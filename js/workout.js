// Função, não constante: o app instalado fica aberto por dias e "hoje" precisa virar à meia-noite.
const todayIdx = () => (new Date().getDay() + 6) % 7;
function defaultDay(t = todayIdx()){
  for (let k=0;k<7;k++){ const i=(t+k)%7; if (WEEK[i].w) return i; }
  return 0;
}
let selDay = defaultDay();
try { const h = location.hash.slice(1); const i = WEEK.findIndex(x => x.w === h); if (i>=0) selDay = i; } catch(e) {}
// Virou o dia com o app aberto: atualiza a semana; se estava no treino padrão, vai para o do novo dia.
let shownToday = todayIdx();
function syncToday(){
  const t = todayIdx(); if (t === shownToday) return;
  const wasDefault = selDay === defaultDay(shownToday);
  shownToday = t;
  if (wasDefault) selDay = defaultDay();
  renderWeek(); renderWorkout();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncToday(); });
setInterval(syncToday, 60000);

/* ---------- week strip ---------- */
function renderWeek(){
  $("#week").innerHTML = WEEK.map((x,i) => {
    const wk = x.w && WORKOUTS[x.w];
    const cls = ["day", x.w ? "" : "rest", i===todayIdx() ? "today":"", i===selDay ? "sel":""].join(" ");
    const style = wk ? `style="--c:var(${wk.color})"` : "";
    return x.w
      ? `<button class="${cls}" ${style} data-i="${i}" aria-pressed="${i===selDay}"><span class="d">${x.d}</span><span class="w">${wk.name.replace("Upper","UP").replace("Lower","LO")}</span><span class="plate"></span></button>`
      : `<div class="${cls}"><span class="d">${x.d}</span><span class="w">off</span><span class="plate"></span></div>`;
  }).join("");
}
$("#week").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  selDay = +b.dataset.i; renderWeek(); renderWorkout();
});

/* ---------- séries, progressão e alternativa ---------- */
const num = t => parseFloat(String(t ?? "").replace(",", "."));
const fmtKg = n => String(Math.round(n * 100) / 100).replace(".", ",");
const isTime = x => /\bs$/.test(x.r.trim());
// Faixa de repetições da prescrição: "6–8" → [6, 8]; "15" → [15, 15]; "10 por perna" → [10, 10].
function repRange(x){
  if (isTime(x)) return null;
  const n = (x.r.match(/\d+/g) || []).map(Number);
  return n.length ? [n[0], n[1] ?? n[0]] : null;
}
// Incremento do Guia: +5 kg nos multiarticulares de perna, +2,5 kg nos principais, 1–2 kg nos demais.
const BIG_LOWER = ["agachamento-livre", "leg-press-45", "levantamento-terra-romeno"];
const step = (x, i) => BIG_LOWER.includes(x.id) ? 5 : i < 2 ? 2.5 : 0;

const cur = wid => S.cur[wid] ||= {};
function setsOf(wid, x){
  const e = (S.cur[wid] || {})[x.id];
  return Array.from({ length:nSets(x) }, (_, j) => (e && e.sets && e.sets[j]) || { kg:"", reps:"", done:false });
}
function entryOf(wid, x){
  const e = cur(wid)[x.id] ||= { sets:[] };
  while (e.sets.length < nSets(x)) e.sets.push({ kg:"", reps:"", done:false });
  e.t = Date.now(); // só é chamado para alterar: marca a hora para a junção entre aparelhos
  return e;
}
const isAlt = (wid, x) => !!(x.alt && (S.cur[wid] || {})[x.id] && S.cur[wid][x.id].alt);
const doneCount = wid => WORKOUTS[wid].ex.reduce((a, x) => a + setsOf(wid, x).filter(s => s.done).length, 0);
const anyActive = () => Object.values(S.cur).some(w => Object.values(w || {}).some(e => (e.sets || []).some(s => s.done)));

// "60 kg × 8, 8, 7" quando a carga é a mesma; senão "60×8 · 57,5×8".
function fmtLog(sets, time){
  const u = time ? " s" : "";
  const kgs = [...new Set(sets.map(s => s.kg))];
  if (kgs.length === 1) return (kgs[0] ? kgs[0] + " kg × " : "") + sets.map(s => (s.reps || "—") + u).join(", ");
  return sets.map(s => `${s.kg || "—"}×${s.reps || "—"}${u}`).join(" · ");
}

/* Dupla progressão (Guia): todas as séries no topo da faixa → sobe a carga;
   senão, mesma carga buscando +1 rep. Três sessões sem evoluir → reduz 10%. */
function suggest(x, i, alt){
  const rg = repRange(x), last = lastOf(x, alt);
  if (!rg || !last) return "";
  const sets = last.sets.filter(s => !isNaN(num(s.reps)));
  if (!sets.length) return "";
  const [lo, hi] = rg;
  const kgs = sets.map(s => num(s.kg)).filter(n => !isNaN(n));
  const kg = kgs.length ? Math.max(...kgs) : NaN;
  if (isDeload()) return isNaN(kg) ? "Deload: metade das séries, sem buscar falha." : `Deload: mantenha <b>${fmtKg(kg)} kg</b>, só ${nSets(x)} séries, longe da falha.`;
  const work = sets.filter(s => isNaN(kg) || num(s.kg) === kg);
  const reps = work.map(s => num(s.reps));
  const hit = work.length >= x.s && reps.every(r => r >= hi);
  if (isNaN(kg)) return hit ? `Meta atingida (${hi} reps em todas): acrescente carga.` : `Busque +1 rep por série (meta: ${hi} em todas).`;
  if (hit) {
    const st = step(x, i);
    return st ? `Meta atingida: suba para <b>${fmtKg(kg + st)} kg</b>.` : `Meta atingida: suba <b>1–2 kg</b> (o próximo peso disponível).`;
  }
  if (reps.every(r => r < lo)) return `Abaixo da faixa ${lo}–${hi} com ${fmtKg(kg)} kg: reduza um pouco a carga.`;
  const recent = S.history.map(h => h.entries.find(e => e.ex === x.id && !!e.alt === !!alt && e.log)).filter(Boolean).slice(0, 3);
  if (recent.length === 3) {
    const top = e => Math.max(...e.log.map(s => num(s.kg)).filter(n => !isNaN(n)));
    const total = e => e.log.reduce((a, s) => a + (num(s.reps) || 0), 0);
    if (recent.every(e => top(e) === kg) && total(recent[0]) <= total(recent[2]))
      return `Travou 3 sessões em ${fmtKg(kg)} kg: reduza 10% (<b>${fmtKg(Math.round(kg * 0.9 * 2) / 2)} kg</b>) e reconstrua.`;
  }
  return `Mantenha <b>${fmtKg(kg)} kg</b> e busque +1 rep por série (meta: ${hi} em todas).`;
}

// Zera o dia (Concluir/Limpar). A hora vai em S.resets para outro aparelho não devolver as séries.
function clearDay(wid){ S.cur[wid] = {}; S.resets[wid] = Date.now(); delete S.started[wid]; delete clockWarned[wid]; }

/* Recordes: maior carga e maior 1RM estimado (Epley: kg × (1 + reps/30)),
   comparados com todos os treinos anteriores do mesmo exercício e variação. */
const e1rm = (kg, reps) => kg * (1 + reps / 30);
function bestOf(log){
  let kg = 0, rm = 0, set = null;
  (log || []).forEach(s => { const k = num(s.kg), r = num(s.reps); if (k > 0 && r > 0) { kg = Math.max(kg, k); const v = e1rm(k, r); if (v > rm) { rm = v; set = s; } } });
  return { kg, rm, set };
}
const bestLabel = log => { const b = bestOf(log); return b.set ? `${b.set.kg} kg × ${b.set.reps}` : ""; };
function records(entry, before = S.history){
  const prev = before.flatMap(h => h.entries).filter(e => e.ex === entry.ex && !!e.alt === !!entry.alt && e.log);
  if (!prev.length) return [];
  const b = bestOf(entry.log), p = prev.map(e => bestOf(e.log));
  const out = [];
  if (b.kg > Math.max(...p.map(q => q.kg))) out.push("carga");
  if (b.rm > Math.max(...p.map(q => q.rm)) + 1e-9) out.push("1rm");
  return out;
}

/* ---------- tela ligada durante o treino ---------- */
let wakeLock = null;
async function keepAwake(on){
  if (!("wakeLock" in navigator)) return;
  try {
    if (on && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch(e) {}
}
// O sistema solta o bloqueio quando o app sai da tela; pede de novo ao voltar.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(anyActive()); });

/* ---------- workout ---------- */
function exCard(wid, x, i){
  const sets = setsOf(wid, x), alt = isAlt(wid, x), last = lastOf(x, alt);
  const complete = sets.every(s => s.done), time = isTime(x), tip = suggest(x, i, alt);
  const ph = (j, f) => { const l = last && (last.sets[j] || last.sets[last.sets.length - 1]); return l && l[f] ? esc(l[f]) : "—"; };
  // Abas Principal/Alternativa no topo do card: a escolhida define nome, cargas, sugestão e técnica.
  const tabs = x.alt ? `<div class="ex-tabs" role="tablist" aria-label="Variação do exercício">
        <button class="ex-tab" role="tab" data-alt="0" aria-selected="${!alt}">Principal</button>
        <button class="ex-tab" role="tab" data-alt="1" aria-selected="${alt}">Alternativa</button></div>` : "";
  return `<article class="ex ${i<2?"main":""} ${complete?"complete":""} ${alt?"is-alt":""}" data-i="${i}">
      ${tabs}
      <div class="ex-top">
        <div class="idx num">${i+1}</div>
        <div><h3>${esc(alt ? x.alt.n : x.n)}</h3>
          ${alt ? `<div class="alt-of">no lugar de ${esc(x.n)}</div>` : ""}
          <div class="tags">${i<2?'<span class="tag key">Progressão de carga</span>':""}${x.optional?'<span class="tag">Se sobrar tempo</span>':""}</div></div>
        <div class="prescr"><div class="sr num">${nSets(x)} × ${esc(x.r)}${isDeload() ? ' <span class="dl">deload</span>' : ""}</div><div class="rest">Descanso ${x.restTxt}</div></div>
      </div>
      <div class="sgrid" role="group" aria-label="Séries">
        <span class="sg-h">Série</span><span class="sg-h">Carga (kg)</span><span class="sg-h">${time ? "Segundos" : "Reps"}</span>
        ${sets.map((s, j) => `<button class="set num" data-j="${j}" aria-pressed="${!!s.done}" aria-label="Série ${j+1}${s.done?" feita":""}">${j+1}</button>
        <input class="num" data-f="kg" data-j="${j}" inputmode="decimal" enterkeyhint="next" aria-label="Carga da série ${j+1}" value="${esc(s.kg)}" placeholder="${ph(j, "kg")}">
        <input class="num" data-f="reps" data-j="${j}" inputmode="numeric" enterkeyhint="done" aria-label="${time ? "Segundos" : "Repetições"} da série ${j+1}" value="${esc(s.reps)}" placeholder="${ph(j, "reps")}">`).join("")}
      </div>
      <div class="ex-info">
        ${i === 0 ? `<div class="set-hint">Toque no número ao terminar a série: o descanso começa e os campos vazios repetem a série anterior.</div>` : ""}
        ${last ? `<div class="last">Última vez (${esc(last.date)}): <b class="num">${esc(fmtLog(last.sets, time))}</b></div>` : ""}
        ${tip ? `<div class="tip">${tip}</div>` : ""}
      </div>
      <details class="how"><summary>Técnica e vídeo</summary>
        <div class="how-body">${alt ? `<dl class="cue">
          <dt>Por que usar</dt><dd>${esc(x.alt.d)}</dd>
          <dt>Prescrição</dt><dd>A mesma de ${esc(x.n)}: ${nSets(x)} × ${esc(x.r)}, descanso ${x.restTxt}. As cargas ficam registradas à parte.</dd>
        </dl>
        <div class="links"><a class="mw" href="${x.alt.link.url}" target="_blank" rel="noopener">${x.alt.link.url.startsWith(MW) ? "MuscleWiki · " : ""}${esc(x.alt.link.label)} ${ext}</a></div>` : `<dl class="cue">
          <dt>Montagem</dt><dd>${esc(x.m)}</dd>
          <dt>Execução</dt><dd>${esc(x.e)}</dd>
          <dt class="warn">Erro comum</dt><dd>${esc(x.x)}</dd>
          ${x.a?`<dt>Atenção</dt><dd>${esc(x.a)}</dd>`:""}
        </dl>
        <div class="links">${x.links.map((l,li)=>`<a class="mw ${li?"alt":""}" href="${l.url}" target="_blank" rel="noopener">MuscleWiki · ${esc(l.label)} ${ext}</a>`).join("")}</div>`}
        </div></details>
    </article>`;
}

function renderWorkout(){
  const wid = WEEK[selDay].w, W = WORKOUTS[wid];
  document.documentElement.style.setProperty("--accent", `var(${W.color})`);
  const total = W.ex.reduce((a,x)=>a+nSets(x),0);
  const restToday = !WEEK[todayIdx()].w && selDay !== todayIdx();

  let h = `<div class="whead"><div><h2><span class="disc"></span>${W.name}</h2><div class="wmeta">${WEEK[selDay].d} · ${W.focus}</div></div>
    <div class="whead-r"><div class="progress num" id="prog">${doneCount(wid)}/${total} séries</div><div class="clock num" id="clock" hidden></div></div></div>`;
  h += cycleBanner();
  if (restToday) h += `<div class="notice">Hoje é <b>descanso</b>. Abaixo está o próximo treino.</div>`;
  h += `<details class="notice warm"><summary><b>Aquecimento (6–8 min)</b></summary>4–5 min de bicicleta ou esteira leve · 1–2 min de mobilidade de ${W.mob} · aproximação no 1º exercício: barra vazia ×10, 50% ×8, 70% ×5, 85% ×3 (não contam no volume).</details>`;
  h += `<div class="list">${W.ex.map((x, i) => exCard(wid, x, i)).join("")}</div>
    <div class="walk"><div class="ico num">15–20<small>MIN</small></div><p><b>Caminhada final — ${W.walk}.</b> 5,0 a 6,0 km/h, ritmo conversacional, FC ~110–130 bpm.${W.walk.startsWith("SEM")?" Em plano, funciona como recuperação ativa para as pernas.":""}</p></div>
    ${W.note?`<div class="notice">${esc(W.note)}</div>`:""}
    <div class="actions" id="actions">
      <button class="btn primary" id="finish">Concluir treino</button>
      <button class="btn ghost" id="reset">Limpar séries</button>
    </div>`;
  $("#workout").innerHTML = h;
  updateClock();
  try { history.replaceState(null, "", "#" + wid); } catch(e) {}
}

function updateProgress(wid){
  $("#prog").textContent = `${doneCount(wid)}/${WORKOUTS[wid].ex.reduce((a,x)=>a+nSets(x),0)} séries`;
}

$("#workout").addEventListener("click", e => {
  const wid = WEEK[selDay].w, W = WORKOUTS[wid];
  const card = e.target.closest(".ex"), i = card ? +card.dataset.i : -1, x = W.ex[i];
  const set = e.target.closest(".set");
  if (set){
    const j = +set.dataset.j, en = entryOf(wid, x), s = en.sets[j];
    s.done = !s.done;
    if (s.done) {
      // Campos vazios: repete a série anterior de hoje; na primeira, usa a última vez.
      const prev = en.sets[j-1], last = lastOf(x, en.alt), ls = last && (last.sets[j] || last.sets[last.sets.length - 1]);
      if (!s.kg) s.kg = (prev && prev.kg) || (ls && ls.kg) || "";
      if (!s.reps) s.reps = (prev && prev.reps) || (ls && ls.reps) || "";
      card.querySelector(`input[data-f="kg"][data-j="${j}"]`).value = s.kg;
      card.querySelector(`input[data-f="reps"][data-j="${j}"]`).value = s.reps;
    }
    if (s.done && !S.started[wid]) { S.started[wid] = Date.now(); updateClock(); }
    save();
    set.setAttribute("aria-pressed", s.done);
    set.setAttribute("aria-label", `Série ${j+1}${s.done ? " feita" : ""}`);
    card.classList.toggle("complete", en.sets.every(t => t.done));
    updateProgress(wid);
    keepAwake(anyActive());
    if (s.done){
      const name = en.alt ? x.alt.n : x.n;
      // Última série do exercício: sem descanso, segue direto para o próximo.
      if (en.sets.every(t => t.done)) { stopTimer(); toast(W.ex[i+1] ? `Próximo: ${W.ex[i+1].n}` : `${name} concluído`); }
      else startTimer(x.rest, name, `Série ${j+1}/${nSets(x)} · descanso ${x.restTxt}`, wid + ":" + x.id);
    } else if (tKey === wid + ":" + x.id) stopTimer(); // desmarcou: o descanso daquela série não vale mais
    return;
  }
  if (e.target.closest("[data-cycle-start]")){ startCycle(); save(); renderWorkout(); return; }
  const cyc = e.target.closest("[data-cycle]");
  if (cyc){ setCycleWeek(+cyc.dataset.cycle); renderWorkout(); return; }
  const tab = e.target.closest(".ex-tab");
  if (tab){
    const want = tab.dataset.alt === "1";
    if (want === isAlt(wid, x)) return;
    const open = card.querySelector("details.how").open; // mantém "Técnica e vídeo" como estava
    entryOf(wid, x).alt = want; save();
    card.outerHTML = exCard(wid, x, i);
    const fresh = $(`#workout .ex[data-i="${i}"]`);
    fresh.querySelector("details.how").open = open;
    fresh.querySelector(`.ex-tab[data-alt="${want ? 1 : 0}"]`).focus();
    return;
  }
  if (e.target.id === "finish") return askFinish();
  if (e.target.id === "reset") { clearDay(wid); save(); renderWorkout(); keepAwake(anyActive()); return; }
  if (e.target.id === "confirm-yes") return finish();
  if (e.target.id === "confirm-no") return renderActions();
});
$("#workout").addEventListener("input", e => {
  const inp = e.target.closest("input[data-f]"); if (!inp) return;
  const wid = WEEK[selDay].w, x = WORKOUTS[wid].ex[+inp.closest(".ex").dataset.i];
  entryOf(wid, x).sets[+inp.dataset.j][inp.dataset.f] = inp.value.trim(); save();
});

function renderActions(){
  $("#actions").innerHTML = `<button class="btn primary" id="finish">Concluir treino</button><button class="btn ghost" id="reset">Limpar séries</button>`;
}
function askFinish(){
  const wid = WEEK[selDay].w;
  if (!WORKOUTS[wid].ex.some(x => (S.cur[wid] || {})[x.id] && setsOf(wid, x).some(s => s.done || s.kg || s.reps)))
    return toast("Nada para salvar: registre ao menos uma série");
  $("#actions").innerHTML = `<div class="confirm">Salvar cargas no histórico e zerar as séries?
    <button class="btn primary" id="confirm-yes">Salvar</button><button class="btn ghost" id="confirm-no">Voltar</button></div>`;
}
function finish(){
  const wid = WEEK[selDay].w, W = WORKOUTS[wid];
  const date = new Date().toLocaleDateString("pt-BR");
  const entries = [];
  W.ex.forEach(x => {
    const en = (S.cur[wid] || {})[x.id]; if (!en) return;
    const sets = setsOf(wid, x), done = sets.filter(s => s.done);
    // Vale o que foi marcado; sem nada marcado, o que foi digitado.
    const log = (done.length ? done : sets.filter(s => s.kg || s.reps)).map(s => ({ kg:s.kg, reps:s.reps }));
    if (!log.length) return;
    const alt = !!(en.alt && x.alt);
    S.last[loadKey(x, alt)] = { date, sets: log, t: Date.now() };
    const entry = { ex:x.id, alt, n: alt ? x.alt.n : x.n, log,
      kg: [...new Set(log.map(s => s.kg).filter(Boolean))].join("/"), reps: log.map(s => s.reps || "—").join(", "),
      sets: done.length, of: nSets(x) };
    const pr = records(entry);
    if (pr.length) entry.pr = pr;
    entries.push(entry);
  });
  if (!entries.length) { renderActions(); return toast("Nada para salvar: registre ao menos uma série"); }
  const dur = elapsedMin(wid);
  const session = { id:newId(), date, wid, entries, finishedAt:Date.now(), ...(dur !== null ? { dur } : {}) };
  S.history.unshift(session); S.pending.push(session.id);
  clearDay(wid);
  if (!S.cycle) startCycle(); // primeiro treino inicia o ciclo
  save(); stopTimer(); renderWorkout(); renderHistory(); keepAwake(anyActive());
  const prs = entries.filter(e => e.pr);
  toast(prs.length ? `🏆 ${prs.length > 1 ? prs.length + " recordes" : "Recorde"}: ${prs.map(e => e.n + " (" + bestLabel(e.log) + ")").join(" · ")}` : "Treino salvo no histórico", prs.length ? 4500 : 2200);
  Sync.flushSessions();
}
/* ---------- rest timer ---------- */
let tEnd = 0, tDur = 0, tInt = null, beeped = false, actx = null, tLabel = "", tKey = "";
// key: treino + exercício que iniciou o descanso, para desmarcar a série parar o timer.
function startTimer(sec, label, sub, key = ""){
  tLabel = `${label} · ${sub}`; tKey = key;
  tDur = sec; tEnd = Date.now() + sec*1000; beeped = false;
  $("#t-label").innerHTML = `<b>${esc(label)}</b>${esc(sub)}`;
  $("#timer").hidden = false; $("#timer").classList.remove("over");
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  clearInterval(tInt); tick(); tInt = setInterval(tick, 250);
  askNotify();
  scheduleNotify(label);
}
function tick(){
  const left = (tEnd - Date.now())/1000;
  $("#t-clock").textContent = left >= 0 ? fmt(left) : "+" + fmt(-left);
  $("#t-bar").style.width = Math.max(0, Math.min(100, (1 - left/tDur)*100)) + "%";
  if (left <= 0 && !beeped){ beeped = true; $("#timer").classList.add("over"); beep(); try { navigator.vibrate && navigator.vibrate([200,100,200]); } catch(e) {} }
}
function beep(){
  if (!actx) return;
  try {
    [0, .25, .5].forEach(t => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(.0001, actx.currentTime+t); g.gain.exponentialRampToValueAtTime(.3, actx.currentTime+t+.02);
      g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime+t+.18);
      o.start(actx.currentTime+t); o.stop(actx.currentTime+t+.2);
    });
  } catch(e) {}
}
function stopTimer(){ clearInterval(tInt); tKey = ""; $("#timer").hidden = true; cancelNotify(); }
$("#t-plus").onclick = () => { tEnd += 15000; tDur += 15; beeped = false; $("#timer").classList.remove("over"); tick(); scheduleNotify(tLabel); };
$("#t-stop").onclick = stopTimer;

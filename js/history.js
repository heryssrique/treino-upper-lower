/* ---------- histórico, evolução, volume, peso corporal e backup ---------- */
const entryKey = e => e.ex + (e.alt ? "~alt" : "");
const sessionsOld = () => [...S.history].sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));

function renderHistory(){
  renderVolume(); renderEvolution(); renderBody(); renderSessions(); renderPrefs();
}

/* Resumo da semana (segunda a domingo): treinos feitos de 4, tempo de treino,
   recordes, peso médio e volume por músculo × plano. weekOff 0 = semana atual. */
let weekOff = 0;
function weekRange(off){
  const from = mondayOf(); from.setDate(from.getDate() - 7 * off);
  const to = new Date(from); to.setDate(to.getDate() + 7);
  return { from, to };
}
function weekSummary(off){
  const { from, to } = weekRange(off), inWeek = t => t >= from.getTime() && t < to.getTime();
  const sessions = S.history.filter(h => inWeek(h.finishedAt || 0));
  const deload = cycleWeek(from) === CYCLE_WEEKS && !!S.cycle;
  const plan = {}, done = {};
  Object.values(WORKOUTS).forEach(W => W.ex.forEach(x => { plan[MUSCLE[x.id]] = (plan[MUSCLE[x.id]] || 0) + (deload ? Math.ceil(x.s / 2) : x.s); }));
  sessions.forEach(h => h.entries.forEach(e => { const g = MUSCLE[e.ex]; if (g) done[g] = (done[g] || 0) + (e.sets || 0); }));
  const avgKg = (a, b) => { const p = bodyPts().filter(q => { const t = parseIso(q.d).getTime(); return t >= a && t < b; }); return p.length ? p.reduce((s, q) => s + q.kg, 0) / p.length : null; };
  const kg = avgKg(from.getTime(), to.getTime()), prevKg = avgKg(from.getTime() - 6048e5, from.getTime());
  return { from, to, sessions, plan, done, deload, kg, prevKg,
    wids: new Set(sessions.map(h => h.wid)), mins: sessions.reduce((a, h) => a + (h.dur || 0), 0),
    prs: sessions.flatMap(h => h.entries.filter(e => e.pr).map(e => e.n)) };
}
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
function renderVolume(){
  const w = weekSummary(weekOff), last = new Date(w.to); last.setDate(last.getDate() - 1);
  $("#wk-label").textContent = weekOff === 0 ? "Esta semana" : `${fmtDay(w.from)} a ${fmtDay(last)}`;
  $("#wk-next").disabled = weekOff === 0;
  const kgLine = w.kg === null ? "—" : `${fmtNum(w.kg)} kg${w.prevKg !== null ? ` (${w.kg - w.prevKg >= 0 ? "+" : "−"}${fmtNum(Math.abs(w.kg - w.prevKg))} na semana)` : ""}`;
  $("#wk-sum").innerHTML = `<dl class="wk">
    <div><dt>Treinos</dt><dd><b class="num">${w.wids.size} de ${ROTATION.length}</b>
      <span class="wk-days">${ROTATION.map(id => `<span class="wk-day ${w.wids.has(id) ? "on" : ""}" title="${esc(WORKOUTS[id].name)}">${w.wids.has(id) ? "✓ " : ""}${esc(WORKOUTS[id].name.replace("Upper", "UP").replace("Lower", "LO"))}</span>`).join("")}</span></dd></div>
    <div><dt>Tempo de treino</dt><dd class="num">${w.mins ? fmtMin(w.mins) + (w.sessions.length ? ` · ${fmtMin(Math.round(w.mins / w.sessions.length))} por treino` : "") : "—"}</dd></div>
    <div><dt>Recordes</dt><dd>${w.prs.length ? `🏆 ${w.prs.length}: ${esc([...new Set(w.prs)].join(", "))}` : "—"}</dd></div>
    <div><dt>Peso médio</dt><dd class="num">${kgLine}</dd></div>
    ${w.deload ? `<div><dt>Ciclo</dt><dd>Semana de deload (plano com metade das séries)</dd></div>` : ""}
  </dl>`;
  const rows = Object.entries(w.plan).sort((a, b) => b[1] - a[1]);
  $("#vol").innerHTML = `<table class="vol"><thead><tr><th>Músculo</th><th class="r">Feitas / plano</th><th class="vbar-h" aria-hidden="true"></th></tr></thead><tbody>
    ${rows.map(([g, p]) => { const d = w.done[g] || 0; return `<tr><td>${g}</td><td class="r num">${d} / ${p}</td>
      <td class="vbar-c"><span class="vbar" aria-hidden="true"><span style="width:${Math.min(100, d / p * 100)}%"></span></span></td></tr>`; }).join("")}
  </tbody></table>`;
}
$("#wk-prev").addEventListener("click", () => { weekOff++; renderVolume(); });
$("#wk-next").addEventListener("click", () => { if (weekOff) { weekOff--; renderVolume(); } });

// Aviso na tela do treino quando a semana vira: resumo da semana anterior, uma vez.
const SEEN_KEY = "ul4-week-seen";
function weekNotice(){
  let seen = ""; try { seen = localStorage.getItem(SEEN_KEY) || ""; } catch(e) {}
  const monday = isoDay(mondayOf());
  if (seen === monday) return "";
  const w = weekSummary(1);
  if (!w.sessions.length) return "";
  const peito = `peito ${w.done.Peito || 0}/${w.plan.Peito}`, biceps = `bíceps ${w.done["Bíceps"] || 0}/${w.plan["Bíceps"]}`;
  return `<div class="notice week-sum"><b>Semana passada:</b> ${w.wids.size} de ${ROTATION.length} treinos${w.prs.length ? ` · 🏆 ${w.prs.length} recorde${w.prs.length > 1 ? "s" : ""}` : ""} · ${peito} · ${biceps}.
    <button class="link-btn" data-week-open>Ver resumo</button><button class="link-btn" data-week-seen aria-label="Dispensar resumo">dispensar</button></div>`;
}
function markWeekSeen(){ try { localStorage.setItem(SEEN_KEY, isoDay(mondayOf())); } catch(e) {} }
$("#workout").addEventListener("click", e => {
  if (e.target.closest("[data-week-seen]")) { markWeekSeen(); e.target.closest(".week-sum").remove(); }
  if (e.target.closest("[data-week-open]")) {
    markWeekSeen(); weekOff = 1; e.target.closest(".week-sum").remove();
    document.querySelector('.tab[data-view="hist"]').click();
    $("#wk-sum").scrollIntoView({ block: "start" });
  }
});

/* 2.1 Evolução por exercício: melhor 1RM estimado de cada treino (ou melhor série, sem carga). */
let evoKey = "";
function renderEvolution(){
  const names = new Map();
  sessionsOld().forEach(h => h.entries.forEach(e => { if (e.ex && e.log) names.set(entryKey(e), e.n + (e.alt ? " (alternativa)" : "")); }));
  const sel = $("#evo-ex"), box = $("#evo-body");
  if (!names.size) { sel.hidden = true; box.innerHTML = `<p class="hist-empty">Conclua treinos com carga e reps por série para ver a evolução de cada exercício.</p>`; return; }
  if (!names.has(evoKey)) { // padrão: primeiro exercício do treino mais recente
    const h = S.history.find(h => h.entries.some(e => e.ex && e.log));
    evoKey = entryKey(h.entries.find(e => e.ex && e.log));
  }
  sel.hidden = false;
  sel.innerHTML = [...names].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([k, n]) => `<option value="${esc(k)}" ${k === evoKey ? "selected" : ""}>${esc(n)}</option>`).join("");
  const rows = sessionsOld().map(h => ({ h, e: h.entries.find(e => e.log && entryKey(e) === evoKey) })).filter(r => r.e);
  const withKg = rows.some(r => bestOf(r.e.log).kg > 0);
  const pts = rows.map(r => {
    const b = bestOf(r.e.log), reps = r.e.log.map(s => num(s.reps) || 0);
    const vol = r.e.log.reduce((a, s) => a + (num(s.kg) || 0) * (num(s.reps) || 0), 0);
    return { x: r.h.finishedAt || brDate(r.h.date), y: withKg ? b.rm : Math.max(...reps), r, b, vol };
  }).filter(p => p.y > 0);
  box.innerHTML = `<p class="fine">${withKg ? "1RM estimado (kg) — carga × (1 + reps/30) da melhor série de cada treino." : "Melhor série (repetições) de cada treino."}</p>
    <div class="chart"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Melhor série</th>${withKg ? "<th class='r'>1RM est.</th><th class='r'>Volume</th>" : ""}</tr></thead><tbody>
    ${pts.slice().reverse().slice(0, 10).map(p => `<tr><td class="num">${esc(p.r.h.date)}${p.r.e.pr ? " 🏆" : ""}</td><td class="num">${esc(withKg ? bestLabel(p.r.e.log) : p.y + " reps")}</td>
      ${withKg ? `<td class="r num">${fmtNum(p.b.rm)} kg</td><td class="r num">${fmtNum(p.vol)} kg</td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
  mountChart(box.querySelector(".chart"), { points: pts, unit: "", tip: i => {
    const p = pts[i];
    return `<b>${esc(p.r.h.date)}</b>${withKg ? `1RM est. ${fmtNum(p.b.rm)} kg<br>${esc(bestLabel(p.r.e.log))}` : `${p.y} reps`}`;
  }});
}
$("#evo-ex").addEventListener("change", e => { evoKey = e.target.value; renderEvolution(); });

/* 3.2 Peso corporal: pesagens com tendência semanal contra a meta do Guia (+0,25 a 0,5 kg/semana). */
const bodyPts = () => (S.body || []).filter(p => typeof p.kg === "number").sort((a, b) => a.d < b.d ? -1 : 1);
function bodyTrend(){
  const pts = bodyPts(); if (!pts.length) return null;
  const end = parseIso(pts[pts.length - 1].d).getTime(), day = 864e5;
  const avg = arr => arr.length ? arr.reduce((a, p) => a + p.kg, 0) / arr.length : null;
  const win = (a, b) => avg(pts.filter(p => { const t = parseIso(p.d).getTime(); return t > end - b * day && t <= end - a * day; }));
  const now = win(0, 7), prev = win(7, 14);
  return now !== null && prev !== null ? now - prev : null;
}
function renderBody(){
  const pts = bodyPts(), last = pts[pts.length - 1], tr = bodyTrend();
  $("#body-kg").placeholder = last ? fmtNum(last.kg) : "kg";
  let msg = "Pese-se de manhã, em jejum, 2 a 3 vezes por semana. Com 2 semanas de registros aparece a tendência.";
  if (tr !== null) {
    const v = `${tr >= 0 ? "+" : "−"}${fmtNum(Math.abs(tr))} kg/semana`;
    msg = tr < 0.25 ? `<b>${v}</b> — abaixo da meta (+0,25 a 0,5): some ~150–200 kcal por dia.`
      : tr > 0.5 ? `<b>${v}</b> — acima da meta (+0,25 a 0,5): tire ~150–200 kcal por dia para limitar o ganho de gordura.`
      : `<b>${v}</b> — dentro da meta (+0,25 a 0,5 kg/semana).`;
  }
  $("#body-msg").innerHTML = msg;
  const chartEl = $("#body-chart");
  if (pts.length > 1) mountChart(chartEl, { points: pts.map(p => ({ x: parseIso(p.d).getTime(), y: p.kg })), tip: i => `<b>${fmtDay(parseIso(pts[i].d))}</b>${fmtNum(pts[i].kg)} kg` });
  else chartEl.innerHTML = "";
  $("#body-list").innerHTML = pts.slice(-6).reverse().map(p => `<li><span class="num">${fmtDay(parseIso(p.d))} · ${fmtNum(p.kg)} kg</span>
    <button class="link-btn" data-body-del="${esc(p.d)}" aria-label="Apagar pesagem de ${fmtDay(parseIso(p.d))}">apagar</button></li>`).join("");
}
$("#body-form").addEventListener("submit", e => {
  e.preventDefault();
  const kg = num($("#body-kg").value);
  if (!(kg > 20 && kg < 400)) return toast("Informe o peso em kg, ex.: 75,4");
  const d = isoDay(new Date());
  S.body = (S.body || []).filter(p => p.d !== d).concat({ d, kg, t: Date.now() }); // um registro por dia
  $("#body-kg").value = ""; save(); renderBody(); toast("Peso registrado");
});
$("#body-list").addEventListener("click", e => {
  const b = e.target.closest("[data-body-del]"); if (!b) return;
  // Apagar vira marca (kg: null) com hora, para a junção não trazer o registro de volta.
  S.body = (S.body || []).filter(p => p.d !== b.dataset.bodyDel).concat({ d: b.dataset.bodyDel, kg: null, t: Date.now() });
  save(); renderBody();
});

/* 2.3 Treinos: lista com editar e apagar. */
let editing = null, confirmDel = null;
function renderSessions(){
  const el = $("#hist");
  if (!S.history.length){ el.innerHTML = `<p class="hist-empty">Nenhum treino salvo ainda. Registre carga e reps nos exercícios e toque em “Concluir treino”.</p>`; return; }
  el.innerHTML = S.history.map(h => {
    const prs = h.entries.filter(e => e.pr).length, open = h.id === editing || h.id === confirmDel;
    const body = h.id === editing
      ? `<form class="h-edit" data-id="${esc(h.id)}">${h.entries.map((e, ei) => `<fieldset><legend>${esc(e.n)}</legend>
          ${(e.log || []).map((s, si) => `<label class="vh" for="ed-${ei}-${si}-kg">Carga da série ${si + 1}</label><input id="ed-${ei}-${si}-kg" class="num" inputmode="decimal" data-e="${ei}" data-s="${si}" data-f="kg" value="${esc(s.kg)}" placeholder="kg">
          <label class="vh" for="ed-${ei}-${si}-reps">Reps da série ${si + 1}</label><input id="ed-${ei}-${si}-reps" class="num" inputmode="numeric" data-e="${ei}" data-s="${si}" data-f="reps" value="${esc(s.reps)}" placeholder="reps">`).join("") || `<span class="fine">Registro antigo, sem séries.</span>`}
        </fieldset>`).join("")}
        <div class="h-actions"><button class="btn primary sm" type="submit">Salvar</button><button class="btn ghost sm" type="button" data-act="cancel">Cancelar</button></div></form>`
      : `<ul>${h.entries.map(e => `<li>${esc(e.n)}${e.alt ? " <i>(alternativa)</i>" : ""}${e.pr ? ` <span class="pr" title="Recorde">🏆</span>` : ""} — <span class="num">${e.log ? esc(fmtLog(e.log)) : (e.kg ? esc(e.kg) + " kg" : "sem carga") + (e.reps ? " · " + esc(e.reps) : "")} · ${esc(e.sets)}/${esc(e.of)} séries</span></li>`).join("") || "<li>Sem registros</li>"}</ul>
        <div class="h-actions">${h.id === confirmDel
          ? `<span class="fine">Apagar este treino?</span><button class="btn danger sm" data-act="del-yes" data-id="${esc(h.id)}">Apagar</button><button class="btn ghost sm" data-act="cancel">Voltar</button>`
          : `<button class="btn ghost sm" data-act="edit" data-id="${esc(h.id)}">Editar</button><button class="btn ghost sm" data-act="del" data-id="${esc(h.id)}">Apagar</button>`}</div>`;
    return `<details ${open ? "open" : ""}><summary>${esc((WORKOUTS[h.wid] || {}).name || h.wid)} <span>· ${esc(h.date)}${h.dur ? ` · ${esc(h.dur)} min${h.durTotal && h.durTotal - h.dur >= 2 ? ` (${esc(h.durTotal)} no total)` : ""}` : ""}${prs ? ` · 🏆 ${prs}` : ""}</span></summary>${body}</details>`;
  }).join("");
}
// Depois de editar ou apagar: "última vez" de cada exercício volta a ser o treino mais recente que sobrou.
function refreshLast(keys){
  keys.forEach(k => {
    const h = S.history.find(h => h.entries.some(e => e.log && entryKey(e) === k));
    const e = h && h.entries.find(e => e.log && entryKey(e) === k);
    S.last[k] = e ? { date: h.date, sets: e.log.map(s => ({ kg: s.kg, reps: s.reps, ...(s.rir ? { rir: s.rir } : {}) })), t: Date.now() } : { date: "", sets: [], t: Date.now() };
  });
}
// Recalcula os recordes dos exercícios afetados em todos os treinos, em ordem; os que mudam voltam à fila de envio.
function refreshRecords(keys){
  const old = sessionsOld();
  old.forEach((h, i) => h.entries.forEach(en => {
    if (!en.log || !keys.includes(entryKey(en))) return;
    const pr = records(en, old.slice(0, i)), was = JSON.stringify(en.pr || []);
    if (pr.length) en.pr = pr; else delete en.pr;
    if (JSON.stringify(pr) !== was && !S.pending.includes(h.id)) S.pending.push(h.id);
  }));
}
$("#hist").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  e.preventDefault();
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "edit") { editing = id; confirmDel = null; }
  if (act === "del") { confirmDel = id; editing = null; }
  if (act === "cancel") { editing = confirmDel = null; }
  if (act === "del-yes") {
    const h = S.history.find(x => x.id === id);
    S.history = S.history.filter(x => x.id !== id);
    if (S.pending.includes(id)) S.pending = S.pending.filter(x => x !== id); else S.delPending.push(id);
    if (h) { const keys = h.entries.filter(e => e.log).map(entryKey); refreshLast(keys); refreshRecords(keys); }
    confirmDel = null; save(); renderWorkout(); renderHistory(); toast("Treino apagado"); Sync.flushSessions();
    return;
  }
  renderSessions();
});
$("#hist").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target.closest(".h-edit"), h = S.history.find(x => x.id === f.dataset.id); if (!h) return;
  f.querySelectorAll("input[data-e]").forEach(inp => { h.entries[+inp.dataset.e].log[+inp.dataset.s][inp.dataset.f] = inp.value.trim(); });
  h.entries.forEach(en => { if (!en.log) return;
    en.kg = [...new Set(en.log.map(s => s.kg).filter(Boolean))].join("/"); en.reps = en.log.map(s => s.reps || "—").join(", "); });
  if (!S.pending.includes(h.id)) S.pending.push(h.id);
  const keys = h.entries.filter(en => en.log).map(entryKey);
  refreshLast(keys); refreshRecords(keys);
  editing = null; save(); renderWorkout(); renderHistory(); toast("Treino atualizado"); Sync.flushSessions();
});

/* 2.5 Backup: CSV (planilha) e JSON (restaurável). */
function download(name, text, type){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => isoDay(new Date());
$("#exp-csv").addEventListener("click", () => {
  const q = v => { v = String(v ?? ""); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = [["data", "treino", "exercicio", "alternativa", "serie", "carga_kg", "reps", "duracao_min", "duracao_total_min", "reps_em_reserva"]];
  sessionsOld().forEach(h => h.entries.forEach(e => {
    const base = [h.date, (WORKOUTS[h.wid] || {}).name || h.wid, e.n, e.alt ? "sim" : "não"];
    if (e.log) e.log.forEach((s, i) => rows.push([...base, i + 1, s.kg, s.reps, h.dur || "", h.durTotal || "", s.rir || ""]));
    else rows.push([...base, "", e.kg, e.reps, h.dur || "", h.durTotal || ""]);
  }));
  // ; e BOM: abre direto no Excel em português.
  download(`treinos-${stamp()}.csv`, "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n"), "text/csv;charset=utf-8");
});
$("#exp-json").addEventListener("click", () => {
  const data = { app: "treino-upper-lower", schema: SCHEMA, exportedAt: new Date().toISOString(), history: S.history, ...pickState(S) };
  download(`treino-backup-${stamp()}.json`, JSON.stringify(data, null, 1), "application/json");
});
/* Backup automático (GitHub Actions, scripts/backup.mjs): criptografado com a
   APP_KEY porque o repositório é público. AES-256-GCM, chave por PBKDF2-SHA256. */
async function decryptBackup(enc, pass){
  const bin = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bin(enc.salt), iterations: enc.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bin(enc.iv) }, aes, bin(enc.data))));
}
$("#imp-json").addEventListener("change", async e => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  try {
    let data = JSON.parse(await file.text());
    if (data.app === "treino-upper-lower" && data.enc) {
      // Tenta a chave conectada; sem ela (ou se não abrir), pergunta.
      let pass = Sync.key(), opened = null;
      if (pass) opened = await decryptBackup(data, pass).catch(() => null);
      if (!opened) {
        pass = prompt("Backup criptografado. Digite a chave pessoal (APP_KEY):");
        if (!pass) return;
        opened = await decryptBackup(data, pass.trim()).catch(() => null);
        if (!opened) return toast("Chave errada para este backup");
      }
      data = opened;
    }
    if (data.app !== "treino-upper-lower" || !Array.isArray(data.history)) throw new Error("formato");
    migrateState(data);
    Object.assign(S, mergeState(S, data));
    const have = new Set(S.history.map(h => h.id));
    const fresh = data.history.filter(h => h && h.id && Array.isArray(h.entries) && !have.has(h.id));
    S.history = [...S.history, ...fresh].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    S.pending.push(...fresh.map(h => h.id));
    save(); renderWorkout(); renderHistory(); Sync.flushSessions();
    toast(`Backup importado: ${fresh.length} treino(s) novo(s)`);
  } catch(err) { toast("Arquivo inválido: use um backup .json exportado pelo app"); }
});

/* Ajustes da academia: peso das barras e anilhas disponíveis. */
function renderPrefs(){
  const p = prefs();
  if (document.activeElement && document.activeElement.closest("#prefs")) return; // não atrapalha quem está digitando
  $("#pref-bar").value = fmtKg(p.bar); $("#pref-barw").value = fmtKg(p.barW);
  $("#pref-plates").innerHTML = PLATES_ALL.map(k => `<label class="chip"><input type="checkbox" value="${k}" ${p.plates.includes(k) ? "checked" : ""}> ${fmtKg(k)}</label>`).join("");
}
$("#prefs").addEventListener("change", () => {
  const bar = num($("#pref-bar").value), barW = num($("#pref-barw").value);
  const plates = [...$("#pref-plates").querySelectorAll("input:checked")].map(c => +c.value);
  if (!(bar >= 0 && bar <= 50) || !(barW >= 0 && barW <= 50)) { toast("Peso da barra entre 0 e 50 kg"); return renderPrefs(); }
  if (!plates.length) { toast("Marque ao menos uma anilha"); return renderPrefs(); }
  S.prefs = { bar, barW, plates, t: Date.now() };
  save(); renderWorkout(); toast("Ajustes salvos");
});
$("#prefs").addEventListener("submit", e => e.preventDefault());


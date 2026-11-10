/* ---------- ciclo de 8 semanas (Guia → Intensidade no ciclo) ----------
   A semana sai da segunda-feira de início guardada em S.cycle. Semanas 1–2:
   calibração; 3–5: 2 reps em reserva; 6–7: 1; semana 8: deload (metade das
   séries, mesma carga). Depois da 8, recomeça na 1. */
const CYCLE_WEEKS = 8;
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
function mondayOf(d = new Date()){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
}
function cycleWeek(){
  if (!S.cycle || !S.cycle.start) return 0;
  // round: horário de verão; início no futuro (ciclo marcado no fim de semana) já conta como semana 1
  const weeks = Math.max(0, Math.round((mondayOf() - parseIso(S.cycle.start)) / 6048e5));
  return ((weeks % CYCLE_WEEKS) + CYCLE_WEEKS) % CYCLE_WEEKS + 1;
}
function phase(w){
  if (w <= 2) return { rir: "3–4 reps em reserva", note: "Calibração: técnica primeiro e anote todas as cargas." };
  if (w <= 5) return { rir: "2 reps em reserva" };
  if (w <= 7) return { rir: "1 rep em reserva" };
  return { rir: "deload", note: "Metade das séries com a mesma carga. As caminhadas continuam.", deload: true };
}
const isDeload = () => cycleWeek() === CYCLE_WEEKS;
const nSets = x => isDeload() ? Math.ceil(x.s / 2) : x.s;
// Define a semana atual do ciclo (o início é recalculado a partir desta segunda-feira).
function setCycleWeek(w){
  const start = mondayOf(); start.setDate(start.getDate() - (w - 1) * 7);
  S.cycle = { start: isoDay(start), t: Date.now() };
  save();
}
// Começar o ciclo: no sábado ou domingo a semana já passou, então a semana 1 é a próxima.
const isWeekend = () => [0, 6].includes(new Date().getDay());
function startCycle(){
  const start = mondayOf(); if (isWeekend()) start.setDate(start.getDate() + 7);
  S.cycle = { start: isoDay(start), t: Date.now() };
}
function cycleBanner(){
  const w = cycleWeek();
  if (!w) return `<div class="cycle"><div><b>Ciclo de 8 semanas</b><span>Marque o início para o app indicar a intensidade de cada semana e avisar do deload.</span></div>
    <button class="btn ghost sm" data-cycle-start>${isWeekend() ? "Começar na segunda" : "Começar nesta semana"}</button></div>`;
  const p = phase(w);
  return `<div class="cycle ${p.deload ? "deload" : ""}"><div><b>Semana ${w} de ${CYCLE_WEEKS} · ${p.deload ? "Deload" : p.rir}</b>${p.note ? `<span>${p.note}</span>` : ""}</div>
    <div class="cycle-adj" role="group" aria-label="Ajustar semana do ciclo">
      <button class="t-adj" data-cycle="${w === 1 ? CYCLE_WEEKS : w - 1}" aria-label="Semana anterior">−</button>
      <button class="t-adj" data-cycle="${w === CYCLE_WEEKS ? 1 : w + 1}" aria-label="Próxima semana">+</button></div></div>`;
}

/* ---------- duração da sessão ----------
   Dois tempos: o total (desde a primeira série) e o útil, que é o que vale para
   o limite de 60 min do Guia. Academia cheia não conta: entre séries do mesmo
   exercício entra o intervalo real até o descanso prescrito + 1,5 min (execução);
   na troca de exercício, até 3 min (trocar, ajustar e fazer a 1ª série). O que
   passar disso é espera por aparelho e fica de fora. Cada série guarda "at",
   a hora em que foi marcada. */
const SESSION_LIMIT = 60, EXEC_MS = 90e3, SWITCH_MS = 180e3, FIRST_MS = 60e3;
S.started ||= {};
let clockWarned = {};
const elapsedMin = wid => S.started[wid] ? Math.floor((Date.now() - S.started[wid]) / 60000) : null;
function activeMs(wid, now = Date.now()){
  const marks = [];
  WORKOUTS[wid].ex.forEach(x => setsOf(wid, x).forEach(s => { if (s.done && s.at) marks.push({ at: s.at, x }); }));
  if (!marks.length) return null;
  marks.sort((a, b) => a.at - b.at);
  const cap = (prev, x) => prev.x === x ? prev.x.rest * 1000 + EXEC_MS : SWITCH_MS;
  let ms = FIRST_MS; // a primeira série
  for (let k = 1; k < marks.length; k++) ms += Math.min(marks[k].at - marks[k - 1].at, cap(marks[k - 1], marks[k].x));
  // Desde a última série: conta como descanso (ou troca, se o exercício acabou), com o mesmo limite.
  const last = marks[marks.length - 1], exDone = setsOf(wid, last.x).every(s => s.done);
  ms += Math.min(Math.max(0, now - last.at), exDone ? SWITCH_MS : last.x.rest * 1000 + EXEC_MS);
  return ms;
}
// Séries marcadas antes desta versão não têm "at": nesse caso vale o tempo total.
const activeMin = wid => { const ms = activeMs(wid); return ms === null ? elapsedMin(wid) : Math.floor(ms / 60000); };
function updateClock(){
  const el = $("#clock"); if (!el) return;
  const wid = WEEK[selDay].w, m = activeMin(wid), t = elapsedMin(wid);
  el.hidden = m === null; if (m === null) return;
  const over = m >= SESSION_LIMIT, total = t !== null && t - m >= 2 ? ` · ${t} no total` : "";
  el.textContent = over ? `${m} min de treino${total} · passou de ${SESSION_LIMIT}: corte o último exercício` : `${m} min de treino${total}`;
  el.title = "Tempo de treino: séries e descansos, sem a espera por aparelho";
  el.classList.toggle("over", over);
  if (over && !clockWarned[wid]) { clockWarned[wid] = true; toast(`${SESSION_LIMIT} min de musculação (sem contar espera): se precisar, corte o último exercício`); }
}
setInterval(updateClock, 20000);

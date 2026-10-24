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
  const weeks = Math.round((mondayOf() - parseIso(S.cycle.start)) / 6048e5); // round: horário de verão
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
function cycleBanner(){
  const w = cycleWeek();
  if (!w) return `<div class="cycle"><div><b>Ciclo de 8 semanas</b><span>Marque o início para o app indicar a intensidade de cada semana e avisar do deload.</span></div>
    <button class="btn ghost sm" data-cycle="1">Começar nesta semana</button></div>`;
  const p = phase(w);
  return `<div class="cycle ${p.deload ? "deload" : ""}"><div><b>Semana ${w} de ${CYCLE_WEEKS} · ${p.deload ? "Deload" : p.rir}</b>${p.note ? `<span>${p.note}</span>` : ""}</div>
    <div class="cycle-adj" role="group" aria-label="Ajustar semana do ciclo">
      <button class="t-adj" data-cycle="${w === 1 ? CYCLE_WEEKS : w - 1}" aria-label="Semana anterior">−</button>
      <button class="t-adj" data-cycle="${w === CYCLE_WEEKS ? 1 : w + 1}" aria-label="Próxima semana">+</button></div></div>`;
}

/* ---------- duração da sessão ----------
   Começa na primeira série marcada do dia. Passou de 60 min de musculação,
   o Guia manda cortar do fim da lista para não estourar a sessão. */
const SESSION_LIMIT = 60;
S.started ||= {};
let clockWarned = {};
const elapsedMin = wid => S.started[wid] ? Math.floor((Date.now() - S.started[wid]) / 60000) : null;
function updateClock(){
  const el = $("#clock"); if (!el) return;
  const wid = WEEK[selDay].w, m = elapsedMin(wid);
  el.hidden = m === null; if (m === null) return;
  const over = m >= SESSION_LIMIT;
  el.textContent = over ? `${m} min · passou de ${SESSION_LIMIT}: corte o último exercício` : `${m} min de treino`;
  el.classList.toggle("over", over);
  if (over && !clockWarned[wid]) { clockWarned[wid] = true; toast(`${SESSION_LIMIT} min de musculação: se precisar, corte o último exercício`); }
}
setInterval(updateClock, 20000);

/* ---------- storage ----------
   S.cur[wid][exId]  treino em andamento: { alt, sets:[{ kg, reps, done }] }
   S.last[loadKey]   última vez de cada exercício: { date, sets:[{ kg, reps }] }
   loadKey é o id do exercício, ou id + "~alt" quando feito com a alternativa,
   para cargas de aparelhos diferentes não se misturarem.
   S.body    pesagens: [{ d:"AAAA-MM-DD", kg, t }]
   S.cycle   ciclo de 8 semanas: { start:"AAAA-MM-DD" (segunda-feira), t }
   S.resets  hora em que cada dia foi zerado (Concluir/Limpar), para a junção
             entre aparelhos não ressuscitar séries apagadas.
   Cada item guarda t (hora da última alteração): ao sincronizar, vale o mais
   recente de cada item, não o estado inteiro mais novo. */
const KEY = "ul4-v1";
const SCHEMA = 3;
let S = { cur:{}, last:{}, history:[], body:[], cycle:null, resets:{} };
try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch(e) {}
function saveLocal(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
// Toda mudança feita no app: grava no aparelho e agenda o envio ao banco.
function save(){ S.updatedAt = Date.now(); saveLocal(); Sync.pushStateSoon(); }
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// Treinos salvos antes da sincronização ganham id e entram na fila de envio.
S.pending ||= [];
S.history.forEach((h, i) => { if (!h.id) { h.id = newId(); h.finishedAt = Date.now() - i; S.pending.push(h.id); } });
const loadKey = (x, alt) => x.id + (alt ? "~alt" : "");
// "Última vez" de um exercício; sets vazio é marca de apagado (ver refreshLast).
const lastOf = (x, alt) => { const l = S.last[loadKey(x, alt)]; return l && l.sets && l.sets.length ? l : null; };

/* ---------- migração de dados antigos ----------
   Versões anteriores guardavam uma carga e um texto de reps por exercício,
   indexados pela posição na lista ("UB:2"). O plano 1 tinha outra ordem nos
   dias Upper. Converte tudo para o formato atual, no aparelho e no que vier
   do banco. */
const PLAN_OLD = {
  UA: ["Supino reto com barra","Barra fixa ou puxada frente","Desenvolvimento com halteres sentado","Remada baixa no cabo","Elevação lateral","Rosca direta (barra W)","Tríceps na corda"],
  UB: ["Desenvolvimento militar (barra ou halteres)","Remada curvada com barra","Supino inclinado com halteres","Puxada pegada neutra","Elevação lateral no cabo","Face pull","Tríceps testa","Rosca martelo"]
};
const parseReps = t => String(t || "").split(/[,;\/\s]+/).filter(Boolean);
const brDate = d => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || ""); return m ? new Date(+m[3], m[2] - 1, +m[1]).getTime() : 0; };
function migrateState(st){
  if (!st || st.v >= SCHEMA) return false;
  const byPos = (w, i) => WORKOUTS[w] && WORKOUTS[w].ex[+i];
  let pos = byPos;
  if ((st.plan || 1) < 2) {
    pos = (w, i) => PLAN_OLD[w] ? Object.values(WORKOUTS).flatMap(W => W.ex).find(x => x.n === PLAN_OLD[w][+i]) : byPos(w, i);
    if (st.checks) Object.keys(PLAN_OLD).forEach(w => delete st.checks[w]);
  }
  // Uma carga para todas as séries; "8, 8, 7" vira uma rep por série (um número só vale para todas).
  const toSets = (x, kg, reps) => {
    const r = parseReps(reps);
    return Array.from({ length:x.s }, (_, j) => ({ kg: String(kg || ""), reps: r.length === 1 ? r[0] : (r[j] ?? "") }));
  };
  const last = {}, cur = {};
  Object.entries(st.last || {}).forEach(([k, v]) => {
    const [w, i] = k.split(":"), x = pos(w, i);
    if (!x || !v || (last[x.id] && brDate(last[x.id].date) >= brDate(v.date))) return;
    last[x.id] = { date: v.date || "", sets: toSets(x, v.kg, v.reps) };
  });
  Object.keys(WORKOUTS).forEach(w => WORKOUTS[w].ex.forEach((x, i) => {
    const d = (st.draft || {})[w + ":" + i], c = ((st.checks || {})[w] || {})[i] || [];
    if (!d && !c.some(Boolean)) return;
    const sets = toSets(x, d && d.kg, d && d.reps);
    sets.forEach((s, j) => s.done = !!c[j]);
    (cur[w] ||= {})[x.id] = { sets };
  }));
  // Rascunhos do plano 1 eram indexados pelas posições antigas: só os do Lower continuam valendo.
  if ((st.plan || 1) < 2) Object.keys(PLAN_OLD).forEach(w => delete cur[w]);
  Object.assign(st, { cur, last, v: SCHEMA });
  delete st.checks; delete st.draft; delete st.plan;
  return true;
}
// Sem mudar updatedAt: a conversão é a mesma no aparelho e no que vier do banco,
// e um aparelho novo (estado vazio) não pode parecer mais recente que o servidor.
if (migrateState(S)) saveLocal();
S.body ||= []; S.resets ||= {};
S.pending ||= []; S.delPending ||= [];

/* ---------- junção entre aparelhos ---------- */
const STATE_KEYS = ["cur", "last", "body", "cycle", "resets"];
const pickState = st => Object.fromEntries(STATE_KEYS.map(k => [k, st[k]]));
const tOf = x => (x && x.t) || 0;
// "Última vez": a mais recente pela hora de alteração; sem ela (dados antigos), pela data.
const newerLast = (a, b) => (tOf(a) || tOf(b)) ? (tOf(a) >= tOf(b) ? a : b) : (brDate(a.date) >= brDate(b.date) ? a : b);
function mergeState(loc, rem){
  if (!rem) return pickState(loc);
  const resets = { ...(loc.resets || {}) };
  Object.entries(rem.resets || {}).forEach(([w, t]) => { resets[w] = Math.max(resets[w] || 0, +t || 0); });
  const cur = {};
  new Set([...Object.keys(loc.cur || {}), ...Object.keys(rem.cur || {})]).forEach(w => {
    const a = (loc.cur || {})[w] || {}, b = (rem.cur || {})[w] || {}, o = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(id => {
      const e = !a[id] ? b[id] : !b[id] ? a[id] : (tOf(a[id]) >= tOf(b[id]) ? a[id] : b[id]);
      if (!resets[w] || tOf(e) > resets[w]) o[id] = e; // alterado depois de zerar o dia
    });
    if (Object.keys(o).length) cur[w] = o;
  });
  const last = { ...(rem.last || {}) };
  Object.entries(loc.last || {}).forEach(([k, v]) => { last[k] = last[k] ? newerLast(v, last[k]) : v; });
  const body = new Map();
  [...(rem.body || []), ...(loc.body || [])].forEach(p => { const q = body.get(p.d); if (!q || tOf(p) >= tOf(q)) body.set(p.d, p); });
  const cycle = tOf(loc.cycle) >= tOf(rem.cycle) ? (loc.cycle || rem.cycle || null) : rem.cycle;
  return { cur, last, body: [...body.values()].sort((a, b) => a.d < b.d ? -1 : 1), cycle, resets };
}


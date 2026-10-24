/* ---------- sincronização com o MongoDB (via /api) ----------
   O aparelho continua sendo a fonte imediata (funciona offline). Com a chave
   configurada, o estado e os treinos concluídos são enviados à API; ao abrir,
   o app busca o que estiver mais novo no servidor. */
const Sync = (() => {
  const KEY_STORE = "ul4-key", BASE_STORE = "ul4-api";
  // No GitHub Pages não há API: ela fica em outro servidor (Vercel), informado
  // uma vez na conexão. Onde a API roda junto com o app, usa o mesmo endereço.
  const needsBase = location.hostname.endsWith("github.io");
  let key = "", base = "";
  try { key = localStorage.getItem(KEY_STORE) || ""; base = localStorage.getItem(BASE_STORE) || ""; } catch(e) {}
  if (needsBase && !base) key = "";
  let timer = null, busy = false;
  $("#sync-api").hidden = !needsBase;
  $("#sync-api").value = base;

  async function api(path, opts = {}){
    const r = await fetch((base ? base + "/api/" : "api/") + path, { ...opts, headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", ...(opts.headers||{}) } });
    if (r.status === 401) throw Object.assign(new Error("Chave inválida"), { auth:true });
    if (!r.ok && r.status !== 409) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function status(text, kind, msg){
    const p = $("#sync-status"); p.textContent = text; p.className = "pill " + (kind||"");
    if (msg) $("#sync-msg").textContent = msg;
    $("#sync-form").hidden = !!key; $("#sync-on").hidden = !key;
  }

  // Aplica o resultado da junção; só redesenha se algo mudou e sem atrapalhar quem está digitando.
  function apply(merged){
    if (JSON.stringify(merged) === JSON.stringify(pickState(S))) return;
    Object.assign(S, merged); saveLocal(); refresh();
  }
  function refresh(){
    if (!document.activeElement || !document.activeElement.matches("input, select, textarea")) { renderWorkout(); renderHistory(); }
  }
  // Envia o estado juntado com o do servidor: o que outro aparelho mudou não é sobrescrito.
  async function pushState(){
    if (!key || !navigator.onLine) return;
    const { state } = await api("state?sessions=0");
    migrateState(state); // estado salvo no banco por uma versão anterior do app
    apply(mergeState(S, state));
    await api("state", { method:"PUT", body: JSON.stringify({ v:SCHEMA, ...pickState(S), updatedAt:Date.now() }) });
  }
  async function flushSessions(){
    if (!key || !navigator.onLine) return;
    for (const id of [...S.pending]) {
      const h = S.history.find(x => x.id === id);
      if (h) await api("sessions", { method:"POST", body: JSON.stringify(h) });
      S.pending = S.pending.filter(x => x !== id); saveLocal();
    }
    for (const id of [...S.delPending]) {
      await api("sessions?id=" + encodeURIComponent(id), { method:"DELETE" });
      S.delPending = S.delPending.filter(x => x !== id); saveLocal();
    }
  }
  async function pull(){
    const { state, sessions = [], deleted = [] } = await api("state");
    migrateState(state);
    apply(mergeState(S, state));
    // Treinos: vale a versão do servidor, exceto os que ainda vão ser enviados daqui.
    // Só some daqui o que o servidor marcou como apagado (em outro aparelho); um
    // treino que apenas falta no servidor (ex.: banco novo) volta para a fila de envio.
    // O servidor manda até 500: os mais antigos que isso ficam como estão.
    const server = new Map(sessions.map(h => [h.id, h])), gone = new Set(deleted);
    const oldest = sessions.length >= 500 ? Math.min(...sessions.map(h => h.finishedAt || 0)) : -Infinity;
    const keep = [];
    S.history.forEach(h => {
      if (gone.has(h.id)) { S.pending = S.pending.filter(x => x !== h.id); return; }
      if (S.pending.includes(h.id)) return keep.push(h);
      if (server.has(h.id)) return keep.push(server.get(h.id));
      if ((h.finishedAt || 0) >= oldest) S.pending.push(h.id);
      keep.push(h);
    });
    const have = new Set(keep.map(h => h.id));
    sessions.forEach(h => { if (!have.has(h.id) && !S.delPending.includes(h.id)) keep.push(h); });
    keep.sort((a,b) => (b.finishedAt||0) - (a.finishedAt||0));
    if (JSON.stringify(keep) !== JSON.stringify(S.history)) { S.history = keep; saveLocal(); refresh(); }
  }
  async function run(){
    if (!key) return status("Só neste aparelho", "", "Conecte com a sua chave pessoal para guardar os treinos no MongoDB e acessá-los de qualquer aparelho.");
    if (!navigator.onLine) return status("Offline", "", "Sem internet. As mudanças ficam no aparelho e são enviadas quando a conexão voltar.");
    if (busy) return; busy = true; status("Sincronizando…");
    try {
      await pull();
      await flushSessions();
      await pushState();
      status("Sincronizado", "ok", `Última sincronização: ${new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}.`);
    } catch(e) {
      if (e.auth) { disconnect(); status("Chave inválida", "err", "A chave não confere com a APP_KEY configurada no servidor."); }
      else status("Erro", "err", "Não foi possível falar com o banco agora. Os dados continuam salvos no aparelho.");
    } finally { busy = false; }
  }
  function pushStateSoon(){
    if (!key) return;
    clearTimeout(timer);
    timer = setTimeout(() => pushState().then(() => status("Sincronizado", "ok")).catch(() => status("Pendente", "", "Mudanças ainda não enviadas. Tentaremos de novo em seguida.")), 1500);
  }
  function connect(k, b){
    key = k.trim(); base = (b || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
    try { localStorage.setItem(KEY_STORE, key); localStorage.setItem(BASE_STORE, base); } catch(e) {}
    run();
  }
  function disconnect(){ key = ""; try { localStorage.removeItem(KEY_STORE); } catch(e) {} status("Só neste aparelho"); }

  $("#sync-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#sync-key").value, b = $("#sync-api").value;
    if (needsBase && !/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)/i.test(b.trim())) return status("Só neste aparelho", "err", "Informe o endereço da API, começando com https://");
    if (v.trim()) { $("#sync-key").value = ""; connect(v, needsBase ? b : ""); }
  });
  $("#sync-now").addEventListener("click", run);
  $("#sync-off").addEventListener("click", () => { disconnect(); toast("Desconectado do banco"); });
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run(); });

  return { run, pushStateSoon, flushSessions: () => flushSessions().catch(() => {}) };
})();

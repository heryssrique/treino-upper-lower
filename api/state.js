// GET  /api/state  → estado atual (séries marcadas, rascunhos, últimas cargas) + histórico
// PUT  /api/state  → salva o estado; ignora envios mais antigos que o já salvo
import { getDb } from "./_lib/db.js";
import { route, send, readJson } from "./_lib/http.js";

const ID = "me";
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

export default route(["GET", "PUT"], async (req, res) => {
  const db = await getDb();
  const states = db.collection("state");

  if (req.method === "GET") {
    // ?sessions=0: só o estado (o app pede assim antes de cada envio, para juntar).
    const withSessions = new URL(req.url, "http://x").searchParams.get("sessions") !== "0";
    const col = db.collection("sessions");
    const [state, sessions, deleted] = await Promise.all([
      states.findOne({ _id: ID }, { projection: { _id: 0 } }),
      withSessions ? col.find({ deleted: { $ne: true } }, { projection: { _id: 0 } }).sort({ finishedAt: -1 }).limit(500).toArray() : null,
      withSessions ? col.find({ deleted: true }, { projection: { _id: 1 } }).toArray() : null
    ]);
    return send(res, 200, withSessions ? { state, sessions, deleted: deleted.map(d => d._id) } : { state });
  }

  const body = await readJson(req);
  const updatedAt = Number(body.updatedAt);
  // Formato atual (v3): séries do treino em andamento por exercício (cur) e últimas cargas (last).
  // Formato antigo (sem v): checks/draft/last indexados pela posição do exercício.
  const v3 = Number(body.v) >= 3;
  const valid = Number.isFinite(updatedAt) && isObj(body.last)
    && (v3 ? isObj(body.cur) : isObj(body.checks) && isObj(body.draft));
  if (!valid) return send(res, 400, { error: "Estado inválido" });
  const doc = v3
    ? { v: Number(body.v), cur: body.cur, last: body.last, updatedAt,
        // Pesagens, ciclo e horas em que cada dia foi zerado (junção entre aparelhos).
        body: Array.isArray(body.body) ? body.body.slice(-3000) : [],
        cycle: isObj(body.cycle) ? body.cycle : null,
        resets: isObj(body.resets) ? body.resets : {} }
    : { checks: body.checks, draft: body.draft, last: body.last, updatedAt, ...(Number.isInteger(body.plan) && body.plan > 0 ? { plan: body.plan } : {}) };
  const unset = v3 ? { checks: "", draft: "", plan: "" } : { v: "", cur: "", body: "", cycle: "", resets: "" };
  const r = await states.updateOne(
    { _id: ID, $or: [{ updatedAt: { $lte: updatedAt } }, { updatedAt: { $exists: false } }] },
    { $set: doc, $unset: unset },
    { upsert: false }
  );
  if (r.matchedCount === 0) {
    // Ainda não existe documento, ou o salvo é mais novo.
    try { await states.insertOne({ _id: ID, ...doc }); }
    catch (err) { if (err.code !== 11000) throw err; return send(res, 409, { error: "Estado mais novo no servidor" }); }
  }
  send(res, 200, { saved: true, updatedAt });
});

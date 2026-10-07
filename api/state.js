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
    const [state, sessions] = await Promise.all([
      states.findOne({ _id: ID }, { projection: { _id: 0 } }),
      db.collection("sessions").find({}, { projection: { _id: 0 } }).sort({ finishedAt: -1 }).limit(500).toArray()
    ]);
    return send(res, 200, { state, sessions });
  }

  const body = await readJson(req);
  const updatedAt = Number(body.updatedAt);
  if (!Number.isFinite(updatedAt) || !isObj(body.checks) || !isObj(body.draft) || !isObj(body.last)) {
    return send(res, 400, { error: "Estado inválido" });
  }
  const doc = { checks: body.checks, draft: body.draft, last: body.last, updatedAt };
  const r = await states.updateOne(
    { _id: ID, $or: [{ updatedAt: { $lte: updatedAt } }, { updatedAt: { $exists: false } }] },
    { $set: doc },
    { upsert: false }
  );
  if (r.matchedCount === 0) {
    // Ainda não existe documento, ou o salvo é mais novo.
    try { await states.insertOne({ _id: ID, ...doc }); }
    catch (err) { if (err.code !== 11000) throw err; return send(res, 409, { error: "Estado mais novo no servidor" }); }
  }
  send(res, 200, { saved: true, updatedAt });
});

// POST   /api/sessions        → grava um treino concluído (reenviar o mesmo id não duplica)
// DELETE /api/sessions?id=... → apaga um treino do histórico
import { getDb } from "./_lib/db.js";
import { route, send, readJson } from "./_lib/http.js";

const WORKOUTS = ["UA", "LA", "UB", "LB"];

export default route(["POST", "DELETE"], async (req, res) => {
  const sessions = (await getDb()).collection("sessions");

  if (req.method === "DELETE") {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (!id) return send(res, 400, { error: "Informe o id" });
    const r = await sessions.deleteOne({ _id: id });
    return send(res, 200, { deleted: r.deletedCount });
  }

  const s = await readJson(req);
  const ok = typeof s.id === "string" && s.id.length <= 64
    && WORKOUTS.includes(s.wid)
    && Number.isFinite(Number(s.finishedAt))
    && Array.isArray(s.entries) && s.entries.length <= 20;
  if (!ok) return send(res, 400, { error: "Treino inválido" });

  const doc = {
    id: s.id,
    wid: s.wid,
    date: String(s.date || "").slice(0, 20),
    finishedAt: Number(s.finishedAt),
    entries: s.entries.map(e => ({
      n: String(e.n || "").slice(0, 80),
      kg: String(e.kg || "").slice(0, 20),
      reps: String(e.reps || "").slice(0, 40),
      sets: Number(e.sets) || 0,
      of: Number(e.of) || 0
    }))
  };
  await sessions.updateOne({ _id: s.id }, { $set: doc }, { upsert: true });
  send(res, 200, { saved: true, id: s.id });
});

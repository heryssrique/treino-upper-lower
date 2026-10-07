// GET /api/health → confirma que a API está no ar e alcança o banco (não exige chave).
import { getDb } from "./_lib/db.js";
import { send } from "./_lib/http.js";

export default async function health(req, res) {
  try {
    await (await getDb()).command({ ping: 1 });
    send(res, 200, { ok: true, db: true });
  } catch (err) {
    console.error(err);
    send(res, 503, { ok: false, db: false });
  }
}

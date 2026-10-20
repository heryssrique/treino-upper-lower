// GET /api/health → confirma que a API está no ar e alcança o banco (não exige chave).
// Em caso de falha, informa a causa provável sem expor a string de conexão.
import { createHash } from "node:crypto";
import { getDb } from "./_lib/db.js";
import { send, cors } from "./_lib/http.js";

export function diagnose(err) {
  const msg = String(err?.message || err);
  if (!process.env.MONGODB_URI) return "MONGODB_URI não configurada na Vercel (ou falta fazer Redeploy depois de cadastrar)";
  if (/[<>]|\s/.test(process.env.MONGODB_URI.trim()))
    return "MONGODB_URI ainda tem <password> (ou < > / espaços): troque pela senha real do usuário do banco";
  if (err?.name === "MongoParseError" || /Invalid scheme|URI must include|Invalid connection string/i.test(msg))
    return "MONGODB_URI inválida: confira se começa com mongodb+srv:// e se não ficou <password> ou espaços";
  if (err?.code === 18 || /bad auth|Authentication failed|auth.*fail/i.test(msg))
    return "usuário ou senha do banco incorretos (Atlas → Database Access). Senha com @ : / ? # % precisa ser codificada";
  if (/ENOTFOUND|querySrv|ENODATA|getaddrinfo/i.test(msg))
    return "endereço do cluster não encontrado: copie de novo a string em Atlas → Connect → Drivers";
  if (err?.name === "MongoServerSelectionError" || /timed out|ECONNREFUSED|ECONNRESET|SSL|TLS/i.test(msg))
    return "o Atlas recusou a conexão: libere 0.0.0.0/0 em Network Access e confira se o cluster não está pausado";
  return "erro desconhecido ao conectar no MongoDB";
}

// Mostra qual credencial o servidor está usando, sem revelar a senha: usuário,
// cluster e tamanho + início do SHA-256 da senha (para comparar com a do Atlas).
export function describeUri(uri = process.env.MONGODB_URI) {
  try {
    const raw = String(uri || "").trim();
    const u = new URL(raw.replace(/^mongodb(\+srv)?:/, "http:"));
    const pass = decodeURIComponent(u.password);
    return {
      user: decodeURIComponent(u.username),
      host: u.hostname,
      passLen: pass.length,
      passSha: createHash("sha256").update(pass).digest("hex").slice(0, 8),
      quoted: /^["']|["']$/.test(raw)
    };
  } catch { return null; }
}

export default async function health(req, res) {
  cors(req, res);
  try {
    await (await getDb()).command({ ping: 1 });
    send(res, 200, { ok: true, db: true });
  } catch (err) {
    console.error(err);
    send(res, 503, { ok: false, db: false, reason: diagnose(err), using: describeUri() });
  }
}

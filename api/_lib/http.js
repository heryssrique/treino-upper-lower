import { timingSafeEqual } from "node:crypto";
import { getDb } from "./db.js";

// Confere a chave pessoal enviada em "Authorization: Bearer <APP_KEY>".
export function authorized(req) {
  const key = process.env.APP_KEY || "";
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (key.length < 16 || got.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(key));
}

// O app pode rodar em outro endereço (GitHub Pages) e chamar a API daqui.
// Só as origens em ALLOWED_ORIGINS (separadas por vírgula) podem ler as respostas.
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://heryssrique.github.io")
  .split(",").map(o => o.trim().replace(/\/$/, "")).filter(Boolean);

export function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ORIGINS.includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Envolve um handler com autenticação, métodos permitidos e tratamento de erro.
export function route(methods, fn) {
  return async (req, res) => {
    cors(req, res);
    // Pré-verificação do navegador (CORS): responde antes de exigir a chave.
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    if (!methods.includes(req.method)) { res.setHeader("Allow", methods.join(", ")); return send(res, 405, { error: "Método não permitido" }); }
    try {
      if (await isLocked(req)) return send(res, 429, { error: "Muitas tentativas com chave errada: aguarde 15 minutos" });
      if (!authorized(req)) { await countFailure(req); return send(res, 401, { error: "Chave inválida" }); }
      await fn(req, res);
    }
    catch (err) { console.error(err); send(res, 500, { error: "Erro no servidor" }); }
  };
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

/* Limite de tentativas: 10 chaves erradas do mesmo IP em 15 min bloqueiam esse IP
   por 15 min (inclusive com a chave certa, para não servir de teste). Os registros
   somem sozinhos pelo índice TTL em expiresAt. */
const MAX_FAILS = 10, WINDOW_MS = 15 * 60 * 1000;
const clientIp = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
let ttlReady = null;
async function failures(){
  const col = (await getDb()).collection("authfail");
  ttlReady ||= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(err => { ttlReady = null; throw err; });
  await ttlReady;
  return col;
}
async function isLocked(req){
  const f = await (await failures()).findOne({ _id: clientIp(req) });
  return !!(f && f.lockedUntil && f.lockedUntil > Date.now());
}
async function countFailure(req){
  const now = Date.now(), col = await failures(), ip = clientIp(req);
  const f = await col.findOneAndUpdate(
    { _id: ip },
    [{ $set: {
      // Janela nova se a anterior já passou.
      n: { $cond: [{ $gt: [{ $ifNull: ["$since", 0] }, now - WINDOW_MS] }, { $add: [{ $ifNull: ["$n", 0] }, 1] }, 1] },
      since: { $cond: [{ $gt: [{ $ifNull: ["$since", 0] }, now - WINDOW_MS] }, "$since", now] },
      expiresAt: new Date(now + 2 * WINDOW_MS)
    } }],
    { upsert: true, returnDocument: "after" }
  );
  const doc = f && (f.value !== undefined ? f.value : f);
  if (doc && doc.n >= MAX_FAILS) await col.updateOne({ _id: ip }, { $set: { lockedUntil: now + WINDOW_MS, expiresAt: new Date(now + 2 * WINDOW_MS) } });
}


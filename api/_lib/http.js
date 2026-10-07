import { timingSafeEqual } from "node:crypto";

// Confere a chave pessoal enviada em "Authorization: Bearer <APP_KEY>".
export function authorized(req) {
  const key = process.env.APP_KEY || "";
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (key.length < 16 || got.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(key));
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
    if (!methods.includes(req.method)) { res.setHeader("Allow", methods.join(", ")); return send(res, 405, { error: "Método não permitido" }); }
    if (!authorized(req)) return send(res, 401, { error: "Chave inválida" });
    try { await fn(req, res); }
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

// Testa as rotas da API contra um MongoDB em memória: npm run test:api
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

const mem = await MongoMemoryServer.create();
process.env.MONGODB_URI = mem.getUri();
process.env.APP_KEY = "chave-de-teste-123456";

const { default: state } = await import("../api/state.js");
const { default: sessions } = await import("../api/sessions.js");
const { default: health } = await import("../api/health.js");
const { closeDb } = await import("../api/_lib/db.js");

// Chama um handler com req/res mínimos, como a Vercel faz.
function call(handler, { method = "GET", url = "/", body, key = process.env.APP_KEY } = {}) {
  return new Promise(resolve => {
    const req = { method, url, body, headers: key ? { authorization: "Bearer " + key } : {} };
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      end(data) { resolve({ status: this.statusCode, body: data ? JSON.parse(data) : null }); } };
    handler(req, res);
  });
}

let r;
r = await call(health); assert.equal(r.status, 200); assert.equal(r.body.db, true);
r = await call(state, { key: "errada-errada-errada!" }); assert.equal(r.status, 401);
r = await call(state, { key: null }); assert.equal(r.status, 401);
r = await call(state, { method: "DELETE" }); assert.equal(r.status, 405);

r = await call(state); assert.equal(r.status, 200); assert.equal(r.body.state, null); assert.deepEqual(r.body.sessions, []);

const st = { checks: { UA: { 0: [true] } }, draft: {}, last: { "UA:0": { kg: "50", reps: "8,8,8,8", date: "01/10/2026" } }, updatedAt: 1000 };
r = await call(state, { method: "PUT", body: st }); assert.equal(r.status, 200);
r = await call(state, { method: "PUT", body: { ...st, last: {}, updatedAt: 500 } }); assert.equal(r.status, 409, "envio antigo é recusado");
r = await call(state); assert.equal(r.body.state.updatedAt, 1000); assert.equal(r.body.state.last["UA:0"].kg, "50");
r = await call(state, { method: "PUT", body: { ...st, updatedAt: 2000 } }); assert.equal(r.status, 200);
r = await call(state, { method: "PUT", body: { checks: [] } }); assert.equal(r.status, 400);

const s1 = { id: "a1", wid: "UA", date: "01/10/2026", finishedAt: 10, entries: [{ n: "Supino reto com barra", kg: "50", reps: "8,8,8,8", sets: 4, of: 4 }] };
r = await call(sessions, { method: "POST", body: s1 }); assert.equal(r.status, 200);
r = await call(sessions, { method: "POST", body: s1 }); assert.equal(r.status, 200, "reenvio não duplica");
r = await call(sessions, { method: "POST", body: { ...s1, id: "b2", finishedAt: 20, wid: "LB" } });
r = await call(sessions, { method: "POST", body: { ...s1, id: "x", wid: "ZZ" } }); assert.equal(r.status, 400);
r = await call(state); assert.deepEqual(r.body.sessions.map(s => s.id), ["b2", "a1"], "mais recente primeiro");
r = await call(sessions, { method: "DELETE", url: "/api/sessions?id=a1" }); assert.equal(r.body.deleted, 1);
r = await call(state); assert.equal(r.body.sessions.length, 1);

await closeDb(); await mem.stop();
console.log("API ok: todos os testes passaram");

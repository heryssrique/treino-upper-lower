// Servidor local: serve o app e as rotas /api/* como a Vercel faria.
// Usa o MONGODB_URI do .env; sem ele, sobe um MongoDB temporário em memória.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
process.env.APP_KEY ||= "chave-local-de-desenvolvimento";

if (!process.env.MONGODB_URI) {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  console.log("MongoDB em memória (os dados somem ao fechar).");
}

const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".webmanifest":"application/manifest+json", ".png":"image/png", ".json":"application/json" };
const ROUTES = ["state", "sessions", "health"];
const handlers = {};
for (const r of ROUTES) handlers[r] = (await import(pathToFileURL(path.join(root, "api", r + ".js")))).default;

const port = Number(process.env.PORT) || 3000;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (m) return handlers[m[1]] ? handlers[m[1]](req, res) : (res.writeHead(404), res.end());
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(root, rel);
  if (!file.startsWith(root) || rel.startsWith(".") || rel.startsWith("api") || rel.startsWith("node_modules")) { res.writeHead(404); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(port, () => console.log(`App em http://localhost:${port} · chave: ${process.env.APP_KEY}`));

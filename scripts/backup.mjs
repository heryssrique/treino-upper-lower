// Backup do banco pela API, criptografado com a APP_KEY (o repositório é público).
// Uso: API_URL=https://… APP_KEY=… node scripts/backup.mjs saida.json
// O arquivo abre no app em Histórico → Backup → Importar backup.
import { writeFile } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const API = (process.env.API_URL || "").replace(/\/+$/, "");
const KEY = process.env.APP_KEY || "";
const out = process.argv[2] || "treino-backup.json";
if (!API) { console.error("Defina API_URL (ex.: https://treino-upper-lower-seven.vercel.app)."); process.exit(1); }
if (KEY.length < 16) { console.error("Defina APP_KEY (segredo do repositório) com a mesma chave da Vercel."); process.exit(1); }

const res = await fetch(`${API}/api/state`, { headers: { Authorization: "Bearer " + KEY } });
if (res.status === 401) { console.error("APP_KEY recusada pela API: confira o segredo do repositório."); process.exit(1); }
if (!res.ok) { console.error(`API respondeu HTTP ${res.status}.`); process.exit(1); }
const { state, sessions, deleted } = await res.json();
if (!Array.isArray(sessions)) { console.error("Resposta da API sem a lista de treinos."); process.exit(1); }

// Mesmo formato do "Exportar backup (JSON)" do app.
const pick = ["cur", "last", "body", "cycle", "resets", "notes", "prefs"];
const plain = { app: "treino-upper-lower", schema: 3, exportedAt: new Date().toISOString(), source: "backup automático",
  history: sessions, deleted: deleted || [], ...Object.fromEntries(pick.map(k => [k, state?.[k] ?? null])) };

// AES-256-GCM com chave derivada da APP_KEY (PBKDF2-SHA256). Mesma rotina de decryptBackup em js/history.js.
const ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), "PBKDF2", false, ["deriveKey"]);
const aes = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(plain))));
const b64 = u => Buffer.from(u).toString("base64");
await writeFile(out, JSON.stringify({ app: "treino-upper-lower", enc: "aes-256-gcm+pbkdf2-sha256", iter: ITER,
  salt: b64(salt), iv: b64(iv), exportedAt: plain.exportedAt, data: b64(data) }) + "\n");

// Resumo sem dados pessoais (vai para o log público da Action).
const pesos = (state?.body || []).filter(p => typeof p?.kg === "number").length;
console.log(`Backup ok: ${sessions.length} treino(s), ${pesos} pesagem(ns), ${Object.keys(state?.last || {}).length} exercício(s) com última carga → ${out}`);

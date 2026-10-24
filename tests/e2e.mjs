// Testes de ponta a ponta: app real no Chromium + API com MongoDB em memória.
// npm run test:e2e
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3900 + Math.floor(Math.random() * 90), KEY = "chave-e2e-123456789", U = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ["scripts/dev.mjs"], { env: { ...process.env, PORT: String(PORT), APP_KEY: KEY, MONGODB_URI: "" }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok, fail) => {
  server.stdout.on("data", d => { if (String(d).includes("App em")) ok(); });
  server.on("exit", c => fail(new Error("servidor saiu: " + c)));
  setTimeout(() => fail(new Error("servidor não subiu")), 120000);
});
const api = (path, opts = {}) => fetch(`${U}/api/${path}`, { ...opts, headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" } }).then(r => r.json());

const browser = await chromium.launch();
const errors = [];
async function open(hash = "UA", { state, connect } = {}){
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(`${U}/#${hash}`);
  if (state) { await p.evaluate(s => localStorage.setItem("ul4-v1", JSON.stringify(s)), state); await p.reload(); }
  if (connect) {
    await p.click("#tab-hist"); await p.fill("#sync-key", KEY); await p.click("#sync-form button");
    await p.waitForFunction(() => document.querySelector("#sync-status").textContent === "Sincronizado");
    await p.click("#tab-treino");
  }
  return p;
}
const S = p => p.evaluate(() => JSON.parse(localStorage.getItem("ul4-v1")));
const card = i => `.ex[data-i="${i}"]`;
const field = (i, j, f) => `${card(i)} input[data-f="${f}"][data-j="${j}"]`;
async function doSets(p, i, sets, from = 0){ // sets: [[kg, reps], ...] a partir da série "from"
  for (const [k, [kg, reps]] of sets.entries()) { const j = k + from; await p.fill(field(i, j, "kg"), kg); await p.fill(field(i, j, "reps"), reps); await p.click(`${card(i)} .set[data-j="${j}"]`); }
}
async function finish(p){ await p.click("#finish"); await p.click("#confirm-yes"); }
let step = 0; const ok = m => console.log(`  ✓ ${++step}. ${m}`);

try {
  // 1. Migração do formato antigo (uma carga por exercício, por posição)
  let p = await open("UA", { state: { plan: 2, checks: { LA: { 0: [true] } }, draft: { "LA:0": { kg: "80", reps: "8" } },
    last: { "UA:0": { kg: "60", reps: "8, 8, 7, 7", date: "20/10/2026" }, "UA:4": { kg: "35", reps: "12", date: "20/10/2026" }, "UB:3": { kg: "40", reps: "12", date: "23/10/2026" } },
    history: [], updatedAt: 1 } });
  let st = await S(p);
  assert.equal(st.v, 3); assert.equal(st.checks, undefined);
  assert.deepEqual(st.last["supino-reto-com-barra"].sets.map(s => s.reps), ["8", "8", "7", "7"]);
  assert.equal(st.last["crucifixo-na-maquina-peck-deck"].sets[0].kg, "40");
  assert.equal(st.cur.LA["agachamento-livre"].sets[0].done, true);
  ok("migração do formato antigo");

  // 2. Séries: campos vazios repetem a última vez/série anterior, descanso, relógio
  assert.equal(await p.getAttribute(field(0, 3, "kg"), "placeholder"), "60");
  assert.match(await p.textContent(`${card(0)} .tip`), /Mantenha 60 kg/);
  await p.click(`${card(0)} .set[data-j="0"]`);
  assert.equal(await p.inputValue(field(0, 0, "kg")), "60");
  assert.equal(await p.isVisible("#timer"), true);
  assert.match(await p.textContent("#clock"), /min de treino/);
  ok("série marcada preenche carga, inicia descanso e relógio");

  // 3. Alternativa com carga separada; concluir inicia o ciclo
  await p.click(`${card(2)} summary`); // abre "Técnica e vídeo": deve continuar aberto ao trocar de aba
  await p.click(`${card(2)} .ex-tab[data-alt="1"]`);
  assert.equal(await p.textContent(`${card(2)} h3`), "Supino inclinado na máquina");
  assert.equal(await p.getAttribute(`${card(2)} .ex-tab[data-alt="1"]`, "aria-selected"), "true");
  assert.match(await p.textContent(`${card(2)} .how-body`), /Por que usar/);
  assert.equal(await p.evaluate(i => document.querySelector(`.ex[data-i="${i}"] details.how`).open, 2), true);
  await doSets(p, 2, [["50", "10"]]);
  await doSets(p, 0, [["60", "8"], ["60", "8"], ["60", "8"]], 1); // a 1ª série já foi marcada no passo 2
  await finish(p);
  st = await S(p);
  assert.equal(st.last["supino-inclinado-com-halteres~alt"].sets[0].kg, "50");
  assert.equal(st.history[0].entries.find(e => e.alt).n, "Supino inclinado na máquina");
  assert.match(await p.textContent(".cycle"), /Semana 1 de 8/);
  assert.match(await p.textContent(`${card(0)} .tip`), /suba para 62,5 kg/);
  await p.click(`${card(2)} .ex-tab[data-alt="0"]`);
  assert.equal(await p.textContent(`${card(2)} h3`), "Supino inclinado com halteres");
  assert.match(await p.textContent(`${card(2)} .how-body`), /Montagem/);
  ok("abas Principal/Alternativa no card, cargas separadas, ciclo iniciado, sugestão de subir carga");

  // 4. Recorde
  await doSets(p, 0, [["62,5", "8"], ["62,5", "7"], ["62,5", "7"], ["62,5", "6"]]);
  await finish(p);
  st = await S(p);
  assert.deepEqual(st.history[0].entries[0].pr, ["carga", "1rm"]);
  assert.match(await p.textContent(".toast"), /Recorde/);
  ok("recorde detectado e avisado");

  // 5. Deload na semana 8
  await p.click('.cycle [aria-label="Semana anterior"]');
  assert.match(await p.textContent(".cycle"), /Semana 8 de 8 · Deload/);
  assert.match(await p.textContent(`${card(0)} .prescr`), /^2 × 6–8 deload/);
  assert.equal(await p.locator(`${card(0)} .set`).count(), 2);
  assert.match(await p.textContent(`${card(0)} .tip`), /Deload: mantenha 62,5 kg/);
  await p.click('.cycle [aria-label="Próxima semana"]');
  assert.match(await p.textContent(".cycle"), /Semana 1 de 8/);
  ok("deload: metade das séries e sugestão própria");

  // 6. Histórico: volume, evolução, editar e apagar
  await p.click("#tab-hist");
  assert.match(await p.textContent("#vol"), /Peito\s*9 \/ 15/);
  assert.equal(await p.locator("#evo-body .c-dot").count(), 2);
  await p.selectOption("#evo-ex", "supino-reto-com-barra");
  await p.hover("#evo-body svg", { position: { x: 300, y: 80 } });
  assert.match(await p.textContent("#evo-body .c-tip"), /1RM est\./);
  await p.click("#hist details >> nth=0"); await p.click('#hist [data-act="edit"] >> nth=0');
  await p.fill("#hist .h-edit input[data-f='reps'] >> nth=3", "8"); await p.click("#hist .h-edit button[type=submit]");
  st = await S(p);
  assert.equal(st.last["supino-reto-com-barra"].sets[3].reps, "8");
  await p.click("#hist details >> nth=0"); await p.click('#hist [data-act="del"] >> nth=0'); await p.click('#hist [data-act="del-yes"]');
  st = await S(p);
  assert.equal(st.history.length, 1); assert.equal(st.last["supino-reto-com-barra"].sets[0].kg, "60", "última vez volta ao treino anterior");
  ok("volume semanal, gráfico com tooltip, editar e apagar treino");

  // 7. Peso corporal com tendência
  await p.evaluate(() => { const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return isoDay(x); };
    S.body = [[13, 74.0], [10, 74.1], [6, 74.4], [3, 74.5]].map(([n, kg]) => ({ d: d(n), kg, t: 1 })); save(); renderBody(); });
  await p.fill("#body-kg", "74,6"); await p.click("#body-form button");
  assert.match(await p.textContent("#body-msg"), /\+0,5 kg\/semana — dentro da meta/);
  assert.equal(await p.locator("#body-chart .c-dot").count(), 5);
  ok("peso corporal: registro, gráfico e tendência");
  if (process.env.SHOTS) { await p.click("#tab-treino"); await p.click(`${card(2)} .ex-tab[data-alt="1"]`); await p.locator(card(2)).screenshot({ path: process.env.SHOTS + "/tab.png" }); await p.click(`${card(2)} .ex-tab[data-alt="0"]`); await p.click("#tab-hist"); await p.screenshot({ path: process.env.SHOTS + "/hist.png", fullPage: true }); }

  // 8. Backup: CSV e JSON, importação em aparelho novo
  const [csv] = await Promise.all([p.waitForEvent("download"), p.click("#exp-csv")]);
  const csvText = await (await import("node:fs/promises")).readFile(await csv.path(), "utf8");
  assert.match(csvText, /^﻿data;treino;exercicio;alternativa;serie;carga_kg;reps;duracao_min/);
  assert.match(csvText, /Supino reto com barra;não;1;60;8/);
  const [js] = await Promise.all([p.waitForEvent("download"), p.click("#exp-json")]);
  const p2 = await open("UA");
  await p2.click("#tab-hist"); await p2.setInputFiles("#imp-json", await js.path());
  st = await S(p2);
  assert.equal(st.history.length, 1); assert.equal(st.body.filter(b => b.kg).length, 5);
  ok("exportar CSV/JSON e importar backup");

  // 9. Dois aparelhos pelo banco: junção por exercício, zerar e apagar propagam
  const A = await open("UB", { connect: true }), B = await open("UB", { connect: true });
  await A.click(`${card(0)} .set[data-j="0"]`); await A.waitForTimeout(2200);
  await B.evaluate(() => Sync.run()); await B.waitForTimeout(300);
  await B.fill(field(1, 0, "kg"), "50"); await B.click(`${card(1)} .set[data-j="0"]`); await B.waitForTimeout(2200);
  await A.evaluate(() => Sync.run()); await A.waitForTimeout(300);
  st = await S(A);
  assert.equal(st.cur.UB["supino-inclinado-com-barra"].sets[0].done, true);
  assert.equal(st.cur.UB["remada-curvada-com-barra"].sets[0].kg, "50", "mudança do outro aparelho preservada");
  await A.click("#reset"); await A.waitForTimeout(2200);
  await B.evaluate(() => Sync.run()); await B.waitForTimeout(300);
  assert.equal(Object.keys((await S(B)).cur.UB || {}).length, 0, "zerar no A zera no B");
  await doSets(A, 0, [["40", "8"]]); await finish(A); await A.waitForTimeout(800);
  await B.evaluate(() => Sync.run()); await B.waitForTimeout(300);
  const id = (await S(B)).history[0].id;
  await A.click("#tab-hist"); await A.click("#hist details >> nth=0"); await A.click('#hist [data-act="del"] >> nth=0'); await A.click('#hist [data-act="del-yes"]'); await A.waitForTimeout(800);
  const srv = await api("state");
  assert.equal(srv.sessions.some(h => h.id === id), false); assert.ok(srv.deleted.includes(id));
  await B.evaluate(() => Sync.run()); await B.waitForTimeout(300);
  assert.equal((await S(B)).history.some(h => h.id === id), false, "apagado no A some no B");
  // Banco sem um treino que o aparelho tem (ex.: banco novo): o treino é reenviado, não apagado.
  const orphan = { id: "orfao-1", wid: "UB", date: "01/10/2026", finishedAt: 1, entries: [{ ex: "face-pull", alt: false, n: "Face pull", log: [{ kg: "20", reps: "15" }], kg: "20", reps: "15", sets: 1, of: 2 }] };
  await B.evaluate(h => { S.history.push(h); saveLocal(); }, orphan);
  await B.evaluate(() => Sync.run()); await B.waitForTimeout(500);
  assert.ok((await S(B)).history.some(h => h.id === "orfao-1"), "treino que falta no servidor não é apagado");
  assert.ok((await api("state")).sessions.some(h => h.id === "orfao-1"), "e é reenviado ao servidor");
  ok("sincronização: junção, zerar e apagar entre aparelhos");

  assert.deepEqual(errors, [], "sem erros de JavaScript na página");
  ok("nenhum erro de JavaScript");
  console.log("E2E ok: todos os testes passaram");
} finally {
  await browser.close(); server.kill();
}

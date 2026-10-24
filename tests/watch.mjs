// Testes da lógica do app do relógio. npm run test:watch
import assert from "node:assert/strict";
import { pickDay, advance } from "../watch/src/common/logic.js";
import plan from "../watch/src/common/plan.js";

assert.equal(pickDay(plan.week, 0), "UA");
assert.equal(pickDay(plan.week, 2), "UB", "quarta (descanso) mostra o próximo treino");
assert.equal(pickDay(plan.week, 5), "UA", "fim de semana vira para segunda");
const ex = [{ n: "A", s: 2, rest: 90 }, { n: "B", s: 1, rest: 60 }];
assert.deepEqual(advance({ ex: 0, set: 0 }, ex), { pos: { ex: 0, set: 1 }, rest: 90 });
assert.deepEqual(advance({ ex: 0, set: 1 }, ex), { pos: { ex: 1, set: 0 }, rest: 0 }, "última série: sem descanso");
assert.deepEqual(advance({ ex: 2, set: 0 }, ex), { pos: { ex: 2, set: 0 }, rest: 0 }, "treino acabado não avança");
console.log("Relógio ok: todos os testes passaram");

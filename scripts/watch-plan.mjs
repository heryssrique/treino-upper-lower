// Gera watch/src/common/plan.js a partir de js/plan.js: o relógio usa o mesmo plano do app.
// npm run watch:plan (rode de novo sempre que mudar o plano)
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../js/plan.js", import.meta.url), "utf8");
const { WORKOUTS, WEEK } = vm.runInNewContext(src + "\n;({ WORKOUTS, WEEK })");
const plan = {
  week: WEEK.map(d => d.w),
  workouts: Object.fromEntries(Object.entries(WORKOUTS).map(([k, W]) => [k, { name: W.name, ex: W.ex.map(x => ({ n: x.n, s: x.s, rest: x.rest })) }]))
};
await writeFile(new URL("../watch/src/common/plan.js", import.meta.url), "// Gerado por scripts/watch-plan.mjs: não edite à mão.\nexport default " + JSON.stringify(plan) + ";\n");
console.log("watch/src/common/plan.js atualizado");

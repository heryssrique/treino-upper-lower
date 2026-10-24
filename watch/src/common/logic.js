// Regras do relógio, sem APIs do sistema (testadas em tests/watch.mjs).

// Treino de hoje; em dia de descanso, o próximo da semana (como no app). day: 0 = segunda.
export function pickDay(week, day) {
  for (var k = 0; k < 7; k++) { var i = (day + k) % 7; if (week[i]) return week[i]; }
  return null;
}

// Série feita: avança e diz quanto descansar. Última série do exercício vai direto ao próximo, sem descanso.
export function advance(pos, ex) {
  var x = ex[pos.ex];
  if (!x) return { pos: pos, rest: 0 };
  if (pos.set + 1 < x.s) return { pos: { ex: pos.ex, set: pos.set + 1 }, rest: x.rest };
  return { pos: { ex: pos.ex + 1, set: 0 }, rest: 0 };
}

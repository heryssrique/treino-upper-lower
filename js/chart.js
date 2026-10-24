/* Gráfico de linha de uma série (SVG, sem biblioteca): eixo de tempo real,
   grade discreta, pontos com borda da cor do fundo e tooltip ao tocar/passar
   o dedo. Uma série só: o título da seção nomeia o que é medido, sem legenda. */
function niceTicks(min, max, n = 4){
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 1e6; v += step) out.push(+v.toFixed(6));
  return out;
}
const fmtNum = v => String(Math.round(v * 10) / 10).replace(".", ",");
const fmtDay = ms => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// points: [{ x: ms, y: número }]; tip(i) devolve o HTML do tooltip do ponto i.
function mountChart(el, { points, tip, unit = "" }){
  // Desenha na largura real do contêiner, para o texto dos eixos sair no tamanho certo.
  // Em aba escondida (largura 0) usa 340; js/app.js redesenha ao abrir a aba.
  const W = Math.max(280, el.clientWidth || 340), H = 190, ml = 42, mr = 12, mt = 12, mb = 26;
  if (!points.length) { el.innerHTML = ""; return; }
  const ys = points.map(p => p.y), yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const X = x => x1 === x0 ? (ml + W - mr) / 2 : ml + (x - x0) / (x1 - x0) * (W - ml - mr);
  const Y = y => mt + (1 - (y - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - mt - mb);
  const pts = points.map(p => [X(p.x), Y(p.y)]);
  const xl = x1 === x0 ? [x0] : [x0, x1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico ao longo do tempo; os valores estão na tabela abaixo">
    ${yt.map(v => `<line class="c-grid" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="c-ax" x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${fmtNum(v)}${unit}</text>`).join("")}
    ${xl.map((v, i) => `<text class="c-ax" x="${X(v)}" y="${H - 8}" text-anchor="${xl.length === 1 ? "middle" : i ? "end" : "start"}">${fmtDay(v)}</text>`).join("")}
    <line class="c-cross" y1="${mt}" y2="${H - mb}" visibility="hidden"/>
    ${pts.length > 1 ? `<polyline class="c-line" points="${pts.map(p => p.join(",")).join(" ")}"/>` : ""}
    ${pts.map(([x, y]) => `<circle class="c-dot" cx="${x}" cy="${y}" r="4.5"/>`).join("")}
    <rect class="c-hit" x="${ml}" y="0" width="${W - ml - mr}" height="${H}"/>
  </svg><div class="c-tip" hidden></div>`;
  const svg = el.querySelector("svg"), cross = el.querySelector(".c-cross"), tipEl = el.querySelector(".c-tip");
  const dots = [...el.querySelectorAll(".c-dot")];
  const show = ev => {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * W;
    let i = 0; pts.forEach((p, k) => { if (Math.abs(p[0] - vx) < Math.abs(pts[i][0] - vx)) i = k; });
    cross.setAttribute("x1", pts[i][0]); cross.setAttribute("x2", pts[i][0]); cross.setAttribute("visibility", "visible");
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    tipEl.innerHTML = tip(i); tipEl.hidden = false;
    const left = pts[i][0] / W * r.width, w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(0, Math.min(r.width - w, left - w / 2)) + "px";
    tipEl.style.top = Math.max(0, pts[i][1] / H * r.height - tipEl.offsetHeight - 12) + "px";
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); tipEl.hidden = true; dots.forEach(d => d.classList.remove("on")); };
  svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show); svg.addEventListener("pointerleave", hide);
}

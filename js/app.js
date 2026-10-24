/* ---------- tabs ---------- */
document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab"); if (!b) return;
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t === b));
  ["treino","guia","hist"].forEach(v => $("#view-"+v).hidden = v !== b.dataset.view);
  if (b.dataset.view === "hist") renderHistory(); // gráficos precisam da aba visível para medir a largura
});


/* ---------- notificação de fim do descanso ----------
   O service worker espera até o fim do descanso e mostra a notificação,
   mesmo com a tela bloqueada ou o app em segundo plano. */
const canNotify = "Notification" in window && "serviceWorker" in navigator;
function updateNotifyBtn(){
  $("#notify").hidden = !(canNotify && Notification.permission === "default");
}
async function askNotify(){
  if (!canNotify || Notification.permission !== "default") return;
  try { await Notification.requestPermission(); } catch(e) {}
  updateNotifyBtn();
  if (Notification.permission === "granted") { toast("Avisos de descanso ativados"); if (!$("#timer").hidden) scheduleNotify(tLabel); }
}
async function swPost(msg){
  if (!canNotify) return;
  try { const reg = await navigator.serviceWorker.ready; reg.active && reg.active.postMessage(msg); } catch(e) {}
}
function scheduleNotify(label){
  if (!canNotify || Notification.permission !== "granted") return;
  swPost({ type:"rest", at:tEnd, label });
}
function cancelNotify(){ swPost({ type:"rest-cancel" }); }
$("#notify").addEventListener("click", askNotify);
updateNotifyBtn();

/* ---------- PWA: instalação e uso offline ---------- */
if ("serviceWorker" in navigator) {
  // Procura versão nova do service worker ao abrir e sempre que o app volta à tela,
  // para o app instalado (que fica aberto em segundo plano) não ficar desatualizado.
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {}));
}
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#install").hidden = false; });
$("#install").addEventListener("click", async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; $("#install").hidden = true;
});
window.addEventListener("appinstalled", () => { $("#install").hidden = true; toast("App instalado"); });
/* ---------- início ---------- */
renderWeek(); renderWorkout(); renderHistory();
Sync.run();
keepAwake(anyActive());
let resizeT = null;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$("#view-hist").hidden) renderHistory(); }, 200); });

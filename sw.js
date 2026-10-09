// Service worker: deixa o app abrir sem internet (academia sem sinal).
const CACHE = "treino-v4";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Página: rede primeiro (pega atualizações), cache se estiver offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Arquivos do app e fontes do Google: cache primeiro, atualiza em segundo plano.
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.includes("/api/")) return; // dados do banco nunca vêm do cache
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Cronômetro do descanso na notificação (tela de bloqueio). A página manda o
// horário de término; o service worker atualiza a notificação a cada segundo
// com o tempo restante e, no fim, troca por um aviso com vibração. Fica acordado
// via waitUntil (até ~5 min por evento no Chrome — cobre o descanso mais longo).
// Com o app aberto e em foco, a notificação some: a barra da própria página basta.
const TAG = "descanso";
const ICON = { icon: "icons/icon-192.png", badge: "icons/badge-96.png" };
let rest = null, restGen = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const clock = t => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

async function appInFront() {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return wins.some(w => w.visibilityState === "visible" && w.focused);
}
async function closeRest() {
  (await self.registration.getNotifications({ tag: TAG })).forEach(n => n.close());
}
async function tellPage(msg) {
  (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).forEach(w => w.postMessage(msg));
}

// Um único laço ativo: cada novo agendamento incrementa restGen e o anterior encerra.
async function runRest(gen) {
  while (gen === restGen && rest) {
    const left = Math.ceil((rest.end - Date.now()) / 1000);
    const front = await appInFront();
    if (gen !== restGen) return;
    if (left <= 0) {
      if (front) await closeRest();
      else await self.registration.showNotification("Descanso encerrado", {
        ...ICON, body: `Hora da próxima série — ${rest.label}`, tag: TAG, renotify: true,
        vibrate: [300, 150, 300, 150, 300]
      });
      rest = null;
      return;
    }
    if (front) await closeRest();
    else await self.registration.showNotification(`Descanso · ${fmt(left)}`, {
      ...ICON, body: `${rest.label}\nTermina às ${clock(rest.end)}`, tag: TAG,
      renotify: false, silent: true, requireInteraction: true,
      actions: [{ action: "plus", title: "+15s" }, { action: "stop", title: "Encerrar" }]
    });
    // Acorda na virada do próximo segundo, para o número não "pular".
    await sleep(((rest?.end ?? Date.now()) - Date.now()) % 1000 || 1000);
  }
}

self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "rest-cancel") { restGen++; rest = null; e.waitUntil(closeRest()); return; }
  if (d.type !== "rest") return;
  rest = { end: d.at, total: d.total, label: d.label };
  e.waitUntil(runRest(++restGen));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "plus" && rest) {
    rest.end = Math.max(rest.end, Date.now()) + 15000; rest.total += 15;
    e.waitUntil(Promise.all([tellPage({ type: "rest-sync", at: rest.end, total: rest.total }), runRest(++restGen)]));
    return;
  }
  if (e.action === "stop") {
    restGen++; rest = null;
    e.waitUntil(Promise.all([closeRest(), tellPage({ type: "rest-stopped" })]));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    const w = wins[0];
    return w ? w.focus() : self.clients.openWindow("./");
  }));
});

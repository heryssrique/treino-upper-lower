// Service worker: deixa o app abrir sem internet (academia sem sinal).
const CACHE = "treino-v2";
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

// Aviso de fim do descanso. A página manda o horário de término; o service worker
// fica acordado esperando (waitUntil, até ~5 min no Chrome) e mostra a notificação
// mesmo com a tela bloqueada. Cada novo agendamento substitui o anterior.
let restGen = 0;
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "rest-cancel") { restGen++; return; }
  if (d.type !== "rest") return;
  const gen = ++restGen;
  const wait = Math.max(0, d.at - Date.now());
  e.waitUntil(new Promise(r => setTimeout(r, wait)).then(async () => {
    if (gen !== restGen) return;
    // Se o app está aberto e visível na tela, ele já toca o bipe.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === "visible" && w.focused)) return;
    await self.registration.showNotification(d.title, {
      body: d.body,
      tag: "descanso",
      renotify: true,
      vibrate: [300, 150, 300, 150, 300],
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png"
    });
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    const w = wins[0];
    return w ? w.focus() : self.clients.openWindow("./");
  }));
});

/* Actif Flow service worker: offline openen + meldingen op het vergrendelscherm */
const CACHE = "actifflow-v2";
const API = "https://ajqedeqauimohmhwlvuo.supabase.co/functions/v1/api";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Eerst het netwerk (zodat nieuwe versies meteen binnenkomen), anders de opgeslagen versie */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))),
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Tijd om even te bewegen";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Zin in 2 minuten beweging?",
    icon: "icon-192.png",
    badge: "badge-96.png",
    tag: d.tag || "actif-flow",
    renotify: true,
    data: { url: d.url || "./", deviceId: d.deviceId || null },
    actions: [
      { action: "start", title: "Start nu" },
      { action: "later", title: "Over 15 min" },
    ],
  }));
});

self.addEventListener("notificationclick", (e) => {
  const n = e.notification;
  n.close();
  if (e.action === "later") {
    const id = n.data && n.data.deviceId;
    if (id) {
      e.waitUntil(fetch(API + "/snooze", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: id, minutes: 15 }),
      }).catch(() => {}));
    }
    return;
  }
  const r = e.action === "start" ? "start" : "1";
  const target = new URL("./?r=" + r, self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: "open", r });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

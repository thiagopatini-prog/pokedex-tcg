/* Cache simples: o app abre mesmo sem internet e se atualiza sozinho na abertura seguinte. */
const V = 'pktcg-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png'].concat([1,2,3,4,5,6,7,8,9].map(n => 'img/atlas-g' + n + '.webp'));
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(e.request, copy)); } return res; }).catch(() => cached);
    return cached || net;
  }));
});

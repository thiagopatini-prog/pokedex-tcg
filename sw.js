/* Cache: abre mesmo sem internet. Arquivos do app: tenta a rede primeiro (sempre a versão nova); imagens: usa o guardado e atualiza ao fundo. */
const V = 'pktcg-v11';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'db.js', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png'].concat([1,2,3,4,5,6,7,8,9].map(n => 'img/atlas-g' + n + '.webp'));
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isImg = /\.(webp|png|jpg|svg)$/.test(u.pathname);
  const put = res => { if (res && res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(e.request, copy)); } return res; };
  if (isImg) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(put)));
  } else {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(put).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});

// 앱 화면 파일을 저장해 두어 바탕화면 아이콘으로 빠르게 열리게 합니다. 회원 데이터는 저장하지 않습니다.
const CACHE = 'cgr-v3-3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/ocr.js', 'js/msg.js', 'js/config.js',
  'assets/logo-emblem.svg', 'assets/school-logo.png', 'assets/icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 화면 파일은 네트워크 우선(최신 반영), 실패하면 저장본 사용
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

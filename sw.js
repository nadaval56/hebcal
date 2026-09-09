/* sw.js — שירות מטמון: האפליקציה עובדת גם ללא חיבור לאינטרנט */
var CACHE = 'luach-v1';
var ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/hdate.js',
  'js/zmanim.js',
  'js/holidays.js',
  'js/cities.js',
  'js/app.js',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-180.png',
  'assets/icon-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  // ניווט: מהמטמון קודם, עם רענון ברקע
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then(function (hit) {
        var net = fetch(req).then(function (res) {
          caches.open(CACHE).then(function (c) { c.put('index.html', res.clone()); });
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.status === 200) {
            caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
          }
        }).catch(function () { });
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

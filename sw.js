/* sw.js — מטמון לעבודה ללא אינטרנט, עם עדכון כפוי בכל טעינה מקוונת.
   כשמתפרסמת גרסה חדשה באתר, המכשיר מקבל אותה מיד — בלי מטמון תקוע. */
var VERSION = '1.12.1';
var CACHE = 'luach-' + VERSION;
var ASSETS = [
  './', 'index.html', 'css/app.css',
  'js/hdate.js', 'js/zmanim.js', 'js/holidays.js', 'js/cities.js', 'js/app.js',
  'manifest.webmanifest', 'assets/icon.svg', 'assets/icon-192.png',
  'assets/icon-512.png', 'assets/icon-180.png', 'assets/icon-maskable.png', 'assets/og.png',
  'assets/fonts/heebo-hebrew.woff2', 'assets/fonts/heebo-latin.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
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

/** מהרשת קודם: תמיד הגרסה העדכנית כשיש חיבור, ומהמטמון כשאין. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  var sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    // גופנים וכדומה: מהמטמון קודם, רשת כגיבוי
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
      })
    );
    return;
  }

  var key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(
    fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(key, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(key).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

/*
 * Service worker for Audio Clipper.
 *
 * The app has no runtime network dependencies — once these files are cached it
 * works with the radio off. Bump CACHE_VERSION whenever a shell file changes;
 * the activate handler drops every older cache.
 */
var CACHE_VERSION = 'audio-clipper-v1';

var SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'vendor/lame.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // addAll is all-or-nothing; request each one so a single 404 during
      // development does not leave the app with no cache at all.
      return Promise.all(SHELL.map(function (path) {
        return cache.add(new Request(path, { cache: 'reload' })).catch(function () {
          console.warn('[sw] could not precache', path);
        });
      }));
    })
  );
  // Deliberately no skipWaiting: swapping app.js out from under a running
  // export would be worse than waiting for the next launch.
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  // The page asks for this explicitly when the user accepts an update.
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so a deployed update lands, fall back to the
  // cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put('index.html', copy);
        });
        return response;
      }).catch(function () {
        return caches.match('index.html').then(function (cached) {
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  // Everything else: serve from cache immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || network;
    })
  );
});

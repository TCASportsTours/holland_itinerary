// Self-destroying service worker.
//
// If an earlier version of the site ever registered a service worker at /sw.js,
// that old worker can keep serving a cached (old) copy of the app forever — which
// is the usual reason a freshly uploaded version "reverts" on every open/refresh.
//
// This file replaces it with a worker that deletes all caches, unregisters itself,
// and reloads any open tabs so they pull the live files. Once it has run there is
// no service worker left, so the app is always served fresh.
//
// Upload this as /sw.js alongside index.html. It is harmless if no old worker exists.

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
    } catch (e) {}
  })());
});

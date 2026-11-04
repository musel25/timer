// Imported by the generated service worker. Keep static precaches for offline
// startup, but permanently remove the former account-shared API response cache.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('api'));
});

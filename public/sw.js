// Service Worker: zeigt Benachrichtigungen an und öffnet die App beim Antippen.
// Der push-Handler ist für einen späteren Server-Push vorbereitet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.title || 'Reading Tracker', { body: d.body || '', icon: 'icon-192.png' })); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => (l.length ? l[0].focus() : self.clients.openWindow(self.registration.scope)))); });

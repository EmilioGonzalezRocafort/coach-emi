const CACHE_NAME = 'coach-emi-v1';

// ── Install: cache the app shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'])
    ).catch(() => {}) // don't block install if some assets fail
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first (offline support) ─────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── Notification scheduling ───────────────────────────────────────────────────
let reminderTimer = null;

self.addEventListener('message', event => {
  const { type, timeStr, hasLoggedToday } = event.data || {};
  if (type === 'SCHEDULE_REMINDER') {
    scheduleReminder(timeStr, hasLoggedToday);
  }
  if (type === 'CANCEL_REMINDER') {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  }
});

function scheduleReminder(timeStr, hasLoggedToday) {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if (!timeStr) return;

  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  // If time has already passed today, aim for tomorrow
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target - now;
  const todayISO = now.toISOString().slice(0, 10);

  reminderTimer = setTimeout(() => {
    self.registration.showNotification('💪 Coach Emi', {
      body: '¡Es hora de registrar tus actividades de hoy!',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'daily-reminder-' + todayISO,
      renotify: false,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: '📝 Registrar ahora' }
      ],
      data: { url: './' }
    });
    // Re-schedule for the next day automatically
    scheduleReminder(timeStr, false);
  }, delay);

  console.log(`[SW] Reminder scheduled in ${Math.round(delay / 60000)} min`);
}

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') || client.url.endsWith('/')) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

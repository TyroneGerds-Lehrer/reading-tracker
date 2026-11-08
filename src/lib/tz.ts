// Zeitzone: gespeicherte Profil-Einstellung (lokal gespiegelt), sonst die des Browsers.
export const TZ = localStorage.getItem('rt-tz') || Intl.DateTimeFormat().resolvedOptions().timeZone;

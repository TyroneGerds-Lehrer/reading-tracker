import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { TZ } from './lib/tz';
import { computeStats, dayKey, type Session } from './lib/stats';
import { btn, card, inp } from './ui';

const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const registerSW = async () => { if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js'); } catch { /* ignorieren */ } } };
async function show(title: string, body: string) {
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(title, { body, icon: import.meta.env.BASE_URL + 'icon-192.png', tag: 'rt-daily' }); else new Notification(title, { body }); } catch { /* ignorieren */ }
}

// Lokale Erinnerung: erscheint zur gewählten Uhrzeit (bzw. beim nächsten Öffnen danach), falls heute noch nicht gelesen wurde.
export function useReminder(sessions: Session[]) {
  useEffect(() => {
    if (localStorage.getItem('rt-remind')) void registerSW();
    const tick = () => {
      const t = localStorage.getItem('rt-remind'); if (!t || !supported() || Notification.permission !== 'granted') return;
      const now = new Date(), hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now), today = dayKey(now, TZ);
      if (hm < t || localStorage.getItem('rt-remind-last') === today) return;
      localStorage.setItem('rt-remind-last', today);
      if (computeStats(sessions, [], { from: today, to: today }, TZ).pages > 0) return;
      const streak = computeStats(sessions, [], null, TZ).currentStreak;
      void show('Zeit zu lesen', streak > 0 ? `Dein Streak von ${streak} Tag${streak > 1 ? 'en' : ''} wartet auf dich – schon 10 Minuten reichen.` : 'Eine kurze Lesesession genügt, um heute dranzubleiben.');
    };
    tick(); const id = setInterval(tick, 60000); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [sessions]);
}

export function ReminderCard() {
  const [time, setTime] = useState(localStorage.getItem('rt-remind') ?? '19:00'), [on, setOn] = useState(!!localStorage.getItem('rt-remind')), [msg, setMsg] = useState('');
  const enable = async () => {
    if (!supported()) return setMsg('Dieses Gerät bzw. dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone musst du die App zuerst zum Home-Bildschirm hinzufügen (iOS 16.4 oder neuer).');
    if ((await Notification.requestPermission()) !== 'granted') return setMsg('Benachrichtigungen sind nicht erlaubt. Du kannst sie in den Browser- bzw. Systemeinstellungen freigeben.');
    localStorage.setItem('rt-remind', time); localStorage.removeItem('rt-remind-last'); await registerSW(); setOn(true); setMsg(`Erinnerung für ${time} Uhr ist aktiv.`);
  };
  const off = () => { localStorage.removeItem('rt-remind'); setOn(false); setMsg('Erinnerung ausgeschaltet.'); };
  return <div className={card + ' space-y-3'}><h3 className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4 text-indigo-500" />Tägliche Lese-Erinnerung</h3>
    <div className="flex flex-wrap items-center gap-2"><input className={inp} type="time" value={time} onChange={e => setTime(e.target.value)} />
      {on ? <><button className={btn} onClick={() => void enable()}>Zeit ändern</button><button className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700" onClick={off}>Ausschalten</button></> : <button className={btn} onClick={() => void enable()}>Erinnerung aktivieren</button>}
      <button className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700" onClick={() => void show('Test', 'So sieht deine Erinnerung aus.')}>Test</button></div>
    {msg && <p className="text-sm text-indigo-700 dark:text-indigo-300">{msg}</p>}
    <p className="text-xs text-zinc-500">Die Erinnerung erscheint nur, wenn heute noch nicht gelesen wurde und die App im Browser bzw. als installierte App geöffnet oder im Hintergrund aktiv ist. Bei komplett geschlossener App sind echte Push-Nachrichten nur mit einem eigenen Server möglich.</p></div>;
}

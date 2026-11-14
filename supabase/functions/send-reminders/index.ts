// Supabase Edge Function: verschickt Lese-Erinnerungen per Web Push.
// Wird alle 15 Minuten per pg_cron aufgerufen (Header x-cron-secret). "Verify JWT" muss für diese Funktion AUS sein.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

Deno.serve(async req => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const { data: subs } = await sb.from('push_subscriptions').select('*');
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const now = new Date();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const hm = new Intl.DateTimeFormat('en-GB', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
      if (hm < s.remind_time || s.last_sent === today) continue;
      const { data: rows } = await sb.from('reading_sessions').select('session_date').eq('user_id', s.user_id).gte('session_date', shift(today, -120)).limit(5000);
      const days = new Set((rows ?? []).map(r => r.session_date as string));
      // Pausenmodus und eingesetzte Schutzschilde (Tabelle game_events; fehlt sie, bleibt die Liste leer)
      const { data: ev } = await sb.from('game_events').select('kind,event_date,end_date').eq('user_id', s.user_id).in('kind', ['pause', 'freeze']).gte('event_date', shift(today, -150));
      const prot = new Set<string>();
      for (const e of ev ?? []) { if (e.kind === 'freeze') prot.add(e.event_date as string); else { const end = (e.end_date ?? e.event_date) as string; for (let k = e.event_date as string, i = 0; k <= end && i < 62; k = shift(k, 1), i++) prot.add(k); } }
      await sb.from('push_subscriptions').update({ last_sent: today }).eq('id', s.id);
      if (days.has(today) || prot.has(today)) continue; // heute schon gelesen oder Pausenmodus: keine Nachricht
      let streak = 0, d = shift(today, -1); while (days.has(d) || prot.has(d)) { if (days.has(d)) streak++; d = shift(d, -1); }
      const body = streak > 0 ? `Dein Streak von ${streak} Tag${streak > 1 ? 'en' : ''} wartet auf dich – schon 10 Minuten reichen.` : 'Eine kurze Lesesession genügt, um heute dranzubleiben.';
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: 'Zeit zu lesen', body }));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id); // Abo nicht mehr gültig
      else console.error(e);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});

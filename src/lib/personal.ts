// Gemeinsame Personalisierung: EINE Berechnung des persönlichen "Tagesbilds", die Dashboard, Motivation,
// lokale Erinnerung (notify.tsx) und später Berichte nutzen. Reine Funktion, nur aus Sessions/Zielen berechnet.
import { computeStats, dayKey, type Session } from './stats';

export type GoalLike = { goal_type: string; target_value: number };
export type DayState = 'empty' | 'start' | 'risk' | 'secured' | 'goal';
export type WeekDay = { day: string; label: string; read: boolean; today: boolean; future: boolean };
export type Personal = {
  state: DayState;
  today: { minutes: number; pages: number; sessions: number };
  goalMin: number; goalSource: 'goal' | 'auto' | 'default'; goalNote: string;
  pct: number; pagesGoal: number | null;
  streak: number; longest: number; readToday: boolean;
  streakNote: string; week: WeekDay[];
  headline: string; text: string;
  notify: { title: string; body: string } | null; // nur, wenn heute noch nicht gelesen wurde
  report: string[]; // fertige Zeilen für spätere Berichte (z. B. Wochen-/Monatsbericht)
};

const dn = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const iso = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const days = (n: number) => `${n} Tag${n === 1 ? '' : 'e'}`;
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function personalize(sessions: Session[], goals: GoalLike[], tz: string, now = new Date()): Personal {
  const today = dayKey(now, tz), t = dn(today);
  const all = computeStats(sessions, [], null, tz), day = computeStats(sessions, [], { from: today, to: today }, tz);
  const past = computeStats(sessions, [], { from: iso(t - 30), to: iso(t - 1) }, tz); // letzte 30 Tage ohne heute
  const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now);

  // Tagesziel (Minuten): 1. eigenes Ziel "Lesezeit pro Tag", 2. Median deiner aktiven Tage (letzte 30 Tage), 3. Startwert
  const own = goals.find(g => g.goal_type === 'minutes_day' && g.target_value > 0);
  const typical = past.daily.length >= 5 ? Math.min(120, Math.max(10, Math.round(median(past.daily.map(d => d.minutes)) / 5) * 5)) : 0;
  const goalMin = own ? Math.round(own.target_value) : typical || 20;
  const goalSource = own ? 'goal' : typical ? 'auto' : 'default';
  const goalNote = own ? 'Tagesziel aus deinem Leseziel „Lesezeit pro Tag“.' : typical ? 'Tagesziel automatisch: dein üblicher Lesetag der letzten 30 Tage. Eigenes Ziel: Leseziele → „Lesezeit pro Tag“.' : 'Startwert für dein Tagesziel, bis genug Lesetage vorliegen. Eigenes Ziel: Leseziele → „Lesezeit pro Tag“.';

  const pph = past.pagesPerHour ?? all.pagesPerHour, pagesGoal = pph && pph > 0 ? Math.max(1, Math.round(goalMin * pph / 60)) : null;
  const minutes = Math.round(day.minutes), pages = day.pages, readToday = day.sessionsCount > 0;
  const streak = all.currentStreak, longest = all.longestStreak, pct = Math.round(minutes / goalMin * 100);
  const state: DayState = !all.sessionsCount ? 'empty' : minutes >= goalMin ? 'goal' : readToday ? 'secured' : streak > 0 ? 'risk' : 'start';

  const readDays = new Set(all.daily.map(d => d.day)), mon = t - ((new Date(t * 864e5).getUTCDay() + 6) % 7);
  const week: WeekDay[] = WD.map((label, i) => { const d = iso(mon + i); return { day: d, label, read: readDays.has(d), today: d === today, future: d > today }; });

  const pg = pagesGoal ? ` (ca. ${pagesGoal} Seiten)` : '';
  const left = Math.max(1, 24 - hour), late = hour >= 17 ? ` Es bleiben noch etwa ${left} Std.` : '';
  const rec = streak >= 2 && streak >= longest ? ' Das ist dein persönlicher Rekord!' : streak > 0 && longest > streak ? ` Bis zu deinem Rekord (${days(longest)}) fehlen ${days(longest - streak)}.` : '';
  const streakNote = streak === 0 ? (longest > 0 ? `Dein Rekord: ${days(longest)}.` : 'Lies heute, um deinen ersten Streak zu starten.') : readToday ? `Heute gesichert.${rec}` : `Heute noch offen.${rec}`;

  let headline: string, text: string, notify: Personal['notify'] = null;
  if (state === 'empty') { headline = 'Los geht’s!'; text = `Erfasse deine erste Lesesession. Dann siehst du hier deinen Tagesring, deinen Streak und deinen persönlichen Impuls. Startwert fürs Tagesziel: ${goalMin} Min.`; }
  else if (state === 'goal') { headline = 'Tagesziel geschafft!'; text = `${minutes} von ${goalMin} Min. und ${pages} Seiten gelesen. Dein Streak steht bei ${days(streak)} – morgen wäre Tag ${streak + 1}.`; }
  else if (state === 'secured') { headline = 'Streak für heute gesichert'; text = `${minutes} Min. und ${pages} Seiten gelesen. Noch ${goalMin - minutes} Min. bis zu deinem Tagesziel von ${goalMin} Min.`; }
  else if (state === 'risk') {
    headline = `Dein Streak von ${days(streak)} wartet`; text = `Heute noch nicht gelesen. ${goalMin} Min.${pg} halten ihn am Leben.${late}`;
    notify = { title: 'Zeit zu lesen', body: `Dein Streak von ${days(streak)} wartet auf dich – ${goalMin} Min.${pg} genügen.` };
  } else {
    headline = 'Neuer Streak, neuer Anfang'; text = `Starte heute mit ${goalMin} Min.${pg}.${longest > 0 ? ` Dein Rekord liegt bei ${days(longest)}.` : ''}`;
    notify = { title: 'Zeit zu lesen', body: `${goalMin} Min.${pg} heute starten einen neuen Streak.` };
  }

  const report = [`Heute: ${minutes} Min. · ${pages} Seiten (${pct} % vom Tagesziel ${goalMin} Min.)`, `Streak: ${days(streak)} (Rekord: ${days(longest)})`, `Lesetage diese Woche: ${week.filter(w => w.read).length} von ${week.filter(w => !w.future).length}`];
  return { state, today: { minutes, pages, sessions: day.sessionsCount }, goalMin, goalSource, goalNote, pct, pagesGoal, streak, longest, readToday, streakNote, week, headline, text, notify, report };
}

// Zentrale Statistik-Engine: reine Funktionen, nur aus Sessions/Büchern berechnet (keine erfundenen Werte).
export type Book = { id: string; user_id: string; title: string; author: string; genre?: string | null; total_pages: number; current_page: number; status: string; rating?: number | null; start_date?: string | null; finish_date?: string | null; cover_url?: string | null; isbn?: string | null; publication_year?: number | null; notes?: string | null; updated_at?: string };
export type Session = { id: string; user_id: string; book_id: string; session_date: string; start_time?: string | null; end_time?: string | null; duration_minutes: number; start_page: number; end_page: number; notes?: string | null; updated_at?: string };
export type Range = { from: string; to: string } | null; // YYYY-MM-DD, inklusive

export const pagesOf = (s: Session) => s.end_page - s.start_page; // immer berechnet, nie doppelt gezählt
export const isValid = (s: Session) => s.end_page >= s.start_page && s.start_page >= 0 && s.duration_minutes >= 0;
export const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayNum = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000; // DST-sicher
const hourIn = (iso: string, tz: string) => +new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
export const rangeFor = (preset: string, tz: string, now = new Date()): Range => {
  const today = dayKey(now, tz), y = +today.slice(0, 4), m = +today.slice(5, 7);
  const back = (n: number) => dayKey(new Date(now.getTime() - (n - 1) * 86400000), tz);
  const pad = (n: number) => String(n).padStart(2, '0'), last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (preset) {
    case '7': return { from: back(7), to: today };
    case '30': return { from: back(30), to: today };
    case '90': return { from: back(90), to: today };
    case 'month': return { from: `${y}-${pad(m)}-01`, to: today };
    case 'lastmonth': { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${last(yy, mm)}` }; }
    case 'year': return { from: `${y}-01-01`, to: today };
    case 'lastyear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: return null;
  }
};

export function computeStats(sessions: Session[], books: Book[], range: Range, tz: string) {
  const valid = sessions.filter(isValid);
  const inR = valid.filter(s => !range || (s.session_date >= range.from && s.session_date <= range.to));
  const byDay = new Map<string, { pages: number; minutes: number; sessions: number }>();
  for (const s of inR) { const d = byDay.get(s.session_date) ?? { pages: 0, minutes: 0, sessions: 0 }; d.pages += pagesOf(s); d.minutes += s.duration_minutes; d.sessions++; byDay.set(s.session_date, d); }
  const pages = inR.reduce((a, s) => a + pagesOf(s), 0), minutes = inR.reduce((a, s) => a + s.duration_minutes, 0);
  const activeDays = byDay.size, days = [...byDay.keys()].sort();
  const spanDays = range ? dayNum(range.to) - dayNum(range.from) + 1 : days.length ? dayNum(days[days.length - 1]) - dayNum(days[0]) + 1 : 0;
  const longestStreak = (() => { let best = 0, run = 0, prev = NaN; for (const k of days) { run = dayNum(k) === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = dayNum(k); } return best; })();
  const currentStreak = (() => { const set = new Set(valid.map(s => dayNum(s.session_date))); const t = dayNum(dayKey(new Date(), tz)); let c = 0, d = set.has(t) ? t : t - 1; while (set.has(d)) { c++; d--; } return c; })();
  const weekday = Array(7).fill(0).map(() => ({ minutes: 0, days: 0 }));
  for (const [k, v] of byDay) { const w = new Date(dayNum(k) * 86400000).getUTCDay(); weekday[w].minutes += v.minutes; weekday[w].days++; }
  const buckets = { morgens: 0, mittags: 0, abends: 0, nachts: 0 };
  for (const s of inR) if (s.start_time) { const h = hourIn(s.start_time, tz); buckets[h >= 5 && h < 11 ? 'morgens' : h >= 11 && h < 17 ? 'mittags' : h >= 17 && h < 22 ? 'abends' : 'nachts'] += s.duration_minutes; }
  const finished = books.filter(b => b.status === 'finished' && (!range || (!!b.finish_date && b.finish_date >= range.from && b.finish_date <= range.to)));
  const maxDay = [...byDay.entries()].sort((a, b) => b[1].pages - a[1].pages)[0];
  return {
    sessionsCount: inR.length, pages, minutes, activeDays, restDays: Math.max(0, spanDays - activeDays), finishedBooks: finished.length,
    avgPagesPerDay: spanDays ? pages / spanDays : 0, avgMinutesPerDay: spanDays ? minutes / spanDays : 0,
    pagesPerHour: minutes > 0 ? pages / (minutes / 60) : null, avgSessionMinutes: inR.length ? minutes / inR.length : 0,
    longestStreak, currentStreak, weekday, buckets,
    record: { maxPagesDay: maxDay ? { day: maxDay[0], pages: maxDay[1].pages } : null, longestSession: inR.reduce((a, s) => Math.max(a, s.duration_minutes), 0) },
    daily: days.map(k => ({ day: k, ...byDay.get(k)! })),
  };
}

// Trend-Erkenntnisse nur bei ausreichender Datenbasis (>= 5 aktive Tage je Vergleichszeitraum).
export function insights(sessions: Session[], books: Book[], tz: string): string[] {
  const out: string[] = [], now = new Date();
  const cur = computeStats(sessions, books, rangeFor('month', tz, now), tz), prev = computeStats(sessions, books, rangeFor('lastmonth', tz, now), tz);
  if (cur.activeDays >= 5 && prev.activeDays >= 5 && prev.pages > 0) {
    const p = Math.round((cur.pages / prev.pages - 1) * 100);
    if (Math.abs(p) >= 5) out.push(`Du hast diesen Monat ${Math.abs(p)} % ${p > 0 ? 'mehr' : 'weniger'} Seiten gelesen als im Vormonat (${cur.pages} vs. ${prev.pages}; der Monat läuft noch).`);
  }
  const all = computeStats(sessions, books, null, tz), names = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const w = all.weekday.map((v, i) => ({ i, avg: v.days >= 3 ? v.minutes / v.days : 0 })).sort((a, b) => b.avg - a.avg)[0];
  if (w && w.avg > 0) out.push(`${names[w.i]}s liest du im Schnitt am längsten (${Math.round(w.avg)} Min. pro aktivem Tag).`);
  if (all.pagesPerHour && all.minutes >= 300) out.push(`Du liest durchschnittlich ${Math.round(all.pagesPerHour)} Seiten pro Stunde.`);
  return out;
}

import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeStats, dayKey, type Book, type Session } from './lib/stats';

import { TZ } from './lib/tz';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const GRAD = ['from-indigo-600 to-violet-600', 'from-sky-600 to-indigo-600', 'from-emerald-600 to-teal-600', 'from-rose-600 to-orange-500', 'from-fuchsia-600 to-purple-600', 'from-amber-500 to-red-500', 'from-zinc-700 to-indigo-700'];
const fmt = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
type Slide = { t: string; big: string; sub: string; chart?: boolean };

function build(y: number, books: Book[], sessions: Session[]) {
  const today = dayKey(new Date(), TZ), end = `${y}-12-31` < today ? `${y}-12-31` : today;
  const s = computeStats(sessions, books, { from: `${y}-01-01`, to: end }, TZ), p = computeStats(sessions, books, { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, TZ);
  const fin = books.filter(b => b.status === 'finished' && b.finish_date?.startsWith(String(y)));
  const bk = new Map(books.map(b => [b.id, b] as const)), authors = new Map<string, number>(), genres = new Map<string, number>(), month: number[] = Array(12).fill(0);
  for (const d of s.daily) month[+d.day.slice(5, 7) - 1] += d.pages;
  for (const x of sessions) if (x.session_date >= `${y}-01-01` && x.session_date <= end && x.end_page >= x.start_page) { const a = bk.get(x.book_id)?.author; if (a) authors.set(a, (authors.get(a) ?? 0) + x.end_page - x.start_page); }
  for (const b of fin) if (b.genre) genres.set(b.genre, (genres.get(b.genre) ?? 0) + 1);
  const best = fin.filter(b => b.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0], longest = [...fin].sort((a, b) => b.total_pages - a.total_pages)[0];
  const mi = month.indexOf(Math.max(...month)), wd = top(new Map(s.weekday.map((v, i) => [WD[i], v.minutes] as const).filter(e => e[1] > 0))), au = top(authors), ge = top(genres);
  const cmp = (a: number, b: number, u: string) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)} % ${u}` : `${u}: kein Vorjahr`);
  const empty = s.sessionsCount === 0 && fin.length === 0;
  const slides: Slide[] = [
    { t: `Dein Lesejahr ${y}`, big: `${fin.length} Bücher`, sub: `${s.pages} Seiten gelesen` },
    { t: 'Deine Lesezeit', big: fmt(s.minutes), sub: `Ø ${Math.round(s.avgMinutesPerDay)} Min. pro Tag · ${s.activeDays} aktive Tage` },
    { t: 'Deine Favoriten', big: ge ? ge[0] : '–', sub: `Lieblingsgenre · Meistgelesener Autor: ${au ? au[0] : '–'}` },
    { t: 'Deine Bücher', big: best ? best.title : '–', sub: `Bestbewertet${best ? ` (${best.rating}★)` : ''} · Längstes Buch: ${longest ? `${longest.title} (${longest.total_pages} S.)` : '–'}` },
    { t: 'Dein Rhythmus', big: month[mi] > 0 ? MONTHS[mi] : '–', sub: `Aktivster Monat · Aktivster Wochentag: ${wd ? wd[0] : '–'}`, chart: true },
    { t: 'Deine Rekorde', big: `${s.longestStreak} Tage Streak`, sub: `${s.record.maxPagesDay ? `Max. ${s.record.maxPagesDay.pages} Seiten an einem Tag` : 'Kein Tagesrekord'} · Längste Session: ${Math.round(s.record.longestSession)} Min.` },
    { t: `Im Vergleich zu ${y - 1}`, big: cmp(s.pages, p.pages, 'Seiten'), sub: `${cmp(s.minutes, p.minutes, 'Lesezeit')} · Bücher: ${fin.length} vs. ${books.filter(b => b.status === 'finished' && b.finish_date?.startsWith(String(y - 1))).length}` },
  ];
  return { slides, empty, month: month.map((v, i) => ({ m: MONTHS[i].slice(0, 3), pages: v })) };
}

function image(name: string, lines: string[], big = false) {
  const c = document.createElement('canvas'); c.width = c.height = 1080; const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#7c3aed'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080); x.fillStyle = '#fff';
  lines.forEach((l, i) => { x.font = i === 0 ? 'bold 64px sans-serif' : big && i === 1 ? 'bold 84px sans-serif' : '44px sans-serif'; x.fillText(l.slice(0, 40), 80, 170 + i * (big && i === 0 ? 150 : 120), 920); });
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = name; a.click();
}

export function Wrapped({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const cur = new Date().getFullYear(), years = useMemo(() => { const a = new Set(sessions.map(s => +s.session_date.slice(0, 4))); books.forEach(b => b.finish_date && a.add(+b.finish_date.slice(0, 4))); return [...a].sort((p, q) => q - p); }, [sessions, books]);
  const [y, setY] = useState(years[0] ?? cur), [i, setI] = useState(0);
  const W = useMemo(() => build(y, books, sessions), [y, books, sessions]);
  if (!years.length) return <p className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">Noch keine Daten für einen Jahresrückblick.</p>;
  const sl = W.slides[i], btn = 'rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40';
  const sum = [`Mein Lesejahr ${y}`, ...W.slides.slice(0, 7).filter((_, k) => k !== 3).map(s => `${s.t.replace('Dein ', '').replace('Deine ', '')}: ${s.big}`)];
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><select className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" value={y} onChange={e => { setY(+e.target.value); setI(0); }}>{years.map(v => <option key={v} value={v}>{v}{v === cur ? ' (laufend)' : ''}</option>)}</select>
    <button className={btn} onClick={() => window.print()}>Als PDF speichern</button><button className={btn} onClick={() => image(`wrapped-${y}-seite${i + 1}.png`, [sl.t, sl.big, ...sl.sub.split(' · ')], true)}>Seite als Bild</button><button className={btn} onClick={() => image(`wrapped-${y}-social.png`, sum)}>Social-Bild</button></div>
    {W.empty ? <p className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">Für {y} gibt es keine Daten.</p> : <>
      <div key={i} className={`relative flex min-h-[22rem] flex-col justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${GRAD[i % GRAD.length]} p-6 text-white shadow-xl md:p-12`} style={{ animation: 'rtfade .5s ease' }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" /><div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-black/10" /><div className="relative text-sm uppercase tracking-widest opacity-80">{sl.t}</div><div className="relative my-3 text-4xl font-bold leading-tight md:text-6xl">{sl.big}</div><div className="relative text-lg opacity-90">{sl.sub}</div>
        {sl.chart && <div className="rt-dark-chart relative mt-4 h-40"><ResponsiveContainer><BarChart data={W.month}><XAxis dataKey="m" stroke="#fff" /><YAxis stroke="#fff" /><Tooltip /><Bar dataKey="pages" name="Seiten" fill="#ffffff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</div>
      <div className="flex items-center justify-between"><button className={btn} disabled={i === 0} onClick={() => setI(i - 1)}>Zurück</button><span className="flex gap-1.5">{W.slides.map((_, k) => <button key={k} aria-label={`Seite ${k + 1}`} onClick={() => setI(k)} className={`h-2 rounded-full transition-all ${k === i ? 'w-6 bg-indigo-600' : 'w-2 bg-zinc-300 dark:bg-zinc-700'}`} />)}</span><button className={btn} disabled={i === W.slides.length - 1} onClick={() => setI(i + 1)}>Weiter</button></div></>}
    <div id="wrapped-print" className="hidden print:block">{W.slides.map((s, k) => <div key={k} style={{ pageBreakAfter: 'always', padding: 40 }}><div style={{ fontSize: 14, textTransform: 'uppercase' }}>{s.t}</div><div style={{ fontSize: 48, fontWeight: 700, margin: '12px 0' }}>{s.big}</div><div style={{ fontSize: 18 }}>{s.sub}</div></div>)}</div></div>;
}

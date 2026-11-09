import { card } from './ui';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookOpen } from 'lucide-react';
import { Empty } from './ui';
import { GT, PERIODS, progress, type Goal } from './Extra';
import { computeStats, dayKey, insights, isValid, pagesOf, rangeFor, type Book, type Session } from './lib/stats';

import { TZ } from './lib/tz';
const fmt = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const S = ({ l, v }: { l: string; v: string | number }) => <div className={card + ' !p-4'}><div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight md:text-3xl">{v}</div></div>;
const Bar2 = ({ title, data, name, color = '#6366f1' }: { title: string; data: { d: string; v: number }[]; name: string; color?: string }) => <div className={card}><h3 className="mb-2 font-medium">{title}</h3>
  <div className="h-48"><ResponsiveContainer><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" /><YAxis /><Tooltip /><Bar dataKey="v" name={name} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>;
const Prog = ({ pct }: { pct: number }) => <div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-700"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.min(100, pct)}%` }} /></div>;
// DST-sicher: Tage per UTC-Datumsarithmetik auf dem lokalen Tagesschlüssel
const lastDays = (n: number) => { const [y, m, d] = dayKey(new Date(), TZ).split('-').map(Number); return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - (n - 1 - i))).toISOString().slice(0, 10)); };

export function Dash({ books, sessions, goals }: { books: Book[]; sessions: Session[]; goals: Goal[] }) {
  const [p, setP] = useState(localStorage.getItem('rt-period') ?? '30'), compact = localStorage.getItem('rt-view') === 'compact';
  const all = useMemo(() => computeStats(sessions, books, null, TZ), [sessions, books]);
  const per = useMemo(() => computeStats(sessions, books, rangeFor(p, TZ), TZ), [p, sessions, books]);
  const yr = useMemo(() => computeStats(sessions, books, rangeFor('year', TZ), TZ), [sessions, books]);
  const tips = useMemo(() => insights(sessions, books, TZ), [sessions, books]);
  const map = useMemo(() => new Map(all.daily.map(d => [d.day, d] as const)), [all]);
  const series = (n: number, k: 'pages' | 'minutes') => lastDays(n).map(d => ({ d: d.slice(5), v: Math.round((map.get(d)?.[k] ?? 0) * 10) / 10 }));
  const year = dayKey(new Date(), TZ).slice(0, 4);
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'].map((d, i) => ({ d, v: all.daily.filter(x => x.day.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).reduce((a, x) => a + x.pages, 0) }));
  let c = 0; const cum = per.daily.map(x => ({ d: x.day.slice(5), v: (c += x.pages) }));
  const bt = (id: string) => books.find(b => b.id === id)?.title ?? '(gelöschtes Buch)';
  const reading = books.filter(b => b.status === 'reading'), done = books.filter(b => b.status === 'finished').sort((a, b) => (b.finish_date ?? '').localeCompare(a.finish_date ?? '')).slice(0, 5);
  const last = sessions.filter(isValid).sort((a, b) => (b.start_time ?? b.session_date).localeCompare(a.start_time ?? a.session_date)).slice(0, 5);
  const gl = goals.slice(0, 4).map(g => { const v = progress(g, sessions, books); return { g, v, pct: Math.round(v / g.target_value * 100) }; });
  return <div className="space-y-4">
    {!sessions.length && <Empty icon={BookOpen} title="Noch keine Lesesessions" text="Lege ein Buch an und erfasse deine erste Session – dann erscheinen hier deine Statistiken." />}
    <div className="flex items-center gap-2 text-sm"><span>Zeitraum:</span><select className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" value={p} onChange={e => setP(e.target.value)}>{PERIODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <S l="Bücher dieses Jahr" v={yr.finishedBooks} /><S l="Bücher insgesamt" v={all.finishedBooks} /><S l="Seiten (Zeitraum)" v={per.pages} /><S l="Lesezeit (Zeitraum)" v={fmt(per.minutes)} />
      <S l="Ø Min. pro Tag" v={Math.round(per.avgMinutesPerDay)} /><S l="Ø Seiten pro Tag" v={per.avgPagesPerDay.toFixed(1)} /><S l="Seiten pro Stunde" v={per.pagesPerHour ? Math.round(per.pagesPerHour) : '–'} /><S l="Aktive Lesetage" v={per.activeDays} />
      <S l="Aktueller Streak" v={`${all.currentStreak} Tage`} /><S l="Längster Streak" v={`${all.longestStreak} Tage`} /></div>
    {!compact && sessions.length > 0 && <div className="grid gap-3 md:grid-cols-2">
      <Bar2 title="Gelesene Seiten (letzte 7 Tage)" data={series(7, 'pages')} name="Seiten" /><Bar2 title="Lesezeit (letzte 30 Tage, Min.)" data={series(30, 'minutes')} name="Minuten" color="#8b5cf6" />
      <Bar2 title={`Monatliche Leseaktivität ${year} (Seiten)`} data={months} name="Seiten" color="#10b981" />
      <div className={card}><h3 className="mb-2 font-medium">Entwicklung der gelesenen Seiten (kumuliert, gewählter Zeitraum)</h3><div className="h-48"><ResponsiveContainer><LineChart data={cum}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" /><YAxis /><Tooltip /><Line type="monotone" dataKey="v" name="Seiten gesamt" stroke="#6366f1" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div></div>}
    <div className="grid gap-3 md:grid-cols-2">
      <div className={card}><h3 className="mb-2 font-medium">Aktuell am Lesen</h3>{reading.length === 0 && <p className="text-sm text-zinc-500">Kein Buch im Status „Aktuell am Lesen“.</p>}
        {reading.map(b => { const pct = b.total_pages ? Math.round(b.current_page / b.total_pages * 100) : 0; return <div key={b.id} className="mb-2 text-sm"><div className="flex justify-between"><span>{b.title}</span><span>{b.total_pages ? `${pct} % (${b.current_page}/${b.total_pages})` : `S. ${b.current_page}`}</span></div>{b.total_pages > 0 && <Prog pct={pct} />}</div>; })}</div>
      <div className={card}><h3 className="mb-2 font-medium">Aktuelle Leseziele</h3>{gl.length === 0 && <p className="text-sm text-zinc-500">Noch keine Ziele angelegt.</p>}
        {gl.map(r => <div key={r.g.id} className="mb-2 text-sm"><div className="flex justify-between"><span>{GT[r.g.goal_type]}</span><span>{r.v} / {r.g.target_value} ({r.pct} %)</span></div><Prog pct={r.pct} /></div>)}</div>
      <div className={card}><h3 className="mb-2 font-medium">Letzte Lesesessions</h3>{last.length === 0 && <p className="text-sm text-zinc-500">Noch keine Sessions.</p>}
        {last.map(s => <div key={s.id} className="text-sm">{s.session_date} · {bt(s.book_id)} · {pagesOf(s)} Seiten · {Math.round(s.duration_minutes)} Min.</div>)}</div>
      <div className={card}><h3 className="mb-2 font-medium">Zuletzt abgeschlossen</h3>{done.length === 0 && <p className="text-sm text-zinc-500">Noch kein Buch abgeschlossen.</p>}
        {done.map(b => <div key={b.id} className="text-sm">{b.title}{b.finish_date ? ` · ${b.finish_date}` : ''}{b.rating ? ` · ${b.rating}★` : ''}</div>)}</div></div>
    {tips.length > 0 && <div className={card}><h3 className="mb-2 font-medium">Erkenntnisse</h3><ul className="list-disc pl-5 text-sm">{tips.map(t => <li key={t}>{t}</li>)}</ul></div>}</div>;
}

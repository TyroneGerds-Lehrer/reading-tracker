import { useMemo, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeStats, dayKey, isValid, pagesOf, type Book, type Session } from './lib/stats';

import { TZ } from './lib/tz';
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800';
const card = 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmt = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const dn = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const topN = (m: Map<string, number>, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);
const Bars = ({ data, k, color = '#6366f1' }: { data: { n: string; [k: string]: string | number }[]; k: string; color?: string }) => <div className="h-44"><ResponsiveContainer><BarChart data={data}><XAxis dataKey="n" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey={k} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>;
const KV = ({ l, v }: { l: string; v: string | number }) => <div className="flex justify-between border-b border-slate-100 py-1 text-sm dark:border-slate-700"><span className="text-slate-500">{l}</span><span className="font-medium">{v}</span></div>;

function BooksRecords({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const d = useMemo(() => {
    const v = sessions.filter(isValid), all = computeStats(v, books, null, TZ), fin = books.filter(b => b.status === 'finished');
    const per = new Map(books.map(b => [b.id, { b, min: 0, n: 0 }] as const)), auth = new Map<string, number>(), gen = new Map<string, number>(), mp = new Map<string, number>(), mb = new Map<string, number>();
    const bk = new Map(books.map(b => [b.id, b] as const));
    for (const s of v) { const e = per.get(s.book_id); if (e) { e.min += s.duration_minutes; e.n++; } const a = bk.get(s.book_id)?.author; if (a) inc(auth, a, pagesOf(s)); inc(mp, s.session_date.slice(0, 7), pagesOf(s)); }
    for (const b of books) if (b.genre) inc(gen, b.genre);
    for (const b of fin) if (b.finish_date) inc(mb, b.finish_date.slice(0, 7));
    const dur = fin.filter(b => b.start_date && b.finish_date && dn(b.finish_date) >= dn(b.start_date)).map(b => dn(b.finish_date!) - dn(b.start_date!));
    const pf = [...per.values()].filter(e => e.b.status === 'finished');
    return { all, fin, per: [...per.values()], auth: topN(auth), gen: topN(gen, 8), mp: topN(mp, 1)[0], mb: topN(mb, 1)[0], dur,
      avgPages: fin.length ? Math.round(fin.reduce((a, b) => a + b.total_pages, 0) / fin.length) : null, avgMin: pf.length ? pf.reduce((a, e) => a + e.min, 0) / pf.length : null,
      maxSess: Math.max(0, ...all.daily.map(x => x.sessions)), longest: [...fin].sort((a, b) => b.total_pages - a.total_pages)[0], rate: [1, 2, 3, 4, 5].map(r => ({ n: `${r}★`, Bücher: books.filter(b => b.rating === r).length })) };
  }, [books, sessions]);
  const t5 = (key: 'min' | 'n') => [...d.per].filter(e => e[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
  const ym = (k?: string) => (k ? `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : '–');
  return <div className="grid gap-3 md:grid-cols-2"><div className={card}><h3 className="mb-2 font-medium">Buchstatistiken</h3>
    <KV l="Begonnen" v={books.filter(b => b.status !== 'wishlist').length} /><KV l="Abgeschlossen" v={d.fin.length} /><KV l="Abgebrochen" v={books.filter(b => b.status === 'abandoned').length} />
    <KV l="Ø Seiten pro abgeschlossenem Buch" v={d.avgPages ?? '–'} /><KV l="Ø Lesezeit pro abgeschlossenem Buch" v={d.avgMin === null ? '–' : fmt(d.avgMin)} />
    <KV l="Ø Tage bis zum Abschluss" v={d.dur.length ? Math.round(d.dur.reduce((a, b) => a + b, 0) / d.dur.length) : '–'} />
    <h4 className="mt-3 text-sm font-medium">Meiste Lesestunden</h4>{t5('min').map(e => <KV key={e.b.id} l={e.b.title} v={fmt(e.min)} />)}
    <h4 className="mt-3 text-sm font-medium">Meiste Sessions</h4>{t5('n').map(e => <KV key={e.b.id} l={e.b.title} v={e.n} />)}
    <h4 className="mt-3 text-sm font-medium">Meistgelesene Autoren (Seiten)</h4>{d.auth.map(([a, n]) => <KV key={a} l={a} v={n} />)}</div>
    <div className="space-y-3"><div className={card}><h3 className="mb-2 font-medium">Persönliche Rekorde</h3>
      <KV l="Meiste Seiten an einem Tag" v={d.all.record.maxPagesDay ? `${d.all.record.maxPagesDay.pages} (${d.all.record.maxPagesDay.day})` : '–'} /><KV l="Längste Session" v={d.all.record.longestSession ? `${Math.round(d.all.record.longestSession)} Min.` : '–'} />
      <KV l="Längster Streak" v={`${d.all.longestStreak} Tage`} /><KV l="Meiste Bücher in einem Monat" v={d.mb ? `${d.mb[1]} (${ym(d.mb[0])})` : '–'} /><KV l="Meiste Seiten in einem Monat" v={d.mp ? `${d.mp[1]} (${ym(d.mp[0])})` : '–'} />
      <KV l="Längstes abgeschlossenes Buch" v={d.longest ? `${d.longest.title} (${d.longest.total_pages} S.)` : '–'} /><KV l="Kürzeste Zeit bis zum Abschluss" v={d.dur.length ? `${Math.min(...d.dur)} Tage` : '–'} /><KV l="Meiste Sessions an einem Tag" v={d.maxSess || '–'} /></div>
      <div className={card}><h3 className="mb-2 font-medium">Bewertungen</h3><Bars data={d.rate} k="Bücher" color="#f59e0b" /></div>
      {d.gen.length > 0 && <div className={card}><h3 className="mb-2 font-medium">Bücher nach Genre</h3><Bars data={d.gen.map(([n, c]) => ({ n, Bücher: c }))} k="Bücher" color="#10b981" /></div>}</div></div>;
}

function Years({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const today = dayKey(new Date(), TZ), ys = [...new Set(sessions.map(s => +s.session_date.slice(0, 4)))].sort((a, b) => b - a);
  const rows = ys.map(y => {
    const end = `${y}-12-31` < today ? `${y}-12-31` : today, s = computeStats(sessions, books, { from: `${y}-01-01`, to: end }, TZ), mo: number[] = Array(12).fill(0);
    for (const x of s.daily) mo[+x.day.slice(5, 7) - 1] += x.pages;
    const rated = books.filter(b => b.status === 'finished' && b.finish_date?.startsWith(String(y)) && b.rating);
    return { y, s, best: Math.max(...mo) > 0 ? MON[mo.indexOf(Math.max(...mo))] : '–', rating: rated.length ? (rated.reduce((a, b) => a + (b.rating ?? 0), 0) / rated.length).toFixed(1) : '–' };
  });
  if (!rows.length) return <p className={card}>Noch keine Daten.</p>;
  return <div className="space-y-3"><div className={card + ' overflow-x-auto'}><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Jahr</th><th>Bücher</th><th>Seiten</th><th>Lesezeit</th><th>Ø Min./Tag</th><th>Streak</th><th>Aktivster Monat</th><th>Ø Bewertung</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.y}><td className="py-1 font-medium">{r.y}</td><td>{r.s.finishedBooks}</td><td>{r.s.pages}</td><td>{fmt(r.s.minutes)}</td><td>{Math.round(r.s.avgMinutesPerDay)}</td><td>{r.s.longestStreak}</td><td>{r.best}</td><td>{r.rating}</td></tr>)}</tbody></table></div>
    <div className={card}><h3 className="mb-2 font-medium">Seiten pro Jahr</h3><Bars data={[...rows].reverse().map(r => ({ n: String(r.y), Seiten: r.s.pages }))} k="Seiten" /></div></div>;
}

function CalHist({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const [ym, setYm] = useState(dayKey(new Date(), TZ).slice(0, 7)), [sel, setSel] = useState<string | null>(null), [q, setQ] = useState(''), [bf, setBf] = useState('');
  const [y, m] = ym.split('-').map(Number), off = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const by = useMemo(() => { const mp = new Map<string, Session[]>(); for (const s of sessions) if (isValid(s)) { const a = mp.get(s.session_date) ?? []; a.push(s); mp.set(s.session_date, a); } return mp; }, [sessions]);
  const bt = (id: string) => books.find(b => b.id === id)?.title ?? '(gelöschtes Buch)';
  const go = (dm: number) => { setYm(new Date(Date.UTC(y, m - 1 + dm, 1)).toISOString().slice(0, 7)); setSel(null); };
  const cells: (string | null)[] = [...Array(off).fill(null), ...Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  const L = sel ? by.get(sel) ?? [] : [];
  const hist = useMemo(() => sessions.filter(s => isValid(s) && (!bf || s.book_id === bf) && `${bt(s.book_id)} ${s.notes ?? ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.start_time ?? b.session_date).localeCompare(a.start_time ?? a.session_date)).slice(0, 200), [sessions, books, q, bf]);
  return <div className="space-y-3"><div className={card}><div className="mb-2 flex items-center justify-between"><button onClick={() => go(-1)}>‹</button><b>{MON[m - 1]} {y}</b><button onClick={() => go(1)}>›</button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => <div key={w} className="text-slate-500">{w}</div>)}
      {cells.map((c, i) => { if (!c) return <div key={i} />; const l = by.get(c), min = l?.reduce((a, s) => a + s.duration_minutes, 0) ?? 0; return <button key={c} onClick={() => setSel(c)} className={`rounded-lg py-2 ${l ? (min >= 60 ? 'bg-indigo-500 text-white' : 'bg-indigo-200 dark:bg-indigo-900') : 'bg-slate-100 dark:bg-slate-700'} ${sel === c ? 'ring-2 ring-indigo-600' : ''}`}>{+c.slice(8)}</button>; })}</div>
    {sel && <div className="mt-3 text-sm"><b>{sel}</b>{L.length === 0 ? <div className="text-slate-500">Nicht gelesen.</div> : <><div>{L.reduce((a, s) => a + pagesOf(s), 0)} Seiten · {fmt(L.reduce((a, s) => a + s.duration_minutes, 0))} · {L.length} Session(s)</div><div>Bücher: {[...new Set(L.map(s => bt(s.book_id)))].join(', ')}</div>{L.filter(s => s.notes).map(s => <div key={s.id} className="text-slate-500">Notiz: {s.notes}</div>)}</>}</div>}</div>
    <div className={card + ' space-y-2'}><h3 className="font-medium">Lesehistorie</h3><div className="flex flex-wrap gap-2"><input className={inp} placeholder="Suchen (Buch, Notiz)…" value={q} onChange={e => setQ(e.target.value)} /><select className={inp} value={bf} onChange={e => setBf(e.target.value)}><option value="">Alle Bücher</option>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
      {hist.length === 0 && <p className="text-sm text-slate-500">Keine Sessions gefunden.</p>}{hist.map(s => <div key={s.id} className="text-sm">{s.session_date} · {bt(s.book_id)} · {pagesOf(s)} Seiten · {Math.round(s.duration_minutes)} Min.{s.notes ? ` · ${s.notes}` : ''}</div>)}</div></div>;
}

export function More({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const [t, setT] = useState(0), tabs = ['Bücher & Rekorde', 'Jahresvergleich', 'Kalender & Historie', 'Vergleiche'];
  return <div className="mt-4 space-y-3"><div className="flex gap-1">{tabs.map((x, i) => <button key={x} onClick={() => setT(i)} className={`rounded-lg px-3 py-1.5 text-sm ${t === i ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{x}</button>)}</div>
    {t === 0 && <BooksRecords books={books} sessions={sessions} />}{t === 1 && <Years books={books} sessions={sessions} />}{t === 2 && <CalHist books={books} sessions={sessions} />}{t === 3 && <Compare books={books} sessions={sessions} />}</div>;
}

function Compare({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const daily = useMemo(() => computeStats(sessions, books, null, TZ).daily, [sessions, books]);
  if (!daily.length) return <p className={card}>Noch keine Daten für Vergleiche.</p>;
  const dow = (n: number) => (new Date(n * 864e5).getUTCDay() + 6) % 7, wk = new Map<number, number>();
  for (const d of daily) { const n = dn(d.day), w = n - dow(n); wk.set(w, (wk.get(w) ?? 0) + d.pages); }
  const t = dn(dayKey(new Date(), TZ)), cw = t - dow(t), [cy, cm] = dayKey(new Date(), TZ).split('-').map(Number);
  const weeks = Array.from({ length: 12 }, (_, i) => { const w = cw - 7 * (11 - i); return { n: new Date(w * 864e5).toISOString().slice(5, 10), Seiten: wk.get(w) ?? 0 }; });
  const months = Array.from({ length: 12 }, (_, i) => { const ym = new Date(Date.UTC(cy, cm - 1 - (11 - i), 1)).toISOString().slice(0, 7), ds = daily.filter(d => d.day.startsWith(ym)); return { n: `${ym.slice(5)}/${ym.slice(2, 4)}`, Seiten: ds.reduce((a, d) => a + d.pages, 0), Minuten: Math.round(ds.reduce((a, d) => a + d.minutes, 0)) }; });
  const ys = [...new Set(daily.map(d => +d.day.slice(0, 4)))].sort((a, b) => b - a).slice(0, 3).reverse(), colors = ['#94a3b8', '#8b5cf6', '#6366f1'].slice(-ys.length);
  const byMonth = MON.map((m, i) => { const r: Record<string, string | number> = { n: m.slice(0, 3) }; for (const y of ys) r[String(y)] = daily.filter(d => d.day.startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)).reduce((a, d) => a + d.pages, 0); return r; });
  return <div className="grid gap-3 md:grid-cols-2"><div className={card}><h3 className="mb-2 font-medium">Seiten pro Woche (12 Wochen, Start = Montag)</h3><Bars data={weeks} k="Seiten" /></div>
    <div className={card}><h3 className="mb-2 font-medium">Seiten pro Monat (12 Monate)</h3><Bars data={months} k="Seiten" color="#10b981" /></div>
    <div className={card}><h3 className="mb-2 font-medium">Lesezeit pro Monat (Min., 12 Monate)</h3><Bars data={months} k="Minuten" color="#8b5cf6" /></div>
    <div className={card}><h3 className="mb-2 font-medium">Monatsvergleich über die Jahre (Seiten)</h3><div className="h-44"><ResponsiveContainer><BarChart data={byMonth}><XAxis dataKey="n" /><YAxis /><Tooltip /><Legend />{ys.map((y, i) => <Bar key={y} dataKey={String(y)} fill={colors[i]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer></div></div></div>;
}

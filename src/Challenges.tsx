import { useMemo } from 'react';
import { BookOpen, CalendarDays, Clock, Compass, Flame, Layers, Medal, Repeat, TrendingUp, Trophy, Users, Zap, type LucideIcon } from 'lucide-react';
import { card } from './ui';
import { TZ } from './lib/tz';
import { dayKey, isValid, pagesOf, type Book, type Session } from './lib/stats';

type A = { pages: number; minutes: number; days: Set<string>; sessions: number; longest: number };
type Ch = { id: string; title: string; g: number; u: string; get: (a: A) => number };
const EMPTY: A = { pages: 0, minutes: 0, days: new Set(), sessions: 0, longest: 0 };
const dn = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const iso = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const weekStart = (k: string) => iso(dn(k) - ((new Date(dn(k) * 864e5).getUTCDay() + 6) % 7));
const fm = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} Std.` : `${m} Min.`);
const groupBy = (v: Session[], key: (d: string) => string) => { const m = new Map<string, A>(); for (const s of v) { const k = key(s.session_date), a = m.get(k) ?? { pages: 0, minutes: 0, days: new Set<string>(), sessions: 0, longest: 0 }; a.pages += pagesOf(s); a.minutes += s.duration_minutes; a.days.add(s.session_date); a.sessions++; a.longest = Math.max(a.longest, s.duration_minutes); m.set(k, a); } return m; };
const run = (a: A) => { let best = 0, c = 0, p = NaN; for (const k of [...a.days].sort()) { c = dn(k) === p + 1 ? c + 1 : 1; best = Math.max(best, c); p = dn(k); } return best; };
const th = (list: number[], f: number) => (n: number) => (n < list.length ? list[n] : Math.round(list[list.length - 1] * f ** (n - list.length + 1)));
const TN = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant', 'Meister', 'Legende'];
const TC = ['bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200', 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300', 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300', 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'];
const Bar = ({ pct, ok }: { pct: number; ok?: boolean }) => <div className="mt-1.5 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className={`h-2 rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>;
const Head = ({ t }: { t: string }) => <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Trophy className="h-5 w-5 text-indigo-500" />{t}</h2>;

export function Gamification({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const G = useMemo(() => {
    const v = sessions.filter(isValid), today = dayKey(new Date(), TZ), ws = weekStart(today), ym = today.slice(0, 7);
    const wk = groupBy(v, weekStart), mo = groupBy(v, d => d.slice(0, 7)), byDay = groupBy(v, d => d);
    const first = v.length ? v.reduce((m, s) => (s.session_date < m ? s.session_date : m), v[0].session_date) : null;
    const avgSess = v.length ? v.reduce((a, s) => a + s.duration_minutes, 0) / v.length : 0;
    // Wöchentliche Ziele: Ø der bis zu 4 Vorwochen (ab erster Session) + 15 %; ohne Verlauf Startwerte. Mehr Lesen => höhere Ziele, weniger Lesen => niedrigere.
    const weekTargets = (w: string) => {
      const prev: (A | undefined)[] = []; for (let i = 1; i <= 4; i++) { const p = iso(dn(w) - 7 * i); if (first && p >= weekStart(first)) prev.push(wk.get(p)); }
      const n = prev.length, avg = (f: (a: A) => number) => (n ? prev.reduce((s, a) => s + (a ? f(a) : 0), 0) / n : null), up = (x: number | null, d: number) => (x === null ? d : x * 1.15);
      const days = Math.min(7, Math.max(2, Math.ceil(up(avg(a => a.days.size), 3)))), pages = Math.max(30, Math.ceil(up(avg(a => a.pages), 60) / 10) * 10), min = Math.max(30, Math.ceil(up(avg(a => a.minutes), 90) / 15) * 15);
      const sess = Math.max(2, Math.ceil(up(avg(a => a.sessions), 3))), long = Math.max(15, Math.round((avgSess ? avgSess * 1.3 : 20) / 5) * 5), st = Math.min(7, Math.max(2, Math.ceil(days * 0.75)));
      const all: Ch[] = [{ id: 'days', title: `${days} Tage lesen`, g: days, u: 'Tage', get: a => a.days.size }, { id: 'pages', title: `${pages} Seiten lesen`, g: pages, u: 'Seiten', get: a => a.pages }, { id: 'min', title: `${fm(min)} lesen`, g: min, u: 'Min.', get: a => Math.round(a.minutes) },
        { id: 'sess', title: `${sess} Lesesessions`, g: sess, u: 'Sessions', get: a => a.sessions }, { id: 'long', title: `Eine Session von ${long} Min.`, g: long, u: 'Min.', get: a => Math.round(a.longest) }, { id: 'st', title: `${st} Tage in Folge lesen`, g: st, u: 'Tage', get: run }];
      const s0 = (Math.floor(dn(w) / 7) * 2) % 6; // Rotation: jede Woche andere Kombination
      return { list: [all[s0], all[(s0 + 1) % 6], all[(s0 + 3) % 6]], n };
    };
    let done = 0; if (first) for (let w = weekStart(first); w <= ws; w = iso(dn(w) + 7)) for (const c of weekTargets(w).list) if (c.get(wk.get(w) ?? EMPTY) >= c.g) done++;
    const cur = weekTargets(ws), lw = iso(dn(ws) - 7), last = first && lw >= weekStart(first) ? weekTargets(lw).list.filter(c => c.get(wk.get(lw) ?? EMPTY) >= c.g).length : null;
    // Monatsziele: Ø der bis zu 3 Vormonate + 10 %
    const pm: (A | undefined)[] = [], [y, m] = ym.split('-').map(Number); for (let i = 1; i <= 3; i++) { const k = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7); if (first && k >= first.slice(0, 7)) pm.push(mo.get(k)); }
    const mavg = (f: (a: A) => number, d: number) => (pm.length ? Math.max(0, pm.reduce((s, a) => s + (a ? f(a) : 0), 0) / pm.length) * 1.1 : d);
    const mp = Math.max(100, Math.ceil(mavg(a => a.pages, 300) / 50) * 50), md = Math.min(28, Math.max(4, Math.ceil(mavg(a => a.days.size, 10))));
    const cm = mo.get(ym) ?? EMPTY, fin = books.filter(b => b.status === 'finished' && b.finish_date?.startsWith(ym)).length;
    const months = [{ t: `${mp} Seiten lesen`, v: Math.round(cm.pages), g: mp, u: 'Seiten' }, { t: `${md} Lesetage`, v: cm.days.size, g: md, u: 'Tage' }, { t: 'Ein Buch abschließen', v: fin, g: 1, u: 'Buch' }];
    const days = [...new Set(v.map(s => s.session_date))].sort(), all: A = { ...EMPTY, days: new Set(days) }, finished = books.filter(b => b.status === 'finished');
    const fam: { t: string; I: LucideIcon; v: number; th: (n: number) => number; u: string }[] = [
      { t: 'Lese-Streak', I: Flame, v: run(all), th: th([3, 7, 14, 30, 60, 100, 180, 365], 1.5), u: 'Tage' }, { t: 'Seiten', I: Layers, v: v.reduce((a, s) => a + pagesOf(s), 0), th: th([250, 500, 1000, 2500, 5000, 10000, 25000], 2), u: 'Seiten' },
      { t: 'Bücher', I: BookOpen, v: finished.length, th: th([1, 3, 5, 10, 25, 50, 100], 1.5), u: 'Bücher' }, { t: 'Lesezeit', I: Clock, v: Math.floor(v.reduce((a, s) => a + s.duration_minutes, 0) / 60), th: th([5, 10, 25, 50, 100, 250, 500, 1000], 1.5), u: 'Std.' },
      { t: 'Lesetage', I: CalendarDays, v: days.length, th: th([7, 30, 60, 100, 200, 365, 500], 1.5), u: 'Tage' }, { t: 'Sessions', I: Repeat, v: v.length, th: th([10, 25, 50, 100, 250, 500, 1000], 1.5), u: 'Sessions' },
      { t: 'Marathon', I: Zap, v: Math.round(Math.max(0, ...v.map(s => s.duration_minutes))), th: th([30, 60, 90, 120, 180, 240, 300], 1.3), u: 'Min. am Stück' }, { t: 'Tagesrekord', I: TrendingUp, v: Math.max(0, ...[...byDay.values()].map(a => a.pages)), th: th([25, 50, 75, 100, 150, 200, 300], 1.3), u: 'Seiten an einem Tag' },
      { t: 'Entdecker', I: Compass, v: new Set(books.map(b => b.genre).filter(Boolean)).size, th: th([2, 3, 5, 8, 12, 20], 1.4), u: 'Genres' }, { t: 'Autor*innen', I: Users, v: new Set(finished.map(b => b.author).filter(Boolean)).size, th: th([3, 5, 10, 25, 50, 100], 1.5), u: 'Autor*innen' },
      { t: 'Challenge-Meister', I: Medal, v: done, th: th([5, 15, 30, 60, 100, 200], 1.5), u: 'Challenges' }];
    return { wk, ws, cur, last, months, fam };
  }, [sessions, books]);
  const a = G.wk.get(G.ws) ?? EMPTY;
  return <>
    <section className="space-y-3"><Head t="Wochen-Challenges" />
      <p className="text-sm text-zinc-500">{G.cur.n > 0 ? `Neue Challenges jede Woche – die Ziele orientieren sich an deinem Lesen der letzten ${G.cur.n} Woche${G.cur.n > 1 ? 'n' : ''}: Liest du mehr, werden sie anspruchsvoller, liest du weniger, werden sie wieder erreichbarer.` : 'Startwerte, bis genug Lesedaten vorliegen. Danach passen sich die Ziele jede Woche an dein Leseverhalten an.'}{G.last !== null ? ` Letzte Woche geschafft: ${G.last} von 3.` : ''}</p>
      <div className="grid gap-3 md:grid-cols-3">{G.cur.list.map(c => { const val = c.get(a); return <div key={c.id} className={card}><div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Diese Woche</div><div className="mt-1 font-medium">{c.title}</div><div className="mt-1 text-sm text-zinc-500">{val >= c.g ? 'Geschafft!' : `${val} / ${c.g} ${c.u}`}</div><Bar pct={val / c.g * 100} ok={val >= c.g} /></div>; })}</div></section>
    <section className="space-y-3"><Head t="Monats-Challenges" /><div className="grid gap-3 md:grid-cols-3">{G.months.map(c => <div key={c.t} className={card}><div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dieser Monat</div><div className="mt-1 font-medium">{c.t}</div><div className="mt-1 text-sm text-zinc-500">{c.v >= c.g ? 'Geschafft!' : `${c.v} / ${c.g} ${c.u}`}</div><Bar pct={c.v / c.g * 100} ok={c.v >= c.g} /></div>)}</div></section>
    <section className="space-y-3"><Head t="Abzeichen" /><p className="text-sm text-zinc-500">Jedes Abzeichen hat unbegrenzt viele Stufen – nach Legende geht es mit immer höheren Zielen weiter.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{G.fam.map(f => { let t = 0; while (t < 200 && f.th(t) <= f.v) t++; const next = f.th(t), name = t === 0 ? 'Noch nicht freigeschaltet' : t <= TN.length ? TN[t - 1] : `Stufe ${t}`;
        return <div key={f.t} className={card + ' flex items-center gap-3 !p-4'}><div className={`rounded-xl p-2.5 ${t === 0 ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800' : TC[Math.min(t - 1, TC.length - 1)]}`}><f.I className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1 text-sm"><div className="flex justify-between gap-2"><span className="truncate font-medium">{f.t}</span><span className="shrink-0 text-xs text-zinc-500">{name}</span></div><Bar pct={f.v / next * 100} /><div className="mt-1 text-xs text-zinc-500">{f.v.toLocaleString('de-DE')} / {next.toLocaleString('de-DE')} {f.u} bis Stufe {t + 1}</div></div></div>; })}</div></section></>;
}

import { useMemo } from 'react';
import { BookOpen, CalendarClock, Flame, Layers, Lightbulb, Trophy, type LucideIcon } from 'lucide-react';
import { card } from './ui';
import { Gamification } from './Challenges';
import { GamePanels } from './Game';
import { PushCard, ReminderCard, pushAvailable } from './notify';
import { GT, progress, type Goal } from './Extra';
import { TZ } from './lib/tz';
import { personalize } from './lib/personal';
import { computeStats, dayKey, rangeFor, type Book, type Session } from './lib/stats';

const dn = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const iso = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const de = (k: string) => `${k.slice(8)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
const Bar = ({ pct, ok }: { pct: number; ok?: boolean }) => <div className="mt-1.5 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className={`h-2 rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>;
const Sec = ({ icon: I, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) => <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><I className="h-5 w-5 text-indigo-500" />{title}</h2>{children}</section>;

export function Motivation({ books, sessions, goals }: { books: Book[]; sessions: Session[]; goals: Goal[] }) {
  const d = useMemo(() => {
    const today = dayKey(new Date(), TZ), t = dn(today), ws = iso(t - ((new Date(t * 864e5).getUTCDay() + 6) % 7)), c = (r: { from: string; to: string } | null) => computeStats(sessions, books, r, TZ);
    return { today, t, all: c(null), m30: c(rangeFor('30', TZ)), now: c({ from: today, to: today }), week: c({ from: ws, to: today }), month: c(rangeFor('month', TZ)) };
  }, [sessions, books]);
  const pace = d.m30.avgPagesPerDay, enough = d.m30.activeDays >= 5, y = +d.today.slice(0, 4), m = +d.today.slice(5, 7), streak = d.all.currentStreak;

  const impulse = useMemo(() => { const p = personalize(sessions, goals, TZ); return `${p.headline} ${p.text}`; }, [sessions, goals]);

  const reading = books.filter(b => b.status === 'reading' && b.total_pages > b.current_page);
  const endYear = Date.UTC(y, 11, 31) / 864e5, endMonth = Date.UTC(y, m, 0) / 864e5, startYear = Date.UTC(y, 0, 1) / 864e5;
  const gf = goals.filter(g => ['pages_year', 'books_year', 'pages_month'].includes(g.goal_type)).map(g => {
    const v = progress(g, sessions, books), left = (g.goal_type === 'pages_month' ? endMonth : endYear) - d.t + 1, need = Math.max(0, g.target_value - v);
    let text: string, ok = false;
    if (need === 0) { text = 'Ziel bereits erreicht.'; ok = true; }
    else if (g.goal_type === 'books_year') {
      const el = d.t - startYear + 1;
      if (el < 30) text = 'Zu früh im Jahr für eine verlässliche Hochrechnung (mind. 30 Tage).';
      else { const proj = v / el * (endYear - startYear + 1); ok = proj >= g.target_value; text = `Hochrechnung: ca. ${proj.toFixed(1)} von ${g.target_value} Büchern. ${ok ? 'Du bist auf Kurs.' : `Noch ${need} Buch/Bücher in ${left} Tagen nötig.`}`; }
    } else if (!enough) text = 'Noch zu wenig Daten (mind. 5 Lesetage in den letzten 30 Tagen).';
    else { const proj = v + pace * (left - 1) + d.now.pages * 0; ok = proj >= g.target_value; text = `Hochrechnung: ca. ${Math.round(proj)} von ${g.target_value} Seiten. ${ok ? 'Du bist auf Kurs.' : `Du brauchst ${Math.ceil(need / left)} Seiten pro Tag (aktuell Ø ${pace.toFixed(1)}).`}`; }
    return { g, text, ok, pct: Math.round(v / g.target_value * 100) };
  });

  const ch = [['Woche', '5 Lesetage', d.week.activeDays, 5, 'Tage'], ['Woche', '150 Seiten lesen', d.week.pages, 150, 'Seiten'], ['Woche', '3 Stunden lesen', Math.round(d.week.minutes), 180, 'Min.'],
    ['Monat', 'Ein Buch abschließen', d.month.finishedBooks, 1, 'Buch'], ['Monat', '10 Lesetage', d.month.activeDays, 10, 'Tage'], ['Monat', '500 Seiten lesen', d.month.pages, 500, 'Seiten']] as [string, string, number, number, string][];
  const badges: { I: LucideIcon; name: string; v: number; g: number }[] = [
    ...[3, 7, 14, 30, 100].map(g => ({ I: Flame, name: `${g}-Tage-Streak`, v: d.all.longestStreak, g })),
    ...[500, 1000, 5000, 10000].map(g => ({ I: Layers, name: `${g.toLocaleString('de-DE')} Seiten`, v: d.all.pages, g })),
    ...[1, 5, 10, 25, 50].map(g => ({ I: BookOpen, name: g === 1 ? 'Erstes Buch' : `${g} Bücher`, v: d.all.finishedBooks, g }))];

  const fin = new Map<string, number>(); books.filter(b => b.status === 'finished' && b.genre).forEach(b => fin.set(b.genre!, (fin.get(b.genre!) ?? 0) + 1));
  const fav = [...fin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const wish = books.filter(b => b.status === 'wishlist').map(b => ({ b, s: (fav && b.genre === fav ? 2 : 0) + (b.total_pages > 0 && b.total_pages <= 250 ? 1 : 0) })).sort((a, b) => b.s - a.s || (a.b.total_pages || 9999) - (b.b.total_pages || 9999)).slice(0, 3);
  const last = new Map<string, string>(); for (const s of sessions) if (s.session_date > (last.get(s.book_id) ?? '')) last.set(s.book_id, s.session_date);
  const stalled = books.filter(b => (b.status === 'reading' || b.status === 'paused') && last.has(b.id) && d.t - dn(last.get(b.id)!) >= 14);
  const bk = d.all.buckets, bt = Object.entries(bk).sort((a, b) => b[1] - a[1])[0], tot = Object.values(bk).reduce((a, b) => a + b, 0);

  return <div className="space-y-8">
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg md:p-8"><div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-4"><Flame className="h-10 w-10 shrink-0" /><div><div className="text-sm uppercase tracking-widest opacity-80">Dein Impuls für heute</div><div className="mt-1 text-lg font-medium md:text-xl">{impulse}</div></div></div></div>

    {pushAvailable ? <PushCard /> : <ReminderCard />}

    <GamePanels />

    <Sec icon={CalendarClock} title="Prognosen"><div className="grid gap-3 md:grid-cols-2">
      <div className={card}><h3 className="mb-2 font-medium">Wann bist du fertig?</h3>{reading.length === 0 ? <p className="text-sm text-zinc-500">Kein angefangenes Buch mit bekannter Seitenzahl.</p> : !enough || pace <= 0 ? <p className="text-sm text-zinc-500">Noch zu wenig Daten (mind. 5 Lesetage in den letzten 30 Tagen).</p> :
        reading.map(b => { const days = Math.ceil((b.total_pages - b.current_page) / pace); return <div key={b.id} className="mb-2 text-sm"><div className="font-medium">{b.title}</div><div className="text-zinc-500">{days > 730 ? 'In mehr als 2 Jahren' : `Voraussichtlich am ${de(iso(d.t + days))}`} ({b.total_pages - b.current_page} Seiten offen)</div></div>; })}
        <p className="mt-2 text-xs text-zinc-500">Basis: Ø {pace.toFixed(1)} Seiten pro Tag in den letzten 30 Tagen. Bei mehreren Büchern gleichzeitig dauert es entsprechend länger.</p></div>
      <div className={card}><h3 className="mb-2 font-medium">Ziele im Check</h3>{gf.length === 0 ? <p className="text-sm text-zinc-500">Lege unter „Leseziele“ ein Jahres- oder Monatsziel für Seiten bzw. Bücher an, dann erscheint hier eine Hochrechnung.</p> :
        gf.map(r => <div key={r.g.id} className="mb-3 text-sm"><div className="flex justify-between font-medium"><span>{GT[r.g.goal_type]}</span><span>{r.pct} %</span></div><Bar pct={r.pct} ok={r.ok} /><div className="mt-1 text-zinc-500">{r.text}</div></div>)}</div></div></Sec>

    <Gamification books={books} sessions={sessions} />

    <Sec icon={Lightbulb} title="Empfehlungen"><div className="grid gap-3 md:grid-cols-2">
      <div className={card}><h3 className="mb-2 font-medium">Als Nächstes lesen</h3>{wish.length === 0 ? <p className="text-sm text-zinc-500">Deine Leseliste ist leer. Suche unter „Meine Bücher“ online nach neuen Büchern.</p> :
        wish.map(({ b }) => <div key={b.id} className="mb-2 text-sm"><div className="font-medium">{b.title}</div><div className="text-zinc-500">{fav && b.genre === fav ? `Passt zu deinem meistgelesenen Genre (${fav})` : b.total_pages > 0 && b.total_pages <= 250 ? `Kurzes Buch (${b.total_pages} Seiten) – ein schneller Erfolg` : 'Steht auf deiner Leseliste'}</div></div>)}</div>
      <div className={card + ' space-y-2 text-sm'}><h3 className="font-medium">Tipps aus deinen Daten</h3>
        {tot >= 120 && bt && bt[1] > 0 ? <p>Du liest am meisten {bt[0]} ({Math.round(bt[1] / tot * 100)} % deiner Lesezeit). Plane dort eine feste Lesezeit ein.</p> : <p className="text-zinc-500">Sobald genug Lesezeit erfasst ist, siehst du hier deine beste Tageszeit.</p>}
        {stalled.map(b => <p key={b.id}>„{b.title}“ liegt seit {Math.round(d.t - dn(last.get(b.id)!))} Tagen still. Lust, weiterzulesen?</p>)}</div></div></Sec></div>;
}

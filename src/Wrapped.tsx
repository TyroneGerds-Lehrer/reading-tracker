import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, Sparkles, X } from 'lucide-react';
import { computeStats, dayKey, type Book, type Session } from './lib/stats';
import { TZ } from './lib/tz';
import { btn, card } from './ui';

const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'], MONF = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WDF = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], ORDER = [1, 2, 3, 4, 5, 6, 0];
const fmt = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const de = (n: number) => n.toLocaleString('de-DE');

// Freischaltung: Wrapped des laufenden Jahres ab 1. Dezember für alle. Vorschau zum Testen: Adresse mit ?wrapped=preview öffnen.
export function wrappedStatus(today: string) {
  const y = +today.slice(0, 4), left = Math.round((Date.UTC(y, 11, 1) - Date.UTC(y, +today.slice(5, 7) - 1, +today.slice(8, 10))) / 864e5);
  return { year: y, left: Math.max(0, left), open: today >= `${y}-12-01` || new URLSearchParams(location.search).get('wrapped') === 'preview' };
}

function build(y: number, books: Book[], sessions: Session[]) {
  const today = dayKey(new Date(), TZ), end = `${y}-12-31` < today ? `${y}-12-31` : today;
  const s = computeStats(sessions, books, { from: `${y}-01-01`, to: end }, TZ), p = computeStats(sessions, books, { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, TZ);
  const isFin = (yy: number) => books.filter(b => b.status === 'finished' && b.finish_date?.startsWith(String(yy))), fin = isFin(y);
  const bk = new Map(books.map(b => [b.id, b] as const)), authors = new Map<string, number>(), genres = new Map<string, number>(), month: number[] = Array(12).fill(0);
  for (const d of s.daily) month[+d.day.slice(5, 7) - 1] += d.pages;
  for (const x of sessions) if (x.session_date >= `${y}-01-01` && x.session_date <= end && x.end_page >= x.start_page) { const a = bk.get(x.book_id)?.author; if (a) authors.set(a, (authors.get(a) ?? 0) + x.end_page - x.start_page); }
  for (const b of fin) if (b.genre) genres.set(b.genre, (genres.get(b.genre) ?? 0) + 1);
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const bt = Object.entries(s.buckets).sort((a, b) => b[1] - a[1])[0], pre: Record<string, string> = { morgens: 'Frühaufsteher', mittags: 'Mittagsleser', abends: 'Abendleser', nachts: 'Nachteule' };
  const style = s.avgSessionMinutes >= 60 ? 'Marathonleser' : s.avgSessionMinutes > 0 && s.avgSessionMinutes <= 25 ? 'Häppchenleser' : 'Gewohnheitsleser';
  const dur = fin.filter(b => b.start_date && b.finish_date && b.finish_date >= b.start_date).map(b => ({ b, d: Math.round((Date.parse(b.finish_date!) - Date.parse(b.start_date!)) / 864e5) })).sort((a, b) => a.d - b.d)[0];
  return { y, s, p, fin, prevFin: isFin(y - 1).length, month, genres: top(genres, 5), author: top(authors, 1)[0], bt, persona: bt && bt[1] > 0 ? `${pre[bt[0]]} & ${style}` : style, dur,
    rated: [...fin].filter(b => b.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.total_pages - a.total_pages)[0], longest: [...fin].sort((a, b) => b.total_pages - a.total_pages)[0],
    heat: new Map(s.daily.map(d => [d.day, d.pages] as const)), empty: s.sessionsCount === 0 && fin.length === 0, hasPrev: p.sessionsCount > 0 };
}
type D = ReturnType<typeof build>;
type Slide = { bg: string; dur: number; node: ReactNode; end?: boolean };

const Cap = ({ children, d = 0 }: { children: ReactNode; d?: number }) => <div className="rt-rise text-xs font-medium uppercase tracking-[.25em] opacity-80 md:text-sm" style={{ animationDelay: `${d}ms` }}>{children}</div>;
const Big = ({ children, d = 150, sm }: { children: ReactNode; d?: number; sm?: boolean }) => <div className={`rt-pop my-3 font-extrabold leading-[1.05] tracking-tight ${sm ? 'text-3xl md:text-5xl' : 'text-5xl md:text-7xl'}`} style={{ animationDelay: `${d}ms` }}>{children}</div>;
const Sub = ({ children, d = 600 }: { children: ReactNode; d?: number }) => <div className="rt-rise mt-2 text-lg opacity-90 md:text-xl" style={{ animationDelay: `${d}ms` }}>{children}</div>;
function Count({ to, d = 0 }: { to: number; d?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => { let raf = 0; const t0 = performance.now() + d, step = (t: number) => { const k = Math.min(1, Math.max(0, (t - t0) / 1400)); setV(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [to, d]);
  return <>{de(v)}</>;
}
function Bars({ vals, labels, hi }: { vals: number[]; labels: string[]; hi: number }) {
  const max = Math.max(1, ...vals);
  return <div className="mt-6 flex h-44 items-end gap-1.5 md:gap-2">{vals.map((v, i) => <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><div className="rt-grow w-full rounded-t-lg" style={{ height: `${Math.max(3, v / max * 100)}%`, background: i === hi ? '#fff' : 'rgba(255,255,255,.35)', animationDelay: `${300 + i * 70}ms` }} /><div className="text-[10px] opacity-80 md:text-xs">{labels[i]}</div></div>)}</div>;
}
function MiniHeat({ y, heat }: { y: number; heat: Map<string, number> }) {
  const off = (new Date(Date.UTC(y, 0, 1)).getUTCDay() + 6) % 7, n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5, max = Math.max(1, ...heat.values());
  const cells: (string | null)[] = [...Array(off).fill(null), ...Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10))];
  return <div className="mt-5 grid gap-[2px]" style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr' }}>{cells.map((c, i) => c === null ? <div key={i} /> :
    <div key={c} className="rt-cell aspect-square rounded-[2px]" style={{ background: (heat.get(c) ?? 0) > 0 ? `rgba(255,255,255,${0.4 + 0.6 * (heat.get(c)! / max)})` : 'rgba(255,255,255,.12)', animationDelay: `${300 + Math.floor(i / 7) * 14}ms` }} />)}</div>;
}

function slidesOf(D: D): Slide[] {
  const { s, p, fin } = D, L: Slide[] = [], hrs = Math.floor(s.minutes / 60), pct = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : null), sg = (n: number | null) => (n === null ? '–' : `${n >= 0 ? '+' : ''}${n} %`);
  L.push({ bg: 'from-indigo-600 via-violet-600 to-fuchsia-600', dur: 6, node: <><Cap>Dein Lesejahr</Cap><Big>{D.y}</Big><Sub d={500}>Bereit für deinen Rückblick?</Sub></> });
  L.push({ bg: 'from-sky-600 to-indigo-700', dur: 10, node: fin.length > 0 ? <><Cap>Das hast du gelesen</Cap><Big><Count to={fin.length} /> {fin.length === 1 ? 'Buch' : 'Bücher'}</Big><Sub d={900}><Count to={s.pages} d={500} /> Seiten{s.pages >= 600 ? ` – rund ${(s.pages / 1200).toFixed(1).replace('.', ',')} Mal „Der Herr der Ringe“ (ca. 1.200 Seiten).` : '.'}</Sub></>
    : <><Cap>Das hast du gelesen</Cap><Big><Count to={s.pages} /> Seiten</Big><Sub d={900}>Dein nächstes abgeschlossenes Buch wartet schon.</Sub></> });
  L.push({ bg: 'from-emerald-600 to-teal-700', dur: 10, node: <><Cap>Deine Lesezeit</Cap><Big><Count to={hrs} /> Stunden</Big><Sub d={900}>{`Das sind ${(s.minutes / 1440).toFixed(1).replace('.', ',')} volle Tage – im Schnitt ${Math.round(s.avgMinutesPerDay)} Minuten pro Tag.`}</Sub></> });
  L.push({ bg: 'from-rose-600 to-orange-500', dur: 11, node: <><Cap>Dein Rhythmus</Cap><Big><Count to={s.activeDays} /> Lesetage</Big><MiniHeat y={D.y} heat={D.heat} /><Sub d={1300}>{`Längster Streak: ${s.longestStreak} Tag${s.longestStreak === 1 ? '' : 'e'} in Folge.`}</Sub></> });
  const mi = D.month.indexOf(Math.max(...D.month));
  if (D.month[mi] > 0) L.push({ bg: 'from-fuchsia-600 to-purple-700', dur: 10, node: <><Cap>Dein stärkster Monat</Cap><Big>{MONF[mi]}</Big><Bars vals={D.month} labels={MON} hi={mi} /><Sub d={1200}>{`${de(D.month[mi])} Seiten in diesem Monat.`}</Sub></> });
  const wd = ORDER.map(i => s.weekday[i].minutes), wi = wd.indexOf(Math.max(...wd));
  if (wd[wi] > 0) L.push({ bg: 'from-amber-500 to-red-500', dur: 9, node: <><Cap>Dein Lesetag</Cap><Big>{WDF[ORDER[wi]]}</Big><Bars vals={wd} labels={['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']} hi={wi} /><Sub d={1200}>An diesem Wochentag liest du insgesamt am längsten.</Sub></> });
  if (D.bt && D.bt[1] > 0) { const tot = Object.values(s.buckets).reduce((a, b) => a + b, 0), vals = ['morgens', 'mittags', 'abends', 'nachts'].map(k => s.buckets[k as keyof typeof s.buckets]);
    L.push({ bg: 'from-slate-800 to-indigo-800', dur: 9, node: <><Cap>Deine Tageszeit</Cap><Big>{D.bt[0].charAt(0).toUpperCase() + D.bt[0].slice(1)}</Big><Bars vals={vals} labels={['Morgens', 'Mittags', 'Abends', 'Nachts']} hi={vals.indexOf(Math.max(...vals))} /><Sub d={1200}>{`${Math.round(D.bt[1] / tot * 100)} % deiner Lesezeit.`}</Sub></> }); }
  if (D.genres.length) L.push({ bg: 'from-teal-600 to-cyan-700', dur: 9, node: <><Cap>Dein Lieblingsgenre</Cap><Big>{D.genres[0][0]}</Big><div className="mt-4 space-y-2">{D.genres.map(([g, n], i) => <div key={g} className="rt-rise" style={{ animationDelay: `${500 + i * 120}ms` }}><div className="flex justify-between text-sm"><span>{g}</span><span>{n}</span></div><div className="mt-1 h-2 rounded-full bg-white/20"><div className="h-2 rounded-full bg-white" style={{ width: `${n / D.genres[0][1] * 100}%` }} /></div></div>)}</div></> });
  if (D.author) L.push({ bg: 'from-violet-600 to-indigo-700', dur: 8, node: <><Cap>Dein Lieblingsautor</Cap><Big sm>{D.author[0]}</Big><Sub d={700}>{`${de(D.author[1])} Seiten von diesem Autor.`}</Sub></> });
  if (D.rated) L.push({ bg: 'from-yellow-500 to-orange-600', dur: 9, node: <><Cap>Dein Highlight</Cap>{D.rated.cover_url && /^https?:\/\//.test(D.rated.cover_url) && <img src={D.rated.cover_url} alt="" referrerPolicy="no-referrer" className="rt-pop mt-3 h-40 rounded-lg object-cover shadow-xl" style={{ animationDelay: '300ms' }} />}<Big sm d={500}>{D.rated.title}</Big><Sub d={900}>{'★'.repeat(D.rated.rating ?? 0)} – dein bestbewertetes Buch.</Sub></> });
  if (D.longest) L.push({ bg: 'from-blue-600 to-violet-700', dur: 9, node: <><Cap>Dein dickster Wälzer</Cap><Big sm>{D.longest.title}</Big><Sub d={700}>{`${de(D.longest.total_pages)} Seiten.`}{D.dur ? ` Am schnellsten warst du mit „${D.dur.b.title}“: ${Math.max(1, D.dur.d)} Tag${D.dur.d > 1 ? 'e' : ''}.` : ''}</Sub></> });
  L.push({ bg: 'from-pink-600 to-rose-700', dur: 10, node: <><Cap>Deine Rekorde</Cap><div className="mt-4 space-y-4">{[[`${s.record.maxPagesDay ? de(s.record.maxPagesDay.pages) : '–'} Seiten`, 'an einem Tag'], [`${Math.round(s.record.longestSession)} Min.`, 'längste Session'], [`${s.longestStreak} Tage`, 'längster Streak']].map(([a, b], i) => <div key={b} className="rt-pop" style={{ animationDelay: `${300 + i * 350}ms` }}><div className="text-4xl font-extrabold md:text-6xl">{a}</div><div className="opacity-80">{b}</div></div>)}</div></> });
  if (D.hasPrev && p.pages > 0) L.push({ bg: 'from-cyan-600 to-blue-700', dur: 10, node: <><Cap>Im Vergleich zu {D.y - 1}</Cap><Big>{sg(pct(s.pages, p.pages))}</Big><Sub d={800}>{`Seiten: ${de(s.pages)} statt ${de(p.pages)}`}</Sub><Sub d={1100}>{`Lesezeit: ${sg(pct(s.minutes, p.minutes))} · Bücher: ${fin.length} statt ${D.prevFin}`}</Sub></> });
  L.push({ bg: 'from-indigo-700 via-fuchsia-600 to-orange-500', dur: 9, node: <><Cap>Dein Leser-Typ</Cap><Big sm>{D.persona}</Big><Sub d={800}>Das sagen deine Lesegewohnheiten über dich.</Sub></> });
  L.push({ bg: 'from-indigo-600 to-violet-700', dur: 0, end: true, node: <><Cap>Das war dein Jahr</Cap><Big sm>Danke fürs Lesen!</Big><div className="rt-rise mt-3 space-y-1 text-lg" style={{ animationDelay: '500ms' }}>{summary(D).slice(1).map(l => <div key={l}>{l}</div>)}</div></> });
  return L;
}
const summary = (D: D) => [`Mein Lesejahr ${D.y}`, `${D.fin.length} Bücher · ${de(D.s.pages)} Seiten`, `Lesezeit: ${fmt(D.s.minutes)}`, `Längster Streak: ${D.s.longestStreak} Tage`, ...(D.genres[0] ? [`Lieblingsgenre: ${D.genres[0][0]}`] : []), `Leser-Typ: ${D.persona}`];
function saveImage(name: string, lines: string[]) {
  const c = document.createElement('canvas'); c.width = c.height = 1080; const x = c.getContext('2d')!, g = x.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#c026d3'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080); x.fillStyle = '#fff';
  lines.forEach((l, i) => { x.font = i === 0 ? 'bold 72px sans-serif' : '46px sans-serif'; x.fillText(l.slice(0, 40), 80, 200 + i * 125 + (i > 0 ? 40 : 0), 920); });
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = name; a.click();
}

function Story({ D, onClose }: { D: D; onClose: () => void }) {
  const L = useMemo(() => slidesOf(D), [D]), [i, setI] = useState(0), [paused, setPaused] = useState(false), t0 = useRef(0), sl = L[i];
  const next = () => setI(k => Math.min(L.length - 1, k + 1)), prev = () => setI(k => Math.max(0, k - 1)), stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onPointerUp: (e: React.PointerEvent) => e.stopPropagation() };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, []);
  return <div className={`fixed inset-0 z-[60] select-none bg-gradient-to-br ${sl.bg} text-white`} onPointerDown={() => { t0.current = Date.now(); setPaused(true); }} onPointerLeave={() => setPaused(false)}
    onPointerUp={e => { setPaused(false); if (Date.now() - t0.current < 250) (e.clientX / window.innerWidth < 0.33 ? prev : next)(); }}>
    <div className="mx-auto flex h-full max-w-3xl flex-col px-5 md:px-10" style={{ paddingTop: 'max(.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <div className="flex gap-1">{L.map((s, k) => <div key={k} className="h-1 flex-1 overflow-hidden rounded bg-white/30"><div key={`${k}-${k === i}`} className="h-full bg-white" style={k < i || (k === i && s.dur === 0) ? { width: '100%' } : k === i ? { animation: `rtbar ${s.dur}s linear forwards`, animationPlayState: paused ? 'paused' : 'running' } : { width: 0 }} onAnimationEnd={() => k === i && next()} /></div>)}</div>
      <div className="mt-3 flex justify-end gap-2"><button {...stop} aria-label={paused ? 'Weiter' : 'Pause'} onClick={() => setPaused(p => !p)} className="rounded-full bg-white/15 p-2">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button {...stop} aria-label="Schließen" onClick={onClose} className="rounded-full bg-white/15 p-2"><X className="h-4 w-4" /></button></div>
      <div key={i} className="flex flex-1 flex-col justify-center">{sl.node}</div>
      {sl.end && <div className="flex flex-wrap gap-2" {...stop}><button className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-indigo-700" onClick={() => saveImage(`wrapped-${D.y}.png`, summary(D))}>Als Bild speichern</button><button className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-medium" onClick={() => window.print()}>Als PDF</button><button className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-medium" onClick={() => setI(0)}>Nochmal ansehen</button><button className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-medium" onClick={onClose}>Schließen</button></div>}
    </div></div>;
}

export function Wrapped({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const st = wrappedStatus(dayKey(new Date(), TZ)), [sel, setSel] = useState<number>(), [open, setOpen] = useState(false);
  const years = useMemo(() => { const a = new Set(sessions.map(s => +s.session_date.slice(0, 4))); books.forEach(b => b.finish_date && a.add(+b.finish_date.slice(0, 4))); return [...a].sort((p, q) => q - p); }, [sessions, books]);
  const avail = years.filter(y => y < st.year || st.open), y = sel ?? avail[0], D = useMemo(() => (y ? build(y, books, sessions) : null), [y, books, sessions]);
  const wait = !st.open && years.includes(st.year);
  const waitCard = wait && <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg md:p-8"><Sparkles className="mb-3 h-7 w-7" /><div className="text-xl font-semibold md:text-2xl">Dein Wrapped {st.year} erscheint am 1. Dezember</div><p className="mt-1 opacity-90">Noch {st.left} Tag{st.left === 1 ? '' : 'e'}. Lies bis dahin weiter, damit dein Rückblick noch besser wird.</p></div>;
  if (!D || !y) return <div className="space-y-3">{waitCard || <p className={card}>Noch keine Daten für einen Jahresrückblick.</p>}</div>;
  return <div className="space-y-4">{waitCard}
    <div className="flex flex-wrap items-center gap-2"><select className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={y} onChange={e => setSel(+e.target.value)}>{avail.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
    {D.empty ? <p className={card}>Für {y} gibt es keine Daten.</p> : <>
      <button onClick={() => setOpen(true)} className="rt-pop group relative flex min-h-[16rem] w-full flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-left text-white shadow-xl transition hover:shadow-2xl md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 transition group-hover:scale-110" /><div className="pointer-events-none absolute -bottom-24 -left-10 h-60 w-60 rounded-full bg-black/10" />
        <Sparkles className="relative mb-3 h-8 w-8" /><div className="relative text-sm uppercase tracking-[.25em] opacity-80">Reading Wrapped</div><div className="relative text-5xl font-extrabold tracking-tight md:text-7xl">{y}</div><div className="relative mt-2 opacity-90">Dein Lesejahr in etwa 2 Minuten – tippe zum Starten.</div></button>
      <div className="grid grid-cols-3 gap-3">{[[D.fin.length, 'Bücher'], [de(D.s.pages), 'Seiten'], [fmt(D.s.minutes), 'Lesezeit']].map(([v, l]) => <div key={l} className={card + ' !p-4'}><div className="text-xs uppercase tracking-wide text-zinc-500">{l}</div><div className="mt-1 text-xl font-semibold tabular-nums md:text-2xl">{v}</div></div>)}</div>
      <div className="flex flex-wrap gap-2"><button className={btn} onClick={() => saveImage(`wrapped-${y}.png`, summary(D))}>Social-Bild speichern</button><button className={btn} onClick={() => window.print()}>Als PDF speichern</button></div></>}
    {open && <Story D={D} onClose={() => setOpen(false)} />}
    <div id="wrapped-print" className="hidden print:block" style={{ padding: 40 }}>{summary(D).map((l, k) => <div key={l} style={{ fontSize: k === 0 ? 40 : 24, fontWeight: k === 0 ? 800 : 400, margin: '12px 0' }}>{l}</div>)}</div></div>;
}

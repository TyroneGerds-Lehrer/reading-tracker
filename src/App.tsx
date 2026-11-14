import { AlertTriangle, BarChart3, BookOpen, Cloud, CloudOff, LayoutDashboard, LogOut, Menu, Moon, RefreshCw, Settings as SettingsIcon, Sparkles, Sun, Target, Timer, Trophy, type LucideIcon } from 'lucide-react';
import { Empty, Skeleton, btn, card, inp } from './ui';
import { useEffect, useMemo, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from './lib/supabase';
import { getAll, getConflicts, getStatus, remove, save, sync, type SyncStatus } from './lib/data';
import { Goals, Heat, Settings, type Goal } from './Extra';
import { Wrapped } from './Wrapped';
import { More } from './More';
import { BookSearch } from './BookSearch';
import { Motivation } from './Motivation';
import { useReminder } from './notify';
import { Dash } from './Dash';
import { Conflicts } from './Conflicts';
import { BookEditor, SessionEditor, deleteSession } from './Edit';
import { computeStats, dayKey, insights, rangeFor, type Book, type Session } from './lib/stats';

import { TZ } from './lib/tz';
const NAV = ['Dashboard', 'Meine Bücher', 'Lesesessions', 'Statistiken', 'Leseziele', 'Motivation', 'Reading Wrapped', 'Einstellungen'];
const STATUS_TXT: Record<SyncStatus, string> = { synced: 'Synchronisiert', syncing: 'Synchronisierung läuft', offline: 'Offline', failed: 'Synchronisierung fehlgeschlagen' };
const BOOK_STATUS: Record<string, string> = { wishlist: 'Leseliste', reading: 'Aktuell am Lesen', paused: 'Pausiert', abandoned: 'Abgebrochen', finished: 'Abgeschlossen' };
const fmtMin = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;

function useLive() {
  const [v, setV] = useState({ goals: [] as Goal[], books: [] as Book[], sessions: [] as Session[], status: getStatus(), conflicts: 0, ready: false });
  useEffect(() => {
    const load = async () => setV({ ready: true, goals: await getAll<Goal>('reading_goals'), books: await getAll<Book>('books'), sessions: await getAll<Session>('reading_sessions'), status: getStatus(), conflicts: (await getConflicts()).length });
    void load(); ['rt-sync', 'rt-data'].forEach(e => window.addEventListener(e, load)); return () => ['rt-sync', 'rt-data'].forEach(e => window.removeEventListener(e, load));
  }, []);
  return v;
}

function Auth() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState('');
  const run = async (kind: 'in' | 'up' | 'reset') => {
    const r = kind === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw })
      : kind === 'up' ? await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.href } })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    setMsg(r.error ? r.error.message : kind === 'in' ? '' : 'Bitte prüfe dein E-Mail-Postfach.');
  };
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-zinc-50 to-violet-50 p-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-indigo-950/40"><div className={card + ' w-full max-w-sm space-y-4 !p-6 rt-page'}>
    <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-md shadow-indigo-600/30"><BookOpen className="h-5 w-5" /></div><div><div className="text-lg font-semibold tracking-tight">Reading Tracker</div><div className="text-xs text-zinc-500">Dein persönliches Lese-Dashboard</div></div></div>
    <input className={inp + ' w-full'} placeholder="E-Mail" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
    <input className={inp + ' w-full'} placeholder="Passwort" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
    <div className="grid grid-cols-2 gap-2"><button className={btn} onClick={() => run('in')}>Anmelden</button><button className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={() => run('up')}>Registrieren</button></div>
    <button className="text-sm text-indigo-600 underline dark:text-indigo-300" onClick={() => run('reset')}>Passwort zurücksetzen</button>{msg && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{msg}</p>}</div></div>;
}

function Stat({ l, v }: { l: string; v: string | number }) { return <div className={card + ' !p-4'}><div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight md:text-3xl">{v}</div></div>; }

function Dashboard({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const s = useMemo(() => computeStats(sessions, books, null, TZ), [sessions, books]);
  const yr = useMemo(() => computeStats(sessions, books, rangeFor('year', TZ), TZ), [sessions, books]);
  const last30 = useMemo(() => computeStats(sessions, books, rangeFor('30', TZ), TZ).daily, [sessions, books]);
  const tips = useMemo(() => insights(sessions, books, TZ), [sessions, books]);
  if (!sessions.length) return <p className={card}>Noch keine Lesesessions. Erfasse deine erste Session, dann erscheinen hier deine Statistiken.</p>;
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    <Stat l="Bücher dieses Jahr" v={yr.finishedBooks} /><Stat l="Seiten gesamt" v={s.pages} /><Stat l="Lesezeit gesamt" v={fmtMin(s.minutes)} />
    <Stat l="Seiten pro Stunde" v={s.pagesPerHour ? Math.round(s.pagesPerHour) : '–'} /><Stat l="Aktive Lesetage" v={s.activeDays} />
    <Stat l="Aktueller Streak" v={`${s.currentStreak} Tage`} /><Stat l="Längster Streak" v={`${s.longestStreak} Tage`} /><Stat l="Ø Min. pro Tag" v={Math.round(s.avgMinutesPerDay)} /></div>
    <div className={card}><h3 className="mb-2 font-medium">Gelesene Seiten (letzte 30 Tage, nur Tage mit Sessions)</h3>
      <div className="h-56"><ResponsiveContainer><BarChart data={last30}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={d => d.slice(5)} /><YAxis /><Tooltip /><Bar dataKey="pages" name="Seiten" fill="#6366f1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
    {tips.length > 0 && <div className={card}><h3 className="mb-2 font-medium">Erkenntnisse</h3><ul className="list-disc pl-5 text-sm">{tips.map(t => <li key={t}>{t}</li>)}</ul></div>}</div>;
}

function Books({ books, uid }: { books: Book[]; uid: string }) {
  const [f, setF] = useState({ title: '', author: '', genre: '', total_pages: 0 }), [q, setQ] = useState(''), [st, setSt] = useState(''), [ed, setEd] = useState<string | null>(null);
  const add = () => { if (!f.title.trim()) return; void save('books', { id: crypto.randomUUID(), user_id: uid, ...f, title: f.title.trim(), genre: f.genre || null, current_page: 0, status: 'wishlist', rating: null }); setF({ title: '', author: '', genre: '', total_pages: 0 }); };
  const upd = (b: Book, p: Partial<Book>) => { const n = { ...b, ...p }; if (p.status === 'finished') { n.finish_date = dayKey(new Date(), TZ); if (n.total_pages) n.current_page = n.total_pages; } void save('books', n, b.updated_at); };
  const list = books.filter(b => (!st || b.status === st) && `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="space-y-4"><BookSearch books={books} uid={uid} /><div className={card + ' flex flex-wrap gap-2'}>
    <input className={inp} placeholder="Titel" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><input className={inp} placeholder="Autor" value={f.author} onChange={e => setF({ ...f, author: e.target.value })} />
    <input className={inp} placeholder="Genre" value={f.genre} onChange={e => setF({ ...f, genre: e.target.value })} /><input className={inp + ' w-28'} type="number" min={0} placeholder="Seiten" value={f.total_pages || ''} onChange={e => setF({ ...f, total_pages: Math.max(0, +e.target.value) })} />
    <button className={btn} onClick={add}>Buch hinzufügen</button></div>
    <div className="flex gap-2"><input className={inp} placeholder="Suchen…" value={q} onChange={e => setQ(e.target.value)} /><select className={inp} value={st} onChange={e => setSt(e.target.value)}><option value="">Alle Status</option>{Object.entries(BOOK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {list.length === 0 && <Empty icon={BookOpen} title="Keine Bücher" text="Füge oben dein erstes Buch hinzu." />}
    {list.map(b => ed === b.id ? <div key={b.id} className={card}><BookEditor book={b} onClose={() => setEd(null)} /></div> : <div key={b.id} className={card + ' flex flex-wrap items-center justify-between gap-2'}><div>{b.cover_url && /^https?:\/\//.test(b.cover_url) && <img src={b.cover_url} alt="" referrerPolicy="no-referrer" className="mb-1 h-16 rounded object-cover" />}<div className="font-medium">{b.title}</div><div className="text-sm text-zinc-500">{b.author}{b.total_pages ? ` · ${Math.round(b.current_page / b.total_pages * 100)} % (${b.current_page}/${b.total_pages})` : ''}</div></div>
      <div className="flex items-center gap-2"><select className={inp} value={b.status} onChange={e => upd(b, { status: e.target.value })}>{Object.entries(BOOK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={inp} value={b.rating ?? ''} onChange={e => upd(b, { rating: e.target.value ? +e.target.value : null })}><option value="">★</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}★</option>)}</select>
        <button onClick={() => setEd(b.id)}>Bearbeiten</button><button className="text-red-600" onClick={() => confirm('Buch und zugehörige Sessions löschen?') && void remove('books', b.id)}>Löschen</button></div></div>)}</div>;
}

type Timer = { start: string; acc: number; run: number | null };
function Sessions({ books, sessions, uid }: { books: Book[]; sessions: Session[]; uid: string }) {
  const K = 'rt-timer', [tm, setTm] = useState<Timer | null>(() => JSON.parse(localStorage.getItem(K) ?? 'null'));
  const [started, setStarted] = useState<string | null>(null), [, tick] = useState(0), [err, setErr] = useState('');
  const [f, setF] = useState({ book: '', start: 0, end: 0, min: 0, note: '' }), [ed, setEd] = useState<string | null>(null);
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i); }, []);
  const persist = (v: Timer | null) => { setTm(v); if (v) localStorage.setItem(K, JSON.stringify(v)); else localStorage.removeItem(K); }; // überlebt Neuladen
  const ms = tm ? tm.acc + (tm.run ? Date.now() - tm.run : 0) : 0;
  const pick = (id: string) => setF(x => ({ ...x, book: id, start: books.find(b => b.id === id)?.current_page ?? 0 }));
  const stop = () => { if (!tm) return; setStarted(tm.start); setF(x => ({ ...x, min: Math.round(ms / 6000) / 10 })); persist(null); };
  const submit = () => {
    const b = books.find(x => x.id === f.book); if (!b) return setErr('Bitte ein Buch wählen.');
    if (f.end < f.start || f.start < 0) return setErr('Die Endseite muss ≥ Startseite sein.');
    if (b.total_pages && f.end > b.total_pages) return setErr('Endseite liegt über der Seitenzahl des Buchs.');
    if (f.min < 0) return setErr('Dauer ungültig.'); setErr('');
    const end = new Date(), start = started ? new Date(started) : new Date(end.getTime() - f.min * 60000);
    void save('reading_sessions', { id: crypto.randomUUID(), user_id: uid, book_id: b.id, session_date: dayKey(start, TZ), start_time: start.toISOString(), end_time: end.toISOString(), duration_minutes: f.min, start_page: f.start, end_page: f.end, notes: f.note || null });
    void save('books', { ...b, current_page: Math.max(b.current_page, f.end), status: b.status === 'wishlist' ? 'reading' : b.status, start_date: b.start_date ?? dayKey(start, TZ) }, b.updated_at);
    setF({ book: '', start: 0, end: 0, min: 0, note: '' }); setStarted(null);
  };
  const bt = (id: string) => books.find(b => b.id === id)?.title ?? '(gelöschtes Buch)';
  return <div className="space-y-4"><div className={card + ' space-y-3'}><div className="font-mono text-3xl">{new Date(ms).toISOString().slice(11, 19)}</div>
    <div className="flex gap-2">{!tm && <button className={btn} onClick={() => persist({ start: new Date().toISOString(), acc: 0, run: Date.now() })}>Start</button>}
      {tm?.run && <button className={btn} onClick={() => persist({ ...tm, acc: ms, run: null })}>Pause</button>}
      {tm && !tm.run && <button className={btn} onClick={() => persist({ ...tm, run: Date.now() })}>Fortsetzen</button>}
      {tm && <button className={btn} onClick={stop}>Stoppen</button>}</div>
    <div className="flex flex-wrap gap-2"><select className={inp} value={f.book} onChange={e => pick(e.target.value)}><option value="">Buch wählen</option>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
      <input className={inp + ' w-24'} type="number" min={0} value={f.start} onChange={e => setF({ ...f, start: +e.target.value })} aria-label="Startseite" /><input className={inp + ' w-24'} type="number" min={0} value={f.end} onChange={e => setF({ ...f, end: +e.target.value })} aria-label="Endseite" />
      <input className={inp + ' w-24'} type="number" min={0} step="0.1" value={f.min} onChange={e => setF({ ...f, min: +e.target.value })} aria-label="Minuten" /><input className={inp} placeholder="Notiz" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <button className={btn} onClick={submit}>Session speichern</button></div>{err && <p className="text-sm text-red-600">{err}</p>}</div>
    {[...sessions].sort((a, b) => (b.start_time ?? b.session_date).localeCompare(a.start_time ?? a.session_date)).slice(0, 100).map(s => <div key={s.id} className={card + ' text-sm'}>{ed === s.id ? <SessionEditor s={s} books={books} sessions={sessions} onClose={() => setEd(null)} /> : <div className="flex justify-between gap-2">
      <span>{s.session_date} · {bt(s.book_id)} · S. {s.start_page}–{s.end_page} ({s.end_page - s.start_page} Seiten) · {Math.round(s.duration_minutes)} Min.</span><span className="flex gap-3"><button onClick={() => setEd(s.id)}>Bearbeiten</button><button className="text-red-600" onClick={() => confirm('Session löschen?') && void deleteSession(s, sessions, books)}>Löschen</button></span></div>}</div>)}</div>;
}

function Statistics({ books, sessions }: { books: Book[]; sessions: Session[] }) {
  const [p, setP] = useState(localStorage.getItem('rt-period') ?? '30'), [pick, setPick] = useState<string | null>(null);
  const s = useMemo(() => computeStats(sessions, books, rangeFor(p, TZ), TZ), [p, sessions, books]);
  const opts: [string, string][] = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['month', 'Aktueller Monat'], ['lastmonth', 'Letzter Monat'], ['year', 'Aktuelles Jahr'], ['lastyear', 'Letztes Jahr'], ['all', 'Gesamt']];
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return <div className="space-y-4"><select className={inp} value={p} onChange={e => setP(e.target.value)}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat l="Seiten" v={s.pages} /><Stat l="Lesezeit" v={fmtMin(s.minutes)} /><Stat l="Sessions" v={s.sessionsCount} /><Stat l="Ø Min./Session" v={Math.round(s.avgSessionMinutes)} />
      <Stat l="Aktive Tage" v={s.activeDays} /><Stat l="Lesefreie Tage" v={s.restDays} /><Stat l="Ø Seiten/Tag" v={s.avgPagesPerDay.toFixed(1)} /><Stat l="Seiten/Stunde" v={s.pagesPerHour ? Math.round(s.pagesPerHour) : '–'} />
      <Stat l="Längste Session" v={`${Math.round(s.record.longestSession)} Min.`} /><Stat l="Max. Seiten/Tag" v={s.record.maxPagesDay ? `${s.record.maxPagesDay.pages} (${s.record.maxPagesDay.day})` : '–'} /></div>
    <div className={card}><h3 className="mb-2 font-medium">Lesezeit pro Tag (Min.)</h3><div className="h-56"><ResponsiveContainer><BarChart data={s.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={d => d.slice(5)} /><YAxis /><Tooltip /><Bar dataKey="minutes" name="Minuten" fill="#6366f1" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(d: any) => setPick(d?.day ?? null)} /></BarChart></ResponsiveContainer></div></div>
    {pick && <div className={card + ' text-sm'}><b>{pick}</b>{sessions.filter(x => x.session_date === pick).map(x => <div key={x.id}>{books.find(b => b.id === x.book_id)?.title ?? '(gelöschtes Buch)'} · S. {x.start_page}–{x.end_page} · {Math.round(x.duration_minutes)} Min.</div>)}</div>}<div className={card}><h3 className="mb-2 font-medium">Lesezeit nach Wochentag (Min. gesamt)</h3><div className="h-48"><ResponsiveContainer><BarChart data={s.weekday.map((v, i) => ({ d: wd[i], minutes: Math.round(v.minutes) }))}><XAxis dataKey="d" /><YAxis /><Tooltip /><Bar dataKey="minutes" fill="#8b5cf6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div></div>;
}

const NAVI: LucideIcon[] = [LayoutDashboard, BookOpen, Timer, BarChart3, Target, Trophy, Sparkles, SettingsIcon];
const SYNC: Record<SyncStatus, { Icon: LucideIcon; cls: string }> = {
  synced: { Icon: Cloud, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  syncing: { Icon: RefreshCw, cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' },
  offline: { Icon: CloudOff, cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  failed: { Icon: AlertTriangle, cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined), [tab, setTab] = useState(0), [more, setMore] = useState(false), [dark, setDark] = useState(localStorage.getItem('rt-theme') ? localStorage.getItem('rt-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const { books, sessions, goals, status, conflicts, ready } = useLive();
  useReminder(sessions, goals);
  useEffect(() => { supabase.auth.getSession().then(r => setAuth(r.data.session)); const { data } = supabase.auth.onAuthStateChange((_e, s) => { setAuth(s); if (s) void sync(); }); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => { if (!auth) return; void supabase.from('profiles').select('timezone,preferred_theme').eq('id', auth.user.id).maybeSingle().then(({ data }) => { if (!data) return; if (data.preferred_theme) { localStorage.setItem('rt-theme', data.preferred_theme); setDark(data.preferred_theme === 'dark'); } if (data.timezone && data.timezone !== TZ) { localStorage.setItem('rt-tz', data.timezone); location.reload(); } }); }, [auth?.user.id]);
  if (auth === undefined) return <div className="p-6"><Skeleton /></div>;
  if (!auth) return <Auth />;
  const uid = auth.user.id, go = (i: number) => { setTab(i); setMore(false); window.scrollTo({ top: 0 }); };
  const toggleTheme = () => { const n = !dark; setDark(n); localStorage.setItem('rt-theme', n ? 'dark' : 'light'); void supabase.from('profiles').update({ preferred_theme: n ? 'dark' : 'light' }).eq('id', uid); };
  const { Icon: SIcon, cls } = SYNC[status];
  const pill = <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`} title="Synchronisierungsstatus"><SIcon className={`h-3.5 w-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`} />{STATUS_TXT[status]}</span>;
  const confBtn = conflicts > 0 && <button className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" onClick={() => go(7)}>{conflicts} Konflikt(e)</button>;
  const logo = <div className="flex items-center gap-2.5"><div className="rounded-xl bg-indigo-600 p-2 text-white shadow-md shadow-indigo-600/30"><BookOpen className="h-4 w-4" /></div><span className="font-semibold tracking-tight">Reading Tracker</span></div>;
  const side = (i: number) => { const I = NAVI[i]; return <button key={i} onClick={() => go(i)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${tab === i ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70'}`}><I className="h-[18px] w-[18px]" />{NAV[i]}</button>; };
  const bot = (i: number, label: string) => { const I = NAVI[i]; return <button key={i} onClick={() => go(i)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === i ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-500'}`}><I className="h-5 w-5" />{label}</button>; };
  const themeBtn = <button onClick={toggleTheme} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70">{dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}{dark ? 'Heller Modus' : 'Dunkler Modus'}</button>;
  const outBtn = <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70"><LogOut className="h-[18px] w-[18px]" />Abmelden</button>;
  return <div className="min-h-screen md:pl-64">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-1 border-r border-zinc-200 bg-white/80 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 md:flex"><div className="mb-5 px-1 pt-1">{logo}</div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(side)}<div className="mt-auto flex flex-col gap-1"><div className="flex flex-wrap items-center gap-2 px-1 pb-2">{pill}{confBtn}</div>{themeBtn}{outBtn}</div></aside>
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85 md:hidden" style={{ paddingTop: 'max(.75rem, env(safe-area-inset-top))' }}>{logo}<div className="flex items-center gap-2">{confBtn}{pill}</div></header>
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8"><h1 className="mb-5 text-2xl font-semibold tracking-tight md:text-3xl">{NAV[tab]}</h1>
      <div key={tab} className="rt-page">{!ready ? <Skeleton /> : <>
        {tab === 0 && <Dash books={books} sessions={sessions} goals={goals} onWrapped={() => go(6)} />}{tab === 1 && <Books books={books} uid={uid} />}{tab === 2 && <Sessions books={books} sessions={sessions} uid={uid} />}
        {tab === 3 && <><Statistics books={books} sessions={sessions} /><Heat books={books} sessions={sessions} /><More books={books} sessions={sessions} /></>}
        {tab === 4 && <Goals goals={goals} books={books} sessions={sessions} uid={uid} />}{tab === 5 && <Motivation books={books} sessions={sessions} goals={goals} />}{tab === 6 && <Wrapped books={books} sessions={sessions} />}
        {tab === 7 && <><Conflicts /><Settings books={books} sessions={sessions} goals={goals} uid={uid} /></>}</>}</div></main>
    {more && <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMore(false)}><div className="absolute inset-x-3 bottom-20 flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-900" onClick={e => e.stopPropagation()}>{[4, 5, 6, 7].map(side)}{themeBtn}{outBtn}</div></div>}
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {bot(0, 'Start')}{bot(1, 'Bücher')}{bot(2, 'Sessions')}{bot(3, 'Statistik')}
      <button onClick={() => setMore(!more)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab >= 4 || more ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-500'}`}><Menu className="h-5 w-5" />Mehr</button></nav></div>;
}

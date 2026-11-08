import { useEffect, useMemo, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from './lib/supabase';
import { getAll, getConflicts, getStatus, remove, save, sync, type SyncStatus } from './lib/data';
import { Goals, Heat, Settings, type Goal } from './Extra';
import { Wrapped } from './Wrapped';
import { More } from './More';
import { BookEditor, SessionEditor, deleteSession } from './Edit';
import { computeStats, dayKey, insights, rangeFor, type Book, type Session } from './lib/stats';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NAV = ['Dashboard', 'Meine Bücher', 'Lesesessions', 'Statistiken', 'Leseziele', 'Reading Wrapped', 'Einstellungen'];
const STATUS_TXT: Record<SyncStatus, string> = { synced: 'Synchronisiert', syncing: 'Synchronisierung läuft', offline: 'Offline', failed: 'Synchronisierung fehlgeschlagen' };
const BOOK_STATUS: Record<string, string> = { wishlist: 'Leseliste', reading: 'Aktuell am Lesen', paused: 'Pausiert', abandoned: 'Abgebrochen', finished: 'Abgeschlossen' };
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50';
const card = 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';
const fmtMin = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;

function useLive() {
  const [v, setV] = useState({ goals: [] as Goal[], books: [] as Book[], sessions: [] as Session[], status: getStatus(), conflicts: 0 });
  useEffect(() => {
    const load = async () => setV({ goals: await getAll<Goal>('reading_goals'), books: await getAll<Book>('books'), sessions: await getAll<Session>('reading_sessions'), status: getStatus(), conflicts: (await getConflicts()).length });
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
  return <div className="mx-auto mt-24 max-w-sm space-y-3 p-4"><h1 className="text-2xl font-semibold">Reading Tracker</h1>
    <input className={inp + ' w-full'} placeholder="E-Mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
    <input className={inp + ' w-full'} placeholder="Passwort" type="password" value={pw} onChange={e => setPw(e.target.value)} />
    <div className="flex gap-2"><button className={btn} onClick={() => run('in')}>Anmelden</button><button className={btn} onClick={() => run('up')}>Registrieren</button></div>
    <button className="text-sm underline" onClick={() => run('reset')}>Passwort zurücksetzen</button>{msg && <p className="text-sm text-amber-600">{msg}</p>}</div>;
}

function Stat({ l, v }: { l: string; v: string | number }) { return <div className={card}><div className="text-sm text-slate-500">{l}</div><div className="text-2xl font-semibold">{v}</div></div>; }

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
  return <div className="space-y-4"><div className={card + ' flex flex-wrap gap-2'}>
    <input className={inp} placeholder="Titel" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><input className={inp} placeholder="Autor" value={f.author} onChange={e => setF({ ...f, author: e.target.value })} />
    <input className={inp} placeholder="Genre" value={f.genre} onChange={e => setF({ ...f, genre: e.target.value })} /><input className={inp + ' w-28'} type="number" min={0} placeholder="Seiten" value={f.total_pages || ''} onChange={e => setF({ ...f, total_pages: Math.max(0, +e.target.value) })} />
    <button className={btn} onClick={add}>Buch hinzufügen</button></div>
    <div className="flex gap-2"><input className={inp} placeholder="Suchen…" value={q} onChange={e => setQ(e.target.value)} /><select className={inp} value={st} onChange={e => setSt(e.target.value)}><option value="">Alle Status</option>{Object.entries(BOOK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {list.length === 0 && <p className="text-slate-500">Keine Bücher vorhanden.</p>}
    {list.map(b => ed === b.id ? <div key={b.id} className={card}><BookEditor book={b} onClose={() => setEd(null)} /></div> : <div key={b.id} className={card + ' flex flex-wrap items-center justify-between gap-2'}><div>{b.cover_url && /^https?:\/\//.test(b.cover_url) && <img src={b.cover_url} alt="" referrerPolicy="no-referrer" className="mb-1 h-16 rounded object-cover" />}<div className="font-medium">{b.title}</div><div className="text-sm text-slate-500">{b.author}{b.total_pages ? ` · ${Math.round(b.current_page / b.total_pages * 100)} % (${b.current_page}/${b.total_pages})` : ''}</div></div>
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
  const [p, setP] = useState('30');
  const s = useMemo(() => computeStats(sessions, books, rangeFor(p, TZ), TZ), [p, sessions, books]);
  const opts: [string, string][] = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['month', 'Aktueller Monat'], ['lastmonth', 'Letzter Monat'], ['year', 'Aktuelles Jahr'], ['lastyear', 'Letztes Jahr'], ['all', 'Gesamt']];
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return <div className="space-y-4"><select className={inp} value={p} onChange={e => setP(e.target.value)}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat l="Seiten" v={s.pages} /><Stat l="Lesezeit" v={fmtMin(s.minutes)} /><Stat l="Sessions" v={s.sessionsCount} /><Stat l="Ø Min./Session" v={Math.round(s.avgSessionMinutes)} />
      <Stat l="Aktive Tage" v={s.activeDays} /><Stat l="Lesefreie Tage" v={s.restDays} /><Stat l="Ø Seiten/Tag" v={s.avgPagesPerDay.toFixed(1)} /><Stat l="Seiten/Stunde" v={s.pagesPerHour ? Math.round(s.pagesPerHour) : '–'} />
      <Stat l="Längste Session" v={`${Math.round(s.record.longestSession)} Min.`} /><Stat l="Max. Seiten/Tag" v={s.record.maxPagesDay ? `${s.record.maxPagesDay.pages} (${s.record.maxPagesDay.day})` : '–'} /></div>
    <div className={card}><h3 className="mb-2 font-medium">Lesezeit pro Tag (Min.)</h3><div className="h-56"><ResponsiveContainer><BarChart data={s.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={d => d.slice(5)} /><YAxis /><Tooltip /><Bar dataKey="minutes" name="Minuten" fill="#6366f1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
    <div className={card}><h3 className="mb-2 font-medium">Lesezeit nach Wochentag (Min. gesamt)</h3><div className="h-48"><ResponsiveContainer><BarChart data={s.weekday.map((v, i) => ({ d: wd[i], minutes: Math.round(v.minutes) }))}><XAxis dataKey="d" /><YAxis /><Tooltip /><Bar dataKey="minutes" fill="#8b5cf6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div></div>;
}

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined), [tab, setTab] = useState(0), [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const { books, sessions, goals, status, conflicts } = useLive();
  useEffect(() => { supabase.auth.getSession().then(r => setAuth(r.data.session)); const { data } = supabase.auth.onAuthStateChange((_e, s) => { setAuth(s); if (s) void sync(); }); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  if (auth === undefined) return null; if (!auth) return <Auth />;
  const uid = auth.user.id;
  return <div className="mx-auto max-w-5xl p-4"><header className="mb-4 flex flex-wrap items-center justify-between gap-2"><nav className="flex flex-wrap gap-1">{NAV.map((n, i) => <button key={n} onClick={() => setTab(i)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === i ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{n}</button>)}</nav>
    <div className="flex items-center gap-3 text-sm"><span title="Synchronisierungsstatus">{STATUS_TXT[status]}{conflicts > 0 && ` · ${conflicts} Konflikt(e)`}</span><button onClick={() => setDark(!dark)}>{dark ? 'Hell' : 'Dunkel'}</button><button onClick={() => supabase.auth.signOut()}>Abmelden</button></div></header>
    {tab === 0 && <Dashboard books={books} sessions={sessions} />}{tab === 1 && <Books books={books} uid={uid} />}{tab === 2 && <Sessions books={books} sessions={sessions} uid={uid} />}{tab === 3 && <><Statistics books={books} sessions={sessions} /><Heat books={books} sessions={sessions} /><More books={books} sessions={sessions} /></>}{tab === 4 && <Goals goals={goals} books={books} sessions={sessions} uid={uid} />}{tab === 6 && <Settings books={books} sessions={sessions} goals={goals} uid={uid} />}
    {tab === 5 && <Wrapped books={books} sessions={sessions} />}</div>;
}

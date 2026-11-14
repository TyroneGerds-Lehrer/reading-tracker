import { btn, card, inp } from './ui';
import { Target } from 'lucide-react';
import { Empty } from './ui';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { remove, removeMany, save, sync } from './lib/data';
import { computeStats, dayKey, type Book, type Session } from './lib/stats';

import { TZ } from './lib/tz';
import type { GameEvent } from './lib/game';
export type Goal = { id: string; user_id: string; goal_type: string; target_value: number };
export const PERIODS: [string, string][] = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['month', 'Aktueller Monat'], ['lastmonth', 'Letzter Monat'], ['year', 'Aktuelles Jahr'], ['lastyear', 'Letztes Jahr'], ['all', 'Gesamter Zeitraum']];
export const GT: Record<string, string> = { books_year: 'Bücher pro Jahr', pages_year: 'Seiten pro Jahr', pages_month: 'Seiten pro Monat', minutes_week: 'Lesezeit pro Woche (Min.)', minutes_day: 'Lesezeit pro Tag (Min.)', days_month: 'Lesetage pro Monat' };

export function progress(g: Goal, s: Session[], b: Book[]) {
  const now = new Date(), t = dayKey(now, TZ), y = t.slice(0, 4), m = t.slice(0, 7), w = dayKey(new Date(now.getTime() - 6 * 864e5), TZ);
  const R: Record<string, [string, string]> = { books_year: [`${y}-01-01`, `${y}-12-31`], pages_year: [`${y}-01-01`, `${y}-12-31`], pages_month: [`${m}-01`, `${m}-31`], days_month: [`${m}-01`, `${m}-31`], minutes_week: [w, t], minutes_day: [t, t] };
  const [from, to] = R[g.goal_type], st = computeStats(s, b, { from, to }, TZ);
  return g.goal_type.startsWith('books') ? st.finishedBooks : g.goal_type.startsWith('pages') ? st.pages : g.goal_type.startsWith('minutes') ? Math.round(st.minutes) : st.activeDays;
}

export function Goals({ goals, books, sessions, uid }: { goals: Goal[]; books: Book[]; sessions: Session[]; uid: string }) {
  const [type, setType] = useState('pages_month'), [target, setTarget] = useState(0);
  const rows = goals.map(g => { const v = progress(g, sessions, books); return { g, v, pct: Math.round(v / g.target_value * 100) }; });
  const row = (r: (typeof rows)[0]) => <div key={r.g.id} className={card}><div className="flex justify-between text-sm"><span>{GT[r.g.goal_type]}: {r.v} / {r.g.target_value} ({r.pct} %)</span>
    <button className="text-red-600" onClick={() => confirm('Ziel löschen?') && void remove('reading_goals', r.g.id)}>Löschen</button></div>
    <div className="mt-2 h-2 rounded bg-zinc-200 dark:bg-zinc-700"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.min(100, r.pct)}%` }} /></div></div>;
  return <div className="space-y-3"><div className={card + ' flex flex-wrap gap-2'}><select className={inp} value={type} onChange={e => setType(e.target.value)}>{Object.entries(GT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    <input className={inp + ' w-28'} type="number" min={1} placeholder="Zielwert" value={target || ''} onChange={e => setTarget(+e.target.value)} />
    <button className={btn} onClick={() => { if (target > 0) { void save('reading_goals', { id: crypto.randomUUID(), user_id: uid, goal_type: type, target_value: target }); setTarget(0); } }}>Ziel hinzufügen</button></div>
    {rows.length === 0 && <Empty icon={Target} title="Noch keine Ziele" text="Lege oben ein Ziel fest, z. B. 300 Seiten pro Monat." />}
    {rows.filter(r => r.pct < 100).map(row)}
    {rows.some(r => r.pct >= 100) && <><h3 className="pt-2 font-medium">Erreichte Ziele (Archiv)</h3>{rows.filter(r => r.pct >= 100).map(row)}</>}</div>;
}

export function Heat({ sessions, books }: { sessions: Session[]; books: Book[] }) {
  const [y, setY] = useState(new Date().getFullYear()), [mode, setMode] = useState<'pages' | 'minutes'>('pages'), [sel, setSel] = useState<string | null>(null);
  const years = useMemo(() => { const a = new Set(sessions.map(s => +s.session_date.slice(0, 4))); a.add(new Date().getFullYear()); return [...a].sort((p, q) => q - p); }, [sessions]);
  const daily = useMemo(() => new Map(computeStats(sessions, books, { from: `${y}-01-01`, to: `${y}-12-31` }, TZ).daily.map(d => [d.day, d] as const)), [sessions, books, y]);
  const max = Math.max(0, ...[...daily.values()].map(d => d[mode]));
  const off = (new Date(Date.UTC(y, 0, 1)).getUTCDay() + 6) % 7, n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;
  const cells: (string | null)[] = [...Array(off).fill(null), ...Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10))];
  const col = ['bg-zinc-100 dark:bg-zinc-800', 'bg-indigo-200 dark:bg-indigo-900', 'bg-indigo-400 dark:bg-indigo-700', 'bg-indigo-500', 'bg-indigo-700 dark:bg-indigo-400'];
  const lvl = (v: number) => (!v || !max ? 0 : Math.min(4, Math.ceil(v / max * 4)));
  const title = (b: string) => books.find(x => x.id === b)?.title ?? '(gelöschtes Buch)';
  return <div className={card + ' mt-4 space-y-3'}><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">Lese-Heatmap</h3>
    <select className={inp} value={y} onChange={e => { setY(+e.target.value); setSel(null); }}>{years.map(v => <option key={v}>{v}</option>)}</select>
    <select className={inp} value={mode} onChange={e => setMode(e.target.value as 'pages' | 'minutes')}><option value="pages">Seiten</option><option value="minutes">Lesezeit</option></select></div>
    <div className="overflow-x-auto"><div className="grid gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px' }}>
      {cells.map((c, i) => c === null ? <div key={i} /> : <button key={c} onClick={() => setSel(c)} title={`${c}: ${daily.get(c)?.pages ?? 0} Seiten, ${Math.round(daily.get(c)?.minutes ?? 0)} Min.`} className={`h-3 w-3 rounded-[3px] transition hover:scale-125 hover:ring-2 hover:ring-indigo-400 ${col[lvl(daily.get(c)?.[mode] ?? 0)]}`} />)}</div></div>
    <div className="flex items-center gap-1 text-xs text-zinc-500">Weniger {col.map(c => <span key={c} className={`h-3 w-3 rounded-sm ${c}`} />)} Mehr</div>
    {sel && <div className="text-sm"><b>{sel}</b>{sessions.filter(s => s.session_date === sel).map(s => <div key={s.id}>{title(s.book_id)} · S. {s.start_page}–{s.end_page} · {Math.round(s.duration_minutes)} Min.{s.notes ? ` · ${s.notes}` : ''}</div>)}
      {!sessions.some(s => s.session_date === sel) && <div className="text-zinc-500">Keine Sessions an diesem Tag.</div>}</div>}</div>;
}

export function Settings({ books, sessions, goals, events, uid }: { books: Book[]; sessions: Session[]; goals: Goal[]; events: GameEvent[]; uid: string }) {
  const [msg, setMsg] = useState(''), [name, setName] = useState(''), [tz, setTz] = useState(TZ), [theme, setTheme] = useState(localStorage.getItem('rt-theme') ?? 'light'), [pw, setPw] = useState('');
  useEffect(() => { void supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle().then(({ data }) => setName(data?.display_name ?? '')); }, [uid]);
  const zones = [...new Set([TZ, ...(((Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined) ?? ['Europe/Berlin'])])];
  const saveProfile = async () => {
    const { error } = await supabase.from('profiles').upsert({ id: uid, display_name: name.trim() || null, timezone: tz, preferred_theme: theme, preferred_language: 'de' });
    if (error) return setMsg(error.message);
    localStorage.setItem('rt-theme', theme); localStorage.setItem('rt-tz', tz); setMsg('Profil gespeichert.');
    if (tz !== TZ || (theme === 'dark') !== document.documentElement.classList.contains('dark')) setTimeout(() => location.reload(), 600);
  };
  const changePw = async () => { if (pw.length < 8) return setMsg('Das Passwort muss mindestens 8 Zeichen lang sein.'); const { error } = await supabase.auth.updateUser({ password: pw }); setMsg(error ? error.message : 'Passwort geändert.'); if (!error) setPw(''); };
  const demo = async () => {
    const mk = (t: string, a: string, g: string, p: number) => ({ id: crypto.randomUUID(), user_id: uid, title: `[Beispiel] ${t}`, author: a, genre: g, total_pages: p, current_page: 0, status: 'reading', rating: null as number | null });
    const bs = [mk('Beispielroman', 'Erika Muster', 'Roman', 320), mk('Beispiel-Sachbuch', 'Max Beispiel', 'Sachbuch', 280), mk('Beispiel-Krimi', 'Ina Probe', 'Krimi', 400)], pos = [0, 0, 0], ss: any[] = [];
    for (let i = 89; i >= 0; i--) { if (Math.random() < 0.45) continue; const k = Math.floor(Math.random() * 3), pages = Math.min(bs[k].total_pages - pos[k], 10 + Math.floor(Math.random() * 30)); if (pages <= 0) continue;
      const mins = Math.round(pages * (1.5 + Math.random())), d = new Date(Date.now() - i * 864e5);
      ss.push({ id: crypto.randomUUID(), user_id: uid, book_id: bs[k].id, session_date: dayKey(d, TZ), start_time: d.toISOString(), end_time: new Date(d.getTime() + mins * 60000).toISOString(), duration_minutes: mins, start_page: pos[k], end_page: pos[k] + pages, notes: null }); pos[k] += pages; }
    for (let i = 0; i < 3; i++) await save('books', { ...bs[i], current_page: pos[i] });
    for (const s of ss) await save('reading_sessions', s);
    setMsg(`Beispieldaten erzeugt (${ss.length} Sessions, Titel mit „[Beispiel]“ gekennzeichnet). Du kannst sie jederzeit löschen.`);
  };
  const undemo = async () => { const ids = new Set(books.filter(b => b.title.startsWith('[Beispiel]')).map(b => b.id)); if (!ids.size) return setMsg('Keine Beispieldaten vorhanden.'); for (const s of sessions) if (ids.has(s.book_id)) await remove('reading_sessions', s.id); for (const id of ids) await remove('books', id); setMsg('Beispieldaten gelöscht.'); };
  const dl = (name: string, text: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const csv = (rows: any[], cols: string[]) => '\ufeff' + [cols.join(';'), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const day = dayKey(new Date(), TZ);
  const imp = async (file: File) => {
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.books) || !Array.isArray(d.reading_sessions)) throw new Error('Keine gültige Sicherung (books/reading_sessions fehlen).');
      const bIds = new Set(books.map(b => b.id)), sIds = new Set(sessions.map(s => s.id)), gIds = new Set(goals.map(g => g.id)), okBooks = new Set(bIds), uuid = /^[0-9a-f-]{36}$/i;
      let nb = 0, ns = 0, ng = 0, bad = 0, dup = 0;
      for (const b of d.books) { if (bIds.has(b?.id)) { dup++; continue; } if (!uuid.test(b?.id) || typeof b.title !== 'string' || !(b.total_pages >= 0) || !(b.current_page >= 0)) { bad++; continue; } await save('books', { ...b, user_id: uid }); okBooks.add(b.id); nb++; }
      for (const s of d.reading_sessions) { if (sIds.has(s?.id)) { dup++; continue; } if (!uuid.test(s?.id) || !okBooks.has(s.book_id) || !(s.start_page >= 0) || !(s.end_page >= s.start_page) || !(s.duration_minutes >= 0) || !/^\d{4}-\d\d-\d\d$/.test(s.session_date)) { bad++; continue; } const { pages_read, ...r } = s; await save('reading_sessions', { ...r, user_id: uid }); ns++; }
      for (const g of d.reading_goals ?? []) { if (gIds.has(g?.id)) { dup++; continue; } if (!uuid.test(g?.id) || !(g.target_value > 0) || !GT[g.goal_type]) { bad++; continue; } await save('reading_goals', { id: g.id, user_id: uid, goal_type: g.goal_type, target_value: g.target_value }); ng++; }
      setMsg(`Import: ${nb} Bücher, ${ns} Sessions, ${ng} Ziele neu. ${dup} bereits vorhanden (nicht überschrieben), ${bad} ungültig übersprungen.`);
    } catch (e: any) { setMsg('Import fehlgeschlagen: ' + e.message); }
  };
  const wipe = async () => { if (!confirm('ALLE Bücher, Sessions und Ziele unwiderruflich löschen?')) return; for (const b of books) await remove('books', b.id); for (const s of sessions) await remove('reading_sessions', s.id); for (const g of goals) await remove('reading_goals', g.id); if (events.length) await removeMany('game_events', events.map(e => e.id)); setMsg('Alle Daten gelöscht.'); };
  const resetGame = async () => { if (!events.length) return setMsg('Es gibt noch keinen Spielstand.'); if (!confirm('Spielstand zurücksetzen (Abzeichen-Daten, Schilde, Pausen, Belohnungen)? Bücher und Sessions bleiben erhalten; Abzeichen und Level werden daraus neu aufgebaut.')) return; await removeMany('game_events', events.map(e => e.id)); setMsg('Spielstand zurückgesetzt. Er wird aus deinen Daten neu aufgebaut.'); };
  const del = async () => { if (!confirm('Konto UND alle Daten endgültig löschen?')) return; const { error } = await supabase.rpc('delete_my_account'); if (error) return setMsg(error.message); await supabase.auth.signOut(); indexedDB.deleteDatabase('reading-tracker'); location.reload(); };
  return <div className="space-y-3"><div className={card + ' space-y-2'}><h3 className="font-medium">Daten</h3><div className="flex flex-wrap gap-2">
    <button className={btn} onClick={() => dl(`reading-tracker-backup-${day}.json`, JSON.stringify({ version: 1, exported_at: new Date().toISOString(), settings: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', timezone: TZ }, books, reading_sessions: sessions, reading_goals: goals }, null, 2), 'application/json')}>JSON-Export</button>
    <button className={btn} onClick={() => dl(`buecher-${day}.csv`, csv(books, ['id', 'title', 'author', 'genre', 'total_pages', 'current_page', 'status', 'rating', 'start_date', 'finish_date']), 'text/csv')}>CSV Bücher</button>
    <button className={btn} onClick={() => dl(`sessions-${day}.csv`, csv(sessions, ['id', 'book_id', 'session_date', 'start_time', 'end_time', 'duration_minutes', 'start_page', 'end_page', 'notes']), 'text/csv')}>CSV Sessions</button>
    <button className={btn} onClick={() => dl(`statistik-tageswerte-${day}.csv`, csv(computeStats(sessions, books, null, TZ).daily, ['day', 'pages', 'minutes', 'sessions']), 'text/csv')}>CSV Statistik</button>
    <label className={btn + ' cursor-pointer'}>JSON-Import<input type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void imp(f); e.target.value = ''; }} /></label></div>
    <p className="text-xs text-zinc-500">Import überschreibt nie vorhandene Datensätze (gleiche IDs werden übersprungen) und prüft jeden Eintrag.</p></div>
    <div className={card + ' space-y-3'}><h3 className="font-medium">Profil</h3><div className="flex flex-wrap items-end gap-3 text-sm">
      <label>Anzeigename<input className={inp + ' ml-2'} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Zeitzone<select className={inp + ' ml-2'} value={tz} onChange={e => setTz(e.target.value)}>{zones.map(z => <option key={z}>{z}</option>)}</select></label>
      <label>Design<select className={inp + ' ml-2'} value={theme} onChange={e => setTheme(e.target.value)}><option value="light">Hell</option><option value="dark">Dunkel</option></select></label>
      <label>Sprache<select className={inp + ' ml-2'} disabled><option>Deutsch</option></select></label><button className={btn} onClick={() => void saveProfile()}>Profil speichern</button></div>
    <div className="flex flex-wrap items-end gap-3 text-sm"><label>Neues Passwort<input className={inp + ' ml-2'} type="password" minLength={8} value={pw} onChange={e => setPw(e.target.value)} /></label><button className={btn} onClick={() => void changePw()}>Passwort ändern</button></div>
    <p className="text-xs text-zinc-500">Name, Zeitzone und Design werden im Konto gespeichert und auf allen Geräten übernommen. Nach „Passwort zurücksetzen“ bist du über den E-Mail-Link angemeldet und kannst hier ein neues Passwort setzen.</p></div>
    <div className={card + ' space-y-2'}><h3 className="font-medium">Anzeige</h3><div className="flex flex-wrap gap-4 text-sm"><label>Standard-Zeitraum<select className={inp + ' ml-2'} defaultValue={localStorage.getItem('rt-period') ?? '30'} onChange={e => localStorage.setItem('rt-period', e.target.value)}>{PERIODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Dashboard-Ansicht<select className={inp + ' ml-2'} defaultValue={localStorage.getItem('rt-view') ?? 'full'} onChange={e => localStorage.setItem('rt-view', e.target.value)}><option value="full">Ausführlich</option><option value="compact">Kompakt (ohne Diagramme)</option></select></label></div>
    <p className="text-xs text-zinc-500">Gilt für dieses Gerät und wird beim nächsten Öffnen von Dashboard bzw. Statistik übernommen.</p></div>
    <div className={card + ' space-y-2'}><h3 className="font-medium">Konto</h3><div className="flex flex-wrap gap-2"><button className={btn} onClick={() => void sync()}>Jetzt synchronisieren</button>
      <button className={btn} onClick={() => void demo()}>Beispieldaten erzeugen</button><button className="rounded-lg border border-zinc-400 px-4 py-2" onClick={() => void undemo()}>Beispieldaten löschen</button>
      <button className="rounded-lg border border-zinc-400 px-4 py-2" onClick={() => void resetGame()}>Spielstand zurücksetzen</button><button className="rounded-lg border border-red-600 px-4 py-2 text-red-600" onClick={wipe}>Alle Daten löschen</button><button className="rounded-lg bg-red-600 px-4 py-2 text-white" onClick={del}>Konto löschen</button></div></div>
    {msg && <p className="text-sm text-amber-600">{msg}</p>}</div>;
}

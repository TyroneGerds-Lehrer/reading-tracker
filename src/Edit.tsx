import { useState } from 'react';
import { remove, save } from './lib/data';
import { isValid, type Book, type Session } from './lib/stats';

const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700';

// Buchfortschritt = höchste Endseite aller (verbleibenden) Sessions des Buchs, gedeckelt auf die Gesamtseitenzahl.
export async function syncProgress(bookId: string, rest: Session[], books: Book[]) {
  const b = books.find(x => x.id === bookId), v = rest.filter(s => s.book_id === bookId && isValid(s));
  if (!b || !v.length) return;
  let p = Math.max(...v.map(s => s.end_page)); if (b.total_pages) p = Math.min(p, b.total_pages);
  if (p !== b.current_page) await save('books', { ...b, current_page: p }, b.updated_at);
}
export async function deleteSession(s: Session, all: Session[], books: Book[]) {
  await remove('reading_sessions', s.id);
  await syncProgress(s.book_id, all.filter(x => x.id !== s.id), books);
}

const FIELDS: [string, string, string][] = [['title', 'Titel', 'text'], ['author', 'Autor', 'text'], ['genre', 'Genre', 'text'], ['isbn', 'ISBN', 'text'], ['cover_url', 'Cover-URL', 'url'], ['total_pages', 'Seiten gesamt', 'number'], ['current_page', 'Aktuelle Seite', 'number'], ['publication_year', 'Erscheinungsjahr', 'number'], ['start_date', 'Startdatum', 'date'], ['finish_date', 'Beendet am', 'date']];

export function BookEditor({ book, onClose }: { book: Book; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ title: book.title, author: book.author, genre: book.genre ?? '', isbn: book.isbn ?? '', cover_url: book.cover_url ?? '', total_pages: book.total_pages, current_page: book.current_page, publication_year: book.publication_year ?? '', start_date: book.start_date ?? '', finish_date: book.finish_date ?? '', notes: book.notes ?? '' });
  const [err, setErr] = useState('');
  const submit = () => {
    if (!String(f.title).trim()) return setErr('Der Titel fehlt.');
    if (f.total_pages < 0 || f.current_page < 0) return setErr('Seitenzahlen dürfen nicht negativ sein.');
    if (f.total_pages && f.current_page > f.total_pages) return setErr('Die aktuelle Seite liegt über der Gesamtseitenzahl.');
    if (f.start_date && f.finish_date && f.finish_date < f.start_date) return setErr('Das Enddatum liegt vor dem Startdatum.');
    if (f.cover_url && !/^https?:\/\//.test(f.cover_url)) return setErr('Die Cover-URL muss mit http:// oder https:// beginnen.');
    const n = (v: string) => v || null;
    void save('books', { ...book, title: String(f.title).trim(), author: f.author, genre: n(f.genre), isbn: n(f.isbn), cover_url: n(f.cover_url), total_pages: f.total_pages, current_page: f.current_page, publication_year: f.publication_year === '' ? null : f.publication_year, start_date: n(f.start_date), finish_date: n(f.finish_date), notes: n(f.notes) }, book.updated_at);
    onClose();
  };
  return <div className="space-y-2"><div className="grid gap-2 md:grid-cols-2">{FIELDS.map(([k, l, t]) => <label key={k} className="text-xs text-slate-500">{l}
    <input className={inp + ' mt-1 w-full'} type={t} value={f[k]} onChange={e => setF({ ...f, [k]: t === 'number' ? (e.target.value === '' ? (k === 'publication_year' ? '' : 0) : +e.target.value) : e.target.value })} /></label>)}</div>
    <label className="block text-xs text-slate-500">Notizen<textarea className={inp + ' mt-1 w-full'} rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    {err && <p className="text-sm text-red-600">{err}</p>}<div className="flex gap-2"><button className={btn} onClick={submit}>Speichern</button><button onClick={onClose}>Abbrechen</button></div></div>;
}

export function SessionEditor({ s, books, sessions, onClose }: { s: Session; books: Book[]; sessions: Session[]; onClose: () => void }) {
  const [f, setF] = useState({ book_id: s.book_id, session_date: s.session_date, start_page: s.start_page, end_page: s.end_page, duration_minutes: s.duration_minutes, notes: s.notes ?? '' }), [err, setErr] = useState('');
  const submit = async () => {
    const b = books.find(x => x.id === f.book_id);
    if (!b) return setErr('Bitte ein Buch wählen.');
    if (!(f.start_page >= 0) || f.end_page < f.start_page) return setErr('Die Endseite muss mindestens der Startseite entsprechen.');
    if (b.total_pages && f.end_page > b.total_pages) return setErr('Die Endseite liegt über der Seitenzahl des Buchs.');
    if (!(f.duration_minutes >= 0)) return setErr('Die Dauer ist ungültig.');
    if (!/^\d{4}-\d\d-\d\d$/.test(f.session_date)) return setErr('Datum ungültig.');
    await save('reading_sessions', { ...s, ...f, notes: f.notes || null }, s.updated_at);
    const rest = sessions.map(x => (x.id === s.id ? { ...x, ...f } : x));
    await syncProgress(f.book_id, rest, books); if (f.book_id !== s.book_id) await syncProgress(s.book_id, rest, books);
    onClose();
  };
  const num = (k: 'start_page' | 'end_page' | 'duration_minutes', l: string) => <label className="text-xs text-slate-500">{l}<input className={inp + ' mt-1 w-full'} type="number" min={0} step={k === 'duration_minutes' ? 0.1 : 1} value={f[k]} onChange={e => setF({ ...f, [k]: +e.target.value })} /></label>;
  return <div className="space-y-2"><div className="grid gap-2 md:grid-cols-3"><label className="text-xs text-slate-500">Buch<select className={inp + ' mt-1 w-full'} value={f.book_id} onChange={e => setF({ ...f, book_id: e.target.value })}>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
    <label className="text-xs text-slate-500">Datum<input className={inp + ' mt-1 w-full'} type="date" value={f.session_date} onChange={e => setF({ ...f, session_date: e.target.value })} /></label>{num('duration_minutes', 'Minuten')}{num('start_page', 'Startseite')}{num('end_page', 'Endseite')}
    <label className="text-xs text-slate-500">Notiz<input className={inp + ' mt-1 w-full'} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label></div>
    {err && <p className="text-sm text-red-600">{err}</p>}<div className="flex gap-2"><button className={btn} onClick={() => void submit()}>Speichern</button><button onClick={onClose}>Abbrechen</button></div></div>;
}

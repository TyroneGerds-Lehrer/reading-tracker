import { useState } from 'react';
import { Search } from 'lucide-react';
import { save } from './lib/data';
import { btn, card, inp } from './ui';
import type { Book } from './lib/stats';

// Buchsuche über Open Library (kostenlos, ohne Konto und ohne API-Schlüssel).
type Hit = { title: string; author_name?: string[]; first_publish_year?: number; number_of_pages_median?: number; isbn?: string[]; cover_i?: number; subject?: string[] };

export function BookSearch({ books, uid }: { books: Book[]; uid: string }) {
  const [q, setQ] = useState(''), [hits, setHits] = useState<Hit[] | null>(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const search = async () => {
    const s = q.trim(); if (!s) return;
    setBusy(true); setMsg(''); setHits(null);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const isbn = s.replace(/[-\s]/g, ''), query = /^(\d{13}|\d{9}[\dXx])$/.test(isbn) ? `isbn:${isbn}` : s;
      const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=6&fields=title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i,subject`, { signal: ctl.signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); setHits(j.docs ?? []);
    } catch { setMsg('Die Buchsuche ist gerade nicht erreichbar (offline oder Dienst gestört). Bücher kannst du weiterhin manuell anlegen.'); }
    finally { clearTimeout(to); setBusy(false); }
  };
  const add = (h: Hit) => {
    const author = h.author_name?.[0] ?? '', isbn = h.isbn?.[0] ?? null;
    if (books.some(b => (isbn && b.isbn === isbn) || (b.title.toLowerCase() === h.title.toLowerCase() && b.author.toLowerCase() === author.toLowerCase()))) return setMsg(`„${h.title}“ ist bereits in deiner Bibliothek.`);
    void save('books', { id: crypto.randomUUID(), user_id: uid, title: h.title.slice(0, 300), author, genre: h.subject?.[0]?.slice(0, 60) ?? null, isbn, cover_url: h.cover_i ? `https://covers.openlibrary.org/b/id/${h.cover_i}-M.jpg` : null, total_pages: h.number_of_pages_median ?? 0, current_page: 0, publication_year: h.first_publish_year ?? null, status: 'wishlist', rating: null });
    setMsg(`„${h.title}“ wurde zur Leseliste hinzugefügt. Seitenzahl und Genre kannst du über „Bearbeiten“ anpassen.`);
  };
  return <div className={card + ' space-y-3'}><h3 className="flex items-center gap-2 font-medium"><Search className="h-4 w-4 text-indigo-500" />Buch online suchen</h3>
    <div className="flex gap-2"><input className={inp + ' min-w-0 flex-1'} placeholder="ISBN oder Titel/Autor" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void search()} /><button className={btn} disabled={busy} onClick={() => void search()}>{busy ? 'Suche…' : 'Suchen'}</button></div>
    {msg && <p className="text-sm text-amber-700 dark:text-amber-300">{msg}</p>}
    {hits && hits.length === 0 && <p className="text-sm text-zinc-500">Keine Treffer gefunden.</p>}
    {hits?.map((h, i) => <div key={i} className="flex items-center gap-3 text-sm">
      {h.cover_i ? <img src={`https://covers.openlibrary.org/b/id/${h.cover_i}-S.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-zinc-100 dark:bg-zinc-800" />}
      <div className="min-w-0 flex-1"><div className="truncate font-medium">{h.title}</div><div className="truncate text-zinc-500">{h.author_name?.[0] ?? 'Unbekannt'}{h.first_publish_year ? ` · ${h.first_publish_year}` : ''}{h.number_of_pages_median ? ` · ${h.number_of_pages_median} S.` : ''}</div></div>
      <button className={btn} onClick={() => add(h)}>Zur Leseliste</button></div>)}
    <p className="text-xs text-zinc-500">Daten: Open Library (openlibrary.org). Die App funktioniert auch ohne diese Suche vollständig.</p></div>;
}

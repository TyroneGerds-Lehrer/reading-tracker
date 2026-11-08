import { useEffect, useState } from 'react';
import { getConflicts, resolveConflict } from './lib/data';
import { supabase } from './lib/supabase';

const L: Record<string, string> = { title: 'Titel', author: 'Autor', genre: 'Genre', isbn: 'ISBN', cover_url: 'Cover-URL', total_pages: 'Seiten gesamt', current_page: 'Aktuelle Seite', publication_year: 'Erscheinungsjahr', start_date: 'Startdatum', finish_date: 'Beendet am', status: 'Status', rating: 'Bewertung', notes: 'Notizen', book_id: 'Buch-ID', session_date: 'Datum', start_time: 'Startzeit', end_time: 'Endzeit', duration_minutes: 'Minuten', start_page: 'Startseite', end_page: 'Endseite' };
const IGN = new Set(['updated_at', 'created_at', 'pages_read', 'user_id', 'id']);
type C = { key: string; t: string; local: any; serverUpdatedAt: string; server: any };
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : String(v));

export function Conflicts() {
  const [cs, setCs] = useState<C[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = (await getConflicts()) as Omit<C, 'server'>[];
      const out = await Promise.all(list.map(async c => ({ ...c, server: (await supabase.from(c.t).select('*').eq('id', c.local.id).maybeSingle()).data })));
      if (alive) setCs(out);
    };
    void load(); window.addEventListener('rt-data', load); window.addEventListener('rt-sync', load);
    return () => { alive = false; window.removeEventListener('rt-data', load); window.removeEventListener('rt-sync', load); };
  }, []);
  if (!cs.length) return null;
  return <div className="mb-3 space-y-3 rounded-2xl border border-amber-400 bg-amber-50 p-4 dark:bg-slate-800"><h3 className="font-medium">Synchronisierungs-Konflikte ({cs.length})</h3>
    <p className="text-sm text-slate-600 dark:text-slate-300">Diese Einträge wurden auf einem anderen Gerät geändert, während du hier eine abweichende Änderung gemacht hast. Nichts wurde überschrieben – entscheide, welche Version gelten soll.</p>
    {cs.map(c => {
      const keys = [...new Set([...Object.keys(c.local), ...Object.keys(c.server ?? {})])].filter(k => !IGN.has(k) && (!c.server || JSON.stringify(c.local[k] ?? null) !== JSON.stringify(c.server[k] ?? null)));
      return <div key={c.key} className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900"><div className="font-medium">{c.t === 'books' ? 'Buch' : 'Session'}: {c.local.title ?? c.local.session_date}</div>
        {!c.server ? <p className="text-red-600">Dieser Eintrag wurde auf dem Server gelöscht.</p> : <table className="my-2 w-full"><thead><tr className="text-left text-slate-500"><th>Feld</th><th>Deine Version</th><th>Server-Version</th></tr></thead>
          <tbody>{keys.length ? keys.map(k => <tr key={k}><td>{L[k] ?? k}</td><td>{show(c.local[k])}</td><td>{show(c.server[k])}</td></tr>) : <tr><td colSpan={3} className="text-slate-500">Keine inhaltlichen Unterschiede.</td></tr>}</tbody></table>}
        <div className="flex gap-2"><button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white" onClick={() => void resolveConflict(c.key, 'local')}>Meine Version behalten</button>
          <button className="rounded-lg border border-slate-400 px-3 py-1.5" onClick={() => void resolveConflict(c.key, 'server')}>Server-Version übernehmen</button></div></div>;
    })}</div>;
}

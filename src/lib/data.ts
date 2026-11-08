// Lokale Daten (IndexedDB) + Outbox-Synchronisierung. Supabase ist die zentrale Quelle.
import { openDB } from 'idb';
import { supabase } from './supabase';
export type T = 'books' | 'reading_sessions' | 'reading_goals';
const dbp = openDB('reading-tracker', 2, { upgrade(d) { for (const s of ['books', 'reading_sessions', 'reading_goals']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); for (const s of ['outbox', 'conflicts']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'key' }); } });
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'failed';
let status: SyncStatus = 'synced';
const setStatus = (s: SyncStatus) => { status = s; window.dispatchEvent(new Event('rt-sync')); };
export const getStatus = () => status;
export const getAll = async <R,>(t: T) => (await (await dbp).getAll(t)) as R[];
export const getConflicts = async () => (await dbp).getAll('conflicts');

export async function save(t: T, row: any, base?: string | null) {
  const d = await dbp, prev = await d.get('outbox', t + row.id);
  await d.put(t, row);
  await d.put('outbox', { key: t + row.id, t, op: 'upsert', row, base: prev ? prev.base : base ?? null }); // Basisversion bleibt erhalten
  window.dispatchEvent(new Event('rt-data')); void sync();
}
export async function remove(t: T, id: string) {
  const d = await dbp; await d.delete(t, id);
  await d.put('outbox', { key: t + id, t, op: 'delete', row: { id }, base: null });
  window.dispatchEvent(new Event('rt-data')); void sync();
}
let running = false;
export async function sync() {
  if (running) return; if (!navigator.onLine) return setStatus('offline');
  running = true; setStatus('syncing');
  try {
    const d = await dbp;
    for (const o of await d.getAll('outbox')) {
      if (o.op === 'delete') { const { error } = await supabase.from(o.t).delete().eq('id', o.row.id); if (error) throw error; }
      else {
        if (o.base) { // Konflikt: Server wurde seit der lokalen Basisversion geändert -> nichts überschreiben
          const { data } = await supabase.from(o.t).select('updated_at').eq('id', o.row.id).maybeSingle();
          if (data && data.updated_at !== o.base) { await d.put('conflicts', { key: o.key, t: o.t, local: o.row, serverUpdatedAt: data.updated_at }); await d.delete('outbox', o.key); continue; }
        }
        const { pages_read, ...row } = o.row; const { error } = await supabase.from(o.t).upsert(row); if (error) throw error; // feste Client-UUID => keine Duplikate
      }
      await d.delete('outbox', o.key);
    }
    for (const t of ['books', 'reading_sessions', 'reading_goals'] as T[]) {
      const { data, error } = await supabase.from(t).select('*'); if (error) throw error;
      const pending = new Set((await d.getAllKeys('outbox')) as string[]), conflicts = new Set((await d.getAllKeys('conflicts')) as string[]), ids = new Set<string>();
      for (const r of data ?? []) { ids.add(r.id); if (!pending.has(t + r.id) && !conflicts.has(t + r.id)) await d.put(t, r); }
      for (const l of (await d.getAllKeys(t)) as string[]) if (!ids.has(l) && !pending.has(t + l)) await d.delete(t, l);
    }
    setStatus('synced');
  } catch (e) { console.error(e); setStatus(navigator.onLine ? 'failed' : 'offline'); } finally { running = false; window.dispatchEvent(new Event('rt-data')); }
}
window.addEventListener('online', () => void sync());
window.addEventListener('offline', () => setStatus('offline'));

// Konfliktlösung: Nutzer entscheidet, welche Version gilt.
export async function resolveConflict(key: string, choice: 'local' | 'server') {
  const d = await dbp, c = await d.get('conflicts', key); if (!c) return;
  if (choice === 'local') await d.put('outbox', { key, t: c.t, op: 'upsert', row: c.local, base: c.serverUpdatedAt }); // erneut senden, Basis = aktuelle Serverversion
  else { const { data } = await supabase.from(c.t).select('*').eq('id', c.local.id).maybeSingle(); if (data) await d.put(c.t, data); else await d.delete(c.t, c.local.id); }
  await d.delete('conflicts', key);
  window.dispatchEvent(new Event('rt-data')); void sync();
}

// Spiel-Logik: XP & Level, Abzeichen-Familien samt Erreichungsdatum, Streak-Schutz (Schilde, Pausenmodus), Überraschungen.
// XP, Level und Abzeichen-Stufen werden aus Sessions/Büchern berechnet (reine Funktionen).
// Nur Ereignisse (Abzeichen-Datum, Schilde, Pausen, Belohnungen) liegen in der Tabelle game_events.
import { BookOpen, CalendarDays, Clock, Compass, Flame, Layers, Medal, Repeat, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react';
import { isProtectedDay, pagesOf, streaksOf, type Book, type Session } from './stats';

export type GameKind = 'start' | 'badge' | 'reward' | 'freeze' | 'pause' | 'level';
export type GameEvent = { id: string; user_id: string; kind: GameKind; key: string; event_date: string; end_date?: string | null; amount: number; data?: { type?: string; fam?: string; tier?: number } | null };

// ---------- Regeln (zentral, damit sie leicht anpassbar sind) ----------
export const SHIELD_MAX = 3; // so viele Schutzschilde passen in den Vorrat
export const SHIELD_EVERY = 7; // alle 7 Lesetage gibt es ein neues Schild
export const PAUSE_MAX = 14; // eine Pause dauert höchstens 14 Tage
export const PAUSE_YEAR = 30; // höchstens 30 Pausentage pro Kalenderjahr
export const MIN_REWARD_MIN = 10; // ab so vielen Minuten am Tag sind Überraschungen möglich

// ---------- Hilfsfunktionen ----------
function cyrb128(s: string): number[] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
// Feste (deterministische) ID je Nutzer/Ereignis: zwei Geräte erzeugen dieselbe Zeile statt Duplikate.
export const evId = (uid: string, kind: string, key: string) => { const h = cyrb128(`${uid}|${kind}|${key}`).map(hex8).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
// Zufall mit festem Startwert: Neuladen würfelt nicht neu.
export function rng(seed: string) { let a = cyrb128(seed)[0]; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const dn = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const key = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => key(dn(k) + n);
export const spanDays = (a: string, b: string) => dn(b) - dn(a) + 1;

export const mkEvent = (uid: string, kind: GameKind, k: string, date: string, amount = 0, data: GameEvent['data'] = null, end: string | null = null): GameEvent => ({ id: evId(uid, kind, k), user_id: uid, kind, key: k, event_date: date, end_date: end, amount, data });
export const isXp = (e: GameEvent) => e.kind === 'badge' || e.kind === 'reward';

// ---------- XP & Level ----------
// 1 XP je Seite, 1 XP je Minute, 10 XP je Lesetag, 100 XP je abgeschlossenem Buch (+ Abzeichen- und Überraschungs-Boni aus game_events).
// Pro Session zählen höchstens 100 Seiten und 120 Minuten.
export function xpParts(books: Book[], valid: Session[]) {
  let pages = 0, minutes = 0; const days = new Set<string>();
  for (const s of valid) { pages += Math.min(pagesOf(s), 100); minutes += Math.min(Math.round(s.duration_minutes), 120); days.add(s.session_date); }
  return { pages, minutes, days: days.size * 10, books: books.filter(b => b.status === 'finished').length * 100 };
}
export const xpSum = (p: ReturnType<typeof xpParts>) => p.pages + p.minutes + p.days + p.books;

export const lvlXp = (L: number) => (L <= 1 ? 0 : Math.round(55 * (L - 1) ** 1.75)); // Gesamt-XP, die für Level L nötig sind
const TITLES: [number, string][] = [[1, 'Leseneuling'], [5, 'Bücherwurm'], [10, 'Seitenwender*in'], [15, 'Geschichtenfreund*in'], [20, 'Leseprofi'], [30, 'Bibliothekar*in'], [40, 'Literaturkenner*in'], [50, 'Lesemeister*in'], [75, 'Großmeister*in'], [100, 'Lese-Legende']];
export const titleOf = (L: number) => [...TITLES].reverse().find(([m]) => L >= m)?.[1] ?? 'Leseneuling';
export function levelOf(xp: number) {
  let L = 1; while (lvlXp(L + 1) <= xp && L < 999) L++;
  const cur = lvlXp(L), next = lvlXp(L + 1);
  return { level: L, title: titleOf(L), into: xp - cur, span: next - cur, pct: Math.round(((xp - cur) / (next - cur)) * 100) };
}

// ---------- Abzeichen ----------
const steps = (list: number[], f: number) => (n: number) => (n < list.length ? list[n] : Math.round(list[list.length - 1] * f ** (n - list.length + 1)));
export type Fam = { id: string; t: string; I: LucideIcon; th: (n: number) => number; u: string };
export const FAMS: Fam[] = [
  { id: 'streak', t: 'Lese-Streak', I: Flame, th: steps([3, 7, 14, 30, 60, 100, 180, 365], 1.5), u: 'Tage' },
  { id: 'pages', t: 'Seiten', I: Layers, th: steps([250, 500, 1000, 2500, 5000, 10000, 25000], 2), u: 'Seiten' },
  { id: 'books', t: 'Bücher', I: BookOpen, th: steps([1, 3, 5, 10, 25, 50, 100], 1.5), u: 'Bücher' },
  { id: 'time', t: 'Lesezeit', I: Clock, th: steps([5, 10, 25, 50, 100, 250, 500, 1000], 1.5), u: 'Std.' },
  { id: 'days', t: 'Lesetage', I: CalendarDays, th: steps([7, 30, 60, 100, 200, 365, 500], 1.5), u: 'Tage' },
  { id: 'sessions', t: 'Sessions', I: Repeat, th: steps([10, 25, 50, 100, 250, 500, 1000], 1.5), u: 'Sessions' },
  { id: 'marathon', t: 'Marathon', I: Zap, th: steps([30, 60, 90, 120, 180, 240, 300], 1.3), u: 'Min. am Stück' },
  { id: 'record', t: 'Tagesrekord', I: TrendingUp, th: steps([25, 50, 75, 100, 150, 200, 300], 1.3), u: 'Seiten an einem Tag' },
  { id: 'genres', t: 'Entdecker', I: Compass, th: steps([2, 3, 5, 8, 12, 20], 1.4), u: 'Genres' },
  { id: 'authors', t: 'Autor*innen', I: Users, th: steps([3, 5, 10, 25, 50, 100], 1.5), u: 'Autor*innen' },
  { id: 'challenge', t: 'Challenge-Meister', I: Medal, th: steps([5, 15, 30, 60, 100, 200], 1.5), u: 'Challenges' },
];
export const TIERS = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant', 'Meister', 'Legende'];
export const TIER_CLS = ['bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200', 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300', 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300', 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'];
export const tierName = (t: number) => (t >= 1 && t <= TIERS.length ? TIERS[t - 1] : `Stufe ${t}`);
export const tierOf = (f: Fam, v: number) => { let t = 0; while (t < 200 && f.th(t) <= v) t++; return t; };

// Aktuelle Werte aller Abzeichen-Familien (ohne "challenge": dieser Wert kommt aus Challenges.tsx).
export function famValues(books: Book[], valid: Session[]): Record<string, number> {
  const days = new Set(valid.map(s => s.session_date)), perDay = new Map<string, number>(), fin = books.filter(b => b.status === 'finished');
  let pages = 0, min = 0, mar = 0;
  for (const s of valid) { pages += pagesOf(s); min += s.duration_minutes; mar = Math.max(mar, s.duration_minutes); perDay.set(s.session_date, (perDay.get(s.session_date) ?? 0) + pagesOf(s)); }
  return { streak: streaksOf(days).longest, pages, books: fin.length, time: Math.floor(min / 60), days: days.size, sessions: valid.length, marathon: Math.round(mar), record: Math.max(0, ...perDay.values()),
    genres: new Set(books.map(b => b.genre).filter(Boolean)).size, authors: new Set(fin.map(b => b.author).filter(Boolean)).size };
}

// Verlauf je Familie: [Tag, Wert] (aufsteigend) – daraus ergibt sich, WANN eine Stufe erreicht wurde (auch rückwirkend).
export function famTimeline(books: Book[], valid: Session[]): Record<string, [string, number][]> {
  const S: Record<string, [string, number][]> = {};
  const put = (id: string, day: string, v: number) => { const a = (S[id] ??= []), l = a[a.length - 1]; if (l && l[0] === day) l[1] = Math.max(l[1], v); else if (!l || v > l[1]) a.push([day, v]); };
  const byDay = new Map<string, Session[]>(); for (const s of valid) { const a = byDay.get(s.session_date); if (a) a.push(s); else byDay.set(s.session_date, [s]); }
  const days = [...byDay.keys()].sort(), bk = new Map(books.map(b => [b.id, b] as const)), gseen = new Set<string>();
  let pages = 0, min = 0, n = 0, run = 0, best = 0, mar = 0, rec = 0, prev: string | null = null;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]; let dp = 0;
    for (const s of byDay.get(day) ?? []) { dp += pagesOf(s); min += s.duration_minutes; n++; mar = Math.max(mar, Math.round(s.duration_minutes)); const g = bk.get(s.book_id)?.genre; if (g) gseen.add(g); }
    pages += dp; rec = Math.max(rec, dp);
    if (prev === null) run = 1;
    else { let ok = true; for (let k = dn(prev) + 1; k < dn(day); k++) if (!isProtectedDay(key(k))) { ok = false; break; } run = ok ? run + 1 : 1; }
    best = Math.max(best, run); prev = day;
    put('streak', day, best); put('pages', day, pages); put('time', day, Math.floor(min / 60)); put('days', day, i + 1); put('sessions', day, n); put('marathon', day, mar); put('record', day, rec); put('genres', day, gseen.size);
  }
  const fin = books.filter(b => b.status === 'finished' && b.finish_date).sort((a, b) => (a.finish_date ?? '').localeCompare(b.finish_date ?? '')), au = new Set<string>();
  fin.forEach((b, i) => { const d = b.finish_date as string; put('books', d, i + 1); if (b.author) { au.add(b.author); put('authors', d, au.size); } });
  return S;
}
export const reachDate = (series: [string, number][] | undefined, thr: number) => series?.find(([, v]) => v >= thr)?.[0] ?? null;

// ---------- Streak-Schutz ----------
// Tage, die den Streak nicht unterbrechen: Pausenmodus + eingesetzte Schutzschilde.
export function protectedFrom(events: GameEvent[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) {
    if (e.kind === 'freeze') s.add(e.event_date);
    else if (e.kind === 'pause') { const end = e.end_date ?? e.event_date; for (let k = e.event_date, i = 0; k <= end && i < 62; k = addDays(k, 1), i++) s.add(k); }
  }
  return s;
}
// Vorrat an Schutzschilden: 1 Startschild, alle 7 Lesetage (ab Start) ein weiteres, Überraschungs-Schilde, minus eingesetzte; höchstens 3.
export function shieldInv(read: Set<string>, events: GameEvent[], today: string): number {
  const st = events.find(e => e.kind === 'start')?.event_date; if (!st) return 0;
  const use = new Set(events.filter(e => e.kind === 'freeze').map(e => e.event_date)), gift = new Set(events.filter(e => e.kind === 'reward' && e.data?.type === 'shield').map(e => e.event_date));
  let inv = 1, cnt = 0;
  for (let d = st, i = 0; d <= today && i < 4000; d = addDays(d, 1), i++) {
    if (read.has(d)) { cnt++; if (cnt % SHIELD_EVERY === 0 && inv < SHIELD_MAX) inv++; }
    if (gift.has(d) && inv < SHIELD_MAX) inv++;
    if (use.has(d)) inv = Math.max(0, inv - 1);
  }
  return inv;
}

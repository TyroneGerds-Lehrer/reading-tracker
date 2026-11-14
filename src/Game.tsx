import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Gift, Pause, Shield, Sparkles, Star } from 'lucide-react';
import { saveMany, type GameStatus } from './lib/data';
import { FAMS, MIN_REWARD_MIN, PAUSE_MAX, PAUSE_YEAR, SHIELD_EVERY, SHIELD_MAX, TIER_CLS, addDays, evId, famTimeline, famValues, isXp, levelOf, mkEvent, protectedFrom, reachDate, rng, shieldInv, spanDays, tierName, tierOf, titleOf, xpParts, xpSum, type GameEvent } from './lib/game';
import { dayKey, isValid, streaksOf, type Book, type Session } from './lib/stats';
import { TZ } from './lib/tz';
import { btn, card, inp } from './ui';

const de = (n: number) => n.toLocaleString('de-DE');
const fd = (k: string) => `${k.slice(8)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
const desc = (a: GameEvent, b: GameEvent) => b.event_date.localeCompare(a.event_date);

export type Popup =
  | { kind: 'badge'; id: string; fam: string; tier: number; date: string }
  | { kind: 'level'; id: string; level: number }
  | { kind: 'reward'; id: string; type: string; amount: number }
  | { kind: 'shield'; id: string; days: string[] };

export type Game = {
  xp: number; parts: ReturnType<typeof xpParts>; bonus: number; lvl: ReturnType<typeof levelOf>;
  shields: number; hasStart: boolean; pause: { active: boolean; end: string | null; used: number };
  earned: Map<string, string>; rewards: GameEvent[]; freezes: GameEvent[];
  gstat: GameStatus; gameOk: boolean; queue: Popup[]; dismiss: () => void;
  startPause: (days: number) => Promise<string>; endPause: () => Promise<void>;
};
export const GameCtx = createContext<Game | null>(null);
export const useG = () => useContext(GameCtx);

// ---------- Hook: berechnet den Spielstand und legt neue Ereignisse (Abzeichen, Level, Schilde, Überraschungen) an ----------
export function useGame(p: { uid: string | null; books: Book[]; sessions: Session[]; events: GameEvent[]; ready: boolean; gameOk: boolean; gstat: GameStatus }): Game {
  const { uid, books, sessions, events, ready, gameOk, gstat } = p;
  const [queue, setQueue] = useState<Popup[]>([]);
  const busy = useRef(false), seen = useRef(new Set<string>());
  const today = dayKey(new Date(), TZ);

  const d = useMemo(() => {
    const valid = sessions.filter(isValid), parts = xpParts(books, valid), bonus = events.filter(isXp).reduce((a, e) => a + e.amount, 0), xp = xpSum(parts) + bonus;
    const read = new Set(valid.map(s => s.session_date)), yr = today.slice(0, 4);
    const pauses = events.filter(e => e.kind === 'pause');
    const act = pauses.find(x => x.event_date <= today && (x.end_date ?? x.event_date) >= today);
    const used = pauses.filter(x => x.event_date.startsWith(yr)).reduce((a, x) => a + spanDays(x.event_date, x.end_date ?? x.event_date), 0);
    const earned = new Map<string, string>(); for (const e of events) if (e.kind === 'badge') earned.set(e.key, e.event_date);
    return { xp, parts, bonus, lvl: levelOf(xp), shields: shieldInv(read, events, today), hasStart: events.some(e => e.kind === 'start'), act, used, earned,
      rewards: events.filter(e => e.kind === 'reward').sort(desc), freezes: events.filter(e => e.kind === 'freeze').sort(desc) };
  }, [books, sessions, events, today]);

  useEffect(() => {
    if (!uid || !ready || !gameOk || busy.current) return;
    busy.current = true;
    void (async () => {
      try {
        const today = dayKey(new Date(), TZ), have = new Set(events.map(e => e.id)), out: GameEvent[] = [], pops: Popup[] = [];
        const mk = (kind: GameEvent['kind'], k: string, date: string, amount = 0, data: GameEvent['data'] = null) => { const e = mkEvent(uid, kind, k, date, amount, data); out.push(e); return e; };
        // Erster Start: bestehende Abzeichen/Level werden still nachgetragen (kein Pop-up-Regen), mit ihrem tatsächlichen Datum.
        let start = events.find(e => e.kind === 'start'); const fresh = !start; if (!start) start = mk('start', 'start', today);
        const st = start.event_date, valid = sessions.filter(isValid), read = new Set(valid.map(s => s.session_date));

        // 1) Streak-Schutz: Wurde gestern (und davor) nicht gelesen, setzt automatisch je Tag ein Schild ein – nur bei einem Streak von mindestens 3 Tagen.
        if (!fresh) {
          const P = protectedFrom(events); let g = addDays(today, -1), L = 0;
          while (L < 15 && g >= st && !read.has(g) && !P.has(g)) { L++; g = addDays(g, -1); }
          if (L >= 1 && L < 15 && (read.has(g) || P.has(g)) && streaksOf([...read].filter(x => x <= g), g).current >= 3 && L <= shieldInv(read, [...events, ...out], today)) {
            const gap = Array.from({ length: L }, (_, i) => addDays(g, i + 1));
            for (const day of gap) mk('freeze', `use:${day}`, day);
            pops.push({ kind: 'shield', id: evId(uid, 'freeze', `use:${gap[0]}`), days: gap });
          }
        }

        // 2) Überraschung: an Lesetagen (ab 10 Min.) mit etwa 28 % Chance, spätestens nach 5 Lesetagen ohne Überraschung. Würfel pro Tag fest => Neuladen ändert nichts.
        const rkey = `day:${today}`, rid = evId(uid, 'reward', rkey), todayMin = valid.filter(s => s.session_date === today).reduce((a, s) => a + s.duration_minutes, 0);
        if (!fresh && todayMin >= MIN_REWARD_MIN && !have.has(rid)) {
          const last = events.filter(e => e.kind === 'reward').map(e => e.event_date).sort().pop() ?? st;
          let since = 0; for (const x of read) if (x > last && x < today) since++;
          const rnd = rng(evId(uid, 'roll', today));
          if (since >= 5 || rnd() < 0.28) {
            const inv = shieldInv(read, [...events, ...out], today), r = rnd();
            let type = 'xp', amount = 20 + Math.floor(rnd() * 5) * 10;
            if (r >= 0.85 && inv < SHIELD_MAX) { type = 'shield'; amount = 0; } else if (r >= 0.55) { type = 'chest'; amount = 100; }
            mk('reward', rkey, today, amount, { type }); pops.push({ kind: 'reward', id: rid, type, amount });
          }
        }

        // 3) Abzeichen: jede neu erreichte Stufe wird mit Datum gespeichert (+25 XP je Stufe-Nummer).
        const fv = famValues(books, valid), tl = famTimeline(books, valid);
        for (const f of FAMS) {
          if (f.id === 'challenge') continue;
          const t = tierOf(f, fv[f.id] ?? 0);
          for (let k = 1; k <= t; k++) {
            const bk = `${f.id}:${k}`, id = evId(uid, 'badge', bk); if (have.has(id)) continue;
            const date = reachDate(tl[f.id], f.th(k - 1)) ?? today; mk('badge', bk, date, 25 * k, { fam: f.id, tier: k });
            if (!fresh) pops.push({ kind: 'badge', id, fam: f.id, tier: k, date });
          }
        }

        // 4) Level
        const xp = xpSum(xpParts(books, valid)) + [...events, ...out].filter(isXp).reduce((a, e) => a + e.amount, 0), lv = levelOf(xp).level, lvEv = events.find(e => e.kind === 'level');
        if (!lvEv) mk('level', 'max', today, lv);
        else if (lv > lvEv.amount) { mk('level', 'max', today, lv); if (!fresh) pops.push({ kind: 'level', id: evId(uid, 'levelup', String(lv)), level: lv }); }

        if (out.length) await saveMany('game_events', out);
        const add = pops.filter(x => !seen.current.has(x.id)); add.forEach(x => seen.current.add(x.id));
        const lvl = add.filter(x => x.kind === 'level'), rest = add.filter(x => x.kind !== 'level');
        if (add.length) setQueue(q => [...q, ...rest.slice(0, 4), ...lvl]);
      } catch (e) { console.error(e); } finally { busy.current = false; }
    })();
  }, [uid, ready, gameOk, books, sessions, events]);

  const startPause = async (n: number) => {
    if (!uid || !gameOk) return 'Der Pausenmodus ist noch nicht eingerichtet (Datenbanktabelle fehlt).';
    if (d.act) return 'Es läuft bereits eine Pause.';
    const left = PAUSE_YEAR - d.used; if (n > left) return `In diesem Jahr sind nur noch ${left} Pausentage übrig.`;
    const end = addDays(today, n - 1); await saveMany('game_events', [mkEvent(uid, 'pause', today, today, 0, null, end)]);
    return `Pausenmodus bis ${fd(end)} aktiv. Dein Streak ist geschützt.`;
  };
  const endPause = async () => { if (d.act) await saveMany('game_events', [{ ...d.act, end_date: today }]); };

  return { xp: d.xp, parts: d.parts, bonus: d.bonus, lvl: d.lvl, shields: d.shields, hasStart: d.hasStart, pause: { active: !!d.act, end: d.act?.end_date ?? null, used: d.used },
    earned: d.earned, rewards: d.rewards, freezes: d.freezes, gstat, gameOk, queue, dismiss: () => setQueue(q => q.slice(1)), startPause, endPause };
}

// ---------- kleine Bausteine ----------
function XpBar({ pct }: { pct: number }) { return <div className="mt-1.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} /></div>; }
function Shields({ n, size = 'h-5 w-5' }: { n: number; size?: string }) {
  return <span className="inline-flex gap-1" role="img" aria-label={`${n} von ${SHIELD_MAX} Schutzschilden`}>{Array.from({ length: SHIELD_MAX }, (_, i) => <Shield key={i} className={`${size} ${i < n ? 'text-sky-500' : 'text-zinc-300 dark:text-zinc-700'}`} fill={i < n ? 'currentColor' : 'none'} fillOpacity={0.25} />)}</span>;
}
function Sec({ icon: I, title, children }: { icon: typeof Star; title: string; children: ReactNode }) { return <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><I className="h-5 w-5 text-indigo-500" />{title}</h2>{children}</section>; }
const KV = ({ l, v }: { l: string; v: string | number }) => <div className="flex justify-between border-b border-zinc-100 py-1 text-sm dark:border-zinc-700"><span className="text-zinc-500">{l}</span><span className="font-medium tabular-nums">{v}</span></div>;
const rewardText = (e: GameEvent) => (e.data?.type === 'shield' ? 'Zusätzliches Schutzschild' : e.data?.type === 'chest' ? `Schatztruhe: +${e.amount} XP` : `Bonus: +${e.amount} XP`);

// ---------- Dashboard-Karte: Level, XP, Schilde ----------
export function GameStrip() {
  const g = useG(); if (!g) return null;
  const { lvl } = g;
  return <section className={card + ' flex flex-col gap-4 md:flex-row md:items-center md:gap-6'}>
    <div className="flex items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-3xl font-extrabold tabular-nums text-white shadow-md shadow-orange-500/30">{lvl.level}</div>
      <div className="min-w-0"><div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Level {lvl.level}</div><div className="truncate font-semibold">{lvl.title}</div><div className="text-xs tabular-nums text-zinc-500">{de(g.xp)} XP gesamt</div></div></div>
    <div className="min-w-0 flex-1"><div className="flex justify-between text-xs tabular-nums text-zinc-500"><span>{de(lvl.into)} / {de(lvl.span)} XP</span><span>Level {lvl.level + 1}</span></div><XpBar pct={lvl.pct} /></div>
    {g.hasStart && <div className="flex items-center gap-3 text-xs text-zinc-500" title="Streak-Schutz: Schutzschilde und Pausenmodus"><Shields n={g.shields} />
      {g.pause.active && g.pause.end && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"><Pause className="h-3.5 w-3.5" />Pause bis {fd(g.pause.end).slice(0, 6)}</span>}</div>}
  </section>;
}

// ---------- Bereiche auf der Seite "Motivation" ----------
export function GamePanels() {
  const g = useG(), [n, setN] = useState(7), [msg, setMsg] = useState('');
  if (!g) return null;
  const left = PAUSE_YEAR - g.pause.used, opts = [3, 5, 7, 10, 14].filter(x => x <= Math.min(PAUSE_MAX, left)), pick = opts.includes(n) ? n : opts[opts.length - 1];
  const { lvl, parts } = g;
  return <>
    {g.gstat === 'missing' && <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-zinc-900 dark:text-amber-200">Für Schutzschilde, Pausenmodus, Abzeichen-Daten und Überraschungen fehlt noch die neue Datenbanktabelle <b>game_events</b>. Führe dazu die Datei <b>003_game_events.sql</b> im Supabase-SQL-Editor aus (siehe README, Abschnitt „Spielelemente“). XP und Level funktionieren auch jetzt schon.</div>}
    <Sec icon={Star} title="Level & XP"><div className="grid gap-3 md:grid-cols-2">
      <div className={card}><div className="flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-4xl font-extrabold tabular-nums text-white shadow-lg shadow-orange-500/30">{lvl.level}</div>
        <div className="min-w-0"><div className="text-lg font-semibold">{lvl.title}</div><div className="text-sm tabular-nums text-zinc-500">{de(g.xp)} XP gesamt</div></div></div>
        <div className="mt-4 flex justify-between text-xs tabular-nums text-zinc-500"><span>{de(lvl.into)} / {de(lvl.span)} XP</span><span>Noch {de(lvl.span - lvl.into)} XP bis Level {lvl.level + 1}</span></div><XpBar pct={lvl.pct} /></div>
      <div className={card}><h3 className="mb-2 font-medium">So sammelst du XP</h3>
        <KV l="Gelesene Seiten (1 XP je Seite)" v={de(parts.pages)} /><KV l="Lesezeit (1 XP je Minute)" v={de(parts.minutes)} /><KV l="Lesetage (10 XP je Tag)" v={de(parts.days)} /><KV l="Abgeschlossene Bücher (100 XP je Buch)" v={de(parts.books)} /><KV l="Abzeichen & Überraschungen (Bonus)" v={de(g.bonus)} />
        <p className="mt-2 text-xs text-zinc-500">Pro Session zählen höchstens 100 Seiten und 120 Minuten. Ein neues Abzeichen bringt 25 XP mal Stufe.</p></div></div></Sec>

    <Sec icon={Shield} title="Streak-Schutz & Pausenmodus"><div className="grid gap-3 md:grid-cols-2">
      <div className={card + ' space-y-2'}><h3 className="font-medium">Schutzschilde</h3><div className="flex items-center gap-3"><Shields n={g.hasStart ? g.shields : 0} size="h-8 w-8" /><span className="text-sm tabular-nums text-zinc-500">{g.hasStart ? g.shields : 0} von {SHIELD_MAX}</span></div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Verpasst du Tage, setzt automatisch je Tag ein Schild ein und rettet deinen Streak (ab einem Streak von 3 Tagen). Alle {SHIELD_EVERY} Lesetage gibt es ein neues Schild, du startest mit einem. Manchmal verstecken sich Schilde auch in Überraschungen.</p>
        {g.freezes.length > 0 && <p className="text-xs text-zinc-500">Zuletzt eingesetzt: {g.freezes.slice(0, 4).map(e => fd(e.event_date)).join(', ')}</p>}</div>
      <div className={card + ' space-y-3'}><h3 className="flex items-center gap-2 font-medium"><Pause className="h-4 w-4 text-sky-500" />Pausenmodus</h3>
        {g.pause.active && g.pause.end ? <><p className="text-sm">Aktiv bis <b>{fd(g.pause.end)}</b>. Dein Streak ist geschützt, Erinnerungen ruhen. Liest du trotzdem, zählt die Session ganz normal.</p>
          <button className={btn} onClick={() => void g.endPause().then(() => setMsg('Pause beendet.'))}>Pause beenden</button></>
          : <><p className="text-sm text-zinc-600 dark:text-zinc-300">Für Urlaub, Krankheit oder stressige Tage: Dein Streak bleibt geschützt und es kommen keine Erinnerungen. Höchstens {PAUSE_MAX} Tage am Stück, {PAUSE_YEAR} Tage pro Jahr.</p>
            <div className="flex flex-wrap items-center gap-2"><select className={inp} value={pick} disabled={!opts.length} onChange={e => setN(+e.target.value)}>{opts.map(x => <option key={x} value={x}>{x} Tage</option>)}</select>
              <button className={btn} disabled={!opts.length || !g.gameOk} onClick={() => { if (confirm(`Pausenmodus für ${pick} Tage starten?`)) void g.startPause(pick).then(setMsg); }}>Pause starten</button></div></>}
        <p className="text-xs text-zinc-500">In diesem Jahr genutzt: {g.pause.used} von {PAUSE_YEAR} Tagen.</p>{msg && <p className="text-sm text-indigo-700 dark:text-indigo-300">{msg}</p>}</div></div></Sec>

    <Sec icon={Gift} title="Überraschungen"><div className={card + ' space-y-2'}>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">An Tagen, an denen du mindestens {MIN_REWARD_MIN} Minuten liest, wartet manchmal eine Überraschung auf dich: Bonus-XP, eine Schatztruhe oder ein Schutzschild. Spätestens nach 5 Lesetagen ohne Überraschung ist wieder eine fällig.</p>
      {g.rewards.length === 0 ? <p className="text-sm text-zinc-500">Noch keine Überraschung erhalten – lies einfach weiter!</p> : g.rewards.slice(0, 6).map(e => <div key={e.id} className="flex justify-between border-b border-zinc-100 py-1 text-sm last:border-0 dark:border-zinc-700"><span>{rewardText(e)}</span><span className="text-zinc-500">{fd(e.event_date)}</span></div>)}</div></Sec></>;
}

// ---------- Pop-ups mit Feier-Animation ----------
const COL = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#ffffff'];
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 48 }, (_, i) => ({ x: Math.random() * 100, d: 2.6 + Math.random() * 2.2, delay: Math.random() * 0.7, c: COL[i % COL.length], dx: Math.round((Math.random() - 0.5) * 160), rot: Math.round(360 + Math.random() * 720) })), []);
  return <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">{pieces.map((q, i) => <i key={i} className="rt-conf" style={{ '--x': `${q.x}%`, '--d': `${q.d}s`, '--delay': `${q.delay}s`, '--c': q.c, '--dx': `${q.dx}px`, '--rot': `${q.rot}deg` } as CSSProperties} />)}</div>;
}

export function PopupLayer() {
  const g = useG(), p = g?.queue[0], [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); if (p) navigator.vibrate?.([40, 30, 40]); }, [p?.id]);
  useEffect(() => { if (!p) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g?.dismiss(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [p?.id]);
  if (!g || !p) return null;
  let bg = 'from-indigo-600 via-violet-600 to-fuchsia-600', cap = '', title = '', sub: ReactNode = null, icon: ReactNode = null, closed = false;
  if (p.kind === 'badge') {
    const f = FAMS.find(x => x.id === p.fam), t = p.tier; cap = 'Neues Abzeichen!';
    if (f) { title = `${f.t} – ${tierName(t)}`; icon = <div className={`rt-pop rt-glow flex h-28 w-28 items-center justify-center rounded-3xl ${TIER_CLS[Math.min(t - 1, TIER_CLS.length - 1)]}`}><f.I className="h-14 w-14" /></div>;
      sub = <><div className="font-medium">Erreicht am {fd(p.date)}</div><div className="mt-1 text-sm opacity-80">{de(f.th(t - 1))} {f.u} · +{25 * t} XP</div></>; }
  } else if (p.kind === 'level') {
    bg = 'from-amber-500 via-orange-500 to-rose-500'; cap = 'Level-Up!'; title = titleOf(p.level);
    icon = <div className="rt-pop rt-glow flex h-28 w-28 items-center justify-center rounded-3xl bg-white/20 text-6xl font-extrabold tabular-nums">{p.level}</div>; sub = <div className="font-medium">Du bist jetzt Level {p.level}.</div>;
  } else if (p.kind === 'reward') {
    bg = 'from-emerald-600 via-teal-600 to-cyan-600'; cap = 'Überraschung!'; closed = !open;
    if (closed) { title = 'Eine Belohnung wartet auf dich'; icon = <div className="rt-wobble flex h-28 w-28 items-center justify-center rounded-3xl bg-white/20"><Gift className="h-14 w-14" /></div>; sub = 'Weil du heute gelesen hast.'; }
    else if (p.type === 'shield') { title = 'Schutzschild!'; icon = <div className="rt-pop rt-glow flex h-28 w-28 items-center justify-center rounded-3xl bg-white/20"><Shield className="h-14 w-14" /></div>; sub = 'Ein zusätzliches Schutzschild für deinen Streak.'; }
    else { title = p.type === 'chest' ? `Schatztruhe: +${p.amount} XP` : `+${p.amount} XP`; icon = <div className="rt-pop rt-glow flex h-28 w-28 items-center justify-center rounded-3xl bg-white/20"><Sparkles className="h-14 w-14" /></div>; sub = 'Bonus fürs Lesen heute.'; }
  } else {
    bg = 'from-sky-600 via-blue-600 to-indigo-700'; cap = 'Streak gerettet!'; title = `${p.days.length} Schutzschild${p.days.length > 1 ? 'e' : ''} eingesetzt`;
    icon = <div className="rt-pop rt-glow flex h-28 w-28 items-center justify-center rounded-3xl bg-white/20"><Shield className="h-14 w-14" /></div>; sub = `Verpasst: ${p.days.map(fd).join(', ')}. Dein Streak läuft weiter.`;
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={cap}>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    {!closed && <Confetti key={`${p.id}-${open}`} />}
    <div key={`${p.id}-${open}`} className={`rt-pop relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br ${bg} p-7 text-center text-white shadow-2xl`}>
      <div className="text-xs font-medium uppercase tracking-[.25em] opacity-80">{cap}</div><div className="my-5 flex justify-center">{icon}</div>
      <div className="text-2xl font-extrabold tracking-tight">{title}</div><div className="mt-2 opacity-90">{sub}</div>
      <div className="mt-6">{closed ? <button className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 shadow" onClick={() => setOpen(true)}>Öffnen</button>
        : <button className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow" onClick={g.dismiss}>{g.queue.length > 1 ? `Weiter (${g.queue.length - 1} weitere)` : 'Super!'}</button>}</div></div></div>;
}

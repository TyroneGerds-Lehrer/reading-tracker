import { Check, Flame, Shield } from 'lucide-react';
import type { Personal } from './lib/personal';

const CHIP: Record<Personal['state'], { t: string; c: string } | null> = {
  empty: null,
  start: { t: 'Neuer Streak', c: 'bg-white/20 text-white' },
  risk: { t: 'Heute noch offen', c: 'bg-amber-300 text-amber-950' },
  secured: { t: 'Streak gesichert', c: 'bg-white/25 text-white' },
  goal: { t: 'Tagesziel erreicht', c: 'bg-emerald-300 text-emerald-950' },
  paused: { t: 'Pausenmodus', c: 'bg-sky-200 text-sky-950' },
};

// Tagesring: Fortschritt der heutigen Lesezeit gegen das persönliche Tagesziel.
export function DayRing({ p, size = 160 }: { p: Personal; size?: number }) {
  const stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r, k = Math.min(1, Math.max(0, p.pct / 100)), done = p.state === 'goal';
  return <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Tagesring: ${p.today.minutes} von ${p.goalMin} Minuten gelesen`}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? '#6ee7b7' : '#fff'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - k)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} /></svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      {done ? <Check className="mb-0.5 h-5 w-5" /> : null}
      <div className="text-4xl font-extrabold leading-none tabular-nums">{p.today.minutes}</div>
      <div className="mt-1 text-xs opacity-80">von {p.goalMin} Min.</div>
      <div className="mt-0.5 text-[11px] opacity-70">{p.today.pages} Seiten</div></div></div>;
}

export function DayHero({ p }: { p: Personal }) {
  const chip = CHIP[p.state];
  return <section className="rt-pop relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg md:p-7">
    <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" /><div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-black/10" />
    <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3"><Flame className={`h-10 w-10 shrink-0 ${p.streak > 0 && !p.readToday && p.state !== 'paused' ? 'animate-pulse' : ''}`} />
          <div><div className="text-xs font-medium uppercase tracking-[.2em] opacity-80">Aktueller Streak</div>
            <div className="flex items-baseline gap-2"><span className="text-5xl font-extrabold leading-none tabular-nums md:text-6xl">{p.streak}</span><span className="text-xl font-semibold md:text-2xl">Tag{p.streak === 1 ? '' : 'e'}</span></div></div>
          {chip && <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold md:ml-2 ${chip.c}`}>{chip.t}</span>}</div>
        <p className="mt-2 text-sm opacity-90">{p.streakNote}</p>
        <div className="mt-3 flex gap-1.5" aria-label="Lesetage dieser Woche">{p.week.map(w => <div key={w.day} className="flex flex-col items-center gap-1" title={`${w.day}${w.read ? ': gelesen' : w.shielded ? ': geschützt' : ''}`}>
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${w.read ? 'bg-white text-indigo-700' : w.shielded ? 'bg-sky-300 text-sky-950' : w.future ? 'bg-white/10 opacity-50' : 'bg-white/20'} ${w.today ? 'ring-2 ring-white ring-offset-2 ring-offset-violet-600' : ''}`}>{w.read ? <Check className="h-3.5 w-3.5" /> : w.shielded ? <Shield className="h-3.5 w-3.5" /> : ''}</div>
          <span className="text-[10px] opacity-80">{w.label}</span></div>)}</div>
        <div className="mt-4 text-lg font-semibold md:text-xl">{p.headline}</div>
        <p className="mt-1 opacity-95">{p.text}</p>
        <p className="mt-2 text-xs opacity-70">{p.goalNote}</p></div>
      <div className="flex justify-center md:justify-end"><DayRing p={p} /></div></div></section>;
}

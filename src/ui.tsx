import type { LucideIcon } from 'lucide-react';

// Designsystem: zentrale Klassen und kleine UI-Bausteine
export const card = 'rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-900/5 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 md:p-5';
export const inp = 'rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900';
export const btn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[.98] disabled:opacity-50';

export function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
    <div className="mb-3 rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-6 w-6" /></div>
    <div className="font-medium">{title}</div>{text && <p className="mt-1 max-w-sm text-sm text-zinc-500">{text}</p>}</div>;
}
export function Skeleton() {
  const b = 'animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800';
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className={b + ' h-24'} />)}</div><div className={b + ' h-56'} /><div className={b + ' h-56'} /></div>;
}

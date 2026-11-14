// Hintergrundmusik für Reading Wrapped. Wird live im Browser erzeugt (Web Audio API):
// keine Audiodateien, keine Lizenzfragen, funktioniert auch offline.
const K = 'rt-music';
export const musicWanted = () => localStorage.getItem(K) !== 'off';
export const setMusicWanted = (on: boolean) => { localStorage.setItem(K, on ? 'on' : 'off'); };

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [[48, 55, 59, 64], [45, 52, 57, 60], [41, 48, 52, 57], [43, 50, 55, 59]]; // Cmaj7 – Am – Fmaj7 – G
const ARP = [0, 2, 1, 3, 2, 3, 1, 2];
const EIGHTH = 60 / 84 / 2; // Achtelnote bei 84 BPM

let ctx: AudioContext | null = null, out: GainNode | null = null, timer = 0, step = 0, nextT = 0;

function tone(c: AudioContext, dest: AudioNode, f: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

function schedule() {
  const c = ctx, o = out; if (!c || !o) return;
  while (nextT < c.currentTime + 0.4) {
    const ch = CHORDS[Math.floor(step / 8) % CHORDS.length], i = step % 8;
    if (i === 0) { // Akkord (Pad) + Bass, ein Takt lang
      ch.forEach((m, k) => tone(c, o, hz(m), nextT, EIGHTH * 8 + 1.2, k % 2 ? 'triangle' : 'sine', 0.045, 1.2));
      tone(c, o, hz(ch[0] - 12), nextT, EIGHTH * 8 + 0.8, 'sine', 0.07, 0.4);
    }
    if (i !== 3 && i !== 7) tone(c, o, hz(ch[ARP[i]] + 24), nextT, 1.1, 'triangle', 0.035, 0.01); // sanfte Arpeggio-Töne
    nextT += EIGHTH; step++;
  }
}

export function startMusic() {
  if (timer) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = ctx ?? new AC(); void ctx.resume();
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(), d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 2200; d.delayTime.value = EIGHTH * 3; fb.gain.value = 0.3; wet.gain.value = 0.35;
    g.connect(lp); lp.connect(ctx.destination); lp.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 2.5); // sanftes Einblenden
    out = g; step = 0; nextT = ctx.currentTime + 0.1;
    timer = window.setInterval(schedule, 100);
  } catch { /* Audio nicht verfügbar: Wrapped läuft einfach ohne Musik */ }
}

export function stopMusic() {
  if (!timer) return;
  window.clearInterval(timer); timer = 0;
  const c = ctx, g = out; out = null;
  if (c && g) { g.gain.cancelScheduledValues(c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6); window.setTimeout(() => g.disconnect(), 900); } // sanftes Ausblenden
}

// Musik pausiert, wenn der Tab im Hintergrund ist.
document.addEventListener('visibilitychange', () => { if (!ctx || !timer) return; if (document.hidden) void ctx.suspend(); else void ctx.resume(); });

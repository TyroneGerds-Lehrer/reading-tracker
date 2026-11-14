# Reading Tracker

Persönlicher Lese-Tracker mit Cloud-Speicherung (Supabase), Offline-Zwischenspeicher (IndexedDB) und umfangreichen Statistiken.
Technik: React, TypeScript, Tailwind CSS, Recharts, Supabase (PostgreSQL + Auth), GitHub Pages / GitHub Actions.

## Einrichtung (Kurzfassung)
1. **GitHub:** Repository `reading-tracker` (öffentlich) anlegen und den Inhalt dieses Ordners hochladen.
2. **Supabase:** Projekt anlegen (Region Frankfurt). Im SQL-Editor den Inhalt von `supabase/migrations/001_schema_rls.sql` ausführen.
3. **Auth:** Unter *Authentication → URL Configuration* als Site URL und Redirect URL `https://BENUTZERNAME.github.io/reading-tracker/` eintragen.
4. **Schlüssel:** Unter *Project Settings → API Keys* die *Project URL* (ohne Schrägstrich am Ende) und den *Publishable key* kopieren. Den Secret-/service_role-Key niemals verwenden.
5. **GitHub-Secrets:** *Settings → Secrets and variables → Actions* → `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` anlegen.
6. **Pages:** *Settings → Pages → Source: GitHub Actions*. Danach unter *Actions → Deploy → Run workflow* starten.

Lokal entwickeln: `.env.example` nach `.env.local` kopieren, Werte eintragen, `npm install`, `npm run dev`.

## Umgebungsvariablen (nur öffentliche Werte)
| Name | Bedeutung |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `VITE_BASE` | optional, Basis-Pfad (Standard `/reading-tracker/`) |

## Datensicherung
- In der App: *Einstellungen → JSON-Export* (Bücher, Sessions, Ziele, Einstellungen), *CSV* für Bücher, Sessions und Statistik.
- Wiederherstellung: *JSON-Import*. Jeder Eintrag wird geprüft, vorhandene Datensätze werden nie überschrieben.
- Supabase Free enthält keine automatische Wiederherstellung: regelmäßig exportieren.

## Aufbau
`src/lib/stats.ts` zentrale Statistik-Engine · `src/lib/data.ts` IndexedDB + Synchronisierung + Konflikte · `src/lib/tz.ts` Zeitzone · `src/lib/music.ts` Hintergrundmusik für Reading Wrapped (im Browser erzeugt, ein-/ausschaltbar) · `src/lib/game.ts` + `src/Game.tsx` Spielelemente · `supabase/migrations/` Datenbank + RLS.

## Spielelemente (XP, Level, Abzeichen-Pop-ups, Streak-Schutz, Überraschungen)
1. `supabase/migrations/003_game_events.sql` im Supabase-SQL-Editor einmal ausführen (legt die Tabelle `game_events` an).
2. Neuen Code nach GitHub hochladen und den Deploy abwarten.
3. Nur bei genutzten Push-Erinnerungen: Edge Function `send-reminders` mit dem Code aus `supabase/functions/send-reminders/index.ts` neu bereitstellen (Pausenmodus und Schilde gelten dann auch für Push).

Regeln (zentral in `src/lib/game.ts`): 1 XP je Seite und Minute, 10 XP je Lesetag, 100 XP je Buch, Abzeichen-Bonus 25 XP × Stufe. Schutzschilde: 1 zum Start, alle 7 Lesetage ein weiteres (max. 3); sie setzen bei Streaks ab 3 Tagen automatisch ein. Pausenmodus: höchstens 14 Tage am Stück, 30 Tage pro Jahr. Überraschungen: an Lesetagen ab 10 Minuten (ca. 28 %, spätestens nach 5 Lesetagen). Ohne die Tabelle läuft die App weiter, XP und Level funktionieren dann nur ohne Boni.

## Push-Erinnerungen (optional)
1. `tools/vapid-generator.html` im Browser öffnen und Schlüssel erzeugen.
2. `supabase/migrations/002_push_subscriptions.sql` im SQL-Editor ausführen.
3. Edge Function `send-reminders` (Code: `supabase/functions/send-reminders/index.ts`) anlegen, *Verify JWT* ausschalten.
4. Secrets in Supabase: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:…), `CRON_SECRET`.
5. `supabase/setup/cron_reminders.sql.txt` mit eigenen Werten im SQL-Editor ausführen.
6. GitHub-Secret `VITE_VAPID_PUBLIC_KEY` anlegen, Deploy neu starten.

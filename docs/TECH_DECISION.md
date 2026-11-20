# Tech stack

Chosen by the owner: **Godot 4.3 + GDScript**, single-player first, saves on the device (`user://`).

## Hosting and services
- **Vercel**: website, launcher, web build. A Godot web export needs COOP/COEP headers or a build without threads (verify when setting up).
- **Supabase** (Postgres + Auth): optional, later, for accounts and cloud data. Not used yet; no schema applied.
- **Dedicated game server**: dropped. Co-op will use a player host (Godot high-level multiplayer, listen server).

## Dropped options (for reference)
Unity, a custom web engine, a Godot headless dedicated server with Postgres, Google Cloud e2-micro, Oracle Always Free.

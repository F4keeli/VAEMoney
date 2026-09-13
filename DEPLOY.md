# Putting VAE online

The app is one Node process plus one database file. Anywhere that can run Node
and keep a file on disk will do. The only thing that really matters:

> **The database is the file at `VAE_DATA_DIR`. If the host wipes its disk on
> every deploy, your data goes with it.** So attach a small disk (a "volume")
> and point `VAE_DATA_DIR` at it.

Below are three ways, easiest first. Whichever you pick, when the site is up:

1. Open the link, make the first account — that starts the team.
2. A **team code** appears once (it is always in Settings too).
3. Send the link and the code to the others. They open the link, choose
   "Create my account", and paste the code.

---

## 1. Fly.io — free allowance, keeps the data

You need the `flyctl` command and a Fly account.

```bash
# once
curl -L https://fly.io/install.sh | sh      # or: brew install flyctl
fly auth signup                              # or: fly auth login

# in this folder
fly launch --no-deploy                       # pick a name, e.g. vae-team; keep the settings it finds
fly volumes create vae_data --size 1         # 1 GB, this is where the database lives
fly deploy
fly open                                     # your link
```

`fly.toml` in this folder already sets `VAE_DATA_DIR=/data` and mounts the volume
there, so there is nothing else to configure. To update later: `fly deploy`.

## 2. Railway or Koyeb — click through, no terminal

Both read the `Dockerfile` in this folder.

1. Push this folder to a GitHub repo.
2. New project → Deploy from GitHub → pick the repo.
3. Add a **volume** mounted at `/data` (Railway: Variables → New Volume).
4. Set the variable `VAE_DATA_DIR=/data`.
5. Deploy, then open the URL it gives you.

## 3. Render — simplest dashboard, but the disk costs money

`render.yaml` is a ready blueprint: New → Blueprint → pick the repo.
It asks for the **Starter** plan because a Render disk is a paid feature.
On Render's free plan the filesystem is wiped on every deploy, so the free
plan would lose your payments — don't use it for this.

## Anywhere else (a VPS you already have)

```bash
npm install
VAE_DATA_DIR=/var/lib/vae PORT=8080 node server.js
```

Put it behind nginx or Caddy with HTTPS. The app notices it is behind HTTPS on
its own and marks the sign-in cookie secure — nothing to set.

---

## Keeping a copy

The whole database is one file: `$VAE_DATA_DIR/vae.db`. Copying that file
somewhere safe now and then is a complete backup.

```bash
fly ssh console -C "cat /data/vae.db" > vae-backup.db     # Fly
```

## If something goes wrong

- **Everyone is signed out after a deploy** — the disk is not persistent. Check
  the volume is mounted and `VAE_DATA_DIR` points at it.
- **"Sign in to continue" in a loop** — the browser is dropping the cookie. Make
  sure you are on `https://` (not a mixed http/https link).
- **The site sleeps and is slow to open** — free machines suspend when unused.
  The first request wakes it; a few seconds and it is back.

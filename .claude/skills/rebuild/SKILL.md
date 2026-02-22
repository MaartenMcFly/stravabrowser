---
name: rebuild
description: Determine the correct ./update.sh argument based on what has changed in the working tree, then run it. Use when the user asks to deploy, update, or rebuild the Docker containers after making code changes.
user-invocable: true
allowed-tools: Bash, Read
---

# Rebuild — stravabrowser

Inspect what has changed and run `./update.sh` with the minimum argument needed to pick up those changes.

## Usage

```
/rebuild
```

No arguments needed. The skill inspects the git diff itself.

## What to do

### 1. Inspect what changed

Run these two commands to see all modified, added, and deleted files since the last commit:

```bash
git diff --name-only HEAD
git diff --name-only --cached
```

Also check for untracked files that might have been added:
```bash
git status --short
```

### 2. Classify the changed files

Use this mapping:

| Changed path pattern | Container affected |
|---|---|
| `frontend/src/**`, `frontend/public/**`, `frontend/index.html`, `frontend/vite.config.js` | **frontend** |
| `frontend/package.json`, `frontend/package-lock.json` | **frontend** (dependency change — rebuild needed) |
| `frontend/Dockerfile`, `frontend/nginx.conf` | **frontend** |
| `backend/src/**` | **backend** |
| `backend/package.json`, `backend/package-lock.json` | **backend** (dependency change — rebuild needed) |
| `backend/Dockerfile` | **backend** |
| `docker-compose.yml`, `docker-compose.*.yml` | **all** |
| `.env`, `.env.*`, `backend/.env` | restart only — no rebuild |
| `update.sh` | no container change needed |
| `*.md`, `CLAUDE.md`, `.claude/**` | no container change needed |

### 3. Choose the update.sh argument

| Situation | Command |
|---|---|
| Only frontend files changed | `./update.sh frontend` |
| Only backend files changed | `./update.sh backend` |
| Both frontend and backend files changed | `./update.sh all` |
| Only docker-compose.yml changed | `./update.sh all` |
| Only config/docs/scripts changed (no src/ or Dockerfile) | `./update.sh` (restart only, no rebuild) |
| Nothing changed / clean working tree | Tell the user — nothing to rebuild |

**Important nuances:**
- `backend/src/**` changes do **not** require a full rebuild — the backend container runs `nodemon` in dev but in production uses `npm start`. For the Docker deployment here, source code changes inside `backend/src/` require a rebuild because the code is COPYed into the image. So a rebuild IS needed for any `backend/src/` change.
- `frontend/src/**` changes likewise require a frontend rebuild because Vite builds the static files into the image.
- If only `.env` changed: `docker compose down && docker compose up -d` is sufficient (no image rebuild). Tell the user this and do it only if they confirm.

### 4. Confirm before running

Before running `./update.sh`, show the user:
- Which files changed (brief summary)
- Which argument you're going to use and why
- Ask for confirmation: "Ready to run `./update.sh <arg>`?"

Only run after confirmation.

### 5. Run the rebuild

```bash
./update.sh <arg>
```

Wait for it to complete, then show the final output of `docker compose ps` to confirm both containers are healthy.

### 6. Flag anything unusual

If you see:
- `backend/package.json` or `frontend/package.json` changed → note that this includes a dependency update, which will take longer as npm install runs
- `backend/Dockerfile` changed → note that the BuildKit cache will be used, so better-sqlite3 won't recompile unless dependencies changed
- Both containers affected → `all` is used but note which specific thing changed in each

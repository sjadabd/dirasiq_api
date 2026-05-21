# MulhimIQ — automated deployment

End-to-end guide for the GitHub Actions → VPS pipeline that ships every
push to `main` of each repo into production, with rollback safety and
zero-downtime restarts.

This doc lives in `dirasiq_api/` because the API is the central piece,
but the procedures apply to all three deployable projects:

| Repo | Domain | Workflow | Service |
|---|---|---|---|
| `dirasiq_api` | https://api.mulhimiq.com | `.github/workflows/deploy.yml` | docker compose `main-api` (`/opt/mulhimiq/main-api`) |
| `dirasiq_chat` | https://chat.mulhimiq.com | `.github/workflows/deploy.yml` | docker compose `chat-api` (`/opt/mulhimiq/chat-api`) |
| `dirasiq_dash` | https://mulhimiq.com | `.github/workflows/deploy.yml` | nginx static (SCP `dist/`) |

The Flutter app (`dirasiq-f`) is NOT in this pipeline — mobile builds ship
to Play / TestFlight, not to a VPS.

---

## 1. How a deploy flows (high level)

```
   git push origin main
            │
            ▼
   ┌─────────────────────────────┐
   │ GitHub Actions: validate    │
   │  · clean install            │
   │  · tsc / build              │
   │  · forbidden URL scan       │
   │  · docker compose config    │
   └────────────┬────────────────┘
                │ (only if green)
                ▼
   ┌─────────────────────────────┐
   │ SSH to VPS                  │
   │  · snapshot OLD_SHA + image │
   │  · git pull                 │
   │  · docker compose build     │
   │  · up -d --no-deps <svc>    │
   │  · internal health probe    │
   │  · external health probe    │
   └────────────┬────────────────┘
                │
                ▼
        ┌─────────────┐
   ┌────┤  Healthy?   ├──── no ────────┐
   │yes └─────────────┘                 │
   ▼                                    ▼
 ✓ deployed              ✗ rollback (reset --hard OLD_SHA → rebuild → restart)
                                        │
                                        ▼
                              ✗ FAILED — page on-call
```

The dashboard is similar but uses SCP + atomic symlink swap instead of
`docker compose`.

---

## 2. Required GitHub repo secrets

Set these in each of the three repos at
**Settings → Secrets and variables → Actions**:

| Name | Example | Notes |
|---|---|---|
| `VPS_HOST` | `38.60.250.122` | IP or DNS of the production server. |
| `VPS_USER` | `deploy` | SSH login. Must NOT be `root`. |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key (whole file). |
| `VPS_PORT` | `22` | SSH port. |

The three repos all use the same four secrets; configure them per-repo
(GitHub doesn't share secrets across repos in personal accounts — would
require a GitHub Organization with shared secrets).

---

## 3. One-time VPS bootstrap

### 3.1 Create a deploy user

Run as `root` (or via `sudo`):

```bash
# Create a non-root user for deploys.
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy            # let it run docker without sudo

# Allow targeted sudo for nginx reload (dashboard deploys need it).
# Add this single line to /etc/sudoers.d/deploy:
echo 'deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/sbin/nginx -t' \
  > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

# Initialize SSH directory.
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown deploy:deploy /home/deploy/.ssh
```

### 3.2 Generate a deploy keypair

On your laptop (NOT on the VPS):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mulhimiq_deploy -N "" \
  -C "github-actions-deploy@mulhimiq"

# → ~/.ssh/mulhimiq_deploy        (private — goes into VPS_SSH_KEY secret)
# → ~/.ssh/mulhimiq_deploy.pub    (public — goes onto the VPS)
```

### 3.3 Install the public key on the VPS

As `root`:

```bash
# Paste the contents of mulhimiq_deploy.pub:
echo 'ssh-ed25519 AAAA... github-actions-deploy@mulhimiq' \
  >> /home/deploy/.ssh/authorized_keys

chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

Test from your laptop:

```bash
ssh -i ~/.ssh/mulhimiq_deploy -p <PORT> deploy@<VPS_HOST> 'echo hello'
# → hello
```

### 3.4 Upload the PRIVATE key to GitHub

In each repo (`dirasiq_api`, `dirasiq_chat`, `dirasiq_dash`):

- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `VPS_SSH_KEY`
- Value: paste the contents of `~/.ssh/mulhimiq_deploy` (the private key,
  INCLUDING the `-----BEGIN ...-----` and `-----END ...-----` lines).

Also add `VPS_HOST`, `VPS_USER` (=`deploy`), and `VPS_PORT`.

### 3.5 Layout the project directories on the VPS

As `deploy`:

```bash
sudo mkdir -p /opt/mulhimiq
sudo chown -R deploy:deploy /opt/mulhimiq
cd /opt/mulhimiq

# Clone each repo. Directory names MUST match the workflow's
# VPS_PROJECT_PATH (`main-api`, `chat-api`).
git clone git@github.com:sjadabd/dirasiq_api.git  main-api
git clone git@github.com:sjadabd/dirasiq_chat.git chat-api
# Dashboard clone is optional — only needed if you also build on the VPS;
# the workflow ships `dist/` via SCP so the repo isn't required there.

# Create the env files (carefully — these are gitignored secrets):
nano main-api/.env.production         # see .env.production.example
nano chat-api/.env.production         # see .env.production.example

# First-time bring-up so the containers exist.
cd /opt/mulhimiq/main-api
docker compose --env-file .env.production up -d --build

cd /opt/mulhimiq/chat-api
docker compose --env-file .env.production up -d --build

# Verify
docker compose -p main-api ps
docker compose -p chat-api ps
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3001/health
```

### 3.6 Dashboard release layout

```bash
sudo mkdir -p /var/www/mulhimiq/dashboard/releases
sudo chown -R deploy:deploy /var/www/mulhimiq/dashboard

# nginx serves the symlink:
sudo nano /etc/nginx/sites-available/mulhimiq.com
#   root /var/www/mulhimiq/dashboard/current;
#   ...
sudo ln -sf /etc/nginx/sites-available/mulhimiq.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The first deploy from GitHub Actions creates `releases/<timestamp>-<sha>/`
and points `current` at it.

---

## 4. What the workflow protects

### 4.1 Never overwritten by deploys

| Path | Why protected |
|---|---|
| `/opt/mulhimiq/*/​.env.production` | Production secrets — gitignored, never touched by `git pull` or the workflow. |
| `/opt/mulhimiq/*/​public/uploads/` | User-generated content — lives on a docker volume; container rebuild doesn't touch it. |
| `/etc/letsencrypt/live/*` | SSL certs — owned by certbot, separate process. |
| Postgres + Redis data | Named docker volumes (`*_pgdata`, `*_redis`) — `up -d --no-deps <service>` doesn't recreate them. |

The workflow explicitly REFUSES to deploy if `.env.production` is missing
on the VPS (sanity check at the start of the SSH script).

### 4.2 Rebuilt on each deploy

| Component | Rebuild trigger |
|---|---|
| API container | `docker compose build main-api` after `git pull` |
| Chat container | `docker compose build chat-api` after `git pull` |
| Dashboard static files | `npm run build` in CI, SCP to `releases/<id>/` |

### 4.3 Restarted (with zero downtime)

`docker compose up -d --no-deps <service>` rebuilds and replaces just one
service. Docker swaps the running container after the new one passes its
HEALTHCHECK. Postgres and Redis stay up the whole time.

For the dashboard, `ln -sfn newdir current && mv -T` is an atomic POSIX
operation — no request hits half-old / half-new files. `nginx -s reload`
gracefully drains existing connections.

---

## 5. Build validation gate (CI side)

Every workflow runs these before any SSH happens. A failure here means
the deploy job never starts — production stays on the old code.

| Check | What it catches |
|---|---|
| `npm ci` (clean) | Lockfile drift, missing deps. |
| `tsc --noEmit` | Type errors. |
| `npm run build` | Compile / bundle failures. |
| Forbidden URL scan | `localhost:300X`, `38.60.250.122`, `10.0.2.2` leaking into source. |
| `docker compose config` | docker-compose.yml syntax + env interpolation. |
| Dashboard: CSP scan | `dist/index.html` must not contain dev origins after Vite substitutes placeholders. |

---

## 6. Rollback behaviour

Two layers:

### 6.1 Automatic (on healthcheck failure)

If the post-deploy probe fails (internal `/health` or external
`https://<domain>/health`), the workflow:

1. Logs the failure clearly (`DEPLOY FAILED — rolling back to <sha>`).
2. `git reset --hard <old_sha>` on the VPS.
3. Rebuilds + restarts the service from the old code.
4. Probes again; if rollback ALSO fails, exits non-zero — alarms / on-call.

For the dashboard, rollback is a single `ln -sfn <prev_release> current`
+ nginx reload (no rebuild needed because the previous `dist/` is still
on disk under `releases/`).

### 6.2 Manual (operator-initiated)

If you spot a regression hours after deploy:

**API / Chat:**
```bash
ssh deploy@vps
cd /opt/mulhimiq/main-api      # or chat-api
git log --oneline -10              # find the last-known-good commit
git reset --hard <known_good_sha>
docker compose --env-file .env.production build main-api    # or chat-api
docker compose --env-file .env.production up -d --no-deps main-api
curl -fsS https://api.mulhimiq.com/health
```

**Dashboard:**
```bash
ssh deploy@vps
ls -1t /var/www/mulhimiq/dashboard/releases | head -5
# Pick the release you want to roll back to:
ln -sfn /var/www/mulhimiq/dashboard/releases/<release_id> \
       /var/www/mulhimiq/dashboard/current
sudo systemctl reload nginx
curl -fsS https://mulhimiq.com/
```

The workflow keeps the last **5 dashboard releases** on disk so rollback
within that window is instant.

---

## 7. Operations cheatsheet

### Watch a deploy live

GitHub → repo → **Actions** tab → click the running run.

### Re-run a failed deploy without a new commit

GitHub → Actions → failed run → **Re-run jobs**.

### Manual trigger (e.g. to force a clean rebuild)

GitHub → Actions → workflow → **Run workflow** → pick `main` → Run.
(`workflow_dispatch:` is enabled on every workflow.)

### Check what's running on the VPS

```bash
ssh deploy@vps
cd /opt/mulhimiq/main-api          # or /opt/mulhimiq/chat-api
docker compose ps
docker compose images main-api     # or chat-api
git log -1 --oneline
```

### See container logs

```bash
docker compose logs --tail=200 -f main-api
docker compose logs --tail=200 -f chat-api
```

### Health endpoints

```bash
curl -fsS https://api.mulhimiq.com/health | jq
curl -fsS https://api.mulhimiq.com/health/detailed | jq
curl -fsS https://chat.mulhimiq.com/health | jq
curl -fsS https://chat.mulhimiq.com/health/detailed | jq
curl -fsS https://mulhimiq.com/            # 200 means dashboard is serving
```

### View previous dashboard releases

```bash
ssh deploy@vps
ls -lat /var/www/mulhimiq/dashboard/releases | head -10
readlink -f /var/www/mulhimiq/dashboard/current
```

### Disable auto-deploy temporarily

GitHub → repo → **Settings → Actions → General** →
**Disable Actions** for the duration of an incident. Re-enable when ready.

---

## 8. Security considerations

| Concern | Mitigation |
|---|---|
| Private SSH key exposure | Stored as an encrypted GitHub repo secret; never echoed in logs (`secrets.*` is masked). Rotate the key (regenerate + update both VPS + secret) on a quarterly basis or after a suspected leak. |
| Deploy user privilege escalation | `deploy` is a normal user with docker group access + narrow sudo for nginx reload only. Cannot install packages, edit `/etc`, or read other users' files. |
| `.env.production` leak | File is owned by `deploy:deploy` with 600 perms, gitignored in the repo, and the workflow refuses to start if it's missing. Never logged. |
| Broken commit shipped to prod | Pre-deploy `validate` job blocks bad builds. Forbidden URL scan catches accidental localhost / IP leaks. |
| Healthcheck false positive | Internal + external probes both must pass. External probe goes through nginx so it catches cert / reverse-proxy issues a local-only check would miss. |
| Concurrent deploys collide | `concurrency:` group serialises deploys of the same project. |
| Rollback failure | Workflow exits non-zero with a clear log; operator paged via whatever alerting is wired to GitHub Actions failures. |
| Long-running connections drop on restart | `up -d --no-deps` rebuilds only the target service; postgres + redis stay up. Docker swap waits for the new container's HEALTHCHECK to pass before stopping the old one. |

---

## 9. Known limitations + future improvements

1. **No staging environment.** All deploys go straight to prod. Add a
   `staging` cluster + parallel workflow when the team grows.
2. **No DB migration step.** If a deploy includes a schema change, the
   migration runs on container boot via `db:init`. Long migrations would
   block the healthcheck and trigger rollback. Move long migrations to a
   separate manual step.
3. **Notification placeholder.** The `notify` job currently just `echo`s.
   Wire up Slack / Discord / email when desired.
4. **Single VPS.** No multi-region. Move to a managed orchestrator
   (k8s/ECS) when the user base demands HA.
5. **No blue-green for API / Chat.** Container swap has a ~1s gap during
   which a new TCP connection might hit the dying container. Acceptable
   for chat (clients reconnect) + API (clients retry) at MVP scale.

---

## 10. Quick-reference command index

```bash
# Local
git push origin main                    # triggers the workflow

# VPS — manual rollback
cd /opt/mulhimiq/main-api          # or chat-api
git reset --hard <sha> && docker compose up -d --build main-api

# VPS — manual dashboard rollback
ln -sfn /var/www/mulhimiq/dashboard/releases/<id> \
       /var/www/mulhimiq/dashboard/current
sudo systemctl reload nginx

# VPS — full restart (DB unaffected)
docker compose --env-file .env.production restart main-api    # or chat-api

# VPS — hard reset (use only when truly broken)
docker compose down
docker compose --env-file .env.production up -d --build
```

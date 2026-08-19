# Scholario Backend — Phase 1 (with CI/CD via Docker + GitHub Actions)

Phase 1: server foundation, HTTPS, Firebase-verified authentication, and now
a full CI/CD pipeline — push to GitHub, GitHub Actions builds a Docker image
and deploys it to your VM automatically. No booking/payment/Stripe logic
yet — that's Phase 2 onward.

## What this proves works
- `/health` — public, confirms the server is running.
- `/me` — protected, confirms a real Firebase ID token from the Android app
  is independently verified by this backend.

## How the pipeline works, end to end

```
You push to GitHub (main branch)
        ↓
GitHub Actions runs:
  1. Build Docker image
  2. Push image to GitHub Container Registry (ghcr.io)
  3. SSH into your VM
  4. On the VM: docker compose pull + docker compose up -d
        ↓
Your VM is now running the new version, automatically
```

Docker's own `restart: unless-stopped` policy handles crash recovery and
restart-on-reboot — this replaces PM2 entirely. You do not need PM2 in this
setup.

---

## One-time setup — do these in order

### 1. Push this project to GitHub

On your PC:
```bash
cd scholario-backend
git init
git add .
git commit -m "Phase 1: backend foundation + CI/CD"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

`.gitignore` already excludes `.env` and the Firebase service account key —
confirm with `git status` before your first commit that neither is staged.

### 2. Fix the placeholder in docker-compose.yml

Edit `docker-compose.yml` and replace `GITHUB_USERNAME/REPO_NAME` with your
real GitHub username and repo name, lowercase, e.g.:
```yaml
image: ghcr.io/johnsmith/scholario-backend:latest
```
This must exactly match what GitHub Actions pushes to (the workflow builds
this automatically from `github.repository`, so it will already be correct
on the Actions side — you're just matching it here for the VM's copy).

### 3. Set up a dedicated SSH deploy key (don't reuse your personal key)

On your PC:
```bash
ssh-keygen -t ed25519 -f scholario_deploy_key -N ""
```
This creates two files: `scholario_deploy_key` (private) and
`scholario_deploy_key.pub` (public).

Copy the **public** key to your VM:
```bash
ssh-copy-id -i scholario_deploy_key.pub your-vm-user@your-vm-ip
```
(If `ssh-copy-id` isn't available, manually append the `.pub` file's
contents to `~/.ssh/authorized_keys` on the VM.)

Test it works:
```bash
ssh -i scholario_deploy_key your-vm-user@your-vm-ip
```

### 4. Add GitHub Secrets

On GitHub: your repo → Settings → Secrets and variables → Actions → New
repository secret. Add these three:

| Secret name | Value |
|---|---|
| `VM_HOST` | your VM's IP address or domain |
| `VM_USER` | the SSH username you connect as |
| `VM_SSH_KEY` | the full contents of the **private** key file (`scholario_deploy_key`, not `.pub`) |

`GITHUB_TOKEN` (used to push to ghcr.io) is provided automatically by GitHub
Actions — you don't need to create this one yourself.

### 5. Prepare the VM

Install Docker:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
```

Create the deploy directory and put the compose file there:
```bash
mkdir -p ~/scholario-backend
```
Copy `docker-compose.yml` from this project onto the VM at
`~/scholario-backend/docker-compose.yml` (scp it over, or just paste its
contents into a file created with `nano ~/scholario-backend/docker-compose.yml`).

Create the `.env` file on the VM (this file never goes through git):
```bash
nano ~/scholario-backend/.env
```
Fill in (see `.env.example` in this repo for the full list):
```
PORT=3000
NODE_ENV=production
FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-service-account.json
ALLOWED_ORIGINS=https://yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200
```

Upload your Firebase service account key to the exact path the compose file
mounts from:
```bash
sudo mkdir -p /etc/scholario-backend
sudo chmod 700 /etc/scholario-backend
scp firebase-service-account.json your-vm-user@your-vm-ip:/tmp/
ssh your-vm-user@your-vm-ip "sudo mv /tmp/firebase-service-account.json /etc/scholario-backend/ && sudo chmod 600 /etc/scholario-backend/firebase-service-account.json"
```

### 6. Let the VM pull a private image from GHCR

By default, the image GitHub Actions pushes is **private**. The VM needs to
authenticate once to pull it:

On GitHub: Settings (top-right avatar) → Developer settings → Personal
access tokens → Tokens (classic) → Generate new token → scope: `read:packages`
only. Copy the token.

On the VM:
```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
# paste the token when prompted for password
```
This only needs to be done once — Docker caches the credential on the VM.

*(Alternative: after your first push, go to your package on GitHub →
Package settings → Change visibility → Public. Then the VM doesn't need to
log in at all. Simpler, but means anyone can pull your image — fine for a
backend with no secrets baked into the image itself, since all real secrets
live in `.env` and the mounted Firebase key, never in the image.)*

### 7. Set up Nginx + HTTPS (same as before, still required)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```
Copy `deploy/nginx-scholario-backend.conf` to
`/etc/nginx/sites-available/scholario-backend`, edit it to replace
`yourdomain.com`, then:
```bash
sudo ln -s /etc/nginx/sites-available/scholario-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com
```

### 8. First deploy

Everything above only needs to happen once. Now trigger the actual pipeline:
```bash
git commit --allow-empty -m "trigger deploy"
git push
```
Watch it run: GitHub → your repo → Actions tab. Two jobs should run —
`build-and-push`, then `deploy`. Both should turn green.

On the VM, confirm the container is running:
```bash
docker ps
docker compose logs -f
```

Then from anywhere:
```bash
curl https://yourdomain.com/health
```

---

## Making changes from now on

```bash
# edit code on your PC
git add .
git commit -m "whatever you changed"
git push
```
That's it — Actions rebuilds the image and redeploys automatically within
about a minute or two. No manual VM steps required after the one-time setup
above.

## Verifying end-to-end from the Android app

```kotlin
val idToken = com.google.firebase.auth.FirebaseAuth.getInstance()
    .currentUser?.getIdToken(false)?.await()?.token

val request = Request.Builder()
    .url("https://yourdomain.com/me")
    .addHeader("Authorization", "Bearer $idToken")
    .get()
    .build()
```
A successful response includes your real Firebase uid — confirming the
whole chain works: Android app → HTTPS → Nginx → Docker container → Firebase
token verification.

---

## What's NOT in Phase 1 (comes next)
- No database connection yet (Phase 2 adds the booking state machine)
- No Stripe integration yet (Phase 3)
- No admin panel (Phase 4)
- Supabase RLS policies to lock out direct client writes (Phase 6)

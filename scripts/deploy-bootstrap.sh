#!/usr/bin/env bash
# Precast CRM — VPS bootstrap.
#
# Run once on a fresh Ubuntu 22.04/24.04 VPS as root (or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/<your-gh>/precast-crm/main/scripts/deploy-bootstrap.sh | bash
# Or, if you've already cloned the repo:
#   cd /opt/precast-crm && bash scripts/deploy-bootstrap.sh
#
# What it does:
#   1. Installs Docker + Compose plugin (if missing)
#   2. Clones the repo to /opt/precast-crm (if missing)
#   3. Generates an .env from .env.production.example with strong secrets
#   4. Builds + starts the stack (db, app, caddy)
#   5. Runs prisma db push to create tables
#   6. Optionally seeds demo data
#
# Re-running the script on an existing install is safe — it skips
# anything already configured.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/azizdadabaev/precast-crm.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/precast-crm}"
BRANCH="${BRANCH:-main}"

c_blue()  { printf "\033[34m%s\033[0m\n" "$*"; }
c_green() { printf "\033[32m%s\033[0m\n" "$*"; }
c_yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
c_red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    c_red "Run as root (or with sudo). Exiting."
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    c_green "✓ Docker already installed"
    return
  fi
  c_blue "→ Installing Docker..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  c_green "✓ Docker installed"
}

clone_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    c_green "✓ Repo already at $INSTALL_DIR (skipping clone)"
    return
  fi
  c_blue "→ Cloning $REPO_URL → $INSTALL_DIR..."
  apt-get install -y git
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  c_green "✓ Repo cloned"
}

detect_public_ip() {
  curl -fsSL https://api.ipify.org 2>/dev/null \
    || curl -fsSL https://ifconfig.me 2>/dev/null \
    || hostname -I | awk '{print $1}'
}

write_env() {
  local env_file="$INSTALL_DIR/.env"
  local example="$INSTALL_DIR/.env.production.example"

  if [ -f "$env_file" ]; then
    c_yellow "✓ $env_file exists already (skipping; edit by hand if needed)"
    return
  fi

  c_blue "→ Generating $env_file..."
  cp "$example" "$env_file"

  local pg_pass; pg_pass="$(openssl rand -hex 24)"
  local jwt;     jwt="$(openssl rand -hex 32)"
  local cancel_pw="${ORDER_CANCEL_PASSWORD:-etalontbm}"
  local public_ip; public_ip="$(detect_public_ip)"
  local app_url="http://${public_ip}"

  # Substitute the empty REQUIRED= keys.
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|"           "$env_file"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|"                              "$env_file"
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${app_url}|"        "$env_file"
  sed -i "s|^ORDER_CANCEL_PASSWORD=.*|ORDER_CANCEL_PASSWORD=${cancel_pw}|"  "$env_file"

  chmod 600 "$env_file"
  c_green "✓ .env written (Postgres pw + JWT secret auto-generated)"
  c_green "  App URL: ${app_url}"
  c_yellow "  Order cancel password: ${cancel_pw}  (change in .env if you want)"
}

start_stack() {
  c_blue "→ Building images and starting stack..."
  cd "$INSTALL_DIR"
  docker compose pull --ignore-pull-failures
  docker compose build
  docker compose up -d
  c_green "✓ Stack started"
}

wait_for_db() {
  c_blue "→ Waiting for Postgres..."
  cd "$INSTALL_DIR"
  for i in {1..40}; do
    if docker compose exec -T db pg_isready -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" >/dev/null 2>&1; then
      c_green "✓ Postgres ready"
      return
    fi
    sleep 1
  done
  c_red "Postgres did not become ready in 40s. Check logs: docker compose logs db"
  exit 1
}

push_schema() {
  c_blue "→ Creating tables (prisma db push)..."
  cd "$INSTALL_DIR"
  docker compose exec -T app npx prisma db push --skip-generate
  c_green "✓ Schema applied"
}

maybe_seed() {
  cd "$INSTALL_DIR"
  if [ -t 0 ]; then
    read -r -p "Seed demo users + sample orders? [y/N] " ans
  else
    ans="${SEED:-n}"
  fi
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    c_blue "→ Seeding..."
    docker compose exec -T app npm run db:seed
    c_green "✓ Seeded"
  else
    c_yellow "✓ Skipped seeding (run manually later: docker compose exec app npm run db:seed)"
  fi
}

print_summary() {
  cd "$INSTALL_DIR"
  local app_url; app_url="$(grep ^NEXT_PUBLIC_APP_URL .env | cut -d= -f2-)"
  echo
  c_green "════════════════════════════════════════════════════════════"
  c_green " Precast CRM is live."
  c_green " Open: ${app_url}"
  c_green "════════════════════════════════════════════════════════════"
  echo
  echo "Useful commands (run from ${INSTALL_DIR}):"
  echo "  docker compose ps                 # service status"
  echo "  docker compose logs -f app        # tail app logs"
  echo "  docker compose exec app npx prisma studio   # DB UI on :5555"
  echo "  docker compose down               # stop the stack (data persists)"
  echo "  git pull && docker compose up -d --build    # update to latest"
}

main() {
  require_root
  install_docker
  clone_repo
  write_env
  start_stack
  wait_for_db
  push_schema
  maybe_seed
  print_summary
}

main "$@"

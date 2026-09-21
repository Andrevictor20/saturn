#!/usr/bin/env bash
# =============================================================================
# Saturn — Raspberry Pi Setup Script
# Run once on the Pi to install Docker, login to ghcr.io and start the stack.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Andrevictor20/saturn/main/scripts/setup-pi.sh | bash
# =============================================================================
set -euo pipefail

REPO="Andrevictor20/saturn"
IMAGE="ghcr.io/${REPO}:latest"
INSTALL_DIR="${HOME}/saturn"

echo "🚀 Saturn — Raspberry Pi Setup"
echo "========================================"

# ── 1. Install Docker if missing ─────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "✅ Docker installed. You may need to log out and back in for group membership."
else
  echo "✅ Docker already installed: $(docker --version)"
fi

# ── 1.1 Configure Docker & Systemd Log Limits (Prevent Disk Filling) ─────────
echo "⚙️  Configuring log rotation policies..."
if command -v sudo &>/dev/null; then
  # Limit Docker Daemon json-file logs globally
  if [ ! -f /etc/docker/daemon.json ]; then
    sudo mkdir -p /etc/docker
    echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"},"max-concurrent-downloads":10,"max-concurrent-uploads":5,"max-download-attempts":5}' | sudo tee /etc/docker/daemon.json > /dev/null
    sudo systemctl restart docker || true
  fi

  # Limit Systemd Journal to 100M and vacuum old logs (frees up to 4GB)
  if [ -d /etc/systemd ]; then
    sudo mkdir -p /etc/systemd/journald.conf.d
    echo -e "[Journal]\nSystemMaxUse=100M\nSystemMaxFileSize=20M" | sudo tee /etc/systemd/journald.conf.d/00-saturn.conf > /dev/null
    sudo systemctl restart systemd-journald 2>/dev/null || true
    sudo journalctl --vacuum-size=50M 2>/dev/null || true
  fi

  # Clean Docker build cache and dangling layers
  echo "🧹 Cleaning legacy Docker build cache and orphan layers..."
  docker builder prune -af 2>/dev/null || true
  docker image prune -f 2>/dev/null || true
fi

# ── 2. Create install directory ───────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ── 3. Download docker-compose.yml ───────────────────────────────────────────
echo "📥 Downloading docker-compose.yml..."
curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/docker-compose.yml" -o docker-compose.yml

# ── 4. Removed .env generation ─────────────────────────────────────────────────
# The Saturn backend now automatically generates its own secure JWT_SECRET
# and stores it in the SQLite data volume. No .env configuration is needed!

# ── 5. Login to ghcr.io (public image, anonymous pull works for public repos) ─
echo ""
echo "🔐 Logging in to GitHub Container Registry..."
echo "   (press Enter to skip if the image is public)"
read -rp "   GitHub username (or Enter to skip): " GH_USER
if [ -n "$GH_USER" ]; then
  read -rsp "   GitHub Personal Access Token (read:packages scope): " GH_TOKEN
  echo
  echo "$GH_TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin
fi

# ── 6. Pull image and start stack ─────────────────────────────────────────────
echo ""
echo "🐳 Pulling image: ${IMAGE}"
docker pull "${IMAGE}"

echo "▶️  Starting Saturn..."
docker compose up -d

echo ""
echo "✅ Done! Saturn is running."
echo ""
echo "   🌐 Access: http://$(hostname -I | awk '{print $1}'):5172"
echo "   📋 Logs:   docker compose logs -f saturn"
echo "   🔄 Updates are managed directly via the Saturn UI"
echo ""

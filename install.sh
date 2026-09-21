#!/usr/bin/env bash
# =============================================================================
#   _____       _                     
#  / ____|     | |                    
# | (___   __ _| |_ _   _ _ __ _ __   
#  \___ \ / _` | __| | | | '__| '_ \  
#  ____) | (_| | |_| |_| | |  | | | | 
# |_____/ \__,_|\__|\__,_|_|  |_| |_| 
#
# Saturn — Universal Automated Installer, Updater & Manager
# Supported: x86_64, aarch64 (ARM64), armv7l (Raspberry Pi 3/4/5, PC, Cloud VPS)
#
# Usage:
#   Instalação:   curl -fsSL https://raw.githubusercontent.com/Andrevictor20/saturn/main/install.sh | bash
#   Atualização:  curl -fsSL https://raw.githubusercontent.com/Andrevictor20/saturn/main/install.sh | bash -s -- --update
#   Desinstalação: curl -fsSL https://raw.githubusercontent.com/Andrevictor20/saturn/main/install.sh | bash -s -- --uninstall
# =============================================================================
set -euo pipefail

# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO="Andrevictor20/saturn"
IMAGE="ghcr.io/${REPO}:latest"

# ── Logging Helpers ──────────────────────────────────────────────────────────
log_info()    { echo -e "${CYAN}ℹ️  [INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}✅ [SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠️  [WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}❌ [ERROR]${NC} $1"; }

# ── Sudo Setup ───────────────────────────────────────────────────────────────
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    SUDO="sudo"
  else
    log_error "Este script requer permissões de administrador (root ou sudo)."
    exit 1
  fi
fi

# ── Interactive TTY Reader ───────────────────────────────────────────────────
read_tty() {
  local prompt_msg="$1"
  local default_val="$2"
  local reply=""
  if [ -c /dev/tty ]; then
    read -rp "$prompt_msg" reply < /dev/tty 2>/dev/null || reply="$default_val"
  else
    reply="$default_val"
  fi
  echo "${reply:-$default_val}"
}

# ── Install Dir Detection ────────────────────────────────────────────────────
detect_install_dir() {
  if [ -d "/DATA/saturn" ]; then
    INSTALL_DIR="/DATA/saturn"
  elif [ -d "/DATA" ] && [ -w "/DATA" ]; then
    INSTALL_DIR="/DATA/saturn"
  elif [ -d "${HOME:-/root}/saturn" ]; then
    INSTALL_DIR="${HOME:-/root}/saturn"
  elif [ -d "/opt/saturn" ]; then
    INSTALL_DIR="/opt/saturn"
  else
    INSTALL_DIR="${HOME:-/root}/saturn"
  fi
}
detect_install_dir

# ── Fix Docker Config Glitch ─────────────────────────────────────────────────
fix_docker_config() {
  if $SUDO test -d /root/.docker/config.json 2>/dev/null; then
    $SUDO rm -rf /root/.docker/config.json 2>/dev/null || true
  fi
  if [ -d "${HOME:-}/.docker/config.json" ]; then
    rm -rf "${HOME:-}/.docker/config.json" 2>/dev/null || true
  fi
  $SUDO mkdir -p /root/.docker 2>/dev/null || true
  if ! $SUDO test -f /root/.docker/config.json 2>/dev/null; then
    echo "{}" | $SUDO tee /root/.docker/config.json > /dev/null 2>&1 || true
  fi
  if [ -n "${HOME:-}" ]; then
    mkdir -p "${HOME}/.docker" 2>/dev/null || true
    if [ ! -f "${HOME}/.docker/config.json" ]; then
      echo "{}" > "${HOME}/.docker/config.json" 2>/dev/null || true
    fi
  fi
}

# ── Architecture & OS Detection ──────────────────────────────────────────────
check_architecture_and_os() {
  ARCH="$(uname -m)"
  log_info "Detectando arquitetura do processador: ${BOLD}${ARCH}${NC}"
  case "${ARCH}" in
    x86_64|amd64)
      PLATFORM_NAME="x86_64 / AMD64 (PC, Servidor, VPS)"
      ;;
    aarch64|arm64)
      PLATFORM_NAME="ARM64 (Raspberry Pi 4/5, Apple Silicon, ARM Server)"
      ;;
    armv7l|armhf)
      PLATFORM_NAME="ARMv7 (Raspberry Pi 2/3 32-bit)"
      ;;
    *)
      log_warn "Arquitetura '${ARCH}' detectada. Tentando instalação genérica multi-arch..."
      PLATFORM_NAME="${ARCH}"
      ;;
  esac
  log_success "Plataforma confirmada: ${BOLD}${PLATFORM_NAME}${NC}"

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="${PRETTY_NAME:-$ID}"
  else
    OS_NAME="$(uname -s)"
  fi
  log_info "Sistema Operacional detectado: ${BOLD}${OS_NAME}${NC}"
}

# ── Docker Engine Check & Install ────────────────────────────────────────────
check_docker() {
  if ! command -v docker &>/dev/null; then
    log_info "Docker não encontrado. Instalando Docker Engine oficial..."
    curl -fsSL https://get.docker.com | $SUDO sh
    if [ -n "${SUDO}" ] && [ -n "${USER:-}" ]; then
      $SUDO usermod -aG docker "$USER" 2>/dev/null || true
    fi
    log_success "Docker instalado com sucesso!"
  else
    log_success "Docker já está instalado: $(docker --version)"
  fi

  if command -v systemctl &>/dev/null; then
    $SUDO systemctl enable --now docker 2>/dev/null || true
  fi
}

# ── Storage & Logging Protection Policy ──────────────────────────────────────
apply_storage_policy() {
  log_info "Aplicando configurações de proteção contra esgotamento de disco..."
  if [ ! -f /etc/docker/daemon.json ]; then
    $SUDO mkdir -p /etc/docker
    echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"},"max-concurrent-downloads":10,"max-concurrent-uploads":5,"max-download-attempts":5}' | $SUDO tee /etc/docker/daemon.json > /dev/null
    $SUDO systemctl restart docker 2>/dev/null || true
  fi

  if [ -d /etc/systemd/journald.conf.d ]; then
    echo -e "[Journal]\nSystemMaxUse=100M\nSystemMaxFileSize=20M" | $SUDO tee /etc/systemd/journald.conf.d/00-saturn.conf > /dev/null
    $SUDO rm -f /etc/systemd/journald.conf.d/00-orbit.conf 2>/dev/null || true
    $SUDO systemctl restart systemd-journald 2>/dev/null || true
    $SUDO journalctl --vacuum-size=50M 2>/dev/null || true
  fi
}

# ── Compose File Generation ──────────────────────────────────────────────────
create_compose_file() {
  log_info "Gerando arquivo de configuração docker-compose.yml..."
  cat << 'EOF' > docker-compose.yml
services:
  saturn:
    image: ghcr.io/andrevictor20/saturn:latest
    container_name: saturn
    restart: unless-stopped
    privileged: true
    ports:
      - "5172:5172"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - saturn_data:/app/data
      - /:/host:rslave
      - /mnt:/mnt:rslave
      - /media:/media:rslave
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  saturn_data:
    name: saturn_data
EOF
  log_success "docker-compose.yml configurado com sucesso."
}

# ── IP Detection ─────────────────────────────────────────────────────────────
detect_local_ip() {
  LOCAL_IP=""
  if command -v hostname &>/dev/null; then
    LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [ -z "${LOCAL_IP}" ] && command -v ip &>/dev/null; then
    LOCAL_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')"
  fi
  LOCAL_IP="${LOCAL_IP:-localhost}"
}

# ── Status Check ─────────────────────────────────────────────────────────────
is_saturn_installed() {
  local names=""
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null || $SUDO docker ps -a --format '{{.Names}}' 2>/dev/null || true)"
  if echo "$names" | grep -Eq '^(saturn|saturn-dashboard|saturn_old_dummy)$'; then
    return 0
  fi
  if [ -n "${INSTALL_DIR:-}" ] && [ -f "${INSTALL_DIR}/docker-compose.yml" ]; then
    return 0
  fi
  return 1
}

# Legacy alias
is_orbit_installed() {
  is_saturn_installed
}

# ── Free Ports and Stop Saturn ─────────────────────────────────────────
stop_and_clear_saturn_instances() {
  log_info "Liberando portas de rede (5172/5173) e parando instâncias antigas..."
  $SUDO docker ps -q --filter "publish=5172" 2>/dev/null | xargs -r $SUDO docker stop 2>/dev/null || true
  $SUDO docker ps -q --filter "publish=5172" 2>/dev/null | xargs -r $SUDO docker rm -f 2>/dev/null || true
  $SUDO docker ps -q --filter "publish=5173" 2>/dev/null | xargs -r $SUDO docker stop 2>/dev/null || true
  $SUDO docker ps -q --filter "publish=5173" 2>/dev/null | xargs -r $SUDO docker rm -f 2>/dev/null || true

  for c in saturn saturn-dashboard ; do
    $SUDO docker stop "$c" 2>/dev/null || true
    $SUDO docker rm -f "$c" 2>/dev/null || true
  done

  # Remove dead or exited duplicates (prevents "1/2 ativos")
  $SUDO docker ps -a -q --filter "name=saturn" --filter "status=exited" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
  $SUDO docker ps -a -q --filter "name=saturn" --filter "status=created" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
  $SUDO docker ps -a -q --filter "name=saturn" --filter "status=dead" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
  $SUDO docker ps -a -q --filter "name=saturn_old_dummy" --filter "status=exited" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
  $SUDO docker ps -a -q --filter "name=saturn_old_dummy" --filter "status=created" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
  $SUDO docker ps -a -q --filter "name=saturn_old_dummy" --filter "status=dead" 2>/dev/null | xargs -r $SUDO docker rm 2>/dev/null || true
}

# ── Action: Install ──────────────────────────────────────────────────────────
do_install() {
  log_info "Iniciando instalação do Saturn..."
  fix_docker_config
  check_architecture_and_os
  check_docker
  apply_storage_policy

  log_info "Preparando diretório de instalação: ${BOLD}${INSTALL_DIR}${NC}"
  mkdir -p "${INSTALL_DIR}/data"
  cd "${INSTALL_DIR}"
  create_compose_file

  stop_and_clear_saturn_instances

  log_info "Baixando imagem multi-arch mais recente (${IMAGE})..."
  $SUDO docker compose pull || $SUDO docker pull "${IMAGE}"

  log_info "Iniciando container do Saturn..."
  $SUDO docker compose up -d || $SUDO docker compose up -d --force-recreate

  detect_local_ip
  echo -e "\n${GREEN}${BOLD}======================================================${NC}"
  echo -e "${GREEN}${BOLD}🎉 Parabéns! O Saturn foi instalado com sucesso!${NC}"
  echo -e "${GREEN}${BOLD}======================================================${NC}\n"
  echo -e "  🌐 ${BOLD}Acesse pelo navegador em:${NC}"
  echo -e "     ${CYAN}${BOLD}http://${LOCAL_IP}:5172${NC}\n"
  echo -e "  📁 ${BOLD}Diretório de Dados e Configuração:${NC}"
  echo -e "     ${INSTALL_DIR}\n"
  echo -e "  ⚙️  ${BOLD}Comandos Rápidos:${NC}"
  echo -e "     • Ver logs:       ${YELLOW}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
  echo -e "     • Reiniciar:      ${YELLOW}cd ${INSTALL_DIR} && docker compose restart${NC}"
  echo -e "     • Parar:          ${YELLOW}cd ${INSTALL_DIR} && docker compose down${NC}"
  echo -e "     • Atualizar:      ${YELLOW}curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --update${NC}\n"
  echo -e "${CYAN}======================================================${NC}"
}

# ── Action: Update ───────────────────────────────────────────────────────────
do_update() {
  echo -e "\n${CYAN}${BOLD}======================================================${NC}"
  echo -e "${CYAN}${BOLD}🚀 ATUALIZAÇÃO DO SATURN${NC}"
  echo -e "${CYAN}${BOLD}======================================================${NC}\n"

  log_info "Verificando ambiente e dependências..."
  fix_docker_config
  check_docker

  log_info "Diretório de instalação: ${BOLD}${INSTALL_DIR}${NC}"
  mkdir -p "${INSTALL_DIR}/data"
  cd "${INSTALL_DIR}"
  create_compose_file

  log_info "Baixando imagem multi-arch mais recente (${IMAGE})..."
  $SUDO docker compose pull 2>/dev/null || $SUDO docker pull "${IMAGE}"

  stop_and_clear_saturn_instances

  log_info "Reiniciando serviço Saturn na nova versão..."
  $SUDO docker compose up -d || $SUDO docker compose up -d --force-recreate

  log_info "Limpando imagens antigas e dangling..."
  $SUDO docker image prune -f 2>/dev/null || true

  detect_local_ip
  echo -e "\n${GREEN}${BOLD}======================================================${NC}"
  echo -e "${GREEN}${BOLD}✅ O Saturn foi atualizado com sucesso!${NC}"
  echo -e "${GREEN}${BOLD}======================================================${NC}\n"
  echo -e "  🌐 ${BOLD}Acesse pelo navegador em:${NC}"
  echo -e "     ${CYAN}${BOLD}http://${LOCAL_IP}:5172${NC}\n"
  echo -e "  🔒 ${BOLD}Seus dados, senhas e containers foram 100% preservados.${NC}\n"
  echo -e "${CYAN}======================================================${NC}"
}

# ── Action: Uninstall ────────────────────────────────────────────────────────
do_uninstall() {
  local keep_apps="${KEEP_APPS:-}"
  local keep_data="${KEEP_DATA:-}"

  echo -e "\n${RED}${BOLD}======================================================${NC}"
  echo -e "${RED}${BOLD}🗑️  DESINSTALAÇÃO DO SATURN${NC}"
  echo -e "${RED}${BOLD}======================================================${NC}\n"

  if [ "$ASSUME_YES" = false ] && [ -c /dev/tty ]; then
    local confirm
    confirm="$(read_tty "Tem certeza de que deseja desinstalar o Saturn? [s/N]: " "n")"
    if [[ ! "$confirm" =~ ^[sSyY]$ ]]; then
      log_info "Desinstalação cancelada pelo usuário."
      exit 0
    fi

    if [ -z "$keep_apps" ]; then
      echo ""
      echo -e "${BOLD}O que deseja fazer com os aplicativos e containers gerenciados pelo Saturn?${NC}"
      echo -e "  1) ${GREEN}${BOLD}Manter todos os containers instalados${NC} (Recomendado — Pi-hole, Plex, Jellyfin, etc. continuam rodando)"
      echo -e "  2) ${RED}${BOLD}Remover todos os containers instalados via Saturn${NC} (Para e remove apps da App Store)"
      local opt_apps
      opt_apps="$(read_tty "Escolha uma opção [1/2, padrão 1]: " "1")"
      if [ "$opt_apps" = "2" ]; then
        keep_apps=false
      else
        keep_apps=true
      fi
    fi

    if [ -z "$keep_data" ]; then
      echo ""
      echo -e "${BOLD}O que deseja fazer com os dados e senhas do Saturn (volume 'saturn_data')?${NC}"
      echo -e "  1) ${GREEN}${BOLD}Manter dados e senhas${NC} (Permite restaurar tudo ao reinstalar no futuro)"
      echo -e "  2) ${RED}${BOLD}Excluir completamente todos os dados do Saturn${NC}"
      local opt_data
      opt_data="$(read_tty "Escolha uma opção [1/2, padrão 1]: " "1")"
      if [ "$opt_data" = "2" ]; then
        keep_data=false
      else
        keep_data=true
      fi
    fi
  else
    # Non-interactive defaults if flags not passed
    keep_apps="${keep_apps:-true}"
    keep_data="${keep_data:-true}"
  fi

  log_info "Parando e removendo o contêiner do Saturn..."
  if [ -d "${INSTALL_DIR}" ] && [ -f "${INSTALL_DIR}/docker-compose.yml" ]; then
    (cd "${INSTALL_DIR}" && $SUDO docker compose down 2>/dev/null || true)
  fi

  stop_and_clear_saturn_instances

  # Handle associated app containers
  if [ "$keep_apps" = false ]; then
    log_warn "Removendo contêineres e aplicativos instalados via Saturn App Store..."
    if [ -d "${INSTALL_DIR}/data/apps" ]; then
      for app_compose in "${INSTALL_DIR}/data/apps"/*/docker-compose.yml; do
        if [ -f "$app_compose" ]; then
          app_dir="$(dirname "$app_compose")"
          log_info "Parando aplicativo: $(basename "$app_dir")"
          (cd "$app_dir" && $SUDO docker compose down -v 2>/dev/null || true)
        fi
      done
    fi
    log_success "Contêineres associados foram parados e removidos."
  else
    log_success "Contêineres associados foram mantidos em execução intactos."
  fi

  # Handle configuration & data volume
  if [ "$keep_data" = false ]; then
    log_warn "Removendo volumes de dados e arquivos de configuração..."
    $SUDO docker volume rm saturn_data saturn_old_data 2>/dev/null || true
    $SUDO rm -rf "${INSTALL_DIR}"
    log_success "Volume e diretório ${INSTALL_DIR} removidos com sucesso."
  else
    log_success "Volumes de dados ('saturn_data') e diretório ${INSTALL_DIR} foram preservados."
  fi

  log_info "Removendo imagens locais do Saturn..."
  $SUDO docker rmi "${IMAGE}" "victorandre280/saturn:latest" 2>/dev/null || true

  echo -e "\n${GREEN}${BOLD}======================================================${NC}"
  echo -e "${GREEN}${BOLD}✅ O Saturn foi desinstalado com sucesso!${NC}"
  echo -e "${GREEN}${BOLD}======================================================${NC}\n"
}

# ── Help / Usage ─────────────────────────────────────────────────────────────
show_help() {
  echo -e "${BOLD}Saturn — Script de Gerenciamento Unificado${NC}"
  echo -e "Uso: ./install.sh [OPÇÕES]\n"
  echo -e "Opções:"
  echo -e "  ${CYAN}--install${NC}         Instala o Saturn (padrão se não estiver instalado)"
  echo -e "  ${CYAN}-u, --update${NC}      Atualiza o Saturn para a versão mais recente preservando dados"
  echo -e "  ${CYAN}-d, --uninstall${NC}   Desinstala o Saturn"
  echo -e "  ${CYAN}--keep-apps${NC}       Mantém outros contêineres e aplicativos da App Store rodando (padrão)"
  echo -e "  ${CYAN}--purge-apps${NC}      Para e remove todos os aplicativos instalados via Saturn"
  echo -e "  ${CYAN}--keep-data${NC}       Mantém o volume de dados ('saturn_data') e senhas (padrão)"
  echo -e "  ${CYAN}--purge-data${NC}      Exclui permanentemente o volume 'saturn_data' e pasta de instalação"
  echo -e "  ${CYAN}-y, --yes${NC}         Assume 'sim' para todas as confirmações não interativas"
  echo -e "  ${CYAN}-h, --help${NC}        Exibe esta mensagem de ajuda\n"
  echo -e "Exemplos:"
  echo -e "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash"
  echo -e "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --update"
  echo -e "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --uninstall --purge-data"
}

# ── Parse CLI Arguments ──────────────────────────────────────────────────────
ACTION=""
ASSUME_YES=false
KEEP_APPS=""
KEEP_DATA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)
      ACTION="install"
      shift
      ;;
    -u|--update)
      ACTION="update"
      shift
      ;;
    -d|--uninstall)
      ACTION="uninstall"
      shift
      ;;
    --keep-apps)
      KEEP_APPS=true
      shift
      ;;
    --purge-apps)
      KEEP_APPS=false
      shift
      ;;
    --keep-data)
      KEEP_DATA=true
      shift
      ;;
    --purge-data)
      KEEP_DATA=false
      shift
      ;;
    -y|--yes)
      ASSUME_YES=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      log_warn "Opção desconhecida: $1"
      shift
      ;;
  esac
done

# ── Main Entrypoint ──────────────────────────────────────────────────────────
clear 2>/dev/null || true
echo -e "${CYAN}${BOLD}"
cat << "EOF"
   _____       _                     
  / ____|     | |                    
 | (___   __ _| |_ _   _ _ __ _ __   
  \___ \ / _` | __| | | | '__| '_ \  
  ____) | (_| | |_| |_| | |  | | | | 
 |_____/ \__,_|\__|\__,_|_|  |_| |_| 
EOF
echo -e "${NC}${BOLD}Saturn — Zero-Config Homelab & Docker Manager${NC}"
echo -e "${CYAN}======================================================${NC}\n"

# If an explicit action was requested via flag, run it directly
if [ -n "$ACTION" ]; then
  case "$ACTION" in
    install)   do_install ;;
    update)    do_update ;;
    uninstall) do_uninstall ;;
  esac
  exit 0
fi

# If Saturn is already installed and interactive TTY is available, display menu
if is_saturn_installed && [ "$ASSUME_YES" = false ] && [ -c /dev/tty ]; then
  echo -e "${YELLOW}ℹ️  O Saturn já está instalado neste sistema (${INSTALL_DIR}).${NC}\n"
  echo -e "${BOLD}O que você deseja fazer?${NC}"
  echo -e "  1) ${CYAN}${BOLD}Atualizar o Saturn${NC} (Recomendado — baixa versão mais recente)"
  echo -e "  2) ${GREEN}${BOLD}Reinstalar / Reparar${NC} (Recria containers e valida portas)"
  echo -e "  3) ${RED}${BOLD}Desinstalar o Saturn${NC}"
  echo -e "  4) ${BOLD}Sair${NC}"
  
  choice="$(read_tty "Escolha uma opção [1-4, padrão 1]: " "1")"
  case "$choice" in
    1) do_update ;;
    2) do_install ;;
    3) do_uninstall ;;
    4|*) log_info "Operação finalizada."; exit 0 ;;
  esac
else
  # Default: Fresh install
  do_install
fi

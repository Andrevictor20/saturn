<div align="center">

<img src="docs/images/saturn-logo.svg" width="96" height="96" alt="Saturn Logo" />

# Saturn

Painel de gerenciamento leve para contêineres Docker e telemetria de hosts Linux.  
Desenvolvido em Rust (Axum, Tokio) e React 19 em contêiner único compilado para servidores dedicados, VPS e dispositivos ARM64.

[![CI Pipeline](https://github.com/Andrevictor20/saturn/actions/workflows/ci.yml/badge.svg)](https://github.com/Andrevictor20/saturn/actions/workflows/ci.yml)
[![Docker Multi-Arch](https://img.shields.io/badge/GHCR-Multi--Arch%20(amd64%20%7C%20arm64)-blue?logo=docker)](https://github.com/Andrevictor20/saturn/pkgs/container/saturn)
[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-victorandre280%2Fsaturn-2496ED?logo=docker)](https://hub.docker.com/r/victorandre280/saturn)
[![Backend](https://img.shields.io/badge/Backend-Rust%20%2B%20Axum%200.8-orange?logo=rust)](https://www.rust-lang.org/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Style-Tailwind%20CSS%20v4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/>

[Início Rápido](#inicio-rapido) •
[Especificações Técnicas](#especificacoes-tecnicas) •
[Capacidades do Sistema](#capacidades-do-sistema) •
[Demonstração](#demonstracao) •
[Documentação Técnica](#documentacao-tecnica) •
[Licença](#licenca)

</div>

---

## Visão Geral

O Saturn é uma plataforma de gerenciamento e observabilidade para infraestrutura baseada em Docker e Linux. O sistema substitui painéis pesados de administração por uma arquitetura enxuta em Rust, operando com consumo inferior a 25 MB de RAM em repouso. O backend em Axum comunica-se diretamente com o Docker Engine via Unix Domain Socket e com o kernel Linux através de interfaces de pseudo-arquivos (`/proc` e `/sys`), transmitindo métricas para a interface React via conexões persistentes WebSocket.

---

## Especificações Técnicas

| Parâmetro | Especificação |
| :--- | :--- |
| **Arquiteturas Alvo** | `linux/amd64` (x86_64) e `linux/arm64` (aarch64, ex.: Raspberry Pi 4/5) |
| **Consumo de Memória (Idle)** | Entre 15 MB e 25 MB RSS |
| **Porta Padrão** | `5172/tcp` (HTTP REST e WebSocket) |
| **Comunicação com Host** | Unix Domain Socket (`/var/run/docker.sock`) e pseudo-arquivos (`/host/proc`, `/host/sys`) |
| **Taxa de Amostragem** | Ciclos periódicos de 1000ms com buffer circular em memória (`VecDeque`) |
| **Criptografia & Autenticação** | Hashing de credenciais via Argon2id e sessões JWT assinadas por segredo CSPRNG de 64 bytes |
| **Concorrência de Arquivos** | Validação de pré-condição HTTP ETag / `If-Match` (RFC 7232) e escrita atômica |
| **Streaming de Mídia** | Resposta HTTP 206 Partial Content (RFC 7233) com cache de miniaturas SHA-256 |

---

## Início Rápido

### Método 1: Implantação Declarativa (Docker Compose)

Crie um arquivo `docker-compose.yml`:

```yaml
services:
  saturn:
    image: ghcr.io/andrevictor20/saturn:latest
    container_name: saturn
    restart: unless-stopped
    privileged: true
    pid: host
    network_mode: bridge
    ports:
      - "5172:5172"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - saturn_data:/app/data
      - /:/host:rslave
      - /mnt:/mnt:rslave
      - /media:/media:rslave
    environment:
      - RUST_LOG=info
      - SSH_HOST=host.docker.internal
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  saturn_data:
```

Inicie o serviço:

```bash
docker compose up -d
```

### Método 2: Execução Direta via Docker CLI

```bash
docker run -d \
  --name saturn \
  --restart unless-stopped \
  --privileged \
  --pid host \
  --add-host host.docker.internal:host-gateway \
  -p 5172:5172 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v saturn_data:/app/data \
  -v /:/host:rslave \
  -v /mnt:/mnt:rslave \
  -v /media:/media:rslave \
  -e RUST_LOG=info \
  -e SSH_HOST=host.docker.internal \
  ghcr.io/andrevictor20/saturn:latest
```

### Método 3: Instalador Automatizado (Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/Andrevictor20/saturn/main/install.sh | bash
```

Após iniciar o container, acesse a interface em `http://<ip-do-servidor>:5172` e conclua a criação da credencial administrativa no assistente inicial (`/setup`).

Consulte [docs/INSTALLATION.md](docs/INSTALLATION.md) para configurações com systemd, compilação a partir do código-fonte e proxies reversos (Nginx, Caddy, Traefik).

---

## Capacidades do Sistema

### Telemetria e Monitoramento de Recursos
- **Amostragem em Tempo Real:** Coleta contínua de métricas de processador, memória física, swap, I/O de disco e tráfego de interfaces de rede ativas a cada 1000ms.
- **Histórico Imediato:** Buffer circular em memória no backend que provê dados temporais imediatos a novos clientes web sem aguardar ciclos de agregação.
- **Cálculo Resiliente de Memória:** Implementação alinhada ao cálculo canônico da Docker CLI (`calculateMemUsageUnixNoCache`), com fallback automático para soma de RSS via `/proc/<pid>/statm` quando a contabilidade de cgroups estiver desativada no kernel do host.

### Orquestração de Contêineres e Stacks Compose
- **Ciclo de Vida de Contêineres:** Controle operacional (iniciar, parar, reiniciar, pausar, remover) com streaming assíncrono de logs via WebSocket.
- **Priorização Determinística de Portas:** Algoritmo que inspeciona ligações de portas IPv4/IPv6, portas padrão em `network_mode: host` e serviços web conhecidos para gerar links de acesso diretos.
- **Pull Concorrente e Otimizado:** Rotina de atualização com injeção de parâmetros de concorrência (`DOCKER_BUILDKIT=1`, `COMPOSE_PARALLEL_LIMIT=8`) e identificação direta da arquitetura nativa do host (`platform: get_host_platform()`).

### Catálogo de Aplicações (App Store Desacoplada)
- **Estrutura Baseada em Manifestos:** Mais de 920 aplicações prontas para implantação com validação estrita de arquitetura (`amd64` / `arm64`) antes da execução do download.
- **Operação Desconectada e Cache:** Consulta a índices pré-compilados via CDN com persistência local em `/app/data/cached_apps.json` para operação sob falha de conectividade externa.
- **Fontes Customizadas:** Suporte a repositórios comunitários adicionais configurados via `/app/data/stores.json`. Consulte [docs/APP_STORE.md](docs/APP_STORE.md).

### Gerenciador de Arquivos e Concorrência Otimista (OCC)
- **Concorrência Otimista via RFC 7232:** Controle de versão no editor de arquivos através do cabeçalho `ETag` (carimbo temporal em nanossegundos e tamanho em bytes). Rejeição com HTTP `412 Precondition Failed` em caso de concorrência de escrita, exibindo interface de resolução de conflitos (recarregar, sobrescrever ou salvar cópia).
- **Streaming Parcial (RFC 7233):** Atendimento a requisições de faixa de bytes (`Range: bytes=start-end`) para reprodução instantânea de mídias e legendas WebVTT.
- **Cache de Miniaturas:** Geração assíncrona de prévias gráficas com indexação por hash SHA-256 persistida em disco.

### Terminal Web e Console Host
- **Emulação de Terminal PTY:** Sessões interativas conectadas diretamente ao shell do host (`/bin/bash` ou `/bin/sh`) ou de contêineres através de `portable-pty` e `@xterm/xterm` sobre WebSocket.
- **Proxy SSH Integrado:** Túnel para conexão com outros servidores da rede local ou remotos.

### Sincronização de Rotas e Túneis Cloudflare
- **Mapeamento Port-First:** Associação determinística de domínios públicos a contêineres locais validando a existência da porta exposta antes da criação do túnel.
- **Port Conflict Guard:** Prevenção de colisões de rotas e alertas em caso de serviços duplicados ou portas inacessíveis.

### Backups de Estado e Restauração
- **Snapshots Atômicos:** Empacotamento de configurações, manifests Compose, metadados de integrações (`cloudflare.json`, `homeassistant.json`, `pihole.json`) e banco SQLite em arquivos `.tar.gz`.
- **Restauração em Quente:** Descompactação e invalidação imediata de caches de memória com recriação de contêineres sem necessidade de reiniciar o processo principal.

### Integrações Homelab
- **Home Assistant:** Agrupamento estruturado de dispositivos por áreas físicas com proxy reverso autenticado para tokens de longa duração.
- **Pi-hole:** Monitoramento de consultas DNS bloqueadas e controle de ativação de filtragem via API nativa.

---

## Demonstração

### Visão Geral & Telemetria em Tempo Real
Acompanhamento contínuo de métricas de CPU, memória, interfaces de rede, temperatura e armazenamento:
![Saturn Overview](./docs/videos/overview.webp)

### Gerenciamento de Contêineres e Stacks Compose
Controle operacional e edição de definições declarativas:
![Saturn Containers](./docs/videos/containers.webp)

### Catálogo de Aplicações
Catálogo de aplicações com filtragem por arquitetura de hardware:
![Saturn App Store](./docs/videos/appstore.webp)

<details>
<summary><b>Capturas de Tela Adicionais (Métricas, Terminal, Disco, Temas e Integrações)</b></summary>
<br/>

| Módulo | Amostra |
| :--- | :--- |
| **Histórico Contínuo de Métricas** | ![Metrics](./docs/images/metrics.png) |
| **Analisador de Armazenamento em Disco** | ![Disk Analyzer](./docs/images/disk_analyzer.png) |
| **Central de Logs com Busca Instantânea** | ![Logs](./docs/images/logs.png) |
| **Terminal Web Integrado (PTY Nativo)** | ![Terminal](./docs/images/terminal.png) |
| **Autenticação Criptografada (Argon2id)** | ![Login](./docs/images/login.png) |
| **Gerenciador de Arquivos com Prévias Inline** | ![File Manager](./docs/images/file_manager.png) |
| **Transição de Temas e Cores Adaptativas** | ![Themes](./docs/videos/themes.webp) |
| **Integração com Home Assistant** | ![Home Assistant](./docs/images/home_assistant.png) |

</details>

---

## Segurança e DevSecOps

O desenvolvimento do Saturn segue os princípios de **Security by Design** e **Menor Privilégio**:
- **Hashing de Senhas:** Implementação com Argon2id resistente a ataques baseados em aceleração por GPU/ASIC.
- **Proteção de Processos Críticos:** O endpoint `kill_process` bloqueia tentativas de interrupção direcionadas ao PID do Saturn, PID 1 (`init`/`systemd`) e daemons essenciais (`dockerd`, `sshd`, `containerd`).
- **Política de CORS Dinâmico:** Restrição de chamadas de API a origens locais (loopback, faixas privadas RFC 1918 e redes de túnel confiáveis).
- **Proteção de Cabeçalhos:** Injeção estrita de `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e `Strict-Transport-Security`.

Consulte [docs/SECURITY.md](docs/SECURITY.md) para o modelo de ameaças completo (STRIDE) e políticas de reporte de vulnerabilidades.

---

## Documentação Técnica

| Documento | Escopo |
| :--- | :--- |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Métodos de instalação, compose, systemd, proxies reversos (Nginx, Caddy, Traefik) e compilação do código-fonte. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura interna do daemon Rust, runtime Tokio, comunicação por sockets e design do frontend React 19. |
| [docs/APP_STORE.md](docs/APP_STORE.md) | Especificação de manifestos `saturn-app.yml`, empacotamento Compose e submissão de novos aplicativos. |
| [docs/SECURITY.md](docs/SECURITY.md) | Modelo de ameaças (STRIDE), governança criptográfica, controle de acesso e auditoria DevSecOps. |
| [docs/TESTING.md](docs/TESTING.md) | Estratégia de testes (Unitários, Integração em Axum, E2E com Playwright, DAST com OWASP ZAP e carga com k6). |

---

## Contribuições

Para contribuir com o desenvolvimento do Saturn ou com o catálogo de aplicações:
1. Faça um Fork do repositório no GitHub.
2. Crie uma branch para sua alteração (`git checkout -b feat/nome-da-funcionalidade`).
3. Siga a política de testes e verificação estática antes de submeter commits (`cargo test`, `npm test`, `npm run lint`).
4. Abra um Pull Request com a descrição técnica e justificativa das mudanças.

---

## Licença

Distribuído sob os termos da licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais informações.

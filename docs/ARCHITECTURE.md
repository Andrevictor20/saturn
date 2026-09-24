# Arquitetura do Sistema - Saturn

Este documento descreve a arquitetura interna, o modelo de concorrência, a organização de diretórios e os padrões de engenharia adotados no Saturn.

---

## 1. Visão Geral da Arquitetura

O Saturn é estruturado segundo uma arquitetura de cliente-servidor em camadas com acoplamento fraco:

- **Frontend SPA (Single Page Application):** Interface web desenvolvida em React 19 e TypeScript com Tailwind CSS v4, consumindo dados via chamadas REST HTTP/1.1 e fluxos contínuos via WebSockets.
- **Backend Daemon (API & Serviços de Fundo):** Servidor assíncrono em Rust baseado no framework Axum e runtime Tokio, comunicando-se diretamente com o Docker Engine via Unix Domain Socket (`/var/run/docker.sock`) e com o kernel Linux através de pseudo-sistemas de arquivos (`/proc` e `/sys`).
- **Camada de Persistência:** Armazenamento local leve baseado em arquivos JSON e SQLite hospedados em volume dedicado (`/app/data`), sem dependência de instâncias externas de banco de dados.

```mermaid
graph TD
    User["Cliente / Navegador Web (SPA)"]
    
    subgraph Frontend ["Camada Frontend (React 19 + TypeScript + Vite)"]
        UI["Componentes de Apresentação (Tailwind CSS v4 + Lucide)"]
        State["Contextos Globais (Auth, Confirm, Stats, Theme, BatchUpdate, Install)"]
        WSClient["Cliente WebSocket Reativo"]
    end
    
    subgraph Backend ["Camada Backend (Rust + Axum + Tokio)"]
        Router["Roteador Axum HTTP & Middlewares de Segurança"]
        AuthModule["Módulo Auth (Argon2id + JWT + Rate Limit)"]
        DockerModule["Módulo Docker (Bollard Async + Update Runner)"]
        SystemModule["Módulo de Sistema (Telemetria, Rotas, Processos)"]
        FilesModule["Módulo Files (HTTP 206 + ETag OCC RFC 7232)"]
        CloudflareModule["Módulo Cloudflare (Túneis & Port-First)"]
        HAModule["Módulo Home Assistant (Proxy Reverso Autenticado)"]
        StoreModule["Módulo App Store (Catálogo Compose + Cache)"]
        WSBroadcaster["Broadcaster WebSocket (Ring Buffer de Métricas)"]
        Storage["Persistência Local (SQLite / JSON em /app/data)"]
    end
    
    subgraph HostLinux ["Host Operacional & Docker Daemon"]
        DockerSocket["/var/run/docker.sock"]
        ProcFS["Kernel Linux (/host/proc, /host/sys)"]
        ContainerEng["Containers em Execução"]
    end

    User <-->|HTTP REST / Cookies / Bearer| UI
    User <-->|WebSocket Bidirecional| WSClient
    UI --> State
    State <--> Router
    WSClient <--> WSBroadcaster
    
    Router --> AuthModule
    Router --> DockerModule
    Router --> SystemModule
    Router --> FilesModule
    Router --> CloudflareModule
    Router --> HAModule
    Router --> StoreModule
    AuthModule --> Storage
    StoreModule --> Storage
    
    DockerModule <--> DockerSocket
    SystemModule <--> ProcFS
    WSBroadcaster <--> ProcFS
    DockerSocket <--> ContainerEng
```

---

## 2. Stack Tecnológica

### Backend (Rust)
| Componente | Crate / Biblioteca | Função Arquitetural |
| :--- | :--- | :--- |
| **Framework Web** | `axum` (v0.8) | Roteamento HTTP modular, injeção de estado via `State` e middlewares |
| **Runtime Assíncrono** | `tokio` (v1) | Execução concorrente não-bloqueante baseada em threads de trabalho configuradas |
| **Alocador Global** | `mimalloc` | Alocação de memória de baixa fragmentação com devolução imediata de páginas via `madvise` |
| **Comunicação Docker** | `bollard` | Driver assíncrono para a Docker Engine API sobre Unix Domain Sockets |
| **Telemetria de Sistema**| `sysinfo` | Monitoramento de processadores, memória física, swap e processos do SO |
| **Criptografia & Sessão** | `argon2`, `jsonwebtoken`, `rand` | Hashing resistente de credenciais e geração de tokens JWT assinados via CSPRNG de 64 bytes |
| **Comunicação em Tempo Real** | `tokio-tungstenite` | Servidor WebSocket com difusão de eventos de telemetria e PTY |
| **Pseudo-Terminal** | `portable-pty` | Alocação e controle de sessões interativas de shell no host e em containers |

### Frontend (React & TypeScript)
| Componente | Tecnologia | Função Arquitetural |
| :--- | :--- | :--- |
| **Linguagem & Tipagem** | TypeScript (`verbatimModuleSyntax: true`) | Verificação estática rigorosa de tipos sem emissão de código invisível em runtime |
| **Biblioteca de UI** | React 19 | Renderização reativa declarativa com memoização (`React.memo`, `useMemo`) |
| **Ferramenta de Build** | Vite 8 | Compilação otimizada para produção e servidor de desenvolvimento com HMR |
| **Estilização** | Tailwind CSS v4 | Estilização por tokens utilitários com suporte estrito a classes dark (`@custom-variant dark`) |
| **Cache Assíncrono** | TanStack Query v5 | Sincronização e invalidação de estado do servidor |
| **Gráficos** | Recharts | Renderização de gráficos de área e séries temporais com dados de buffers contínuos |
| **Terminal Web** | `@xterm/xterm` | Emulação compatível com VT100/ANSI conectada via WebSocket |
| **Internacionalização** | `i18next` + `react-i18next` | Suporte nativo e verificado a múltiplos idiomas (`pt` e `en`) |

---

## 3. Módulos do Backend e Padrões de Implementação

### 3.1 Módulo Docker (`backend/src/docker/`)
Para cumprir a diretriz de coesão estrutural (< 500 linhas por arquivo), o subsistema Docker foi particionado em submódulos especializados:

- **`containers.rs`:** Endpoints REST de controle de ciclo de vida (start, stop, restart, pause, kill) e listagem consolidada de instâncias.
- **`port_prioritization.rs`:** Algoritmo determinístico para descoberta e pontuação de portas web. Avalia mapeamentos IPv4/IPv6, portas padrão em `network_mode: host` e portas bem conhecidas (80, 443, 8080, 8123, 3000), sintetizando a URL principal de acesso do container.
- **`stats.rs`:** Coleta e cálculo estatístico de CPU, memória, I/O de rede e disco dos containers.
  - *Cálculo de Memória Resiliente:* Aplica o algoritmo canônico da Docker CLI (`calculateMemUsageUnixNoCache`), subtraindo apenas páginas de cache inativas (`inactive_file`).
  - *Fallback para Ambientes Homelab:* Caso o kernel da distribuição (ex.: Raspberry Pi OS ou container LXC) não possua contabilidade de memória em cgroups ativada (`cgroup_enable=memory`), consulta os processos do container via `docker.top_processes` e calcula o somatório do Resident Set Size (RSS) das tabelas `/proc/<pid>/statm`.
- **`updates.rs`:** Inspeção paralela de imagens em registros remotos (Docker Hub, GHCR, Quay, registries privados) utilizando streams concorrentes com limite de janelas (`buffer_unordered`), reduzindo o tempo de consulta de dezenas de containers.
- **`update_runner.rs`:** Motor assíncrono de atualização. Executa pulls e builds em segundo plano via tarefas `tokio::spawn`, transmitindo o progresso de download linha a linha com sanitização de códigos ANSI e suporte a cancelamento sob demanda via `CancellationToken`.

### 3.2 Módulo de Sistema (`backend/src/system/`)
- **`network.rs`:** Identificação determinística da interface primária de internet do host lendo a tabela de rotas do kernel em `/host/proc/1/net/route` (ou `/proc/1/net/route`), selecionando a rota padrão (destino `00000000`) com a menor métrica e descartando adaptadores virtuais (`docker0`, `veth*`, `tailscale*`, `br-*`). Extrai contadores de bytes transmitidos/recebidos via `/host/proc/1/net/dev`.
- **`processes.rs`:** Monitor de processos com suporte a leitura em `/host/proc`. Agrupa threads do kernel (`kthreadd`), calcula utilização delta de CPU e impõe bloqueios contra terminação (`kill_process`) direcionada ao PID do Saturn, PID 1 e daemons de infraestrutura do sistema.
- **`disks.rs`:** Varredura e classificação de pontos de montagem, identificando dispositivos físicos (NVMe, SSD SATA, cartões microSD, unidades USB) e volumes de armazenamento.

### 3.3 Módulo de Arquivos e Concorrência Otimista (`backend/src/files/`)
- **Concorrência Otimista (RFC 7232):** O endpoint `GET /api/files/content` retorna cabeçalho `ETag` baseado em `mtime_nanos` e tamanho do arquivo. O endpoint `PUT /api/files/content` valida `If-Match` ou campo `etag`, rejeitando modificações concorrentes com HTTP `412 Precondition Failed` e garantindo escrita atômica via arquivo temporário seguido de `fs::rename`.
- **Streaming Parcial (RFC 7233):** Atendimento a requisições HTTP 206 para carregamento incremental e seeks imediatos de arquivos de vídeo e legendas.

### 3.4 Módulo de Telemetria e WebSocket (`backend/src/ws/`)
- Implementa um loop centralizado de amostragem periódica (intervalo de 1000ms) que consolida métricas do host e de todos os containers ativos em uma estrutura `SystemStats`.
- Mantém um buffer circular em memória (`VecDeque`) para retenção temporal de métricas de rede, CPU e RAM, permitindo que novos clientes conectados ao painel recebam imediatamente o histórico recente sem aguardar a acumulação de novos ciclos.

### 3.5 Módulos de Integração (Home Assistant, Pi-hole & Cloudflare)
- **Home Assistant:** Proxy reverso autenticado que injeta Long-Lived Access Tokens no backend, eliminando exposição de credenciais e restrições de CORS. Consulta templates dinâmicos para agrupamento por áreas físicas.
- **Pi-hole:** Consulta estatísticas de consultas DNS, taxa de bloqueio e permite comutação operacional de bloqueio via chamadas de API nativa.
- **Cloudflare:** Sincronização de rotas com vinculação orientada a portas (`port-first`), assegurando que subdomínios sejam apontados apenas para serviços com portas ativas no contêiner.

---

## 4. Arquitetura do Frontend

O código-fonte do frontend está localizado em `frontend/src/` e segue uma separação modular por domínios funcionais:

```
frontend/src/
├── components/           # Componentes modulares por domínio funcional
│   ├── docker/           # Gerenciamento de containers e stacks Compose
│   │   └── container-list/# Subcomponentes particionados (Grid, Table, Filters, Actions)
│   ├── files/            # Gerenciador de arquivos, editor CodeMirror e resolução de conflitos
│   ├── homeassistant/    # Visualização e controle unificado de dispositivos do Home Assistant
│   ├── layout/           # Shell de navegação, Sidebar, DashboardLayout e Topbar mobile
│   ├── metrics/          # Gráficos Recharts, MiniSparklines e cartões de telemetria
│   └── ui/               # Primitivas de interface (ConfirmModal, Toast, Badges, Botões)
├── contexts/             # Provedores de estado global (Auth, Confirm, Stats, Theme, BatchUpdate, Install)
├── hooks/                # Hooks customizados reutilizáveis
├── locales/              # Dicionários de tradução tipados para i18n (pt.ts, en.ts)
├── pages/                # Pontos de entrada das rotas (Overview, Containers, Metrics, Store, etc.)
├── queries/              # Custom hooks do TanStack Query para requisições assíncronas
├── types/                # Definições de tipos e interfaces TypeScript
└── utils/                # Utilitários de paleta, formatação e verificação de rotas
```

### Regras de Design e Performance no Frontend
1. **Isolamento de Variantes Escuras:** Uso de `@custom-variant dark (&:where(.dark, .dark *));` em `src/index.css`, garantindo que seletores escuros dependam estritamente da presença da classe CSS `.dark` no elemento raiz, sem contaminação pela media query do sistema operacional do cliente.
2. **Conformidade de Acessibilidade (WCAG AA):** Todas as superfícies de texto em temas claros adotam a paleta semântica two-tier contrast, garantindo relação de contraste mínima de 4.5:1 em badges, painéis e caixas de diálogo.
3. **Ergonomia em Telas Móveis:** Viewports menores que 640px agrupam opções de temas e idiomas no componente `MobilePreferencesDropdown`, mantendo áreas de toque com dimensões mínimas de 36x36px.

---

## 5. Estrutura de Diretórios do Repositório

```
Saturn/
├── backend/                  # Código-fonte do daemon e serviços Rust
│   ├── src/
│   │   ├── auth/             # Autenticação, Argon2id, JWT e rate limiting
│   │   ├── cloudflare/       # Gerenciamento de túneis Cloudflare e mapeamento de rotas
│   │   ├── docker/           # Ciclo de vida de containers, stats e updates assíncronos
│   │   ├── files/            # Gerenciamento de arquivos, HTTP 206 (RFC 7233) e ETag OCC (RFC 7232)
│   │   ├── homeassistant/    # Proxy reverso autenticado para Home Assistant
│   │   ├── pihole/           # Monitoramento e controle da API do Pi-hole
│   │   ├── store/            # Catálogo e orquestração de manifests Compose
│   │   ├── system/           # Detecção de rede, processos do host e discos
│   │   ├── ws/               # Broadcaster WebSocket com buffer circular de telemetria
│   │   ├── errors.rs         # Tratamento e conversão de erros da API
│   │   ├── lib.rs            # Configuração de rotas Axum e middlewares globais
│   │   ├── links.rs          # Gerenciamento de links customizados
│   │   ├── logs.rs           # Streaming e sanitização de logs de contêineres
│   │   ├── main.rs           # Ponto de entrada, inicialização de runtime e bind do socket TCP
│   │   ├── ssh.rs            # Cliente e proxy SSH
│   │   └── state.rs          # Estrutura compartilhada AppState
│   ├── tests/                # Testes de integração de rotas e segurança
│   └── Cargo.toml            # Dependências e perfis de compilação (dev/release)
├── frontend/                 # Aplicação SPA React
│   ├── src/                  # Componentes, contextos, páginas e estilos
│   ├── e2e/                  # Testes funcionais e de regressão visual com Playwright
│   ├── package.json          # Dependências e scripts de build/teste
│   ├── vite.config.ts        # Configuração do empacotador Vite
│   └── vitest.config.ts      # Configuração de harness para testes unitários
├── docs/                     # Documentação técnica e guias de governança
├── scripts/                  # Scripts operacionais e checadores de recursos
├── docker-compose.yml        # Manifesto de implantação em produção
├── Dockerfile                # Build multi-etapa e multi-arquitetura (amd64 / arm64)
└── install.sh                # Script de instalação automatizada em ambiente Linux
```

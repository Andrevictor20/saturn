# Saturn Backend (Daemon & API)

Serviço de retaguarda do Saturn, desenvolvido em Rust assíncrono com o framework Axum 0.8 e runtime Tokio. Responsável pela comunicação com o daemon Docker sobre Unix Domain Socket, telemetria do host Linux via `/proc` e `/sys`, orquestração de Stacks Compose e difusão de métricas via WebSockets.

---

## 1. Stack Tecnológica

| Componente | Crate / Versão | Função Arquitetural |
| :--- | :--- | :--- |
| **Framework HTTP** | `axum` (v0.8) | Roteador modular assíncrono, extração tipada de estado via `State` e middlewares |
| **Runtime Assíncrono** | `tokio` (v1) | Execução orientada a eventos multithread e agendamento de tarefas em segundo plano |
| **Alocador Global** | `mimalloc` | Alocação de memória de alto desempenho e baixa fragmentação em servidores e ARM64 |
| **Comunicação Docker** | `bollard` (v0.21) | Cliente assíncrono para a Docker Engine API via `/var/run/docker.sock` |
| **Telemetria do Host** | `sysinfo` (v0.39) + `/proc` | Monitoramento de uso de CPU, memória física, swap, discos e processos |
| **Criptografia & Sessão** | `argon2`, `jsonwebtoken`, `rand` | Hashing com Argon2id e geração de tokens JWT via CSPRNG de 64 bytes |
| **Terminal Interativo** | `portable-pty` | Criação e controle de pseudo-terminais (PTY) conectados a sessões WebSocket |
| **Compressão & I/O** | `tokio-util`, `tower-http` | Streaming de respostas, compressão gzip/brotli e controle de CORS dinâmico |

---

## 2. Estrutura de Módulos

```
backend/src/
├── auth/                 # Autenticação, Argon2id, emissão e validação de tokens JWT, rate limiting
├── cloudflare/           # Gerenciamento de túneis Cloudflare e mapeamento determinístico de portas
├── docker/               # Submódulos Docker divididos por responsabilidade (< 500 linhas)
│   ├── containers.rs     # Ciclo de vida (start, stop, restart, pause, kill) e listagem
│   ├── port_prioritization.rs # Algoritmo de identificação da porta web primária
│   ├── stats.rs          # Coleta e cálculo estatístico de CPU, memória e I/O de rede
│   ├── updates.rs        # Consulta concorrente de tags e manifests em registros remotos
│   └── update_runner.rs  # Execução assíncrona de docker pull / compose com cancelamento
├── files/                # Gerenciador de arquivos, suporte a HTTP 206 (RFC 7233) e ETag OCC (RFC 7232)
├── homeassistant/        # Proxy reverso autenticado para instâncias do Home Assistant
├── pihole/               # Monitoramento e controle de filtragem DNS via API do Pi-hole
├── store/                # Catálogo de aplicativos, compilação de compose e cache de lojas
├── system/               # Módulos de rede do host, montagem de discos e leitura de `/host/proc`
├── ws/                   # Servidor WebSocket e broadcaster com buffer circular de métricas
├── errors.rs             # Enum consolidado de erros com implementação de `IntoResponse`
├── lib.rs                # Montagem das rotas públicas, protegidas e middlewares da aplicação
├── links.rs              # Gerenciamento de atalhos e links customizados
├── logs.rs               # Coleta e sanitização de logs de containers em tempo real
├── main.rs               # Ponto de entrada, inicialização de tracing, alocador e bind do socket TCP
├── ssh.rs                # Cliente e túnel proxy SSH para conexões externas
└── state.rs              # Estrutura unificada de estado global (`AppState`)
```

---

## 3. Variáveis de Ambiente e Parâmetros Operacionais

| Variável | Valor Padrão | Descrição |
| :--- | :--- | :--- |
| `PORT` | `5172` | Porta TCP para escuta de requisições HTTP e conexões WebSocket |
| `RUST_LOG` | `info` | Nível de detalhamento do coletor de logs (`trace`, `debug`, `info`, `warn`, `error`) |
| `SSH_HOST` | `host.docker.internal` | Endereço do host operacional para o terminal web e conexões SSH |
| `DATA_DIR` | `/app/data` (ou `./data`) | Diretório persistente para chaves JWT, banco SQLite e cache do catálogo |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Caminho do Unix Domain Socket da Docker Engine API |

---

## 4. Comandos de Compilação e Testes

### Execução em Modo de Desenvolvimento
```bash
cargo run
# Inicia o daemon com recarregamento incremental em http://localhost:5172
```

### Compilação Otimizada para Produção
```bash
cargo build --release
# Gera o binário nativo em target/release/backend com LTO e codegen-units=1
```

### Verificação Estática Rápida (Typecheck)
```bash
cargo check --tests --workspace
```

### Execução da Suíte de Testes
```bash
# Executa testes unitários de biblioteca
cargo test --lib

# Executa testes de integração com harness HTTP Axum-Test
cargo test --test backups_tests
cargo test --test customization_tests
cargo test --test etag_tests
```

### Auditoria de Dependências (SAST)
```bash
cargo audit --ignore RUSTSEC-2023-0071
```

---

## 5. Testes de Carga e Estresse (k6)

O diretório `load-tests/` contém cenários de teste automatizados com o Grafana k6:

### Teste de Fumaça (Smoke Test)
Valida a disponibilidade imediata dos endpoints críticos sob concorrência mínima:
```bash
k6 run load-tests/smoke_test.js
```

### Teste de Carga Real (Load Test)
Simula múltiplos clientes simultâneos consumindo endpoints de telemetria e listagem:
```bash
k6 run load-tests/load_test.js
```

### Teste contra Ambiente Remoto ou Staging
```bash
k6 run -e BASE_URL=http://<ip-do-servidor>:5172 load-tests/smoke_test.js
```

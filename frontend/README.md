# Saturn Frontend (SPA)

Single Page Application (SPA) do Saturn Dashboard, construída em React 19, TypeScript e Tailwind CSS v4, consumindo a API REST do daemon Axum e canais de streaming WebSocket.

---

## 1. Stack Tecnológica

| Componente | Versão / Biblioteca | Função Arquitetural |
| :--- | :--- | :--- |
| **Framework Base** | React 19 (`react`, `react-dom`) | Renderização de interface reativa e gerenciamento de estado |
| **Tipagem Estática** | TypeScript 6 (`verbatimModuleSyntax: true`) | Verificação rigorosa em tempo de compilação sem emissão de código invisível |
| **Build & Bundler** | Vite 8 (`@vitejs/plugin-react`) | Empacotamento para produção e servidor de desenvolvimento com HMR |
| **Estilização** | Tailwind CSS v4 (`@tailwindcss/vite`) | Sistema de design utility-first com isolamento de modo escuro |
| **Gerenciamento de Cache** | TanStack Query v5 (`@tanstack/react-query`) | Sincronização assíncrona com a API REST, invalidação e prefetching |
| **Internacionalização** | i18next & react-i18next | Suporte multi-idioma (Português, Inglês e adicionais) |
| **Gráficos & Séries** | Recharts | Renderização de telemetria histórica de CPU, RAM, rede e temperatura |
| **Terminal Web** | `@xterm/xterm` + addon-fit | Emulação VT100/ANSI bidirecional via WebSocket |
| **Editor de Código** | CodeMirror (`@uiw/react-codemirror`) | Edição de arquivos Compose e YAML com suporte a syntax highlighting |
| **Testes Unitários** | Vitest 4 + React Testing Library | Harness de testes em ambiente JSDOM com workers limitados |
| **Testes E2E / Visuais** | Playwright | Validação de ponta a ponta e regressão visual com snapshots |
| **Linter** | Oxlint | Análise estática ultrarrápida baseada em Rust |

---

## 2. Estrutura de Diretórios

```
frontend/src/
├── components/           # Componentes modulares por domínio funcional
│   ├── docker/           # Grids de containers, modais de compose e controle de ciclo de vida
│   │   └── container-list/# Subcomponentes particionados (< 500 linhas)
│   ├── files/            # Gerenciador de arquivos, editor CodeMirror e resolução de conflitos
│   ├── homeassistant/    # Visualização e controle de entidades do Home Assistant
│   ├── layout/           # Sidebar, DashboardLayout, Topbar e preferências móveis
│   ├── metrics/          # Cards de telemetria, sparklines e gráficos Recharts
│   └── ui/               # Primitivas de interface (ConfirmModal, Toast, Badges, Botões)
├── contexts/             # Provedores de estado global
│   ├── AuthContext.tsx   # Estado da sessão JWT, usuário e permissões administrativas
│   ├── ConfirmContext.tsx# Diálogos modais assíncronos baseados em Promises (`useConfirm`)
│   ├── StatsContext.tsx  # Buffer de telemetria recebido continuamente via WebSocket
│   ├── ThemeContext.tsx  # Gerenciamento de modo escuro/claro, paletas e wallpapers
│   ├── BatchUpdateContext.tsx # Fila assíncrona de atualização de containers
│   └── InstallContext.tsx# Fila de instalação de apps da loja
├── hooks/                # Hooks customizados reutilizáveis
├── locales/              # Dicionários de tradução tipados (`pt.ts`, `en.ts`)
├── pages/                # Componentes roteados (Overview, Containers, Metrics, Store, etc.)
├── queries/              # Custom hooks do TanStack Query para comunicação REST
├── types/                # Definições de tipos e interfaces TypeScript
└── utils/                # Utilitários puros (paletas cromáticas, formatação, validação de rotas)
```

---

## 3. Diretrizes de Engenharia e Design System

1. **Isolamento Estrito do Modo Escuro:**
   - Em `src/index.css`, a variante escura é vinculada estritamente à presença da classe `.dark` no elemento raiz (`@custom-variant dark (&:where(.dark, .dark *));`), prevenindo interferência da media query `prefers-color-scheme` do sistema operacional quando o usuário definir explicitamente um tema.
2. **Conformidade de Acessibilidade (WCAG AA):**
   - Relação mínima de contraste de 4.5:1 para elementos textuais em todos os temas.
   - Navegação completa por teclado (`Tab`, `Escape` para fechar modais) e áreas de toque com dimensões mínimas de 36x36px para visualização móvel.
3. **Concorrência Otimista (RFC 7232 ETag):**
   - O editor de arquivos (`TextEditorModal.tsx`) armazena o cabeçalho `ETag` retornado na leitura. Ao salvar, envia a pré-condição `If-Match`. Caso receba HTTP `412 Precondition Failed`, abre automaticamente o `FileConflictModal.tsx` com visualização de diff lado a lado.

---

## 4. Scripts e Comandos de Desenvolvimento

### Servidor de Desenvolvimento Local (HMR)
```bash
npm run dev
# Inicia em http://localhost:5173 com proxy configurado para a porta 5172 do backend
```

### Compilação de Produção e Verificação de Tipos
```bash
npm run build
# Executa tsc -b e gera o bundle estático em dist/
```

### Análise Estática com Oxlint
```bash
npm run lint
```

### Testes Unitários e de Componentes (Vitest)
```bash
npm test
# Executa toda a suíte de testes unitários em modo single-run
```

### Validação de Internacionalização (i18n)
```bash
# Verifica consistência de chaves entre dicionários
npm run i18n:check

# Sincroniza chaves ausentes
npm run i18n:sync
```

### Testes End-to-End e Regressão Visual (Playwright)
```bash
# Executa testes funcionais E2E
npm run test:e2e

# Executa testes com interface visual do Playwright
npm run test:e2e:ui

# Executa testes de regressão visual com snapshots
npm run test:visual
```

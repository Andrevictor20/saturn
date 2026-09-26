# Saturn Dashboard v4.1.5

### Novidades, Correções e Melhorias na Versão 4.1.5

### ⚡ Correções no Monitor de Processos & Estabilidade de Modais
- **Desacoplamento de Stacking Context via Portal (`createPortal`):**
  - Os modais de detalhes de processo (`ProcessDetailModal`) e de encerramento forçado (`ProcessKillModal`) agora são renderizados diretamente no `document.body` via `createPortal`, eliminando o aprisionamento em *containing blocks* causados por propriedades CSS `transform` e animações no container pai.
  - O modal agora permanece visível, centralizado e perfeitamente acessível independentemente do nível de rolagem da tabela de processos.
- **Interatividade nos Cards de Top Processos (CPU & RAM):**
  - Os cards de resumo de maior consumo de CPU e RAM no topo do Monitor de Processos agora são totalmente clicáveis e acessíveis via teclado (<kbd>Enter</kbd> / <kbd>Espaço</kbd>), abrindo instantaneamente a janela com as métricas detalhadas, executável e linha de comando do processo correspondente.
- **Robustez na Renderização de Processos:**
  - Inseridos guardrails defensivos para tratamento de propriedades parciais ou processos de sistema (como threads do kernel), prevenindo exceções de renderização em acessos a propriedades numéricas e vetores de comando.
- **Acessibilidade e Usabilidade:**
  - Elevação do nível de camada para `z-[100]`, definição semântica `role="dialog"` com `aria-modal="true"` e suporte nativo ao fechamento com a tecla <kbd>Esc</kbd>.

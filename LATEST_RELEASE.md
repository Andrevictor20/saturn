# Saturn Dashboard v4.1.5

### Novidades, Correções e Melhorias na Versão 4.1.5

### ✨ Novidades
- **Atualização Paralela e Concorrente de Containers em Lote:** Otimização do fluxo de atualização em massa permitindo o processamento simultâneo de containers com seletor de paralelismo configurável (`1x`, `2x`, `3x`, `5x`), acelerando substancialmente a conclusão em servidores com alta largura de banda.
- **Salvaguarda de Rede para Túneis e Proxies:** Containers críticos de conectividade (como Cloudflare Tunnel, Tailscale, WireGuard, Nginx Proxy Manager, Traefik, Caddy) continuam com fila sequencial isolada e são processados por último, prevenindo a perda do link de acesso ao servidor durante os downloads.

### 🛠️ Correções & Estabilidade
- **Desacoplamento de Stacking Context no Monitor de Processos:** Os modais de detalhes e finalização de processos agora utilizam React Portals (`createPortal`), eliminando o aprisionamento visual e desalinhamentos de rolagem causados por propriedades CSS `transform` ancestrais.
- **Interatividade nos Cards de Top Processos (CPU & RAM):** Os cards de maior consumo de CPU e memória agora são totalmente interativos e acessíveis por teclado (<kbd>Enter</kbd> / <kbd>Espaço</kbd>), abrindo instantaneamente os detalhes do processo selecionado.
- **Resiliência e Acessibilidade:** Tratamento defensivo para processos do sistema sem linha de comando completa, elevação do z-index para `z-[100]` e suporte nativo a fechamento com a tecla <kbd>Esc</kbd>.

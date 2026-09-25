# Saturn Dashboard v4.1.4

### Novidades, Correções e Melhorias na Versão 4.1.4

### 📱 Experiência Mobile Nativa (App-Like UI & Respiro Visual)
- **Barra de Navegação Móvel Ergonômica:** Nova barra inferior fixa (`MobileBottomNav`) para smartphones e tablets pequenos com efeito `backdrop-blur-2xl`, suporte completo a `safe-area-inset-bottom` e atalhos rápidos (*Início*, *Containers*, *Store*, *Arquivos* e gaveta *Mais*).
- **Tela de Login Otimizada com `100dvh`:** Viewport dinâmico moderno prevenindo cortes provocados por barras do navegador ou teclado virtual no iOS e Android, com dimensionamento balanceado do formulário e tipagem sem zoom automático forçado.
- **Carrossel Snap Magnético de Telemetria:** Substituição de cards empilhados verticais por um carrossel horizontal suave com rolagem magnética (`snap-x snap-mandatory`), reduzindo a ocupação vertical na tela inicial de ~1000px para apenas ~165px.
- **Respiro Visual & Densidade Touch-Friendly:** Espaçamentos e botões reestruturados nas barras de ferramentas de contêineres, arquivos e terminal para eliminar claustrofobia e elementos gigantes no celular.

### 🛡️ Hardening de Segurança Global (Frontend & Backend)
- **Segregação Estrita de Privilégios (Least Privilege):** Rotas destrutivas e operacionais do Docker (`/exec`, `/env`, `/volumes`, `/update`, `/compose/install`, `/compose/save`) e da Store (`/install`, `/install/custom`, `/uninstall`, `/update`, `/repositories`, `/sync`) segregadas em `admin_routes` protegidas por `require_admin`. Usuários com papel `Member` mantêm acesso apenas de leitura e monitoramento.
- **Isolamento de Sandbox no Editor de Arquivos (Anti-XSS):** Pré-visualizações de arquivos HTML agora utilizam sandbox estrito sem `allow-same-origin`, bloqueando qualquer tentativa de exfiltração de tokens JWT do Saturn via scripts embarcados.
- **Mitigação de Timing Attack no Login:** Implementado cálculo Argon2 dummy para solicitações com usuários inexistentes, equalizando a latência (~150ms) e impedindo a enumeração automatizada de contas.
- **Proteção contra SSRF e DoS na App Store:** Bloqueio de endereços de metadados em nuvem (`169.254.169.254`, `metadata.google.internal`) no cadastro e sincronização de repositórios e limite estrito de 25MB em streams de catálogos remotos para prevenir esgotamento de memória RAM (OOM).
- **Anti-Path Traversal & Permissões Seguras:** Validação de identificadores de aplicativos via whitelist (`is_valid_app_id`), bloqueio de escape em caminhos de volumes e permissões restritas POSIX (`0o755` e `0o644` com proteção contra travessia de symlinks).
- **Hardening no Compilador do `saturn-apps`:** Validação de sintaxe YAML de `docker-compose.yml`, checagem de integridade de IDs e rejeição de esquemas perigosos (`javascript:`, `data:text/html`) em ícones.

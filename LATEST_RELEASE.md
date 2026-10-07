# Saturn Dashboard v4.1.7

### Novidades, Correções e Melhorias na Versão 4.1.7

### ⚡ Performance & Downloads
- **Paralelismo Nativo no Docker Compose V2:** Invocação do `docker compose` atualizada para utilizar `--parallel 8` e `--ignore-buildable` nos fluxos de instalação e atualização de apps da loja e recriação de containers. Acelera significativamente o pull simultâneo de serviços e camadas.
- **Throttling Inteligente do Stream de Progresso:** Implementada taxa de atualização controlada (350ms) durante eventos contínuos de `Downloading` e `Extracting` nas rotas do instalador. Elimina a contenção de locks síncronos (`RwLock`) no runtime Tokio do backend causada por centenas de mensagens de progresso por segundo.
- **Tuning de Alta Performance do Containerd & Docker Daemon:** Adicionado otimizador de configuração para o containerd 2.x e Docker Daemon em `daemon_optimizer.rs`, ajustando a concorrência de extração (`max_concurrent_unpacks = 4`) e downloads paralelos (`max_concurrent_downloads = 8` / `10`), mitigando lentidão em sistemas com sistemas de arquivos modernos.

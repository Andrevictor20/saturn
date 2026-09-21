# Saturn Dashboard v4.0.0

### Novidades, Correções e Melhorias na Versão 4.0.0

### ⚡ Otimização de Alta Velocidade para Downloads e Atualizações de Contêineres
- **Docker Daemon Optimizer em Tempo Real:** O Saturn agora inspeciona de forma inteligente o arquivo de configuração do Docker daemon (`/etc/docker/daemon.json` ou `/host/etc/docker/daemon.json`), elevando os limites vanilla para **10 downloads simultâneos de camadas** (`max-concurrent-downloads: 10`, `max-concurrent-uploads: 5`, `max-download-attempts: 5`). O daemon recebe um sinal não-destrutivo `SIGHUP` para aplicar as diretivas sem interromper contêineres ativos.
- **Pull Nativo Imediato de Plataforma:** O puller standalone do Docker agora envia a arquitetura nativa do host (`platform: get_host_platform()`) diretamente na primeira requisição, eliminando negociações redundantes, falhas multi-arch e timeouts demorados em ambientes ARM64 / Raspberry Pi e x86_64.
- **Docker Compose com Paralelismo Acelerado:** Injeção das variáveis `DOCKER_BUILDKIT=1` e `COMPOSE_PARALLEL_LIMIT=8` em todas as rotinas de pull via Docker Compose e na Saturn App Store.
- **Scripts de Provisionamento:** `install.sh` e `setup-pi.sh` atualizados para configurar o `daemon.json` de alta performance no Momento Zero.

### 🎨 Fidelidade Cromática Real (True-Chroma) e Proteção Visual contra Influência do Wallpaper
- **Novo Motor de Extração Cromática (True-Chroma):** Substituição do algoritmo legado de quantização grosseira por um extrator de alta precisão com 36 bins angulares (10° por bin) e tratamento dedicado para wallpapers neutros, monocromáticos e fotos em escala de cinza.
- **Preservação Autêntica de Tons e Saturação:** Fim da forçação artificial de 78% de saturação. As cores geradas respeitam rigorosamente a paleta real e as médias RGB do papel de parede.
- **Cor Secundária Real da Imagem:** Identificação autêntica da segunda cor a partir de clusters distintos da fotografia ($\Delta E > 42$), abandonando fórmulas matemáticas arbitrárias.
- **Desacoplamento Visual dos Cards:** A densidade dos cards em `.theme-wallpaper` foi calibrada para 88% (dark) e 90% (light), impedindo o vazamento excessivo de cores do wallpaper para dentro dos painéis e garantindo contraste e legibilidade impecáveis.
- **Eliminação de Manchas e Gradientes Concorrentes:** Os ambient orbs coloridos (roxo, rosa, verde e ciano) são automaticamente desativados quando há um papel de parede ativo, e o filtro de hipersaturação artificial (`saturate-[190%]`) foi removido da sidebar e painéis.
- **Conformidade WCAG AA:** Ajuste de luminosidade ergonômica para botões e cálculo dinâmico de luminância relativa para o texto de contraste.

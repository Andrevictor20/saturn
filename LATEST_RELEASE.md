# Saturn Dashboard v4.1.0

### Novidades, Correções e Melhorias na Versão 4.1.0

### 🎬 Streaming de Vídeo e Áudio de Alta Consistência (Inspirado no Jellyfin)
- **Decodificador Universal de Charsets de Legendas:** O novo subsistema de legendas (`subtitle_parser.rs`) analisa os bytes brutos e decodifica nativamente arquivos com codificação UTF-8 (com/sem BOM), UTF-16 Little/Big Endian e faz fallback automático para Windows-1252 / ISO-8859-1 (Latin-1). Isso elimina definitivamente os erros HTTP 500 ao carregar arquivos `.srt` em português/espanhol com acentuação.
- **Normalização e Stripping de Tags ASS/SSA:** Conversão automática de arquivos `.ass`, `.ssa` e `.sbv` para WebVTT padronizado, removendo tags de estilos complexos (`{\an8}`, `{\c&H...}`) e preservando o texto limpo com quebras de linha corretas.
- **Suporte a Multi-Áudio e Downmix Estéreo:** O `ffprobe` agora extrai dinamicamente todas as trilhas de áudio do arquivo de mídia. Ao reproduzir ou selecionar uma faixa via `&audio={index}`, o backend aplica downmixing inteligente de formatos multicanal 5.1/7.1 (DTS, Dolby AC3) para AAC estéreo a 48kHz, impedindo a perda de diálogos e vozes em caixas de som de celulares, tablets e notebooks.
- **Desempenho Otimizado para Dispositivos Fracos:** Remux / DirectStream sob demanda (`-c:v copy`) em fMP4 para fluxos H.264/HEVC compatíveis, mantendo o consumo de CPU do servidor abaixo de 1% (ideal para Raspberry Pi). Suporte adicional ao parâmetro `max_height` para reescalonamento dinâmico sem sobrecarregar GPUs móveis.
- **Controles no Player de Vídeo:** Adição do seletor dedicado de faixas de áudio (`VideoAudioMenu.tsx`) e controle de sincronização de legendas em tempo real com botões de avanço e atraso (`±0.5s` e reset) diretamente na barra de controles do player.

### 🛡️ Controle de Concorrência Otimista (OCC - RFC 7232)
- **Prevenção de Sobrescrita no Gerenciador de Arquivos:** Implementação de cabeçalhos HTTP `ETag` e `If-Match` para operações de escrita, impedindo que edições simultâneas causem perda de dados. Apresentação do `DiffConflictModal` quando um arquivo é modificado por outro processo.

### 🎨 Modernização de Diálogos e Consistência de Tema
- **ConfirmModal e useConfirm:** Substituição integral de diálogos nativos do navegador (`window.confirm`) por modais modernos com suporte a WCAG AA, foco automático e animações do design system.
- **Consistência de Tema e Wallpaper:** Endpoint público `GET /api/system/customization` permitindo renderização imediata do papel de parede e do tema configurados desde a tela de login e em novos dispositivos.

### 📚 Refatoração Técnica e Governança
- **Deslopização Documental:** Remoção de retóricas hiperbólicas em favor de especificações técnicas mensuráveis em `README.md`, `frontend/README.md`, `backend/README.md` e `docs/APP_STORE.md`.
- **Arquitetura Resiliente:** Todos os componentes e módulos mantidos estritamente sob a regra *No God Files* (< 500 linhas).

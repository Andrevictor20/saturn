# Saturn Dashboard v4.1.1

### Novidades, Correções e Melhorias na Versão 4.1.1

### 🎨 Renderização de Legendas Avançadas ASS/SSA e PGS (Bitmap) via WebAssembly & Canvas
- **Suporte a Legendas Gráficas PGS (.sup / VobSub):** Fim do descarte de legendas bitmap rasterizadas em vídeos MKV. O Saturn agora cataloga codecs `hdmv_pgs_subtitle`, `pgs` e `dvd_subtitle` e os renderiza no navegador com aceleração de hardware via `libpgs` e Canvas.
- **Fidelidade Visual Completa para ASS/SSA:** Eliminação da mutilação de formatação vetorial e quebras de linha em animes e filmes. Legendas estilizadas agora são renderizadas em alta definição via `jassub` (motor nativo `libass` compilado para WebAssembly), preservando tipografia, cores, notas de tradução e posicionamento original.
- **Code-Splitting e Lazy Loading:** Os binários `.wasm` e scripts de worker são carregados assincronamente sob demanda via `import()` dinâmico somente quando uma faixa ASS ou PGS é ativada, mantendo o bundle inicial do painel extremamente leve.
- **Sincronização de Alta Densidade e Limpeza de Memória:** O novo componente `CanvasSubtitleRenderer` sincroniza dimensões via `ResizeObserver` respeitando a proporção de aspecto e a densidade de tela (`devicePixelRatio`), garantindo destruição completa de workers e liberação de memória ao fechar o player ou trocar de trilha.

### ⚡ Endpoint de Extração Bruta e Deduplicação Concorrente
- **Rota Dedicada `/api/files/subtitles/raw`:** Permite a extração direta de fluxos brutos de legendas embutidas em MKV (`internal:stream_idx:path`) e leitura de arquivos externos com MIME types corretos (`text/x-ssa; charset=utf-8` e `application/octet-stream`).
- **Cache Determinístico em Disco e Mutex:** Resultados de extração são persistidos em `/data/cache/subtitles/` e protegidos por `EXTRACTION_MUTEX`, evitando execuções paralelas redundantes do `ffmpeg` e poupando I/O de disco em arquivos grandes de 10 a 50 GB.

### 🛡️ Fallback de Queima de Legenda no Servidor (Burn-in)
- **Modo Compatibilidade Absoluta:** O transcode de vídeo (`/api/files/stream/transcode`) agora aceita o parâmetro opcional `burn_sub={index}`, injetando o filtro de sobreposição `-filter_complex "[0:v][0:s:{idx}]overlay"` para dispositivos legados ou Smart TVs sem suporte a WebAssembly.

### 🏷️ Indicadores Visuais no Player
- **Badges de Formato no Menu de Legendas:** O seletor de legendas exibe badges `[ASS]` e `[PGS]` ao lado de cada trilha, facilitando a identificação da tecnologia de renderização pelo usuário.

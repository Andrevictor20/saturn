# Saturn Dashboard v4.1.3

### Novidades, Correções e Melhorias na Versão 4.1.3

### 🎬 Resiliência de Reprodução & Streaming de Vídeo MP4
- **Correção Crítica no Roteamento de Transcodificação:** Corrigido bug no `VideoPlayerModal` onde o botão *"Forçar Transcodificação"* não alternava o parâmetro de URL em arquivos `.mp4`, mantendo o fluxo direto quebrado em loop. A rota agora comuta perfeitamente para `/api/files/stream/transcode?mode=transcode`, aplicando decodificação universal H.264 + AAC 48kHz.
- **Auto-Recuperação Graciosa no Watchdog (Auto-Remux):** Ao detectar buffer estagnado (>6s) na reprodução direta de vídeos MP4 (comum em arquivos sem *faststart* / átomo `moov` no final ou com perfis HEVC não acelerados por hardware), o player transiciona de forma silenciosa e automática para o modo Remux rápido (`mode=copy`). O contêiner é reorganizado pelo FFmpeg em fragmented MP4 em milissegundos e com zero sobrecarga de CPU, iniciando a reprodução imediatamente.
- **Botão *"Tentar Remux Novamente"* Ativo:** O botão de repetição no banner de travamento agora aciona efetivamente o Remux de contêiner fMP4, permitindo contornar arquivos MP4 com índices de áudio/vídeo corrompidos sem re-codificar o vídeo.

### 🌐 Sanitização de Cabeçalhos CORS & Compatibilidade Universal
- **Headers CORS em Códigos HTTP 416:** Adicionados os cabeçalhos `Access-Control-Allow-Origin: *` e `Access-Control-Allow-Headers: *` nas respostas `416 Range Not Satisfiable` do streaming assíncrono em Rust, prevenindo falhas fatais de CORS no navegador durante requisições de range além do fim do arquivo.
- **Desacoplamento de `crossOrigin="anonymous"`:** Removido o atributo `crossOrigin` do elemento `<video>`, garantindo compatibilidade fluida com cookies de sessão, proxies reversos locais e navegadores estritos tanto em conexões diretas quanto roteadas.

# Saturn Dashboard v4.1.8

### Novidades, Correções e Melhorias na Versão 4.1.8

### 🐛 Correção: Upload de Vídeos no Gerenciador de Arquivos
- **Upload de arquivos grandes (vídeos) de qualquer tamanho:** Corrigida a falha no envio de vídeos pelo gerenciador de arquivos enquanto imagens funcionavam normalmente. A causa era falta de robustez para arquivos grandes (muitos chunks de 5 MB sequenciais), não filtro de tipo nem limite de tamanho.
- **Retry automático com backoff exponencial:** O frontend (`UploadManagerContext.tsx`) agora tenta novamente automaticamente (até 3x com backoff) em falhas transitórias de rede ou erros 5xx no envio de cada chunk, evitando que um único pico de rede aborte todo o upload.
- **Timeout por requisição de chunk:** Timeout de 60 s por requisição de chunk para não travar indefinidamente em uploads longos.
- **Throttle de progresso da UI:** A gaveta de upload não re-renderiza a cada chunk em arquivos grandes, evitando travamento da interface durante o envio.
- **Logging estruturado no backend:** `chunked_upload.rs` agora emite logs detalhados (`tracing`) em cada chunk gravado e na montagem final, expondo a causa real de falhas (disco, caminho, tamanho).
- **Testes:** Novo teste de integração `test_complete_upload_assembles_large_file_from_many_chunks` que monta um arquivo grande a partir de múltiplos chunks e confere conteúdo e tamanho exatos; 2 testes de chunked_upload passando, 55 testes de lib passando, 63 testes de files do frontend passando e `tsc --noEmit` limpo.

### ⚠️ Limite de Infraestrutura
- "Qualquer tamanho" depende ainda de espaço em disco disponível e de timeouts/limites de corpo de requisição de proxies reversos na frente (nginx, Traefik, túnel Cloudflare), que são de infraestrutura, não de código do Saturn.

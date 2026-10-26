# Saturn Dashboard v4.1.10

### Novidades, Correções e Melhorias na Versão 4.1.10

### 🐛 Correção: Upload de Vídeos no Gerenciador de Arquivos (erro de parsing multipart)
- **DefaultBodyLimit nas rotas de upload:** Adicionado `DefaultBodyLimit::max(10 GB)` nas rotas `/api/files/upload/chunk` e `/complete`. O limite padrão do Axum (~2 MB) bloqueava o parsing de requisições `multipart/form-data` com chunks de 5 MB+, causando erro `Error parsing 'multipart/form-data' request` em vídeos de 4 MB a 5,5 MB.
- **Limite total de upload no backend:** `chunked_upload.rs` agora rejeita com erro **413 Payload Too Large** uploads que excedam 10 GB, evitando encher o disco silenciosamente; antes não havia nenhum teto.
- **Cleanup garantido em erro:** O diretório temporário de fragmentos e qualquer arquivo final parcial são removidos em todo caminho de falha da montagem (disco cheio, caminho inválido, leitura de chunk, flush), eliminando fragmentos órfãos.
- **Logging estruturado aprimorado:** `tracing` emite `upload_id`, `chunk_index`, `bytes`, `total_size` e motivo exato (disco, caminho, tamanho) em cada etapa do upload e montagem.
- **Tratamento de cota do IndexedDB:** `saveFileToDb` detecta `QuotaExceededError` e grava apenas metadados leves (nome, tamanho, tipo, caminho, chunks) sem o blob, retornando `savedBlob: false`; outros erros são propagados em vez de silenciados. Adicionada `getUploadMetadata(id)`.
- **Verificação de cota antes de salvar blob:** `UploadManagerContext` consulta `navigator.storage.estimate()`; se a cota estiver ≥ 85%, pula a gravação do blob e avisa o usuário que a retomada após F5 não estará disponível para aquele arquivo.
- **Timeout de chunk dinâmico:** `CHUNK_REQUEST_TIMEOUT_MS` (60s base) + 30s a cada 100 MB do arquivo, teto de 300s — arquivos grandes em rede lenta não morrem por timeout fixo de 60s.
- **Testes:** 55 testes de lib backend, 2 testes de chunked_upload, 63 testes de files do frontend e `tsc --noEmit` todos passando.

### ⚠️ Limite de Infraestrutura
- "Qualquer tamanho" depende ainda de espaço em disco disponível e de timeouts/limites de corpo de requisição de proxies reversos na frente (nginx, Traefik, túnel Cloudflare), que são de infraestrutura, não de código do Saturn.

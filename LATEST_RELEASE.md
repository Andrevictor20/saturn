# Saturn Dashboard v4.1.11

### Novidades, Correções e Melhorias na Versão 4.1.11

### 🐛 Correção: Upload de Vídeos no Gerenciador de Arquivos (arquivo não aparecia após sucesso)
- **Campo de destino no upload completo:** `UploadManagerContext` agora envia `destination` (em vez de `destination_path`) no corpo do `POST /api/files/upload/complete`, batendo com o campo lido pelo backend. Antes, o backend usava o default `/DATA`, gravando o arquivo no caminho errado; o upload reportava sucesso mas o arquivo não aparecia na interface nem chegava ao diretório esperado pelo usuário.
- **DefaultBodyLimit nas rotas de upload:** `DefaultBodyLimit::max(10 GB)` nas rotas `/api/files/upload/chunk` e `/complete`, corrigindo erro `Error parsing 'multipart/form-data' request` em chunks de 5 MB+.
- **Limite total de upload no backend:** `chunked_upload.rs` rejeita com erro **413 Payload Too Large** uploads que excedam 10 GB, evitando encher o disco silenciosamente.
- **Cleanup garantido em erro:** O diretório temporário de fragmentos e qualquer arquivo final parcial são removidos em todo caminho de falha da montagem.
- **Tratamento de cota do IndexedDB:** `saveFileToDb` detecta `QuotaExceededError` e grava apenas metadados leves sem o blob; `UploadManagerContext` consulta `navigator.storage.estimate()` (≥ 85% pula gravação do blob).
- **Timeout de chunk dinâmico:** 60s base + 30s a cada 100 MB, teto 300s.
- **Testes:** 55 testes de lib backend, 2 testes de chunked_upload, 63 testes de files do frontend e `tsc --noEmit` todos passando.

### ⚠️ Limite de Infraestrutura
- "Qualquer tamanho" depende ainda de espaço em disco disponível e de timeouts/limites de corpo de requisição de proxies reversos na frente (nginx, Traefik, túnel Cloudflare), que são de infraestrutura, não de código do Saturn.

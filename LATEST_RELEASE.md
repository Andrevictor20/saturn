# Saturn Dashboard v4.1.13

### Novidades, Correções e Melhorias na Versão 4.1.13

### ✨ Melhoria: Destino do Arquivo no Drawer de Upload
- **Caminho de destino exibido por item:** `UploadProgressDrawer` agora mostra o `destinationPath` de cada arquivo abaixo do nome, com ícone de disco rígido, para o usuário saber exatamente para onde o upload está sendo enviado (modo expandido do drawer).

### ✨ Melhoria (v4.1.12): Tempo Estimado (ETA) no Upload de Arquivos
- **ETA no drawer de upload:** `UploadManagerContext` agora calcula `etaSeconds` com base na velocidade atual e bytes pendentes; o `UploadProgressDrawer` exibe o tempo restante tanto no modo minimizado (pill flutuante) quanto no modo expandido (por item), formatado como "2m 30s", "45s" ou "1h 10m".

### 🐛 Correções (v4.1.11)
- **Campo de destino no upload completo:** `UploadManagerContext` agora envia `destination` (em vez de `destination_path`) no corpo do `POST /api/files/upload/complete`, batendo com o campo lido pelo backend. Antes, o backend usava o default `/DATA`, gravando o arquivo no caminho errado; o upload reportava sucesso mas o arquivo não aparecia na interface nem chegava ao diretório esperado pelo usuário.
- **DefaultBodyLimit nas rotas de upload:** `DefaultBodyLimit::max(10 GB)` nas rotas `/api/files/upload/chunk` e `/complete`, corrigindo erro `Error parsing 'multipart/form-data' request` em chunks de 5 MB+.
- **Limite total de upload no backend:** `chunked_upload.rs` rejeita com erro **413 Payload Too Large** uploads que excedam 10 GB, evitando encher o disco silenciosamente.
- **Cleanup garantido em erro:** O diretório temporário de fragmentos e qualquer arquivo final parcial são removidos em todo caminho de falha da montagem.
- **Tratamento de cota do IndexedDB:** `saveFileToDb` detecta `QuotaExceededError` e grava apenas metadados leves sem o blob; `UploadManagerContext` consulta `navigator.storage.estimate()` (≥ 85% pula gravação do blob).
- **Timeout de chunk dinâmico:** 60s base + 30s a cada 100 MB, teto 300s.
- **Testes:** 55 testes de lib backend, 2 testes de chunked_upload, 63 testes de files do frontend e `tsc --noEmit` todos passando.

### ⚠️ Limite de Infraestrutura
- "Qualquer tamanho" depende ainda de espaço em disco disponível e de timeouts/limites de corpo de requisição de proxies reversos na frente (nginx, Traefik, túnel Cloudflare), que são de infraestrutura, não de código do Saturn.

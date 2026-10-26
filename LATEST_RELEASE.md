# Saturn Dashboard v4.1.14

### Novidades, Correções e Melhorias na Versão 4.1.14

### ✨ Melhoria: Retomada de Upload Após Recarregar a Página (F5)
- **Hidratação de itens com erro:** `UploadManagerContext` agora mantém visíveis os uploads com status `error` após recarregar a página (Ctrl+Shift+R / F5), em vez de fazê-los sumir. Antes, apenas itens `uploading` e `paused` eram restaurados.
- **Botão "Retomar":** `UploadProgressDrawer` exibe um botão de retomar (ícone `RotateCcw`) para itens com erro, chamando `resumeUpload(item.id)` para recomeçar do ponto onde parou, aproveitando os chunks já gravados no servidor via endpoint `/status`.
- **Mensagem clara quando arquivo não está mais disponível:** Se o arquivo não estiver mais no IndexedDB (ex: limpeza de cache), o item mantém status `error` com mensagem "Arquivo não está mais disponível localmente. Reenvie o arquivo.", em vez de sumir silenciosamente.
- **Teste de regressão:** `frontend/src/tests/components/files/UploadManagerContext.test.tsx` (4 testes) validam a hidratação e retomada de itens com erro.

### ✨ Melhoria (v4.1.13): Destino do Arquivo no Drawer de Upload
- **Caminho de destino exibido por item:** `UploadProgressDrawer` agora mostra o `destinationPath` de cada arquivo abaixo do nome, com ícone de disco rígido.

### ✨ Melhoria (v4.1.12): Tempo Estimado (ETA) no Upload de Arquivos
- **ETA no drawer de upload:** `UploadManagerContext` calcula `etaSeconds` com base na velocidade atual e bytes pendentes; `UploadProgressDrawer` exibe o tempo restante (modo minimizado e expandido), formatado como "2m 30s", "45s" ou "1h 10m".

### 🐛 Correções (v4.1.11)
- **Campo de destino no upload completo:** `UploadManagerContext` agora envia `destination` (em vez de `destination_path`) no corpo do `POST /api/files/upload/complete`.
- **DefaultBodyLimit nas rotas de upload:** `DefaultBodyLimit::max(10 GB)` nas rotas `/api/files/upload/chunk` e `/complete`.
- **Limite total de upload no backend:** `chunked_upload.rs` rejeita com erro **413 Payload Too Large** uploads que excedam 10 GB.
- **Cleanup garantido em erro:** Fragmentos temporários e arquivos parciais são removidos em caminhos de falha.
- **Tratamento de cota do IndexedDB:** `saveFileToDb` detecta `QuotaExceededError` e grava apenas metadados leves.
- **Timeout de chunk dinâmico:** 60s base + 30s a cada 100 MB, teto 300s.
- **Testes:** 55 testes de lib backend, 2 testes de chunked_upload, 67 testes de files do frontend e `tsc --noEmit` todos passando.

### ⚠️ Limite de Infraestrutura
- "Qualquer tamanho" depende ainda de espaço em disco disponível e de timeouts/limites de corpo de requisição de proxies reversos na frente (nginx, Traefik, túnel Cloudflare), que são de infraestrutura, não de código do Saturn.

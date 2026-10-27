# Saturn Dashboard v4.1.16

### ✨ Melhoria: Upload em Segundo Plano Mais Consistente
- **Aba não congela mais durante o upload:** `acquireUploadKeepAlive` segura um Web Lock enquanto há upload ativo, impedindo o navegador de congelar a aba ao trocar de página/aba.
- **Retry resiliente:** até 10 tentativas por chunk com backoff exponencial (teto de 30s). Se a rede cair, o upload espera o evento `online` em vez de gastar tentativas.
- **Auto-retomada:** ao voltar a rede ou a aba ficar visível, uploads parados e uploads com falha transitória (rede/5xx/429/408) são retomados sozinhos. Erros 4xx permanentes continuam exigindo ação manual.
- **Pausa efetiva:** pausar/cancelar agora aborta também a requisição de chunk em andamento (o signal externo antes era sobrescrito).
- **Organização:** utilitários em `utils/uploadResilience.ts` e tipos em `contexts/uploadManagerTypes.ts` (arquivos < 500 linhas).

# Saturn Dashboard v4.1.15

### 🐛 Correções na Versão 4.1.15
- **Typecheck do frontend (`tsc -b`):** `UploadManagerContext` passa a usar `item.fileSize` no cálculo do ETA (a variável `fileSize` não existia no escopo) e o teste `UploadManagerContext.test.tsx` usa `import type` para `UploadItem`. Corrige a falha do passo "Typecheck & Build Frontend" no CI.

# Saturn Dashboard v4.1.6

### Novidades, Correções e Melhorias na Versão 4.1.6

### 🛠️ Correções & Estabilidade
- **Resolução de Imagens Multi-Arquitetura no Verificador de Versões:** Imagens multi-arch (como `n8nio/n8n:latest`, `alpine`, `nginx`) agora têm seus manifestos filhos OCI/Docker index inspecionados para a arquitetura exata do host (`arm64`, `amd64`, etc.). Elimina o falso positivo permanente onde o Saturn alertava sobre atualizações inexistentes devido à divergência entre o digest do índice remoto e o digest da camada local.
- **Eliminação de Short-Circuit Falso na Atualização em Lote:** Corrigido comportamento no atualizador em massa que interpretava tarefas concluídas passadas como se o container já estivesse atualizado na sessão corrente, pulando downloads e recriações sem executar. Tarefas finalizadas há mais de 120s no backend agora expiram automaticamente para `idle`.
- **Prevenção de Falhas de Parsing JSON no Home Assistant:** Tratamento resiliente para respostas HTTP sem corpo JSON (como sessões expiradas `401` ou restrições de permissão `403`), exibindo mensagens amigáveis de autenticação em vez de erros genéricos de parsing no frontend. Leitura unificada de credenciais via utilitário de autenticação.

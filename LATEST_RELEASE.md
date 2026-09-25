# Saturn Dashboard v4.1.2

### Novidades, Correções e Melhorias na Versão 4.1.2

### 📈 Histórico Estendido de Métricas (12h, 24h e 72h)
- **Two-Tier Ring Buffer em Memória:** Implementada arquitetura de séries temporais balanceada no backend Rust, combinando ticks em tempo real de alta resolução (`STATS_HISTORY`, últimas 1h a 2h) com agregação periódica de longo prazo (`STATS_HISTORY_LONG`, até 72 horas em buckets de 3 minutos).
- **Consultas Leves e Sem Impacto de I/O:** Suporte ao parâmetro `range` (`12h`, `24h`, `72h`) no endpoint `/api/docker/stats/history`, com downsampling uniforme que garante payloads compactos (< 100 KB) e consumo desprezível de memória (< 2 MB).
- **Navegação Temporal Fluida:** Novos botões de intervalo (12h, 24h, 72h) na aba de Métricas do Sistema com formatação contextual do eixo X (`DD/MM HH:mm`).

### 🔔 Avisos & Insights Cobrindo 48 Horas
- **Janela de Retenção de 48 Horas:** O subsistema de alertas do Saturn agora mantém histórico ativo cobrindo 48 horas completas (`ALERT_RETENTION_MS`), descartando automaticamente anomalias expiradas.
- **Rótulos com Data e Horário Completos:** Badges de alertas agora exibem o timestamp formatado com data e hora local (`DD/MM, HH:mm`), oferecendo rastreabilidade precisa de incidentes de hardware e containers.

### ✨ Gráficos Fluidos com Curvas Catmull-Rom e Animações Dinâmicas
- **Suavização Contínua $C^1$ na Visão Geral:** Os mini-gráficos (`MiniSparkline`) dos cards de telemetria agora utilizam interpolação Catmull-Rom convertida para Bézier Cúbico, eliminando platôs artificiais e proporcionando transições orgânicas e dinâmicas.
- **Animações Ativas a 60 FPS:** Habilitada a animação vetorial com easing natural (`ease-in-out`) em todas as séries de CPU, Memória e Tráfego de Rede (Host e Containers) da aba de Métricas.


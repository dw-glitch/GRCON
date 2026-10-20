# Tarefas em segundo plano e painel técnico

O GRCON usa Cloudflare Workflows para manter a execução fora da sessão do navegador. O R2 privado recebe os dados por streaming e armazena os resultados. O estado, as permissões e os pontos de retomada ficam no Supabase.

## Operação

- **Tarefas** no cabeçalho: trabalhos do próprio usuário no contrato atual, progresso, situação, download e nova tentativa de falhas recuperáveis.
- **Painel técnico**: atalho montado somente para o proprietário master; o servidor verifica a capacidade no banco a cada consulta. Exibe disponibilidade/configuração dos serviços, execução do agendador, métricas das APIs nas últimas 24 horas e tarefas recentes dos contratos.
- Na Conferência SIGEM, o recálculo é silencioso. **Relatório Excel** gera e baixa o XLSX diretamente no navegador, respeitando os filtros e a visualização. O botão de conferência em segundo plano foi removido.
- **Publicar Consulta Geral compartilhada** envia a base validada para uma tarefa. As páginas são confirmadas no banco antes da publicação atômica. A base anterior continua ativa enquanto isso; uma publicação concorrente mais recente impede sobrescrita.
- Avisos de eGRDT ao Teams entram na fila quando o usuário confirma o envio. A interface distingue registro da tarefa, recebimento pelo fluxo e confirmação no SIGEM.

Após terminar o envio dos dados e receber a confirmação da tarefa, o navegador pode ser fechado. A lista e o resultado são recuperados pelo mesmo usuário ao retornar. Arquivos locais ainda precisam ser escolhidos e enviados pelo usuário; o servidor não acessa pastas do computador.

## Plano gratuito

O Workers Free tem limite de CPU por etapa. A Cloudflare executa a orquestração e o I/O; a função Supabase `grcon-background-processor` executa os cálculos e a escrita do XLSX. O pacote Cloudflare não contém ExcelJS nem executa a leitura integral dos grandes lotes.

Limites de entrada: 24 MiB por tarefa, 100.000 registros de Consulta Geral e 10.000 linhas por relatório remoto. O Excel remoto conserva as colunas, a linha 10 de cabeçalho, os propósitos, o histórico de envios e o julgamento pela última GRDT; usa uma apresentação mais leve para respeitar a capacidade disponível. As quotas dos serviços continuam aplicáveis. Nenhuma assinatura é alterada pela implantação.

## Confiabilidade e segurança

- Admissão por usuário/contrato, identificador idempotente e fingerprint; dados de uma tarefa aceita não são sobrescritos por repetição.
- Geração de execução impede que uma tentativa antiga finalize uma nova tentativa.
- Workflows guarda os passos concluídos. A importação também registra o snapshot e sua publicação no banco, tornando repetição de requisição segura.
- O agendador recupera inícios de tarefas que ficaram pendentes e identifica execuções interrompidas.
- Antes de executar, importar páginas, retornar arquivos ou despachar integração, as permissões atuais são verificadas.
- Tabelas internas têm RLS com bloqueio explícito e acesso revogado. O RPC de execução é exclusivo de `service_role`; a função Edge valida esse acesso antes de processar os dados.
- Telemetria armazena categorias de rota, contagens, códigos e duração; não grava tokens, webhooks nem corpos de documentos. As métricas expiram após sete dias. Polling da lista e do painel não entra nas métricas.

## Tentativas do Teams

Indisponibilidade de configuração e resposta HTTP 429 recebem novas tentativas com espera crescente, até cinco despachos. O mesmo identificador acompanha o envio. A intenção de despacho é gravada antes da chamada externa.

Timeout, erro de rede, HTTP 5xx e interrupção após o início do despacho são tratados como **entrega incerta**: o sistema não reenvia automaticamente, pois o fluxo externo pode ter recebido a mensagem. O painel pede conferência do Teams. O cabeçalho de idempotência sozinho não garante deduplicação em um fluxo Power Automate que não o implemente.

## Implantação

1. Aplicar as migrations `cloudflare_background_operations` e `background_processor_checkpoints`.
2. Executar `node scripts/build-background-edge.mjs` para copiar as versões atuais dos motores para `supabase/functions/grcon-background-processor/generated/`.
3. Publicar a função Edge com todos os arquivos dessa pasta, `index.ts` e `deno.json`. `verify_jwt=false` porque a autenticação própria exige um RPC que apenas a chave de servidor pode executar. Informar explicitamente `import_map_path=deno.json` ao atualizar via conector.
4. Publicar `wrangler.jsonc`. O binding `GRCON_TASKS` referencia `GrconTaskWorkflow`; o bucket privado existente é utilizado sob `operations/`, fora do catálogo documental.
5. Executar a verificação de produção e validar uma tarefa completa. Não enviar mensagens reais ao Teams em testes automatizados.

Os arquivos gerados da função Edge não são uma segunda fonte de implementação; devem ser reconstruídos a partir dos motores canônicos do repositório.

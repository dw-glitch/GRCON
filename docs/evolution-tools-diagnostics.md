# Diagnóstico e decisões de integração — fase 6

## Entrega executada

O painel técnico existente, exclusivo do proprietário master, ganhou diagnóstico
da aba: categorias de requisição, duração média, P95, máximo, erros HTTP quando
informados pelo navegador e tarefas longas. Chamadas diretas ao Supabase deixam
de ser um ponto sem medição no navegador. As métricas do servidor continuam
sendo exibidas separadamente, com sua janela de 24 horas.

A amostra em memória contém no máximo 200 chamadas e 200 tarefas longas. Não
armazena URL, parâmetros, tokens, corpos, arquivos, códigos documentais, pilhas ou
mensagens de erro. Exporta somente números, categorias fixas e indicadores de
recursos/armazenamento. Trocar contrato ou sair da conta limpa a amostra. Status
HTTP indisponível é explicitamente desconhecido, não uma falha. Não há upload
para novo fornecedor nem novo serviço de monitoramento.

A verificação de publicação agora tolera propagação transitória dos assets com
até seis leituras, separadas por três segundos. O hash exato continua obrigatório;
divergência persistente falha. A mudança responde a um caso observado: metadados
já apontavam o commit novo enquanto o SW retornou temporariamente o anterior.
Uma leitura posterior confirmou o SW correto. Foram testados resposta antiga
seguida da correta, divergência persistente, HTTP 404 e falha de rede.

## Ferramentas avaliadas e decisão

| Opção | Uso concreto no GRCON | Situação |
|---|---|---|
| Cloudflare Observability | Logs e métricas do Worker existente | Já habilitada no Wrangler; mantida como primeira fonte de diagnóstico de servidor. |
| Métricas nativas do navegador | Separar demora da API, chamadas diretas ao banco e bloqueios da interface | Implementadas nesta fase, com exportação local. |
| Sentry / OpenTelemetry externo | Agrupar erros em várias sessões e correlacionar serviços | Não instalado. Exige demonstrar lacuna no diagnóstico atual, definir dados coletados, acesso, retenção e custo. |
| ProjectWise API / WSG | Evitar exportação manual do CSV | Condicionada à identificação do endpoint corporativo, aplicativo autorizado e permissões de leitura. O login no PW não prova acesso da integração. O caminho CSV com perfis já funciona. |
| Teams / Power Automate / Graph | Retorno estruturado e acompanhamento de emissão | Fluxo existente mantido. O conector Teams é classificado separadamente dos conectores HTTP; licença e consentimento dependem do fluxo real do tenant. Nenhuma mensagem de teste foi enviada. |
| Conversão local PDF→DOCX | Produzir documento editável sem serviço adicional | Implementação paralela preservada na integração; esta fase não substitui o conversor. |
| OCR / serviço de conversão externo | PDFs digitalizados e casos que o extrator local não resolve | Experimento condicionado a exemplos reais e critério de fidelidade. Nenhum documento corporativo foi enviado a terceiros. |
| Filas e orquestração | Retentativas e trabalhos duráveis | Workflows já existe no GRCON. Não foi adicionada outra fila sem uma necessidade demonstrada. |

## Critérios dos próximos pilotos

- PW: confirmar API/datasource, autorizar identidade de leitura, comparar um lote
  pequeno com CSV e conferir código, revisão física, última emissão e contrato.
  Só então programar sincronização e publicação atômica; falha preserva a base.
- M365: usar conta/tenant autorizados, verificar licença do gatilho/ação usados e
  deduplicação no retorno. Confirmação Teams continua independente do SIGEM.
- OCR: conjunto de avaliação com texto, tabela e digitalização; medir caracteres,
  células, edição efetiva do DOCX e fidelidade, sem chamar imagem de texto editável.
- Monitoramento externo: comprovar quais incidentes não se resolvem com o painel,
  identificar dados permitidos e comparar custo antes de contratar ou habilitar.

## Fontes oficiais consultadas em 20/10/2026

- https://developers.cloudflare.com/workers/observability/
- https://developers.cloudflare.com/workers/observability/opentelemetry-export/
- https://developer.bentley.com/apis/overview/authorization/service-app/
- https://learn.microsoft.com/en-us/connectors/teams/
- https://learn.microsoft.com/en-us/connectors/webcontentsv2/

Não foi validado acesso real à API corporativa do PW, a licença do tenant M365 ou
um fornecedor OCR. Esses pilotos não são apresentados como integrações ativas.

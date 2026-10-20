# Workers AI no Registro Mestre

O botão **Explicar com IA**, dentro de **Entender os resultados e suas fontes**,
usa exclusivamente Workers AI com `@cf/google/gemma-4-26b-a4b-it`. Não utiliza a
chave OpenAI criada anteriormente. **Consultar fontes** continua disponível por
regras, inclusive quando a IA falha ou atinge seus limites. A IA só roda por ação
explícita; abrir o Registro Mestre não gera uma resposta de IA.

## Controle de consumo

- Teto persistente de 32 tentativas por dia UTC para todo o GRCON, incluindo um
  teste sintético de publicação; seis por usuário e intervalo de dez segundos.
- Reservas atômicas no banco são feitas antes da inferência. Falhas e timeouts
  consomem a reserva; não há repetição automática, outro modelo ou provedor pago.
- Modelo fixo da faixa gratuita, contexto de até 6.000 bytes UTF-8, saída de até
  384 tokens e raciocínio estendido desativado. O texto contém no máximo três
  explicações. Alterar o modelo exige revisar os limites e o preço.
- A franquia Cloudflare é de 10.000 neurônios/dia para a **conta**, não por usuário
  nem por aplicativo. Pelas tarifas publicadas em 20/10/2026, esse teto e os
  limites de contexto/saída deixam margem sobre o consumo máximo esperado do
  GRCON. O contador do GRCON não mede nem limita outros aplicativos da conta.
  Em Workers Paid, uso total acima da franquia é cobrado pela Cloudflare.
- O teto do aplicativo é um controle de consumo; não é um bloqueio de faturamento
  de toda a conta Cloudflare. Nenhum plano ou crédito foi comprado nesta entrega.

## Fontes e isolamento

O servidor valida a sessão e a participação ativa no contrato, consulta as fontes
novamente e compara suas revisões de paginação com as exibidas na tela. Uma base
alterada exige atualização da consulta. A IA usa somente a primeira página e até
três exemplos por fonte; as limitações de amostra são enviadas ao modelo.

Apenas campos selecionados de SIGEM, PW, emissões, versões do Cofre e existência
de solicitações entram na inferência. Binários, tokens, chaves, e-mails,
responsáveis, observações, títulos e dados livres das solicitações não são enviados.
Amostras e respostas não são gravadas pelo GRCON em banco, R2 ou logs. O contador
guarda somente dia, identificador do usuário, contagem e horário.

A saída precisa de JSON válido e citações pertencentes às evidências enviadas;
respostas truncadas ou citações inventadas são rejeitadas. O navegador escapa o
texto e ignora respostas que chegam após mudar documento, contrato ou conta.
Citações válidas não comprovam toda a interpretação: a explicação exige consulta
às fontes. A IA não altera revisão, classificação, histórico ou postagem e não
recebe ferramentas para executar ações.

## Validação

PGlite: papéis, contrato desativado, cooldown, teto global e reaplicação preservando
consumo. Worker: autenticação, alteração de fonte, reserva negada, citação inválida,
resposta truncada e falha de provedor. Chromium: fontes, IA, cache da consulta,
escape de HTML, limite e troca de contrato com resposta atrasada.

A publicação executa uma inferência real com dados sintéticos, protegida por OIDC
GitHub com repositório, proprietário, workflow, branch e audiência fixos. O teste
usa no máximo uma reserva por dia. Ele não consulta nem envia documentos reais.

## Documentação oficial consultada

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/
- https://developers.cloudflare.com/workers-ai/platform/data-usage/

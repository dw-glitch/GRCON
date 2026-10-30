# Assistente de Auditoria do GRCON — entrega de 29/10/2026

A integração ficou no PR #343, em rascunho e sem publicação. Esta entrega incorpora o assistente à versão atual do GRCON e acrescenta retomada direta de sessões, seleção visual de casos de treinamento e correções verificadas na origem. Preserva a atualização do SIGEM×PW e as correções da Consulta Geral.

## Acesso e operação

Em Ferramentas → Gerador de Alocações, a ação **Auditar com o Robô** abre o chat de 720 px. É possível usar os documentos selecionados no Gerador, anexar múltiplas alocações oficiais/LDs ou informar o número de uma alocação reconhecida no histórico publicado. Números ambíguos exigem o código completo com ano.

O chat permite conferir, pausar, retomar e baixar o pacote. Perguntas sobre achados exigem código completo e uma ocorrência única; revisão e alocação delimitam ocorrências repetidas. Código 121 nunca é tratado como 1210 ou 122. A consulta técnica reutiliza a rota Workers AI existente e somente as evidências dos achados selecionados.

O mesmo mascote oficial sai do cabeçalho, aparece no chat e retorna ao fechar. Os vídeos existentes atendem saudação, análise, atenção e sucesso; movimento reduzido usa imagem estática. Não foram geradas animações pagas nem duplicadas instâncias.

## Correções e arquivos

As decisões ficam vinculadas a contrato, documento, revisão, ocorrência, arquivo, aba, linha e SHA-256. Arquivos originais e comentários fiscais são preservados. Propostas equivalentes podem ser aprovadas em grupo; decisões já aprovadas ou rejeitadas saem dos grupos pendentes.

As cópias de LD são preparadas antes das cópias de alocação. O escritor de origem suporta título, workflow, Data Book, TAG, EAP, disciplina e N1–N6 **quando a coluna física existir de forma única**. Confere hash, código, revisão e valor anterior; recusa fórmulas, mesclagens, conflitos e campos sem coluna comprovada. Se a LD já contiver o valor aprovado, não a apresenta como corrigida. Não reescreve a identidade documental a partir de um TAG/EAP isolado.

O modelo oficial continua com 16 colunas. Seu escritor altera somente Workflow, Data Book e N1–N6 aprovados; as outras células são conferidas. As partes OOXML não autorizadas são comparadas, os XLSX são reabertos e os ZIPs têm CRC validado. Campos sem escritor aplicável permanecem como exceções, sem indicação falsa de correção.

**Baixar pacote completo** reúne o relatório com exatamente `RESUMO` e `DETALHAMENTO`, as cópias efetivamente produzidas e o manifesto com hashes e exceções. Dentro de **Nova alocação e linhas da Central**, a ação de geração usa a numeração oficial do Gerador e produz as linhas correspondentes. Não altera a Central compartilhada. Origens distintas são emitidas separadamente; todos os lotes são conferidos antes da emissão. Auditoria incompleta, fontes ausentes ou duplicidades ambíguas bloqueiam a nova numeração. Correções na origem sem uma cópia validada também bloqueiam essa emissão.

## Sessões e treinamento

Conversas e checkpoints são privados por usuário/contrato, com revisão otimista e retenção de 30 dias. A restauração consulta a análise diretamente pelo identificador, inclusive fora da página atual do histórico. Após recarregar, reanexe as fontes originais com os mesmos hashes. Anexos são processados no navegador; seus bytes não são armazenados no Cofre/R2.

Em Administração → Inteligência do Robô, o Proprietário ADM orienta uma proposta determinística, cria uma candidata e seleciona casos históricos positivos/negativos na tela, sem preparar JSON. A autorização administrativa é conferida no servidor. Ativação exige testes aprovados e referência de homologação; suspensão, revogação, histórico e restauração mantêm versões. Uma regra revogada só volta por restauração como candidata e nova validação, sem reaproveitar a aprovação anterior.

Regras automáticas são precedentes exatos: documento, revisão, disciplina, hashes da alocação e LD, versões das bases e valores antes/depois devem corresponder. Não são inferidas regras normativas gerais de comentários fiscais. Nenhuma regra corporativa foi ativada nesta entrega.

## Banco, habilitação e rollback

As tabelas privadas e o RPC já existentes no ambiente foram verificados. Migrations canônicas:

- `20261028192535_allocation_assistant_sessions_rules.sql`;
- `20261030010508_allocation_assistant_release_safety.sql`.

RLS está ativo, não há leitura direta por `authenticated`, o wrapper público é invoker e `anon` não pode executá-lo. Um teste transacional remoto percorreu sessões, candidata, validação positiva/negativa, autorização, retry idempotente, revogação/restauração e ausência de sessão. Todas as escritas de QA foram revertidas pela transação.

A configuração `contract.settings.enabledModules.allocationAuditAssistant` habilita a experiência. Administração → Contratos contém o controle correspondente para o Proprietário ADM. A publicação habilita somente UHDT-D; outros contratos preservam suas configurações. Rollback: desabilitar esse controle e reverter a interface; preservar o histórico e as regras, sem DROP.

## Evidências e limites

`docs/allocation-assistant-2-validation.json` registra os ensaios executados. Os scripts de navegador usam React, Web Workers, XLSX/ZIP e o runtime real do mascote; identidade e RPC são fixtures. O teste do banco remoto verifica funções reais em transação, sem representar uma sessão de navegador autenticada.

As planilhas corporativas autorizadas são testadas localmente, sem inclusão no repositório e sem upload de bytes. A correspondência exata é exigida; fontes ausentes ou revisões divergentes continuam pendentes. Os relatórios não presumem resolução fiscal por reapresentação posterior.

Precisão normativa, falsos positivos/negativos e cobertura de políticas gerais não foram homologados com um conjunto independente rotulado pela fiscalização. A extração livre de políticas de qualquer texto/planilha não é uma autorização automática. A publicação da experiência permite utilizá-la com esses limites explícitos, sem alegar conformidade integral nem aprovação fiscal.

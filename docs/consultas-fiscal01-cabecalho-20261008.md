# Fiscal 01 — cabeçalhos com identificação da responsável

## Problema

A Central de alocação pode usar `Resposta da Fiscal 01` seguido por uma quebra de linha e pelo nome da responsável entre parênteses. A comparação exata do cabeçalho não reconhecia esse formato, deixando `fiscalComment` vazio embora a planilha tivesse respostas.

## Correção

Somente a identificação da coluna de comentário remove o complemento final entre parênteses antes de comparar os aliases aceitos. O conteúdo da célula permanece preservado. Não confunde retorno/data da Fiscal 01, respostas da Fiscal 02 ou outros campos com esse comentário. Duas colunas reconhecidas para Fiscal 01 continuam sendo rejeitadas como cabeçalho duplicado.

Não altera a base ativa nem recompõe snapshots antigos. O importador corrigido será usado na próxima publicação da planilha por seu proprietário.

## Validação

- Testes de importação: cabeçalho com quebra de linha e responsável, conteúdo com acentos e múltiplas linhas, campo vazio, Fiscal 02 e cabeçalho duplicado.
- Regressões existentes: múltiplas alocações, comentários distintos, texto longo, célula mesclada, fachada React e exportação.
- Verificação local com uma planilha original de 02/10/2026: 12.541 vínculos, 12.015 respostas reconhecidas e texto/quebras de linha conferidos com a origem.
- Exportação local em memória: comentários de 9.624 documentos conferidos após salvar e reabrir o Excel. A verificação tolera a normalização de CRLF para LF pelo leitor XML, preservando o texto e as linhas.
- A planilha original e suas respostas não são incluídas no repositório.

## Atualização operacional

No contrato correto, o proprietário deve abrir Configurações gerais → Controle de Solicitações · Central de alocação, selecionar a planilha atual e usar “Publicar Central para a equipe”. Em seguida deve consultar os documentos e exportar o Excel.

A planilha de 02/10 foi usada apenas como fonte de validação. Publicar esse arquivo sobre uma base mais recente não faz parte da correção.

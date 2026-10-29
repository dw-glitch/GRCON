# Controle de Solicitações — Colar GRCON v3 e Conferência SIGEM

## Compatibilidade

A aba **Colar GRCON v2** permanece **inalterada** em A:F. A aba **Colar GRCON v3** contém as mesmas seis colunas iniciais, seguidas de:

| Coluna | Campo |
| --- | --- |
| G | STATUS DA CONFERÊNCIA |
| H | POSTADO NO SIGEM? |
| I | REVISÃO VERIFICADA NO SIGEM |
| J | DATA DE REFERÊNCIA DA CONSULTA GERAL |
| K | SNAPSHOT DA CONSULTA GERAL |

**SIM** na coluna H somente quando o motor oficial da Conferência localiza código e revisão exatos em Consulta Geral válida. Todos os demais cenários são **INDETERMINADO**, pois ausência não demonstra que nunca houve postagem. O status descritivo utiliza a classificação calculada pelo motor da Conferência, sem deduções paralelas.

A comparação usa índice da Consulta Geral em lote, sem chamada ao banco por documento. Base ausente/desatualizada: **NÃO VERIFICADO**. A data e o snapshot da Consulta Geral acompanham a exportação para rastreabilidade.

## Limitação do arquivo operacional de 29/10/2026

A aba **Colar GRCON** da planilha de Controle de Solicitações possui a coluna **G** reservada à **Chave documento e envio (não colar)**. Não colar diretamente A:K da nova exportação nessa planilha, porque isso sobrescreveria a chave e quebraria as fórmulas atuais.

Para migrar o modelo e permitir **uma colagem v3 de A:K**:

1. Mover a chave auxiliar da coluna G para a coluna L da aba Colar GRCON e atualizar a tabela GRCON_Envios para A:L, corrigindo referências estruturadas.
2. Reservar G:K para os novos campos. Manter título na linha 1, cabeçalhos na 2 e dados a partir da 3.
3. Acrescentar em Solicitações as colunas de status e confirmação com referências INDEX aos campos de GRCON_Envios, protegidas por IF quando a posição Y estiver vazia.
4. Validar o vínculo entre documento, revisão, última eGRDT pertinente e data de recebimento, principalmente quando houver solicitações repetidas.
5. **Não** preencher automaticamente Solicitações!S (Data prevista de Submissão no SIGEM) com a data de geração da eGRDT. A data real já aparece em Solicitações!X (Último envio GRCON). Para previsão verdadeira, usar fonte comprovada de planejamento, como Data Prevista da Central de Alocação, desde que o vínculo seja inequívoco.

**Antes da migração efetiva do arquivo:** continuar colando a aba v2 somente em A:F, nunca sobre G. A nova aba v3 pode ser consultada separadamente para verificação dos status, mas ainda não está conectada ao modelo Excel legado.

## Testes

Executar: node tests/colar_grcon_v3.cjs

Cobertura: preservação do contrato v2, confirmação exata de revisão, revisão divergente, ausência de base e base desatualizada. A atualização do Excel operacional e a verificação no navegador de produção ainda são etapas obrigatórias antes de anunciar a colagem única v3.

# Conformidade documental — integração progressiva

## Entrega

A análise documental carrega sob demanda um painel de conformidade com resumo,
busca por código, detalhes dos componentes N-1710 e paginação de 50 documentos.
Cada verificação identifica regra, norma, parte/anexo, revisão e seção. Quando a
verificação determina valores encontrados e esperados, eles são apresentados.
A consulta NORTEC não disponível aparece como informação pendente, sem afirmar
que a origem foi confirmada. Não há novo bloqueio normativo nesta entrega.

A emissão normal e a Repostagem auditam os dados finais de cada entrada, inclusive
edições. A Repostagem também mostra os achados na coluna Situação antes da geração. A eGRDT registra `normativeValidation` por documento e por geração: versão
da validação, regras, normas/partes/revisões, alertas, informações e bloqueios.
Os snapshots compactos preservam as contagens e não são recalculados no Histórico.
Registros antigos sem snapshot permanecem sem validação registrada. A exportação
do Histórico inclui versão, normas aplicadas, alertas e bloqueios.

O cache considera os dados efetivos do documento e a geração do registro de
versões. Uma edição ou substituição de versão invalida a análise em memória,
sem modificar o snapshot de uma emissão anterior.

## Critérios de decisão

A N-1710 utiliza o parser e os anexos independentes previamente entregues.
A N-2064 mantém a fonte D como não promovível até confirmação primária; suas
recomendações e achados de ciclo de vida são apresentados sem novo bloqueio.
O motor geral exige revisão de regra igual à revisão da fonte ativa e resultado
booleano conclusivo. Avaliador ausente, exceção, fonte pendente ou revisão
divergente produzem alerta, não uma decisão bloqueante.

A alocação manual e os bloqueios operacionais existentes continuam regidos pelo
motor operacional. A indicação de conformidade normativa avalia somente as regras
implementadas e seu contexto; não substitui a conferência contratual completa.

## Validação

- Regressões de parser, fonte, aplicabilidade, cache, emissão, Repostagem,
  snapshots compactos, exportação e preservação do passado.
- Chromium com LD e pasta de 60 documentos: confirmação de estrutura, resumo,
  paginação, busca, componentes, revisão I, snapshot de geração e uso após ficar
  offline com módulos já carregados.
- A confirmação de estrutura da LD fica acima do overlay, corrigindo um problema
  de interação encontrado pelo teste de navegador.

## Próximas fases do escopo original

Esta entrega não implementa o painel owner de Normas Petrobras, upload/promoção
compartilhada de fontes, exceções normativas justificadas, a matriz contratual
RECON/disciplinas ou a extração de texto do PDF para concordância completa com
capa/revisão N-381. Essas fases exigem entregas próprias e fontes/escopos
confirmados. Também permanece pendente a confirmação primária da N-2064 D.

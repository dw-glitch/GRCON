# Cruzamento com o Apêndice 3 e correção da alocação

Levantamento feito sobre os arquivos reais do usuário em 17/08/2026, antes de
qualquer alteração de código. Os números abaixo saíram do próprio motor do
GRCON lendo as quatro LDs e o Apêndice, não de estimativa.

## 1. O erro da alocação

Relato: *"ao gerar a GRDT ele não está pegando informação verídica se está ou
não alocado na LD"*.

Medido sobre as quatro LDs somadas — 6.027 registros:

| Situação | Registros |
| --- | --- |
| Vindos de aba **sem coluna de alocação** | 399 |
| Com a coluna presente e a célula vazia | **0** |
| Com **número de ALOC** mas **sem status** | 83 |
| Documentos em que nenhuma LD informa alocação | 346 |

Duas falhas distintas:

**1.1 Coluna ausente é tratada como célula vazia.** A aba `N-1710` da LD002 não
tem coluna de alocação; a `N-1710 MOD` tem. Hoje as duas produzem o mesmo
vazio, e vazio segue como decisão `pronto` sem avisar que a LD sequer rastreia
o dado. Nestas LDs *todo* "não informado" é coluna ausente — nenhum é pendência
real, e são fatos diferentes que precisam ser ditos de formas diferentes.

O parser já guarda o que falta para separar os dois casos:
`allocationStatusColumn` fica vazio quando a coluna não existe, e
`allocationStatusHeader` guarda o cabeçalho encontrado. A conclusão é que não
usa essa distinção.

**1.2 Número de alocação não conta como evidência.** 83 registros trazem algo
como `C1O-ALOC-COM-0002-2025` na coluna ALOCAÇÃO e nenhum status. Exemplo:
`CR-5290.00-22313-970-C1O-002`, na aba `N-1710 MOD`, com
`C1O-ALOC-COM-0002-2025`; o GRCON conclui `allocationStatus: ""` e decisão
`pronto`. Ter número de ALOC é evidência de alocação e está sendo ignorada.

O que **já funciona** e não deve ser mexido: a consolidação entre LDs. Nos 14
documentos que aparecem vazios numa LD e alocados em outra, o motor escolhe o
registro informado.

## 2. Cruzamento com o Apêndice 3

Arquivo: `ANEXO I — Apêndice 3, Fornecimento de Bens Tagueados`, Rev. B.

- Aba `Apêndice`, cabeçalho na linha 7, dados a partir da linha 8.
- 5.915 TAGs.
- Colunas: UNIDADE DE PROCESSO, DISCIPLINA, **TAG**, DESCRIÇÃO, RESPONSÁVEL PELO
  FORNECIMENTO, EQUIPAMENTO PRINCIPAL/ÁREA, CRITICIDADE, FAMÍLIA LCF,
  FORNECEDOR ORIGINAL, LOCAL DE ENTREGA.

### Regras decididas com o usuário

**Origem do TAG — nesta ordem:**
1. Coluna de TAG da LD, quando a aba tiver uma.
2. Extraído do próprio código do documento. O motor já faz isso em
   `reportGroup7Info(document).tag`: é o 7º grupo em diante do código, e vem
   vazio quando o identificador começa com `nt-`.

**TAG não encontrado no Apêndice → sugerir a forma COM `nt-`.**
`nt-` marca o não tagueado. TAG ausente do Apêndice significa item não
tagueado, logo o código para envio de ALOC leva `nt-`. Vale mesmo quando a LD
já descreve o documento sem `nt-`.

Exemplo: `..._TUB_REP_VM-322710` com TAG `VM-322710` ausente do Apêndice passa a
sugerir `..._TUB_REP_nt-VM-322710`.

**Sugerir nunca bloqueia.** Divergência entre a LD e o Apêndice gera sugestão de
mudança e segue; a postagem não é impedida em nenhum caso.

### Colunas novas

Na planilha de triagem (Resumo) e na tela da triagem:

| Coluna | Conteúdo |
| --- | --- |
| `CODIGO DA LD` | o código exatamente como está na LD |
| `BUSCA NO APENDICE` | resultado da procura do TAG: encontrado, não encontrado, ou sem TAG para procurar |
| `Tagueado sim ou não?` | SIM quando o TAG consta do Apêndice; NÃO quando não consta |

Quando não houver Apêndice carregado, as três colunas dizem isso — não sai
"NÃO" por ausência de fonte, que seria afirmar o que não se apurou.

## 3. Regras do módulo que continuam valendo

- Nunca inventar: sem fonte, o campo diz que não há fonte.
- Nunca casar por semelhança: o TAG é comparado por igualdade, tolerando apenas
  caixa, acento e espaço.
- Preservar a grafia da LD: nenhuma coluna reescreve título ou código.

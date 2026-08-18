# Cruzamento com o Apêndice 3 e correção da alocação

Levantamento feito sobre os arquivos reais do usuário em 17/08/2026, antes de
qualquer alteração de código. Os números abaixo saíram do próprio motor do
GRCON lendo as quatro LDs e o Apêndice, não de estimativa.

> **Implementado na 5.32.25.** O que este documento decidiu está em código:
> `core.js` (leitura da alocação pela linha inteira e coluna de TAG da LD),
> `apendice_tagueados.js` (leitura do Apêndice e cruzamento), `app.js` e
> `index.html` (fonte opcional do Apêndice e colunas da triagem) e
> `report_summary.js` (colunas do `Resumo`). A seção 4 registra o que mudou.

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

## 4. O que foi implementado

**Alocação.** `allocationEvidenceState(record)` lê a linha inteira e devolve
cinco situações em vez de um único vazio: `allocated`, `not_allocated`,
`unknown`, `not_tracked` (a aba não tem coluna de alocação) e `blank` (a coluna
existe e a célula está vazia). Quando o status está vazio e a coluna ALOCAÇÃO
traz um identificador de ALOC — token `ALOC` isolado mais sequência numérica,
conferido por `allocationNumberInfo` — a situação é `allocated` com evidência
`number`. Texto livre como `Já alocado / Sem rastreio de alocação` continua
fora, porque não é número de alocação.

O resultado da triagem carrega isso em `allocationFinding`, o motivo escrito
diz qual das situações ocorreu e o `Resumo` deixou de responder "Não informado"
para os três casos. Nada disso muda bloqueio: só `NÃO ALOCADO` bloqueia, e a
consolidação entre LDs não foi tocada.

**Apêndice.** `apendice_tagueados.js` localiza a aba e a coluna de TAG sozinho
— nos arquivos reais, aba `Apêndice`, cabeçalho na linha 7, coluna C, 5.682
TAGs distintos em 5.915 linhas de dados. O cruzamento roda depois da triagem,
sobre o resultado pronto, e por isso não interfere em decisão nenhuma.

Medido sobre as quatro LDs: 5.189 registros com TAG no Apêndice, 11.665 sem
TAG no Apêndice (com sugestão `nt-` quando o código é de relatório ET) e 5.902
sem TAG para procurar. Nenhuma LD desta remessa traz coluna de TAG, então o
TAG veio do Grupo 7 do código; a coluna da LD continua tendo preferência
quando existir.
---

# Geração de alocação — formato correto

Levantado a partir de cinco alocações reais dadas como exemplo correto:
`C1O-ALOC-CM-0237/0238/0239/0240/0241-2026`. Todas com a mesma estrutura:
aba única `GERAL`, 16 colunas, cabeçalho na linha 1.

## Colunas, na ordem

| # | Coluna | Como se preenche |
| --- | --- | --- |
| 0 | NomeDocumento | código do documento |
| 1 | Data Prevista | data |
| 2 | Workflow | `RNEST UHDTD U-32 C&M/<DISCIPLINA>` |
| 3 | Documento Ativo | vazio nos exemplos |
| 4 | Ação | `INCLUSÃO` |
| 5 | Data da Linha Base | vazio nos exemplos |
| 6 | Propósito de Emissão Original | `PARA CONSTRUÇÃO` |
| 7 | Documento Crítico | vazio nos exemplos |
| 8 | Observação | vazio nos exemplos |
| 9 | Caminho Data Book | `UHDT-D\|DATA BOOK C&M\|<GRUPO>\|<SUBGRUPO>` |
| 10-15 | N1 … N6 | níveis da EAP |

Pedido do usuário, ainda não implementado: a coluna `Aba` das linhas da central
passa a ser o número da LD, e `versão da LD` passa a ser o prazo descrito na LD
informada.

## Workflow por disciplina (do 5º grupo do código)

| Disciplina | Workflow |
| --- | --- |
| TUB | `RNEST UHDTD U-32 C&M/TUBULACAO` |
| EST | `RNEST UHDTD U-32 C&M/ESTATICOS` |
| CVL | `RNEST UHDTD U-32 C&M/CIVIL` |

## DOIS IMPEDIMENTOS REAIS

**1. Os níveis N1..N10 NÃO saem por cálculo do código EAP.**

Os exemplos mostram duas hierarquias diferentes:

| EAP no código | N1 | N2 | N3 |
| --- | --- | --- | --- |
| `3.8.10.1` | UHDTD U-32 | 03.REPARO | 03.08.TUBULAÇÃO |
| `6.10.4.1` | UHDTD U-32 | 06.MONTAGEM ELETROMECÂNICA | 06.10.ESTRUTURAS METÁLICAS |
| `7.6.1.1` | **07.COMISSIONAMENTO** | 07.02.CONDICIONAMENTO | 07.02.09.SOPS |

Em `3.x` e `6.x` o N1 é a unidade e os dígitos batem: `3.8` vira `03.08`. Em
`7.6.1.1` o N1 deixa de ser a unidade e os dígitos **não batem** — `6` vira
`02` e `1` vira `09`. Logo a EAP tem nomes e numeração próprios, e derivar os
níveis do código por regra aritmética produziria `07.06.01`, que não existe.

**É preciso a tabela da EAP** com o caminho de cada código. Sem ela, qualquer
implementação estaria adivinhando.

**2. A planilha de Data Books rev.C não foi enviada.**

O caminho do Data Book não é função do EAP mais disciplina. A mesma disciplina
`EST` aparece com dois destinos diferentes:

- `UHDT-D|DATA BOOK C&M|EQP ESTÁTICOS|C&M VASOS E TANQUES`
- `UHDT-D|DATA BOOK C&M|EQP ESTÁTICOS|C&M DEMAIS EQP ESTÁTICOS`

O usuário citou "a planilha que tem todos os databook rev.C" — ela é a fonte
desse caminho e ainda não foi anexada.

## Caminhos de Data Book vistos nos exemplos

- `UHDT-D|DATA BOOK C&M|TUBULAÇÃO|C&M VÁLVULAS`
- `UHDT-D|DATA BOOK C&M|EQP ESTÁTICOS|C&M VASOS E TANQUES`
- `UHDT-D|DATA BOOK C&M|EQP ESTÁTICOS|C&M DEMAIS EQP ESTÁTICOS`
- `UHDT-D|DATA BOOK C&M|CIVIL|ESTRUTURA METÁLICA`

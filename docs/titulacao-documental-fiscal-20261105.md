# Codificação e titulação de documentos — orientação da fiscal (05/11/2026)

Fonte: apresentação "Controle de Documentação — Codificação e titulação de documentos / Relatórios de C&M, itens tagueados e não tagueados" (`Controle de Documentação.pptx`, 10 slides), enviada pelo proprietário do GRCON. Norma citada: **ET-5290.00-22000-912-1LV-001** (item 7.1.7.2, última versão publicada; o Auditor de Títulos usa a Rev. R), ISO 9001:2015 / N-381, Anexos VII e X do contrato.

Este documento é a referência para o **Auditor de Títulos** (`workers/title-corrector.worker.js`, `src/react/title-corrector/`) e para qualquer trabalho sobre títulos de documentos. Quando a norma e esta apresentação divergirem de uma regra interna, vale a norma; regras do proprietário registradas abaixo ("Regras do proprietário") prevalecem sobre os exemplos.

## 1. Por que o título importa
- O **título é parte obrigatória da identificação documental**, não texto acessório. Deve permitir identificação **clara, inequívoca e sem ambiguidade** (rastreabilidade de qualidade, Anexos VII e X; ISO 9001:2015 / N-381).
- Objetivo: qualquer pessoa localizar, identificar e relacionar registros, relatórios e evidências **só pela nomenclatura e pelo título**; facilitar organização, arquivamento e recuperação durante e depois da obra; permitir **medição eletrônica a partir da nomenclatura dos arquivos**.
- Cenário de 5 a 10 anos: "preciso do relatório de inspeção da fundação, coluna C-101". **Sem descritivo é impossível localizar** entre milhares de RIRs; **com descritivo** é rastreável.
- **A LD é o primeiro documento contratual a ser emitido e deve conter o título completo.**
- O título **descreve o documento de forma sucinta**; os detalhes ficam dentro do próprio documento. A descrição **não deve ser genérica**.

## 2. Estrutura do código (7 grupos)
Exemplo: `XXX_RNEST_U12_3.1.1.1_EST_RIR_FT-22101`

| Grupo | Conteúdo |
|---|---|
| 1 | Trigrama do emissor |
| 2 | Sigla do empreendimento (RNEST) |
| 3 | Sigla da unidade |
| 4 | Item (etapa) do critério de medição — Anexo III, Apêndice A (a estrutura de pastas N1–N5 do SIGEM segue a EAP) |
| 5 | Código da disciplina |
| 6 | Item do código do documento (ex.: RIR) |
| 7 | **Código do TAG** (ou `nt-…` para não tagueados) |

## 3. Campo 7 — tagueados × não tagueados
**Tagueados**
- Informar o TAG **exatamente** como está no Anexo I — AP.3 (Fornecimento de Bens Tagueados), **exceto** se a descrição tiver `_` (sublinhado) ou `/` (barra): nesses casos **substituir por `-`**.
- Se o TAG **não está** no AP.3 mas existe em campo: tratar como item tagueado normal e **registrar na observação da LD** que é TAG inexistente no Anexo I — AP.3.

**Não tagueados**
- Campo 7 **deve iniciar com `nt-`**. Vale para serviços e materiais não tagueados da Planilha de Preços (Anexo IIB), desde que não exista TAG formalmente definido para o objeto.
- **`nt-` não faz parte da TAG.** O prefixo `nt-` identifica o item não tagueado, mas **não entra no TAG do final do título**: em `…_CVL_DESEM_nt-EMT-R-32003-R-32503-EL.37.015` a TAG do final é `EMT-R-32003-R-32503-EL.37.015` (o Grupo 7 sem o `nt-`).
- Usar os prefixos padronizados quando existirem; **não inserir espaços nem caracteres diferentes dos definidos**.
- Sem prefixo padronizado, seguir a lógica **O QUÊ É + ONDE É**, ou **O QUÊ É + QUANDO**. Os dois últimos itens (onde/quando) **não precisam estar juntos** no mesmo código.

### Prefixos pré-definidos (itens não tagueados)
| Material | Sigla / prefixo | Sufixo / regra | Exemplo |
|---|---|---|---|
| Leitos e bandejas | LBN (novo) / LBE (existente) | final do DE | `AB1_RNEST_U36_3.1.1.1_RIR_LBN-140-CHZ-101` |
| Eletrodutos | ETN / ETE | final do DE | `…_RIR_ETN-140-CHZ-101` |
| Luminárias | LMN / LME | final do DE | `…_RIR_LMN-140-CHZ-101` |
| Suportes | SPN / SPE | final do DE | `…_RIR_SPN-140-CHZ-101` |
| Estrutura metálica | EMT | local / TAG / final do DE | `…_RIR_EMT-ESC-MA-130-CHZ-102` |
| Válvula manual existente | VM | código da válvula (projeto 3D) | `…_RIR_VM-360958` |
| Válvula manual nova | VM | código da válvula | `…_RIR_VM-36999` |
| Conexão | CNXN (nova) / CNXE (existente) | código aplicável | `…_RIR_CNXN-1234` |
| Miscelânea | MISN / MISE | código aplicável | `…_RIR_MISN-1234` |
| Tubulação | código da linha / STH | conforme aplicável | `…_RIR_3-4-AD-36-07700-AA-NI` |
| Andaime | AND | final do DE ou mês/ano | `…_3.1.1.1_AND-JAN-26` |
| Cabos novos | BOB + código da bobina | — | — |
| Cabos lançados | TAG do circuito | unidade + circuito | `…_RIR_U32-PN-01-04F` |

## 4. Lógica de titulação: O QUÊ? · QUANDO? · ONDE?
Padrão dos exemplos da fiscal: **TIPO DOCUMENTAL – O QUÊ – ONDE/QUANDO**.

Exemplos adequados (slide 3):
- `…_CVL_RIR_nt-FUND-BL-B-EST01` → **RIR – FUNDAÇÃO DIRETA – BLOCO B ESTRUTURAL 01**
- `…_CVL_RIR_nt-EMT-SOLD-T32000` → **RIR – RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO – EST. METÁLICA SOLDAGEM DA TORRE SEPARADORA**
- `ABC_RNEST_U34_3.1.1.1_DIN_RIR_B-34110A` (tagueado) → **RIR – RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO – BOMBA CENTRÍFUGA DE ÁGUA GELADA**

Exemplos de codificação `nt` (slides 8 e 9):
- `C1U_RNEST_U36_3.1.1.1_CVL_RIR_nt-EMT-ESC-MA-EL11600-F-36001` → **Inspeção de Recebimento Civil – Escada Marinheiro Forno** (O QUÊ: EMT estrutura metálica, ESC-MA escada marinheiro; ONDE: EL11600 elevação, F-36001 TAG do forno; QUANDO: não informado, desnecessário).
- `C1O_RNEST_U32_6.21.1.1_CVL_MTAND_nt-EMT-AND-FEV-26` → **Relatório de Montagem de Andaimes Aplicados – Fev/2026** (QUANDO: FEV-26; ONDE: não informado — são todos os andaimes do mês).
- `AB1_RNEST_U36_3.1.1.1_CVL_RIR_CI-104-1-1-130-CHZ-102` → **Inspeção de Recebimento Civil – Caixa de Passagem contida no DE-5290.00-2311-130-CHZ-102** (ou apenas "… – Caixa de Passagem"; o final do DE concentra a localização).

## 5. Notas da fiscal sobre a codificação
1. O título descreve o documento de forma sucinta; as informações detalhadas estão no documento.
2. Codificação com **sequência numérica crescente é exceção**.
3. **Não usar caracteres especiais** como barra `/`, ponto `.`, asterisco `*` etc. na codificação (item 7.1.7.2 da ET).
4. Evitar codificações excessivamente extensas; **jamais ultrapassar 78 caracteres na codificação** (nome do documento). A descrição não deve ser genérica.
5. A estrutura de pastas do SIGEM segue a EAP (Anexo III, AP.A) — arquivamento nas pastas N1 a N5.

## 6. Regras do proprietário para o Auditor de Títulos (05–06/11/2026)
- **A TAG do código fica sempre no final do título**, no modelo `TÍTULO - TAG`. (Os exemplos da apresentação não mostram a TAG no fim, mas a regra do proprietário prevalece.)
- **Documento `nt-`**: o `nt-` **não é parte da TAG**; a TAG do final é o Grupo 7 sem o prefixo. Exemplo do proprietário, LD correta:
  `C1O_RNEST_U32_3.9.1.1_CVL_DESEM_nt-EMT-R-32003-R-32503-EL.37.015` → `RELATÓRIO DE DESMONTAGEM DE ESTRUTURA METÁLICA \ 130 - REATORES \ VIGA \ R-32003/503-EL.37.015 - DESMONTAGEM DE ESTRUTURAS METÁLICAS DA VIGA COM GRAU DE CORROSÃO SEVERA - EMT-R-32003-R-32503-EL.37.015`.
- **O Auditor é um REUNIDOR de informações, não um substituto de título.** Ele junta o **título atual da LD** com o que encontra nas **bases oficiais** (norma, SCON, LI de válvulas, Apêndice 3, SCON ESCOPO…) e forma um título coerente e o mais detalhado possível, **sem retirar informação que o título atual já traz**, com a TAG no final. Há julgamento de onde juntar:
  - título atual **rico** (traz muito mais do que as bases): ele é mantido **por inteiro**; o tipo documental das bases entra na frente se faltar, e o que as bases acrescentam entra antes da TAG;
  - título atual **pobre ou genérico**: o título das bases é o esqueleto e o que o atual diz a mais é anexado;
  - bases **em conflito**: o título atual é mantido por inteiro e a linha segue para revisão;
  - identificador técnico que não pertence ao código do documento (outra TAG) nunca é incorporado, e trecho do título atual que **contradiz** as bases (ex.: "VALVULA AUTOMATICA" × "VALVULA MANUAL") não é recolhido; ambos são ditos na justificativa.

# FASE 6 — Contrato oficial do workbook GRDT

Data: 2026-09-30  
Branch: `feat/grdt-workbook-official-contract`

## Referência consolidada

Foram conferidas as cinco cópias fornecidas de **Carga em Lote de Documentos**. As cinco são binariamente idênticas:

- tamanho: **74.240 bytes**;
- formato: **OLE/CFB BIFF8 (.XLS legado)**;
- SHA-256: `25e1dd4224661e4170b91b7d0e14402373dca707e44c558ced94d039cba08ac2`.

O template interno do GRCON também é BIFF8, apesar do nome histórico `grdt-template.xlsx`. Ele não é tratado como cópia byte a byte do arquivo fornecido: o contrato passa a ser verificado por estrutura e comportamento, evitando acoplar o gerador a metadados de impressão/autoria que não alteram a carga no SIGEM.

## Contrato preservado

A aba `GRDT` continua exigindo exatamente, nesta ordem:

1. DOCUMENTO
2. REVISÃO
3. TÍTULO
4. ARQUIVO
5. FORMATO
6. DISCIPLINA
7. TIPO DE DOCUMENTO
8. PROPÓSITO
9. CAMINHO DATABOOK

Também são verificados:

- arquivo BIFF8 real;
- presença da aba `GRDT`;
- cabeçalhos exatos;
- presença das regras de validação/combos do modelo;
- linha `FIM` na posição esperada;
- ausência de valores depois de `FIM` na mesma linha;
- round-trip do conteúdo escrito;
- revisão não vazia;
- arquivo não vazio e com extensão;
- formato não vazio;
- disciplina válida;
- tipo documental não vazio;
- limite técnico do BIFF8.

## Compatibilidade com as regras atuais

A FASE 6 não promove silenciosamente campos que hoje são informativos na geração normal:

- TÍTULO;
- PROPÓSITO;
- CAMINHO DATABOOK.

Esses campos passam a aparecer no resultado de `auditRows` como avisos quando vazios. Repostagem e outros fluxos que já possuem regras mais estritas mantêm as próprias validações.

Quando o chamador fornece os catálogos de `formats`, `documentTypes` e `purposes`, o workbook também cruza os valores com essas listas. Propósito inválido permanece alerta no contrato do workbook; o fluxo que já exige confirmação pode bloqueá-lo antes da geração.

## Novo gate automatizado

`tests/grdt_workbook_official_contract.cjs` valida:

- template BIFF8;
- nove cabeçalhos;
- combos/validações de dados;
- fingerprint da referência real;
- geração e reabertura;
- linha FIM;
- revisão vazia;
- arquivo sem extensão;
- disciplina inválida;
- preservação do caráter não bloqueante de Título/Propósito/Databook.

O teste é parte de `npm test` e, por consequência, de `npm run verify`.

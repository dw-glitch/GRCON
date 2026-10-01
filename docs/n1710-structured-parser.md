# N-1710 — parser estruturado e catálogos versionados

Data: 2026-09-30  
Branch: `feat/n1710-structured-parser`

## Escopo

Esta fase cria a base técnica para validar a codificação N-1710 sem substituir silenciosamente as regras operacionais atuais do GRCON.

Foram adicionados:

- `n1710_catalog.js`: códigos compactos dos Anexos A–F, com revisão, edição e SHA-256 das fontes;
- `n1710_parser.js`: decomposição dos Grupos 0–6, validação de formato e validação semântica contra os anexos;
- `tests/n1710_parser.cjs`: regressões com códigos do RHDD, exemplos da própria N-1710, rota TRANSPETRO e casos inválidos.

## Fontes auditadas

- Corpo N-1710 Rev. N — 04/2020.
- Anexo A Rev. W — 10/2023.
- Anexo B Rev. CJ — 04/2025.
- Anexo C Rev. BF — 12/2024.
- Anexo D Rev. BG — 04/2025.
- Anexo E Rev. D — 03/2010.
- Anexo F Rev. G — 10/2014.
- Anexo G Rev. CN — 04/2025.

Os PDFs não são empacotados no frontend. O catálogo guarda apenas os códigos necessários para validação e os hashes das fontes.

## Regras implementadas

1. Grupo 0 de idioma é opcional em português e, quando presente, aceita I/A/F/L/E/D.
2. Grupo 1 possui duas letras e precisa existir no Anexo A.
3. Grupo 2 segue `CDDD.EE` e precisa existir no Anexo B.
4. Grupo 3 aceita `GGGG` ou `FGGGG`; o primeiro algarismo opcional é tratado como diferenciador.
5. Instalações iniciadas por `48` usam Anexo E para área e Anexo F para classe.
6. Demais instalações usam Anexo C para área e Anexo D para classe.
7. Grupo 4 possui três caracteres alfanuméricos e é conferido no anexo correto.
8. Grupo 5 possui três caracteres alfanuméricos, mas sua existência não é declarada como confirmada porque depende do cadastro NORTEC/Código de Origem externo aos anexos fornecidos.
9. Grupo 6 aceita três algarismos e a exceção normativa de quatro algarismos quando o sequencial ultrapassa as centenas.

## Caso RHDD validado

`RL-5290.00-22313-91B-C1O-002`

- RL → Anexo A;
- 5290.00 → Anexo B / Refinaria do Nordeste;
- 22313 → diferenciador 2 + área base 2313;
- 2313 → Anexo C / Unidade de Hidrotratamento;
- 91B → Anexo D;
- C1O → sintaxe do Grupo 5 válida, existência dependente do cadastro de origem;
- 002 → sequencial válido.

## Guardrail de integração

Esta PR não muda a decisão da geração normal ou da Repostagem. O parser é inicialmente uma fonte estruturada para uma próxima integração em modo ALERTA.

Isso é intencional porque o GRCON possui códigos operacionais/contratuais históricos que não podem ser transformados em erro somente porque o Anexo A atual mudou. A promoção para BLOQUEIO precisa considerar contexto, contrato, versão do documento e regra de override.

## Catálogo extraído

A extração local reproduz:

- 21 categorias;
- 7.149 instalações;
- 915 áreas do Anexo C;
- 704 classes do Anexo D;
- 118 áreas do Anexo E;
- 119 áreas mapeadas no Anexo F;
- 493 pares área/classe no Anexo F.

O teste de catálogo verifica também marcos de controle do RHDD e da TRANSPETRO.

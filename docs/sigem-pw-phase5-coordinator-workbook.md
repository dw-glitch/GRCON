# SIGEM × PW — Fase 5 | Planilha do coordenador

## Escopo implementado
Referência conferida no diagnóstico da Fase 0: arquivo **LD x PW 2.xlsx**, com três abas **N-1710**, **REL. PW** e **SIGEM**. A origem usada no diagnóstico possuía 6.041 registros na aba principal e 29.421 linhas PW.

O exportador React passa a utilizar o ExcelJS **já incluído no GRCON**, carregado sob demanda por `GRCONModuleLoader.ensure("excel")`. Não foi acrescentada dependência nem gerado um segundo relatório sintético.

1. **N-1710** mantém 32 colunas `A:AF`, as três linhas de cabeçalho e a matriz `0..U` nas colunas L–AF. Dados vêm do mesmo `reconcileManagerial` que alimenta os cartões. Fórmulas F/G/H/I são geradas com referências à linha exata de `REL. PW`, e caches coerentes com a fonte selecionada. A coluna J usa o catálogo central de providências da Fase 1; a K preserva o status de cadastro.
2. **REL. PW** escreve as 70 colunas `A:BR` do CSV, na ordem original, inclusive títulos duplicados, espaços e valores vazios. Os valores PW são texto literal, inclusive quando começam por `=`, sem fórmulas a partir de dados não confiáveis. Linhas válidas de outras empresas permanecem na origem para auditoria, mas não entram nos indicadores.
3. **SIGEM** permanece vazia como no modelo fornecido; a origem oficial SIGEM continua sendo a Consulta Geral do GRCON, não uma aba fictícia.

Adotado visual GRCON: azul institucional, verde para fonte/comparação, cabeçalho de contraste, congelamento de linhas/colunas, filtros, larguras ajustadas e destaque de ações. Nenhum campo, coluna ou aba adicional é criado.

## Critérios de integridade
- A exportação **não prossegue** se faltam as referências ativas, a Consulta Geral, o PW com coluna C ou dados brutos PW.
- **Não aceitar automaticamente outra quantidade de colunas**: se a consulta PW não tiver 70 posições, bloquear em vez de inventar, descartar ou modificar os campos.
- A fonte PW deve permitir vincular cada documento cadastrado à sua linha original, caso contrário interromper.
- CSG e QTM vêm exclusivamente da coluna C. `Previsto` significa cadastrado, não emitido.
- Documento único nos cartões, Documento + Revisão na matriz e operações de auditoria; referências LD ativas são a fonte da lista.
- Não reaproveitar status SIGEM de revisão divergente; comentários e ressalvas não equivalem a conformidade.

## Não comprovado nesta fase
- As **fórmulas originais exatas** do XLSX entregue ao coordenador não foram materializadas junto à branch. Esta implementação fornece fórmulas equivalentes para as quatro posições F:I, mas a equivalência fórmula a fórmula com o arquivo original e todos os doze textos históricos de AÇÃO **ainda exige homologação comparativa**.
- Linhas PW sem código documental válido foram excluídas pelo parser anterior. A Fase 5 não afirma recuperar essas linhas omitidas.
- Arquivos PW antigos que não preservam `pwRawCells` precisam de nova importação; não foram reconstituídos por aproximação.
- Ainda é necessário teste de estresse com 29 mil registros PW e teste de memória/navegador corporativo, além da autorização para compartilhamento desses 70 campos.
- Sem publicação Cloudflare ou integração com a `main` até concluir homologação e QA.

## Testes automatizados
```bash
npm run test:sigem-pw-coordinator
npm run test:sigem-pw-pw-fidelity
npm run test:sigem-pw-managerial
npm run typecheck
npm run build
```

`test:sigem-pw-coordinator` gera XLSX real em memória usando ExcelJS, reabre o arquivo e verifica: três abas, 32/70 colunas, fórmulas F:I, indicadores do painel, valores literais que começam com `=`, estilo, filtros e erros em base obsoleta.

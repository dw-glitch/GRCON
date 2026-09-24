# FASE A — Evolução SIGEM × PW em React + TypeScript

## Escopo

Migração exclusivamente estrutural da interface **Evolução** do módulo SIGEM × PW.

## Fonte da verdade preservada

- `sigem_pw_evolution_core.js` continua responsável por normalização, universo LD, snapshots, comparação por código + revisão, transições de emissão e timeline.
- `sigem_pw_history_core.js` continua responsável pelos snapshots históricos.
- `sigem_pw_history_management.js` continua responsável pelo gerenciamento do histórico.
- A regra de contagem por ocorrência/revisão não foi reescrita.

## Runtime

- Entrada React: `src/react/sigem-pw/evolution/index.tsx`.
- UI: `SigemPwEvolutionApp.tsx`.
- Estado/integração: `useSigemPwEvolution.ts` + `sigemPwEvolutionAdapter.ts`.
- Bundle lazy: `react-dist/sigem-pw-evolution-app.js`.
- O bootstrap carrega primeiro o Core e, somente ao abrir Evolução, carrega o bundle React.
- A fachada global `GrconSigemPwEvolutionUi` foi preservada para compatibilidade.
- `sigem_pw_evolution_app.js` foi removido.

## Paridade funcional

Preservados:

- período inicial/final e “Todo o histórico”;
- seleção de snapshot anterior/atual para SIGEM e PW;
- KPIs Entraram no SIGEM, Entraram no PW, Emitidos no PW e SIGEM novo sem PW;
- listas de entradas, removidos, correspondências e pendências;
- filtros por código, classe, tipo, revisão, status, disciplina, TAG, EAP e origem;
- paginação de 100 registros;
- timeline diária;
- auditoria das bases;
- detalhe/rastreabilidade por linha;
- exportação XLSX sob demanda;
- validação do universo pela LD da Qualidade;
- abertura do Gerenciador de histórico.

## QA

- teste estrutural dedicado: `tests/sigem_pw_evolution_react.cjs`;
- regressão do Core: `tests/sigem_pw_evolution.cjs`;
- Chromium confirma raiz React, fachada global, bundle lazy e ausência do app legado;
- Service Worker inclui CSS + bundle React e invalida o cache anterior.

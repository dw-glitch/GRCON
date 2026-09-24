# FASE B — Evolução SIGEM × PW

Base: `main` em `adf88f902d92459ab9edc985ec32e17f27e590ea`.
Branch: `feat/phase-b-sigem-pw-evolution-ui`.

## Escopo e paridade

| Área | Mudança visual | Contrato preservado |
| --- | --- | --- |
| Header e universo LD | Título mais curto; histórico como ação secundária | LD obrigatória e revalidação |
| Período e bases | Etapas visuais; selects truncados com título completo | Mesmo período e IDs de snapshots |
| KPIs e resumo | Seleção com `aria-pressed`; cartões 2 × 2 no mobile | Quatro valores e sete modos oriundos da comparação |
| Timeline | Exibe também saídas SIGEM/PW, legenda e foco por dia | Mesmos cinco valores diários retornados pelo Core |
| Auditoria e listas | Cartões compactos; lista com rolagem local | Dois snapshots e sete modos |
| Filtros | Três principais, seis avançados recolhíveis; contagem de ativos | Nove filtros; rawFilters, debounce e adapter inalterados |
| Tabela e exportação | Badges; cabeçalho fixo; indicação de rolagem no celular; exportação próxima da lista | Dez colunas; PAGE_SIZE 100; exportação de todas as páginas filtradas |
| Detalhe | Campos agrupados por tema | UiDrawer, todos os 21 campos, foco e fechamento |
| PWA | Nova chave de cache | Estratégia de atualização preservada |

`sigem_pw_evolution_core.js`, adapters, importação, matching, revisão e IndexedDB não foram modificados. Não foram adicionadas dependências.

## Verificação

| Verificação | Estado | Evidência / limite |
| --- | --- | --- |
| TypeScript, build | PASS | `npm run typecheck`, `npm run build` |
| Suíte funcional, Core 20k, Dashboard 50k e módulos relacionados | PASS | `npm test`; Core 20k 91,2 ms; Dashboard 50k 4205,4 ms modelo, 1308,0 ms agregação; combinado 3176,5 / 1322,8 ms |
| Verify | PASS | `npm run verify`: TypeScript, build, sintaxe, referências, versões, dependências, Supabase e suíte completa |
| Chromium 1440/1366/1024/768/390, teclado, dark, PWA | NÃO EXECUTADO | Instalação Playwright/Chromium bloqueada no ambiente; runner atualizado para medir seção e rolagem |
| Screenshots 01–16 e inspeção visual | NÃO EXECUTADO | Depende de Chromium funcional |
| Altura 390 antes/depois | NÃO EXECUTADO | Baseline e valor posterior não podem ser medidos sem Chromium |
| Métricas de interação, lazy, exportação | NÃO EXECUTADO | Depende de Chromium funcional |
| Bundle depois | PASS | 181,10 kB / 57,21 kB gzip; referência anterior ~178,5 / ~56,6 kB |
| Preview, CI, produção e erros de runtime | NÃO EXECUTADO | Dependem de branch remota e deploy |

Não mesclar enquanto o teste Chromium, a inspeção de telas, CI e Preview estiverem pendentes.

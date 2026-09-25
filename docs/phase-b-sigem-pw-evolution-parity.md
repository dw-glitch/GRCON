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
| Chromium 1440/1366/1024/768/390, teclado, dark, PWA | PASS | GitHub Actions instalou Chromium e executou o runner completo no commit `bd891cf`; última correção visual aguarda nova rodada |
| Screenshots e inspeção visual | FAIL | 13 capturas da Evolução geradas; inspeção identificou e levou à correção da sobreposição dos KPIs, largura da tabela, contraste dark e células longas. As 16 capturas com os nomes solicitados ainda não foram produzidas |
| Altura 390 antes/depois | NÃO EXECUTADO | Após: 2.683 px no estado medido da fixture; baseline anterior à FASE B não está disponível para comparação confiável |
| Métricas de interação, lazy, exportação | PASS | Commit `bd891cf`: openModule 1299 ms; lazy 112 ms; snapshots 60,5 ms; período 0,6 ms; filtro 0,1 ms; busca 0,4 ms; exportação 20,5 ms (83 ms wall) |
| Bundle depois | PASS | 181,10 kB / 57,21 kB gzip; referência anterior ~178,5 / ~56,6 kB |
| Preview do projeto correto | PASS | `grcon` da equipe Consagprojetos / bibiaprojetos, Preview READY do commit `53f0ce8`; checar novamente para o último commit |
| CI final, produção e erros de runtime | NÃO EXECUTADO | Última rodada em andamento; produção continua na `main` anterior |

Não mesclar enquanto a CI do último commit, as 16 capturas solicitadas e a comparação de altura antes/depois estiverem pendentes.

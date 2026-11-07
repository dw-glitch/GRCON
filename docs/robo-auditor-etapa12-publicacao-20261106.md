> Estado atualizado do banco e da publicação: veja `docs/robo-auditor-publicacao-20261107.md`. As restrições e estados abaixo registram a preparação anterior.

# Robô Auditor de Alocações — Etapa 12: preparação da publicação — 06/11/2026

## Atualização de continuidade — 07/11/2026

O PR #431 foi localizado aberto e em rascunho, head `8ffce5f5`, sem merge. A continuidade local foi feita na branch `fix/robo-auditor-conclusao-20261107`, preservando também a main `0c3572b1`. Não houve novo commit, push ou publicação nesta continuidade. Veja `docs/robo-auditor-conclusao-20261107.md` para correções, testes repetidos, dados reais e bloqueios atuais. As referências a “PR não criado” abaixo descrevem a preparação histórica e estão superadas pelo PR #431.

## Estado
**PREPARADO. NÃO PUBLICADO.** Autorizado a **preparar**; nesta etapa **não** houve merge na `main`, push de publicação, PR, alteração de dados de produção nem aplicação de migração. As únicas consultas ao ambiente real foram **somente-leitura** (listar projetos/migrações/branches do Supabase, ler o texto da função RPC e listar as implantações do Worker na Cloudflare). O branch `claude/robo-auditor-etapas-1-3` permanece só no remoto, sem PR.

## 1. Ordem obrigatória da publicação (cada passo exige autorização do proprietário)
| # | Passo | Quem | Estado |
|---|---|---|---|
| 1 | Revisão do código do branch (PR em rascunho). A revisão do Codex está sem cota; o `CLAUDE.md` pede esperar a revisão antes de mesclar | proprietário | pendente |
| 2 | **Homologar a migração e o rollback num banco de homologação** (hoje **não existe**: a conta tem só o projeto de produção; criar branch/projeto é serviço pago) | proprietário | **bloqueado** |
| 3 | Aplicar **em ordem** `20261107120803_allocation_auditor_complete_checkpoint.sql` e `20261107120824_allocation_auditor_reference_validations.sql` (RA-07) em produção. Ambas ainda **não existem** em produção (consulta somente-leitura em 07/11/2026) e cada uma tem rollback em `supabase/rollback/` | proprietário | pendente |
| 4 | Merge na `main` → deploy automático (GitHub → Cloudflare Workers Builds) | proprietário | pendente |
| 5 | Verificação pós-deploy (seção 5) | eu, após autorização | pendente |

A migração é **aditiva** (uma tabela privada nova com RLS e dois ramos novos na função privada). Aplicá-la **antes** do frontend é a ordem correta; o frontend atual também **tolera** o banco sem a migração (seção 2), então a ordem 3→4 não é frágil.

## 2. Compatibilidade frontend × banco (verificada)
Consulta somente-leitura em produção (06/11/2026): a função `private.grcon_allocation_auditor` **não** contém `input-chunk` e a tabela `grcon_allocation_audit_inputs` **não existe**; a última migração aplicada é `20261104221515_rls_auth_uid_initplan`.

| Combinação | Resultado | Evidência |
|---|---|---|
| Frontend novo + banco **sem** a migração | Análise, pendências, chat e relatório funcionam. **Salvar o histórico completo e a emissão oficial ficam bloqueados** com o aviso `CHECKPOINT_UNAVAILABLE` ("o banco ainda não recebeu a atualização do checkpoint… baixe o relatório antes de sair"). Com análise anterior no contrato, **nenhuma análise órfã** é criada; na primeira gravação do contrato a falha vem ao enviar a entrada (a análise criada fica sem entrada — caso borda documentado). Ao aplicar a migração, salvar volta a funcionar | `tests/allocation_auditor_checkpoint_phase2.cjs` (servidor legado simulado) |
| Frontend novo + banco **com** a migração | fluxo completo (checkpoint, retomada, reauditoria) | mesmo teste + PGlite |
| Frontend **antigo** (rollback do Worker) + banco **com** a migração | compatível: o frontend antigo nunca cria análises `snapshotVersion 2`; análises antigas seguem sem o novo bloco | migração aditiva; `allocation_auditor_database.cjs` |
| Rollback da migração depois de ter dados | recusa apagar entradas salvas sem confirmação explícita | `tests/allocation_auditor_migration_rollback_stage12.cjs` |

**Correção feita durante a preparação:** eu havia suposto que uma operação desconhecida responde "Operação não reconhecida" para qualquer `id`. O teste no PGlite mostrou o contrário: com **id inexistente** os dois bancos respondem "Análise indisponível", então a sonda de compatibilidade **precisa de uma análise real do contrato** (`input-detail` nela: banco antigo → "Operação não reconhecida"; banco novo → responde). Corrigido antes de qualquer envio; a primeira versão da sonda teria sempre concluído "banco atualizado".

## 3. Rollback
### 3.1 Frontend / Worker
- Implantação em produção **antes** desta publicação (Worker `grcon-cloudflare`): **`7484cc7c-06df-4523-ac61-82937e289fd6`**, versão **`c7b2f4b3-cc92-47ca-b00a-6182e341e94a`** (06/11/2026 14:15 UTC). Anterior: `12e29476…`, versão `2d6abbba-ffd5-419e-a3d8-f17f3bedf398`.
- Reverter: `npx wrangler rollback c7b2f4b3-cc92-47ca-b00a-6182e341e94a` (ou o botão de rollback da implantação no painel da Cloudflare). Para voltar o código: reverter o commit de merge pela interface do GitHub (gera novo deploy).
### 3.2 Banco
- `supabase/rollback/20261107120803_allocation_auditor_complete_checkpoint.down.sql` (**fora** de `supabase/migrations`, nunca roda sozinho). Remove o bloco que a migração acrescentou (a função volta **byte a byte** ao texto anterior — md5 de produção antes da migração: `34c59c9fddfaade8ef378b54a6dfa470`, 7.318 caracteres) e remove a tabela de entradas **somente se vazia** (ou com `set local app.confirm_drop_inputs='sim'` depois de exportar). Idempotente e a migração pode ser reaplicada depois. Provado no PGlite, **não** em banco real.
- Gatilhos para reverter: erro de gravação do histórico em massa, falha de RLS/permissão, ou migração que degrade o desempenho das demais telas.

## 4. Preservação dos demais módulos
- **Merge com a `main` atual** (`0c3572b1`, inclui `#430`): simulado numa árvore temporária — **sem conflitos**; `npm run build`, `npm test` (agora incluindo `test:allocation-auditor`) e `build:cloudflare` + `verify:cloudflare` (348 arquivos) passam.
- **Superfície alterada fora do auditor** (63 arquivos no branch; 11 fora do auditor): `cloudflare/worker-entry.mjs` (apenas o manipulador da consulta de IA: log seguro e erro 422), `cloudflare/allocation-audit-ai.mjs` (importa o contrato de campos), `grcon_module_loader.js`, `scripts/verify-cloudflare-production.mjs`, `package.json` e testes do assistente de alocação.
- **Risco tratado em 07/11/2026:** `workers/allocation.worker.js` (o worker do **Gerador**) havia passado a usar a leitura estrita de LD também na importação de LD do Gerador. Agora a leitura estrita é um tipo separado (`audit-ld`), usado **só** pelo Auditor; `parse('ld')` do Gerador voltou **exatamente** ao comportamento original (leitura do XLSX sem `cellNF`/`sheetStubs`, sem recusar cabeçalho ambíguo), com teste que prova as duas rotas. Mesmo assim, vale **uma conferência com uma LD real** do Gerador antes de publicar.
- `npm test` agora também executa `npm run test:allocation-auditor` (decisão sua). **Atenção:** os workflows do GitHub Actions deste repositório **não disparam sozinhos** (só `workflow_dispatch`); o portão automático é o Workers Builds, que roda `npm run build` e `wrangler deploy`, sem `npm test`. Rodar `npm test` antes do merge é manual.

## 5. Verificação de compatibilidade (pré e pós-deploy)
Pré (local, já executados): `npm run build`, `npm test`, `npm run build:cloudflare && npm run verify:cloudflare`, `npx wrangler deploy --dry-run`, `node scripts/validar-allocation-assistant-browser.cjs` (navegador real), matriz independente (17/17) e `worker_edge_checks` (10/10).
Pós-deploy (após autorização): `node scripts/verify-cloudflare-production.mjs` (confere os ativos do auditor em produção, incluindo os módulos novos), abrir o Gerador, auditar uma alocação pequena, salvar o histórico (deve salvar se a migração estiver aplicada; senão exibe `CHECKPOINT_UNAVAILABLE`), baixar o relatório e conferir as abas, reexecutar e ver a aba REAUDITORIA, e checar os logs da consulta de IA (só `requestId`/etapa/código).

## 6. Riscos de publicação
1. **Migração não homologada** (sem banco de homologação) e rollback provado só no PGlite.
2. **RA-02** pode aumentar o número de erros em alocações reais (títulos/TAGs que antes passavam em silêncio).
3. ~~Importação de LD do Gerador mais estrita~~ — isolada (seção 4); resta a conferência com LD real.
4. **Desempenho** do pacote com milhares de documentos (13 s para 2.500; 81 s para 10.000; ~1,2 GB no Node) — não medido em navegador de usuário.
5. **Prazos** da Etapa 8 não calibrados; **IA** nunca exercitada contra o Workers AI real.
6. **Sem validação com usuários**; ML bloqueado (sem acervo autorizado); RA-07 parcial; RA-16 sem dados reais.
7. Revisão do Codex indisponível (sem cota) — o `CLAUDE.md` pede esperar; decidir se a revisão humana a substitui.
8. Esta sessão encontrou e corrigiu regressões minhas só ao rodar a suíte inteira do auditor; recomenda-se manter `test:allocation-auditor` no `npm test`.

## 7. Rascunho do PR (não criado)
**Título:** Robô Auditor de Alocações — referências, comparação com a LD, parecer único, chat, Excel didático, reauditoria, falhas explicadas e infraestrutura de aprendizado
**Corpo:** resumo por etapa (1–12) com a matriz RA (13 resolvidos localmente, RA-07 parcial, RA-12 infraestrutura com treinamento bloqueado, RA-16 parcial), **pré-requisitos** (homologar a migração e o rollback; validar a importação de LD do Gerador; revisão humana), **ordem** (migração → merge → verificação pós-deploy), **rollback** (seção 3) e limitações (seção 6).

## 8. Matriz final
**Resolvidos localmente (não em produção):** RA-01, 02, 03, 04, 05, 06, 08, 09, 10, 11, 13, 14, 15. **Resolvido localmente também:** RA-07 (registro de validações/homologações na tela, com responsável, data e evidência; migração e rollback testados em PGlite; depende da migração `20261107120824`, ainda não aplicada). **Parcial:** RA-16 (cobertura ponta a ponta local feita; falta dados reais/homologação). **Infraestrutura pronta, treinamento bloqueado:** RA-12.

# Robô Auditor de Alocações — Etapa 11: homologação — 06/11/2026

## Conclusão
**NÃO HOMOLOGADO em produção.** O que foi feito é **homologação local de integração** (Worker real, dados sintéticos) e verificações automatizadas. Não existe banco de homologação e não houve validação com usuários. Nada foi publicado nem aplicado em banco.

## 1. Níveis de evidência (o prompt pede para não misturá-los)
| Nível | O que é | Situação |
|---|---|---|
| **1. Testes unitários** | módulos puros (motor, parecer, reauditoria, relatório, catálogo de falhas, ML, contrato de campos) | ✔ `npm run test:allocation-auditor` (37 etapas) e `npm test` passam |
| **2. Integração local** | Worker real + XLSX/ZIP reais; React real em JSDOM; **PGlite** (Postgres em memória) para banco/RLS | ✔ (inclui o novo `tests/allocation_auditor_homologation_stage11.cjs`) |
| **3. Banco real de homologação** | migrações aplicadas num banco real separado da produção | ✘ **Bloqueado.** A conta Supabase tem **um único projeto, `GRCON` (produção)**, sem branches de desenvolvimento. Criar um branch/projeto é serviço pago e não foi autorizado. A migração `20261106104652_allocation_auditor_complete_checkpoint.sql` **não está aplicada** (a última migração do projeto é `20261104221515_rls_auth_uid_initplan`; consulta somente-leitura). O frontend que depende dela **não deve ir ao ar antes de ela ser homologada** |
| **4. Validação operacional com usuários** | equipe de Qualidade usando alocações reais | ✘ Não realizada |

## 2. Cenários ponta a ponta (nível 2)
`tests/allocation_auditor_homologation_stage11.cjs` — arquivo XLSX real → leitura → auditoria em lotes → parecer → pacote → releitura do Excel:
| Cenário | Resultado |
|---|---|
| Alocação **interna** (registros do Gerador, sem arquivo) | ✔ mesmas regras, origem preservada |
| Alocação **externa** XLSX (modelo oficial de 16 colunas) | ✔ hash do arquivo preservado, nenhuma linha perdida |
| **Múltiplas LDs** | ✔ cada documento é comparado com a LD onde está; 10 documentos em nenhuma LD viram `DOCUMENT-NOT-IN-LD`, nunca associação por semelhança |
| **Revisões divergentes** (01 × 0) | ✔ sempre há apontamento; nunca "sem não conformidades" |
| **Ausência de fontes** (sem LD e sem bases) | ✔ inconclusivo (`LD-BASE-MISSING`, `CONTEXTO-LIMITADO`), nunca "pronta" |
| **Correção → cópia verificada → reauditoria** | ✔ original preservado byte a byte; valor lido de volta na cópia; reauditoria comprova a resolução, sem regressões; Excel e parecer coerentes |
| **Recuperação de falhas** | ✔ arquivo corrompido, aba ausente e operação desconhecida viram erro controlado e classificado |
| **Segurança do pacote** | ✔ conteúdo com `=`, `+`, `-`, `@` em todos os campos: nenhuma célula com fórmula e nenhum texto iniciado como fórmula em nenhuma aba; nomes de entrada do ZIP seguros; manifesto sem segredos |
| **Entrega** | ✔ todo módulo `allocation_auditor_*.js` está no Worker ou no carregador e na verificação de produção; o pacote `dist-cloudflare` regenerado (`build:cloudflare`) contém os 13 e `verify:cloudflare` valida 348 arquivos |

**Coerência chat × Excel × manifesto** (em todos os volumes): contagens do parecer = visão do chat = manifesto; "O QUE CORRIGIR" = pendências abertas do chat; "PROPOSTAS" = propostas + sugestões; DETALHAMENTO = ocorrências + propostas + documentos limpos (sem perder nem inventar linha); hashes de todos os arquivos do ZIP batem com o manifesto.

## 3. Volumes (nível 2, Node, dados sintéticos, uma execução)
| Documentos | Leitura XLSX | Auditoria | **Gerar pacote** | Ler Excel de volta | ZIP | Heap (processo de teste) |
|---|---|---|---|---|---|---|
| 100 | 62 ms | 38 ms | 0,7 s | 0,1 s | 0,06 MB | 79 MB |
| 500 | 145 ms | 97 ms | 2,4 s | 0,5 s | 0,19 MB | 242 MB |
| 1.000 | 245 ms | 163 ms | 4,8 s | 1,1 s | 0,31 MB | 450 MB |
| 2.500 | 422 ms | 432 ms | 13,5 s | 2,6 s | 0,69 MB | 836 MB |
| **10.000** (lote grande) | 1,5 s | 1,6 s | **80,8 s** | 11,9 s | 2,34 MB | **1,19 GB** |

Os volumes 100–2.500 rodam na suíte padrão (~30 s); o de 10.000 roda com `GRCON_HOMOLOGATION_LARGE=1`. No **navegador real** (Chromium, Workers reais), 12.000 documentos concluíram em ~49 s (inclui retomada de checkpoint).

**Risco de desempenho identificado:** a **geração do pacote** (ExcelJS) cresce mais que linearmente (2.500 → 13 s; 10.000 → 81 s) e a memória chega a ~1,2 GB no Node. A auditoria em si é rápida. Em navegador de usuário (menos memória) lotes de milhares de documentos podem ficar lentos ou falhar; os prazos da Etapa 8 (`assistant-package` 180 s) cobrem 10.000 nesta máquina, mas **não foram calibrados em hardware de usuário**. Recomendação: limitar/avisar acima de ~5.000 documentos por pacote ou gerar o relatório em partes.

## 4. Outras áreas
| Área | Evidência | Nível |
|---|---|---|
| Integridade dos dados | hash de origem preservado, original intacto byte a byte, nenhuma linha perdida em 100–10.000, determinismo, hashes do ZIP | 2 |
| Regras documentais | suíte do motor, matriz independente do pacote da Etapa 0 (**17/17**), `worker_edge_checks` **10/10** | 1–2 |
| Persistência e permissões | `allocation_auditor_database` (28 verificações), `allocation_assistant_database` (27), `checkpoint_phase2` (retomada 100/500/12.000), `governance_phase8` (RLS/ADM/append-only, sem R2/armazenamento local) — todos em **PGlite**, não em banco real | 2 |
| Responsividade | navegador real: painel dentro de 390×800 e 320×640, sem rolagem horizontal, campo de mensagem visível, abas por teclado | 2 |
| Tratamento de falhas | prazo, cancelamento real, IA indisponível sem perder o cálculo, diagnóstico sanitizado | 2 |
| Compatibilidade com o Gerador | `allocation_generator*`, `gate_phase9`, `generation_guard`, `allocation_auditor_dom` | 2 |
| Segurança | injeção de fórmula, ZIP, manifesto/diagnóstico sem segredos, API (422, log sem conteúdo), RLS em PGlite; `wrangler deploy --dry-run` empacota o Worker | 1–2 |

## 5. Achados desta homologação (e correções)
1. **`npm test` não executa `test:allocation-auditor`** (são scripts separados). Minhas afirmações anteriores de "suíte completa" referiam-se a `npm test`; os testes do auditor eu rodava **individualmente** a cada etapa. Ao rodar a suíte do auditor inteira agora, encontrei **duas falhas introduzidas por mim** que estão nos commits já enviados ao branch (sem PR, sem CI):
   - `allocation_auditor_mascot_phase2.cjs` (desde o commit da **Etapa 6**, `d4f1430e`): afirmava o texto exato do auto-scroll do chat, que mudei. Teste atualizado (agora exige rolar só o viewport do chat e proíbe `scrollIntoView`/`window.scrollTo`).
   - `allocation_auditor_checkpoint_phase2.cjs` (desde a **Etapa 8**, `b0f050e7`): "Pausar" passou a cancelar de forma abrupta e **descartava o lote em andamento**, contrariando a mensagem "vou finalizar o lote atual". Corrigido: **pausa graciosa** (o lote termina e entra no progresso; se travar, interrompe após `pauseGrace`, 5 s) e **cancelamento imediato** só no botão "Cancelar operação". Também corrigi um defeito do primeiro conserto: o temporizador de tolerância podia interromper uma **gravação posterior**; agora só atinge a análise que foi pausada.
   A CI de deploy (`deploy-cloudflare.yml` e `allocation-auditor-release.yml`) roda `npm run test:allocation-auditor`, então esses commits teriam sido barrados antes do deploy. **Sugiro** incluir `test:allocation-auditor` no `npm test` para que o comando padrão reflita a CI (decisão sua: aumenta ~80 s).
2. `dist-cloudflare` é artefato local gitignored; estava defasado. O teste só o confere quando está mais novo que os módulos; a evidência de entrega usa `build:cloudflare` + `verify:cloudflare`.

## 6. Lacunas que impedem declarar homologação
- Banco real de homologação inexistente (nível 3) e **migração do checkpoint não aplicada/homologada**.
- Nenhuma validação com usuários (nível 4) nem com uma alocação corporativa real (a comparação RA-02 pode aumentar o número de erros em dados reais).
- Desempenho medido só nesta máquina; navegador de usuário não medido.
- Consulta de IA nunca exercitada contra o Workers AI real.
- Treinamento de ML bloqueado (Etapa 9).
- RA-07 (tela de validação de referências/homologação com responsável e evidência) e RA-16 (cobertura do fluxo completo com dados reais) continuam abertos/parciais.

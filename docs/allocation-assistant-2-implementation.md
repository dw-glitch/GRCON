# GRCON — Assistente de Auditoria 2.0: entrega inicial protegida

Data: 28/10/2026. Base inicial: `dbe94f99229e792272ed5d92938dcb09d27190e9`.

**A implementação técnica inicial foi executada. Não é homologação integral dos 24 critérios do pedido. A experiência permanece opt-in; a navegação anterior é preservada. Nenhuma regra real foi ativada nem foi aplicada correção automática a documentos corporativos.**

## 1. Implementado

- Conversa flutuante de 720 px, expansão, fechamento, foco, anexos múltiplos e progresso do Worker.
- Ação “Auditar com o Robô” no Gerador quando `allocationAuditAssistant` estiver habilitado. A opção de alocação atual reutiliza os documentos selecionados e as fontes existentes.
- Identificação de alocações oficiais por estrutura e conteúdo; prioridade para GERAL. Arquivos sem identificação única são recusados com orientação, sem escolha silenciosa de origem.
- Até 20 arquivos por seleção, XLSX de até 30 MiB, limites de expansão ZIP existentes. LDs usam o parser original do Gerador.
- Associação e decisões por ocorrência: contrato, código completo, revisão, LD, arquivo, aba, linha, alocação e SHA-256. Mesmo código em alocações diferentes preserva decisões distintas.
- Agrupamento das propostas determinísticas por contrato, disciplina, workflow, versões, campo e valores. A aceitação é por grupo e não extrapola o contexto.
- Conversas recuperáveis por usuário/contrato, revisão otimista e checkpoint de auditoria pausada. Após recarregar, fontes precisam ser reanexadas com os mesmos hashes.
- Pacote de auditoria com relatório de duas abas, manifesto e cópias efetivamente produzidas. Falhas de arquivos são registradas como exceções; não se declara correção aplicada quando só há uma decisão.

O chat reconhece comandos de auditoria, pausa, retomada e exportação. Perguntas com código completo usam a consulta Workers AI existente, somente para uma ocorrência identificada de forma única. Perguntas vagas pedem identificação em vez de disparar chamadas para todo o lote. Isto não é um agente autônomo com acesso irrestrito às fontes.

## 2. Alterações e reutilização

| Camada | Arquivos principais |
|---|---|
| Chat | `src/react/allocation-auditor/AllocationAssistant.tsx`, `assistantStore.ts`, `service.ts`, `index.tsx`, `allocation-auditor.css` |
| Regras limitadas e grupos | `allocation_auditor_assistant.js`, `allocation_auditor_core.js` |
| XLSX/ZIP | `allocation_auditor_revision.js`, `allocation_auditor_package.js`, `workers/allocation-auditor.worker.js` |
| Integração Gerador | `src/react/allocation/AllocationApp.tsx`, `index.tsx`, `service.ts` |
| Administração | `IntelligencePanel.tsx`, `contract_admin_app.js` |
| Mascote | `grcon_mascot_controller_v4.js`, tipos do bridge React |
| IA | `cloudflare/allocation-audit-ai.mjs` |
| Persistência | `supabase/migrations/20261028184402_allocation_assistant_sessions_rules.sql` |
| Entrada e cache | `grcon_module_loader.js`, `sw.js`, `package.json` |

O motor de normas, os parsers RECON, os escritores preservados de LD e alocação, o histórico existente, o mecanismo de numeração e o runtime do mascote continuam sendo reutilizados. Não foi criado banco Neon nem outro provedor pago. O Cofre não foi modificado.

## 3. Mascote

O runtime 5.2.2 move a mesma instância para o chat por `presentIn(host)` e devolve-a ao cabeçalho ao fechar. Uma operação que normalmente pediria corrida usa análise enquanto o mascote estiver no chat. Não existe segundo personagem ou animação corporal de PNG por CSS.

São reutilizados os vídeos oficiais de saudação, análise, atenção e sucesso. Não houve geração de vídeos novos nem consumo de créditos. A validação `validar-mascote-alpha.cjs` decodificou todos os 11 WebM alpha com libvpx-vp9 e confirmou fundo transparente e personagem opaco em quadros amostrados. A inspeção visual do chat foi feita em 1440 e 1280 px; uma revisão visual completa em todos os temas/estados ainda não substitui a aprovação corporativa.

## 4. Auditoria e correções

A validação parcial de EAP e N1–N10 existente foi preservada: o ancestral mais específico cadastrado basta; níveis adicionais sem referência não se tornam automaticamente erro. A origem LD agora também respeita a identidade canônica informada; autorização automática exige revisão exata comprovada na LD.

Uma regra automática elegível tem documento, revisão, contrato, disciplina, SHA da alocação, SHA da LD, versões das bases, campo, antes/depois e evidências exatos. Ela precisa estar ativa e validada pelo Master. O servidor compara a proposta determinística persistida, a origem e as versões oficiais atuais. Decisões anteriores, inclusive rejeições, não são sobrescritas automaticamente. Retry da autorização não duplica eventos.

A escrita automática inicial está limitada a Workflow, Data Book e N1–N6 do modelo oficial de 16 colunas. O escritor recusa fórmulas na célula alvo, confere valor anterior e código na linha, preserva as outras partes OOXML e reabre o resultado. A exportação ainda suporta títulos em cópia da LD pelo escritor anterior, mediante decisão humana. **Não há escritor geral homologado para TAG, EAP, disciplina e todos os demais campos das diversas LDs.**

Novas alocações/linhas da Central exigem a ação explícita dentro dos detalhes do chat. O Gerador usa sua numeração real. Origens diferentes são processadas separadamente; repetições ambíguas dentro do mesmo lote bloqueiam essa geração. O procedimento não grava na Central compartilhada.

## 5. Aprendizado

“Administração → Inteligência do Robô” cria candidatos a partir de uma proposta determinística de auditoria salva e da orientação do Master. Planilhas podem ser auditadas no assistente e fornecer essas propostas; comentários fiscais isolados não ativam aprendizados.

A versão inicial usa casos históricos rotulados em JSON, identificados por `runId`, `rowNumber` e `expected`. O servidor calcula os resultados sobre linhas de auditorias existentes do mesmo contrato e exige exemplos positivos e negativos distintos. Ativar exige resultado técnico aprovado e referência explícita de homologação. Suspensão, revogação, histórico e restauração como candidata acrescentam versões; restaurar exige nova validação antes de ativar.

A autorização usa `private.grcon_require_master_owner()`, nunca o nome exibido. Contagens de testes não são apresentadas como métricas de precisão documental. **A extração automática de regras gerais de quaisquer planilhas, a rotulagem automática e o treinamento conversacional livre sobre falsos positivos ainda não estão entregues.**

## 6. Arquivos e exemplos

O pacote contém `01_Relatorio_Auditoria.xlsx` com exatamente RESUMO e DETALHAMENTO, cabeçalho formatado, filtros, congelamento e larguras. As cópias ficam em diretórios por tipo e recebem nomes com hash/sufixo. Não se criam planilhas vazias. As linhas da Central aparecem quando uma nova alocação foi efetivamente gerada pelo Gerador.

O manifesto registra fontes, hashes, versões, decisões, exceções e hashes das saídas. Os XLSX são reabertos, seus ZIPs têm CRC verificado, cópias oficiais passam por nova auditoria determinística e os hashes são comparados depois de consolidar o ZIP. Isso é validação técnica, não aprovação fiscal.

Exemplos gerados localmente:

- Pacote e relatório sintéticos para verificar a estrutura.
- Pacote real das alocações 0353 e 0369: **53 documentos, duas fontes, zero correções automáticas**. As referências normativas/LDs não foram homologadas nesta amostra; os casos permanecem pendentes.

Arquivos corporativos e exemplos não são enviados ao repositório público.

## 7. Testes e limitações

- `npm run verify`: aprovado, incluindo regressão geral, TypeScript, nove builds, verificações estáticas, banco local, desempenho e suites do Auditor/Assistente.
- Banco do Assistente: 24 verificações em PGlite, incluindo usuário/contrato, Master, versões, exemplos positivos/negativos, suspensão, restauração e idempotência.
- Worker: identidade 121/122, revisão, mudança de fonte/base/contrato, ocorrências distintas, duas abas, hashes, CRC e arquivos inválidos.
- Chromium 153: React e Workers reais; importação múltipla, pacote, uma instância do mascote, fechamento/reabertura, 1280/1440 px, movimento reduzido e limpeza por contrato; zero erros de página.
- Checkpoint no Chromium: 2.500 documentos; pausa durante o processamento, recarga da página, recuperação da conversa, reanexo e conclusão. O ponto exato de pausa depende do agendamento do navegador.
- Pacote Cloudflare: 338 arquivos e referências íntegras.

Identidade, RPC e catálogos foram controlados no ensaio de navegador. Autorização real e inferência paga não são inferidas desse ensaio. Precisão, falsos positivos/negativos, cobertura e taxa de correções indevidas no conjunto real independente continuam **não medidos**. Não há alegação de 100%.

## 8. Banco e segurança

A migration acrescenta duas tabelas privadas: sessões e versões de regras. RLS, ausência de grants diretos e policies explícitas de negação protegem ambas. O wrapper público é invoker; a função privada verifica sessão, vínculo ativo e contrato ativo. Alterações de regras exigem Master no servidor. As tabelas anteriores de análises, linhas e eventos são reutilizadas.

Não são armazenados bytes dos anexos. A sessão guarda no máximo 100 mensagens de 2.000 caracteres, hashes e referência da análise, com expiração em 30 dias; a próxima escrita remove sessões expiradas do próprio usuário/contrato. O histórico de auditoria segue a retenção existente. Fechar o chat mantém o Worker; interromper exige pausa. Fechar abruptamente o navegador antes de um checkpoint confirmado pode perder o progresso ainda não salvo.

Aplicação remota: uma tentativa retornou `Invalid or expired requestState`. A introspecção posterior confirmou ausência das duas tabelas e do RPC novo. Não se apresenta a migration como aplicada. O diagnóstico anterior do advisor tinha INFO das tabelas privadas sem policies e um WARN preexistente de proteção de senhas vazadas desabilitada; nada nessa configuração foi alterado.

## 9. Publicação e rollback

Entrega em branch/PR para revisão; sem publicação desta experiência em produção nesta execução. A migration remota e o fluxo autenticado com fontes reais ainda precisam ser concluídos.

A flag é `allocationAuditAssistant`, em `GRCON_FEATURES` para QA ou `contract.settings.enabledModules` para configuração contratual autorizada. Nenhum contrato foi habilitado. Sem flag, permanece o fluxo anterior. Manter o Auditor independente é deliberado até a substituição homologada.

Rollback: desabilitar a flag e reverter o commit da interface. Preservar tabelas/versões quando houver registros; não executar DROP de histórico. Nenhuma modificação no Cofre é necessária.

## 10. Pendências para aceitação integral

1. Aplicar a migration remotamente e conferir grants/RLS/RPC com identidades reais.
2. Exercitar chat, reabertura, treinamento e geração oficial autenticados no contrato autorizado.
3. Homologar fontes normativas/EAP e um conjunto independente com rótulos positivos/negativos reais; medir precisão, cobertura e correções indevidas.
4. Homologar e ampliar escritores de LD por layout/campo. Sem fonte e escritor comprovados, preservar o valor e registrar pendência.
5. Ampliar treinamento por conversa/planilha para além das propostas determinísticas atualmente reconhecidas.
6. Validar coerência documental completa entre LD corrigida, nova alocação e Central em casos reais, além da integridade de arquivos já testada.
7. Somente então habilitar a experiência contratual, remover a entrada antiga da navegação e publicar/confirmar o commit em produção.

Não existe impedimento de credencial OpenAI: a arquitetura continua usando Workers AI. Não foram geradas animações pagas, alterados planos, ativados contratos ou publicados dados corporativos.

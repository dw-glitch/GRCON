# Robô Auditor de Alocações — Etapas 9 e 10: infraestrutura de aprendizado (RA-12) — 06/11/2026

## Situação
**Infraestrutura: implementada e testada (somente com dados SINTÉTICOS). Treinamento com dados reais: BLOQUEADO.**

Motivo (conforme o prompt mestre: *"se não existir acervo autorizado ou conjunto de rótulos suficientemente validado, conclua somente a infraestrutura e registre o treinamento como bloqueado"*):
- Nenhuma autorização humana do acervo foi apresentada nesta sessão. O acervo de ~**15.441 eventos históricos** citado na auditoria **não foi acessado, lido nem usado**; não rodei nenhuma consulta no banco de produção para isso.
- Não existe conjunto de rótulos revisados por pessoas (o mínimo configurado é 300 rótulos revisados e 60 casos de teste).
- Nenhum modelo foi treinado com dados reais; **nenhum modelo está ativo**; nenhum documento saiu do ambiente; nenhum serviço externo ou pago foi usado.

O que destrava o treinamento (ações humanas): (1) uma pessoa responsável assina a autorização do acervo (arquivo `autorizacao.json`, escopo `treino-local`, contratos listados); (2) exportar os eventos; (3) revisores técnicos confirmam/corrigem os rótulos (`revisoes.json`); (4) rodar `node scripts/allocation-auditor-ml.cjs …`; (5) um aprovador diferente de quem treinou ativa a versão no registro.

## 1. Etapa 9 — o que foi construído (`allocation_auditor_ml.js`, 100% local)
| Item do prompt | Implementação |
|---|---|
| 1. Inventariar dados autorizados | `checkAuthorization` (responsável humano, data, contratos, escopo `treino-local`, validade) e `inventory`: **sem autorização, o acervo inteiro é bloqueado**; com ela, cada evento é classificado uma única vez em elegível / inconclusivo / excluído, com motivos e contagens por contrato e período |
| 2. Relacionar recusas e comentários ao documento e revisão corretos | Vínculo **exato** por contrato · documento · revisão · alocação (sem aproximação); sem revisão/alocação → excluído; duplicados e **rodadas conflitantes** (mesma rodada, decisões diferentes) → separados |
| 3. Estado documental anterior à fiscalização | Exige título e versão/identificação da LD enviada; sem isso `SEM-ESTADO-PREVIO`. As características usam **só** o estado anterior (título, código, disciplina, workflow, Data Book, níveis…); **comentário, decisão, status e data nunca entram** (testado) |
| 4. Remover inválidos, separar inconclusivos | Motivos: documento/revisão/alocação ausentes, data inválida, decisão não comprovada, comentário vazio ou não classificado, contrato não autorizado, duplicado, rodada conflitante |
| 5. Rótulos tecnicamente revisados | A regra só gera **palpite** (`source:'regra'`, `reviewed:false`). Só vira rótulo com revisão **humana** (revisor, data, decisão confirmado/corrigido); revisor com nome de robô/modelo/regra/sistema é recusado; a correção humana prevalece sobre o palpite |
| 6. Treino/validação/teste sem vazamento | Divisão por **documento** (todas as revisões juntas) e por **tempo** (treino < validação < teste, estritamente); grupo que atravessa fronteira é **descartado e informado**; detector de vazamento documental e temporal (testado com violações introduzidas de propósito e por mutação) |
| 7. Classificadores leves + precedentes | Naive Bayes de Bernoulli por categoria (multirrótulo) e recuperação de precedentes TF-IDF/cosseno; determinísticos, sem aleatoriedade |
| 8. Falsos positivos/negativos e por categoria | Matriz por categoria (tp/fp/fn/tn), precisão, recall, F1, taxas de falso positivo/negativo, suporte, macro/micro F1, acerto exato; categoria com suporte de teste < 20 é "insuficiente". **Pontos de partida** a superar: nenhuma categoria, categoria mais comum e vizinho mais próximo. Limiares escolhidos **só na validação**; o teste nunca participa |
| 9. Versão, origem e limitações | Cartão do modelo: versão (`ml-AAAAMMDD-hash`), autorização, contratos, hash do dataset, revisores, divisão, métricas, limiares, **limitações fixas** (não conhece a norma; só sugestão; vale só para contratos/período autorizados; categorias raras instáveis; comentário fiscal é precedente). Nasce `candidato` |
| 10. Integrar somente como sugestão | `suggest()` e gancho opcional no motor (`context.mlModel`): produz apenas achados de severidade **suggestion**, `origin:'modelo'`, com versão, pontuação, precedentes e limitações; sem valor novo, sem proposta, sem erro/pendência. **Não altera nenhum achado determinístico** (testado: achados idênticos com e sem modelo; modelo corrompido não derruba a auditoria; o parecer continua "pronto"). Desligável com `mlEnabled:false` |

Pipeline offline: `scripts/allocation-auditor-ml.cjs` (sem rede). Sem autorização/rótulos suficientes grava `TRAINING_STATUS.json` (**só contagens e motivos, sem texto de documentos**) e sai com código 2; com tudo, grava `model-card.json`, `evaluation.json`, `model.json` e **não ativa**.

## 2. Etapa 10 — aprendizado contínuo controlado (infraestrutura)
Ciclo: nova alocação → auditoria → decisão humana → correção comprovada → reauditoria → exemplo validado → avaliação → atualização.
- **Livro de exemplos** (`createLedger`): só admite exemplo com **decisão humana**, **correção comprovada pela reauditoria** (estado `resolvida-comprovada` do parecer da Etapa 5) e evidência, em contrato autorizado. **Palpite do robô/modelo/regra nunca vira exemplo.** Casos pendentes ficam num pool **separado** e nunca treinam; recusados ficam registrados. Sem aprendizado entre contratos (contrato não autorizado → recusado).
- **Registro de versões** (`createRegistry`): versões **imutáveis**; **ativar** exige avaliação independente (teste não usado na calibração), desempenho acima dos pontos de partida (+0,05 de macro-F1), categoria com suporte e precisão ≥ 0,6, e **aprovador humano diferente de quem treinou**; **desligar** e **reverter para a versão anterior** a qualquer momento; histórico de toda ação (quem, quando, por quê); serializável.
- **Regras determinísticas independentes** (o modelo nunca é pré-requisito delas) e resultados anteriores preservados (versões e livro são append-only).

## 3. Verificação
`tests/allocation_auditor_ml_stage9.cjs` (na suíte `test:allocation-auditor`): autorização (8 variações), bloqueio total sem autorização, inventário com 11 motivos, rótulos, características sem vazamento, divisão (documento, tempo, grupo de vida longa, fronteiras; **teste de mutação** confirmou que agrupar por revisão ou ler a decisão fiscal quebra o teste), métricas conferidas à mão, embaralhar rótulos de teste não muda o modelo, determinismo, cartão, bloqueio por poucos rótulos/teste pequeno, registro (8 recusas de ativação, ativar/reverter/desligar), livro, integração só-sugestão, módulo sem rede nem `Math.random`, e a CLI (bloqueada e concluída).

Dados do teste são **sintéticos** (sinal plantado em título/workflow/Data Book). Os números do teste (macro-F1 ≈ 0,94 contra 0,71 do vizinho mais próximo) **provam a mecânica, não a qualidade em dados reais**, e não devem ser citados como desempenho do robô.

## 4. Limites e riscos
- Nenhuma validade estatística real: o desempenho em alocações reais é **desconhecido**.
- Os rótulos fracos vêm da taxonomia por palavras-chave do motor (categorias se sobrepõem, ex.: "workflow … disciplina" aciona `workflow` e `scope`); a revisão humana é obrigatória justamente por isso.
- A tela mostra o status do modelo (hoje: nenhum ativo), mas **ainda não há interface** para registrar autorização, revisar rótulos, ativar, desligar ou reverter; hoje isso é feito pelo registro/CLI. O registro não é persistido no banco (nenhuma migração foi criada nem aplicada).
- Se houver aprendizado entre contratos, é preciso autorização explícita por contrato (o código recusa por padrão).

## 5. Matriz
RA-12: **infraestrutura resolvida localmente; treinamento BLOQUEADO** (sem acervo autorizado nem rótulos revisados). Não conta como resolvido em produção. Resumo: 13 resolvidos localmente, **1 parcial/bloqueado (RA-12)**, 1 parcial (RA-07), 1 aberto (RA-16).

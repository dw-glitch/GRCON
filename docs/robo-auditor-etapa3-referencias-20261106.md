# Robô Auditor de Alocações — Etapa 3: fontes, normas e referências documentais (06/11/2026)

Situação: **parcial** (parte tecnicamente demonstrável concluída; dependências humanas e de artefatos ausentes registradas abaixo). Nada foi commitado, enviado, mesclado ou publicado.

## 1. Estado recuperado
- Base: `main` em `09de0a46` (#429). Branch local desta etapa: `claude/robo-auditor-etapa3` (alterações **não commitadas**).
- **Artefatos das Etapas 0, 1 e 2 NÃO estão no GitHub nem neste ambiente.** Não existem: o branch `fix/robo-auditor-fase2-atual-20261106`, a migração `20261106104652_allocation_auditor_complete_checkpoint.sql`, os documentos de controle (`GRCON_Auditoria_Robo_*`, `GRCON_Robo_Plano_*`, `GRCON_Robo_Fase0_*`, `GRCON_Robo_Fase2_*`), os pacotes/relatórios das Etapas 1 e 2 e qualquer referência a `RA-xx` no repositório. O caminho `/workspace/scratch/df2b0ea3bfae/GRCON-robo-fase2` pertence ao ambiente isolado do outro chat.
- Consequência: as Etapas 1 e 2 **não podem ser consideradas continuadas aqui**, e a matriz dos 16 problemas (RA-01…RA-16) não pode ser atualizada, pois só os RA citados no prompt são conhecidos.
- O que **existe** na `main` e foi preservado: motor `allocation_auditor_core.js` (1.4.0), Worker, interface React, registro normativo `vendor/recon/allocation_normative_*.js`, inventário de fontes `docs/allocation-auditor-source-inventory.json` (28 arquivos, com SHA-256, de 28/10/2026) e as fases 0–9 do "Auditor preventivo" de 03/11/2026. Mudanças recentes do SIGEM×PW e do Auditor de Títulos foram preservadas.

## 2. O que a Etapa 3 entrega
Novo módulo `allocation_auditor_references.js` (independente das Etapas 1 e 2) e integração **aditiva** ao motor e ao Worker.

- **Catálogo de referências** com escada explícita: `ausente → localizado → carregado → validado → homologado`. Nada sobe sem o degrau anterior; validação sem responsável ou sem evidência é ignorada; homologação exige validação; validação de algo que o GRCON não carregou não habilita regra.
- **Revisões separadas**: a ET Rev. N, P, Q e R são entradas distintas, identificadas pelo **nome do arquivo** ou por **validação por hash**; arquivo sem revisão fica com o bloqueio `REF-REVISAO-NAO-IDENTIFICADA`. A Rev. R nunca preenche lacunas das demais (a Rev. P tem só a Tabela 13 carregada; N e Q nada).
- **Vigência**: a data da Rev. R (24/08/2026) é registrada como **declarada**, não comprovada; só vira **documentada** com evidência; data de referência anterior à vigência bloqueia.
- **Dependência regra → referência** (21 regras: ET Rev. R, 717x da ET, N-1710, N-381, TAG/Anexo I AP.3, EAP/Anexo III AP.A, Data Book, Caminho das Pastas, Workflow), cada uma com nível mínimo exigido (EAP e Workflow exigem **homologação**).
- **Sem falsa conformidade**: com `context.references`, o motor acrescenta um único apontamento pendente `REF-BLOCKED` por registro (detalhe na evidência), o status nunca é "Sem não conformidades detectadas" enquanto houver verificação bloqueada, o resumo não conta o registro como limpo e o resultado grava `verification` (`verificado | parcial | nao-verificado`) e a impressão digital do catálogo. Sem catálogo, o comportamento anterior é mantido.
- **Rastreabilidade**: matriz regra → documento oficial → revisão → item/escopo → campo → evidência → resultado (`traceMatrix`, `traceFinding`), exportada no Excel em duas abas novas (`Referências` e `Rastreabilidade das regras`), da mesma fonte do motor.
- O Worker monta o catálogo no `context` (aplicabilidade da ET, sinalizador de homologação existente, bases carregadas) e a impressão digital entra na assinatura do cache.

## 3. Situação das referências do contrato (inventário de 28/10/2026, sem nenhuma validação registrada)
| Referência | Situação | Bloqueio |
|---|---|---|
| ET Rev. R | carregada (Tabela 13, grupos 1–7, nt-); vigência apenas declarada | não validada; vigência sem prova documental |
| ET Rev. P | arquivo localizado; só a Tabela 13 carregada | regras da P sem validador |
| ET Rev. N e Q | arquivo localizado, nada carregado | não carregadas |
| N-1710 (Rev. N, anexos A–D) | listas carregadas | não validada; o PDF do inventário não informa a revisão |
| N-381 Rev. M | numeração carregada | não validada |
| Anexo I — Apêndice 3 (TAGs) | arquivo localizado | não carregado/validado |
| Anexo III — Apêndice A (EAP) | **não localizado** | ausente (também na busca de 28/10/2026) |
| Caminho Data Book Rev. E / Caminho das Pastas | localizados | não carregados/validados |
| WORKFLOWS_UHDT-D | localizado (data no nome: `260325`, ambígua) | sem homologação |
| Memorial UHDT-D | **não consta no inventário** | ausente |

Com a aplicabilidade da ET já confirmada pelo usuário (revisão + evidência), a ET Rev. R passa a *validada* e as regras do Grupo 1–7 ficam verificáveis; as demais seguem bloqueadas até haver registro humano.

## 4. Critérios de conclusão da Etapa 3
1. Catálogo funcionando — **atendido** (módulo + testes).
2. Revisões não confundidas — **atendido**.
3. Verificações registram a origem — **atendido** (arquivo/hash, embutido, validação, sinalizador existente).
4. Falta de referência sem falsa conformidade — **atendido** no motor, no resumo e no Excel.
5. Bloqueios claros no resultado — **atendido no motor e no Excel**; a **apresentação no chat e o filtro de pendências na interface são das Etapas 5 e 6**.
6. Rastreabilidade integrada ao motor — **atendido** (motor, Worker, Excel).
7. Testes pertinentes — **atendido** (`tests/allocation_auditor_references.cjs`, mais as suítes existentes do Auditor).
8. Nenhuma regra inventada — **atendido** (teste exige que toda regra exista no motor/registro normativo e vice-versa).

Pendências que **dependem de pessoas**: comparação integral das revisões N/P/Q com a Rev. R; comprovação documental da vigência da Rev. R; revisão das Rev. N e Q (carregar); validação do Anexo I — Apêndice 3, do Caminho do Data Book e do Caminho das Pastas; localizar o Anexo III — Apêndice A e o Memorial UHDT-D; homologação humana do Workflow e da EAP. Não foi simulada nenhuma aprovação.

## 5. Efeito para quem usa
Com o catálogo ativo, registros que antes saíam "Sem não conformidades detectadas" passam a sair "Verificações inconclusivas" enquanto TAG, EAP, Data Book e Workflow não estiverem validados/homologados. Isso é intencional (não declarar conformidade sem verificar), mas **a interface ainda não tem tela para registrar validações**; hoje só valem a confirmação de aplicabilidade da ET e os sinalizadores de homologação que a tela já grava. Essa tela depende das etapas seguintes.

## 6. Próxima etapa
Etapa 4 — motor documental e reapresentações (RA-01, RA-02, RA-07). **Depende de recuperar o pacote cumulativo das Etapas 1 e 2** (identificação documental e sessões), porque as verificações de LD, revisão e reapresentação precisam dessa base.

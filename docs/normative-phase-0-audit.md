# FASE 0 — Auditoria normativa do GRCON

Baseline auditado: `main` em `da597233de6c25ba3ea077353932b380597d408e`, versão `5.44.5`.

## Fontes analisadas

- pacote PETROBRAS entregue na conversa: 288 PDFs (Catálogo + 280 normas-base + conjunto N-1710 com anexos A-G);
- Catálogo de Normas Técnicas PETROBRAS — ordem numérica 09/2026;
- `Carga em Lote de Documentos(5).XLS`, mantido no formato BIFF8 original;
- regras e integrações existentes da `main` do GRCON.

## Vigência e versionamento

A comparação automática pacote × Catálogo resultou em:

- 234 normas-base com revisão coincidente;
- 32 com revisão divergente;
- 8 com revisão do arquivo não confirmada automaticamente;
- 6 presentes no pacote e ausentes do Catálogo 09/2026.

Uma fonte com revisão divergente, ausente do catálogo ou não confirmada **não pode promover regra bloqueante para produção**. O bloqueio é da promoção da regra, não do documento do usuário.

Exemplo crítico: `N-2301` no pacote está em Rev. E (11/2016), enquanto o Catálogo 09/2026 indica Rev. F (12/2025).

## N-1710

O corpo está em Rev. N (04/2020), mas os anexos têm ciclos independentes:

| Parte | Revisão | Edição |
|---|---:|---:|
| Anexo A | W | 10/2023 |
| Anexo B | CJ | 04/2025 |
| Anexo C | BF | 12/2024 |
| Anexo D | BG | 04/2025 |
| Anexo E | D | 03/2010 |
| Anexo F | G | 10/2014 |
| Anexo G | CN | 04/2025 |

A versão de cada anexo precisa acompanhar o resultado da validação e o histórico da eGRDT.

## Estado atual do GRCON

- `grdt_workbook.js` já produz e reabre XLS BIFF8, preserva cabeçalhos, estilos, `FIM`, área de impressão e validações. A evolução deve ampliar esse motor, não substituí-lo.
- `core.js` aceita `0`, revisões alfabéticas de múltiplas letras (`AA`, `AB`) e revisões alfanuméricas como `A1`.
- preliminares `#1`, `#2`, `01` da N-2064 ainda não estão modeladas como categorias normativas próprias.
- `REVISION_ALPHABET` exclui I/O; pela N-2064 essa exclusão é prática recomendada, portanto sua eventual condição bloqueante deve permanecer atribuída a uma fonte operacional/contratual distinta.
- N-1710 é usada hoje como família/escopo e em regexes/categorias operacionais, mas ainda não existe parser normativo por grupos e anexos.
- não há registry/version registry normativo, motor formal de aplicabilidade, governança de promoção ou snapshot normativo no histórico.

## Modelo real de GRDT

Cabeçalhos A:I confirmados:

`DOCUMENTO`, `REVISÃO`, `TÍTULO`, `ARQUIVO`, `FORMATO`, `DISCIPLINA`, `TIPO DE DOCUMENTO`, `PROPÓSITO`, `CAMINHO DATABOOK`.

O modelo exige revisão e arquivo, extensão no nome do arquivo, ordem fixa das colunas, ausência de linha vazia intermediária e marcador `FIM`.

O combo de `PROPÓSITO` contém 12 opções. A configuração atual do GRCON contém 10 e não inclui:

- `Conforme Comprado`;
- `Para As-Built`.

A lista de disciplinas do XLS real também diverge da lista atualmente tratada como oficial por `discipline_resolver.js`. Esse conflito não deve ser resolvido substituindo silenciosamente uma fonte pela outra; a autoridade/versionamento do template precisa ser explícita.

## Arquitetura aprovada no checkpoint

1. `NormativeRegistry`: schema único de regras, sem PDFs no frontend.
2. `NormativeVersionRegistry`: revisão por norma/parte/anexo e status de vigência.
3. `NormativeApplicability`: escopo por disciplina, tipo, fase, projeto, instalação e família documental.
4. `NormativeRuleEngine`: resultados `CONFORME`, `ALERTA`, `BLOQUEIO`, `NÃO APLICÁVEL`, sempre com evidência e fonte.
5. snapshot no Histórico com versão do motor, regras consultadas, avisos, bloqueios, overrides e normas aplicadas.
6. registry de template GRDT separado do registry normativo.

## Princípios de implementação

- regra disciplinar nunca é aplicada fora de seu escopo;
- ausência de contexto de aplicabilidade nunca vira bloqueio;
- prática recomendada nunca vira bloqueio apenas por ser norma;
- norma desatualizada nunca bloqueia documento;
- contrato/LD/SCON/Documentos Previstos continuam fontes de escopo mais específicas quando aplicável;
- histórico antigo não é recalculado silenciosamente;
- promoção de nova base compartilhada é ação de owner e exige relatório de diferenças.

## Estratégia de PRs

- PR A — infraestrutura normativa;
- PR B — N-2064;
- PR C — N-1710;
- PR D — GRDT workbook/modelo real;
- PR E — N-381 / Adicionar Capa;
- PR F — ReconDocs/matriz disciplinar;
- PR G — auditoria, overrides e histórico;
- PR H — módulo Normas Petrobras/governança owner;
- PR I — hardening final.

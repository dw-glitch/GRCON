# SIGEM × PW — estabilidade, desempenho, interface e Excel (03/11/2026)

Escopo: módulo SIGEM × PW (`src/react/sigem-pw`, `sigem_pw_dashboard_core.js`,
`workers/sigem_pw_dashboard.worker.js`). Nenhuma regra documental foi alterada
(CSG/QTM pela coluna C, múltiplas LDs, cadastro × emissão, revisão 0 × todas,
duplicidades, evolução). Os testes dessas regras continuam passando sem alteração.

## 1. Diagnóstico (medido, não presumido)

Método: Chromium real (Playwright), servidor estático local, fixtures sintéticas de
**30.000 documentos** (LD 30 mil · Consulta Geral 36 mil linhas · PW 24 mil linhas),
monitor de *long tasks* (`PerformanceObserver`), perfil de CPU via CDP e contagem de
navegações do frame principal.

| Sintoma | Causa comprovada | Local |
|---|---|---|
| 2ª importação PW grande **falha** (“resultados nem sempre atualizados”) | O histórico de bases era **um único valor** do IndexedDB com todas as versões e todos os registros. Cada `saveBase` relia e regravava o conjunto; com 2 PWs + SIGEM + LD o valor chegou a 134.606.800 bytes e passou do limite do navegador (133.169.152): `The serialized keys and/or value are too large`. A importação era revertida (base anterior preservada), mas não entrava. | `sigem_pw_dashboard_core.js` (`saveBase`, `loadHistory`, `kvSetMany`) |
| Interface “congelada” por 13–17 s a cada importação (parece reinício) | (a) clonagem do histórico inteiro dentro/fora do IndexedDB na thread principal; (b) ~8 s de CPU recalculando identidade documental (`parseDocumentIdentity`, `etCodeParts`, `canonicalDocumentCode`, `documentSearchKeys`) sem cache; (c) leituras e reconstruções redundantes. | core + adapter |
| Abertura lenta com bases já persistidas (9,3 s até exibir resultados) | O worker calculava e devolvia **8 agregados** (≈92 MB serializados cada) embora a tela use 1; mais releitura das três bases. | worker + `loadBases` |
| Refresh/modelo duplicados | `grcon:pw-base-updated` com origem `sigem-pw-dashboard-references` não era ignorado pelo próprio módulo (auto-disparo); gravar a Consulta Geral emitia `shared-sigem-updated` que disparava novo refresh; `lastModelSources` só era atualizado no refresh, forçando 2º rebuild. | adapter |
| “Reinicialização” | **Não foi reproduzida** nenhuma recarga de página na importação (0 navegações do frame principal em todas as importações, SIGEM/PW/LD, válidas e inválidas). Os únicos `location.reload()` do app são troca de contrato (`grcon_cloud_app.js`) e restauração de backup (`productivity_center.js`); o Service Worker não força recarga (`sw.js`). O que o usuário percebe como reinício é a thread principal bloqueada por vários segundos e a falha de gravação acima. Não há como autenticar na produção a partir daqui; o comportamento em produção com sessão/contrato real **não foi observado**. | — |

## 2. Correções

* **Histórico em índice + partes** (`sigem_pw_dashboard_core.js`): `HISTORY_KEY` guarda só
  metadados/contagens; os registros ficam em partes de 15.000 linhas
  (`HISTORY_KEY::p::<id>::records|source::<n>`). Gravações são atômicas (índice + partes +
  remoções + bases ativas numa transação). Compatibilidade: `loadHistory()`/`kvGet(HISTORY_KEY)`
  continuam devolvendo o histórico completo (backup, Evolução, auditoria); `kvSetMany` aceita o
  formato antigo e converte; `loadHistoryIndex()` converte o formato legado na primeira leitura.
  Novas APIs: `loadHistoryIndex()`, `loadHistorySnapshot(id)`.
* **Memoização** de `canonicalDocumentCode`/`documentIdentity` (funções puras; limite de 250 mil entradas).
* **Worker sob demanda**: calcula só `all:all` + o agregado em exibição (`aggregateKeys`); troca de
  classe/escopo calcula uma vez no cliente e guarda. Sem `aggregateKeys` (chamadores antigos) mantém o conjunto completo.
* **Adapter**: estado guarda o índice do histórico; hidratação só quando precisa de registros;
  eventos do próprio módulo não reiniciam leitura; `lastModelSources` atualizado ao reconstruir;
  `loadBases` reaproveita as leituras da migração (SIGEM/LD).
* **Importação por etapas reais** (PW: 5; Consulta Geral: 4) e **erro com a etapa que falhou**
  (“Falha na etapa de leitura dos registros: … A última base válida foi mantida.”). Sem percentuais inventados.
* **Diagnóstico**: `window.GrconSigemPwPerf()` devolve os últimos tempos por etapa
  (`refresh.loadBases`, `refresh.model`, `worker.compute`, `worker.roundtrip`, `importPw.*`); sem dados documentais.

Proteção da base anterior (já existente, preservada e testada): validação → histórico → gravação →
rollback automático (`rollbackStagedImport`) → só então ativa e recalcula.

## 3. Desempenho (mesma máquina/contêiner, uma execução cada; variação típica ±15 %)

30.000 documentos (LD 30 mil · SIGEM 36 mil · PW 24 mil):

| Medida | Antes | Depois |
|---|---|---|
| Importar Consulta Geral — tempo total | 16,6 s | 7,7 s |
| Importar Consulta Geral — main thread bloqueada (soma de long tasks) | 12,1 s (maior 2,5 s) | 4,0 s (maior 1,0 s) |
| Importar PW (1ª) — tempo total | 19,5 s | 10,7 s |
| Importar PW (1ª) — long tasks | 14,9 s (maior 3,3 s) | 6,0 s (maior 1,5 s) |
| Importar 2ª versão PW | **falhou** (limite do IndexedDB) | 10,5 s, concluída |
| Abrir o módulo com bases persistidas: casca da página | 40 ms | 32 ms |
| Abrir o módulo com bases persistidas: até exibir resultados | 9,3 s | 5,5 s |
| Rebuilds do modelo por importação de Consulta Geral | 2 | 1 |
| Recargas da página durante importações | 0 | 0 |

Limites conhecidos (não resolvidos): o modelo comparativo (~113 MB serializados) ainda é clonado do
worker para a thread principal (~2,7 s na abertura); a gravação da base ativa continua sendo um único
valor por base (PW de ~100 mil linhas com `sourceRecords` aproxima o limite do navegador).
Memória não foi medida de forma independente (apenas `usedJSHeapSize` pontual, ~97–131 MB).

## 4. Interface

* Faixa fixa **Bases em uso** (SIGEM, PW, Referências): arquivo, data da base, contagens e
  situação, com atalho “Importar ou trocar bases” (reaproveita o gerenciador existente; nenhum
  mecanismo de importação novo).
* Indicadores reorganizados em dois grupos que respondem às perguntas operacionais:
  **PW** — Universo analisado, Cadastrados, Emitidos, *Aguardando cadastro*, *Cadastrados, não
  emitidos* (com % sobre os documentos que dependem do PW); **SIGEM** — Postados, Em conformidade,
  Com pendências. Cada cartão filtra a relação abaixo; cor da borda + texto (não só cor).
* Definições (`reconcileManagerial`): `pwApplicable` = vigentes, não cancelados, não CV;
  `awaitingRegistration` = dependentes do PW sem registro; `registeredNotEmitted` = cadastrados sem
  emissão; `pwApplicable = aguardando + cadastrado-não-emitido + emitido` (testado). Base ausente nunca vira zero.
* Corrigido “(1 ativas)” → “(1 ativa)” na identificação das referências.

## 5. Excel (relatório gerencial do coordenador)

Mantidos: 3 abas do modelo do coordenador (`Resumo`, `N-1710`, `REL. PW` A–BR com 70 colunas),
fórmulas F:I, texto literal para valores com aparência de fórmula, filtros e painéis congelados.
Acrescentado/ajustado:

* **Resumo** em seções (Universo e cadastro · Acompanhamento SIGEM · Fora do universo e conflitos ·
  Origem dos dados · Critérios), novos indicadores, **percentuais de atendimento reais** (formato `0,0%`),
  data/hora de geração e datas das bases.
* **Aba `Fora das LDs`** (somente quando existir registro): SIGEM e PW fora das referências, a partir do
  agregado completo (nunca da lista filtrada da tela); não altera os indicadores. Duplicatas exatas colapsadas.
* **Cadastro** com cor de status (emitido verde · cadastrado/não emitido âmbar · sem cadastro vermelho ·
  CV neutro) e rótulo textual; impressão paisagem ajustada à largura, títulos repetidos e rodapé.

Validação: `tests/sigem_pw_excel_polish.cjs` reabre o `.xlsx` gerado com ExcelJS e confere abas,
filtros, painéis, cores, formatos, texto literal e que fora-das-LDs não inflam os indicadores;
`tests/sigem_pw_coordinator_workbook_phase5/6/8` seguem passando (paridade com o dashboard). **Não foi
aberto no Microsoft Excel** neste ambiente; a conferência visual no Excel permanece pendente. A planilha de
referência da coordenação não está no repositório: campos e lógica seguem o que o código comprova.

## 6. Testes

Novos: `sigem_pw_history_split_storage.cjs` (limite de valor simulado: o formato antigo falha, o novo
grava; índice leve; compatibilidade; reversão; migração do formato legado; memoização; worker sob demanda;
contratos do adapter), `sigem_pw_managerial_kpis.mjs`, `sigem_pw_excel_polish.cjs`.
Ajustados (contrato mudou de propósito): `sigem_pw_performance_stability.cjs` e `sigem_pw_react.cjs`
deixaram de exigir que o worker pré-calcule todos os agregados; passam a exigir o cálculo sob demanda.

## 7. Publicação

Código alterado, testado localmente e enviado ao branch de trabalho. **Não publicado em produção**
(sem credenciais Cloudflare nesta sessão). Publicação manual: `npm run build:cloudflare` e
`npm run verify:cloudflare`, depois o fluxo de deploy Workers já documentado em `LEIA-ME_PUBLICACAO.txt`.
Usuários com o formato antigo de histórico terão conversão automática na primeira abertura do módulo
(uma gravação em partes); recomenda-se abrir o módulo uma vez após o deploy com uma base grande.

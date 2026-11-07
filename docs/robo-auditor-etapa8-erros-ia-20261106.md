# Robô Auditor de Alocações — Etapa 8: explicações, erros, prazos e cancelamento (RA-08, RA-11) — 06/11/2026

Situação: **Etapa 8 implementada e testada localmente.** Nada publicado nem implantado (o `wrangler deploy --dry-run` apenas confirmou que o Worker empacota o novo módulo). Sem teste em produção.

## 1. RA-08 — API rejeitava campos produzidos pelo motor
**Causa:** `cloudflare/allocation-audit-ai.mjs` tinha uma lista própria de campos; o motor emite `plannedDate`, `action`, `purpose` e propostas `N1`–`N6` (e `discipline`/`eap` desde a Etapa 4), que ficavam de fora → `AUDIT_EVIDENCE_INVALID` e a explicação inteira falhava.

**Correção:**
- **Contrato compartilhado** `allocation_auditor_fields.js` (UMD): fonte única da lista de campos, dos limites e do montador do corpo da consulta. A API importa o contrato (o Worker empacota normalmente) e **não mantém lista própria**.
- **Cliente** (`buildAuditRequest`): coerção de valores não-texto, limites, **orçamento de tamanho** (a API recusa >7000 bytes de mensagens; o cliente encurta evidências, mensagens e, por último, omite propostas/achados) e **omite o que não cabe, dizendo o que omitiu**, em vez de derrubar a consulta. Sem achado utilizável não chama a IA.
- **API:** dados fora do contrato agora respondem **422** com mensagem clara, `requestId` e registro técnico sem conteúdo (antes: 500 com código cru).
- **Cálculo sem IA:** a auditoria determinística não depende da IA; falha da IA é **informativa** (não alarme) e o resultado, as pendências e o relatório permanecem.
- **Teste de varredura:** tudo que o motor realmente emite (e todo campo citado nas regras) tem de estar no contrato; remover `plannedDate` do contrato faz o teste falhar (verificado por mutação).
- Pontos independentes da Etapa 0: `W07-AI-plannedDate/action/purpose` e `W08-AI-N1` reprovavam e agora **aprovam**.

## 2. RA-11 — cancelamento e prazos incompletos
**Antes:** `compute()` (Worker) e `rpc()` não tinham prazo; `cancel()` só ligava uma flag lida entre lotes; só a IA tinha prazo (no servidor).

**Agora** (`service.ts` — as funções de prazo/cancelamento ficam no mesmo arquivo porque o harness independente da Etapa 0 carrega `service.ts` isoladamente, sem resolver imports):
- **Watchdog por operação** com prazo próprio (`inspect` 60 s, `parse` 120 s, `context` 60 s, `batch` 120 s, `summarize` 60 s, `revise-allocation` 120 s, `assistant-package` 180 s, `rpc` 30 s, `rpc-write` 60 s, `ai` 35 s). Estourou: a operação é rejeitada com `TIMEOUT`, o **Worker é encerrado** e o `fetch`/RPC recebe `abort`.
- **Cancelamento real:** `service.cancel()` interrompe na hora a operação em andamento (Worker, gravação, IA). "Pausar" no meio de um lote agora para de verdade; resultados já obtidos são preservados. Botão **Cancelar operação** na tela para qualquer operação sem progresso por documento (exportação, importação, IA).
- **Resposta atrasada não afeta contexto novo:** a promessa é liquidada uma única vez; resposta que chega depois do prazo/cancelamento é descartada (o id sai do mapa e o Worker é encerrado); troca de conta/contrato/análise cancela tudo (`STALE_CONTEXT`).
- Erros tipados (`OperationError`: `TIMEOUT`, `CANCELLED`, `SAVE_FAILED`, `EXPORT_FAILED`, `AI_FAILED`, `STALE_CONTEXT`). Cancelar **não** é mostrado como erro.
- "Retomar" só é oferecido quando algo já foi analisado; com 0 documentos (ex.: prazo no primeiro lote) o caminho é "Auditar alocação".

## 3. Falhas explicadas (o que aconteceu · o que ficou comprometido · o que fazer)
Catálogo `allocation_auditor_errors.js` (código estável, gravidade, se é repetível, se o resultado determinístico foi preservado). Cobre: arquivo inválido/corrompido, falha de leitura do Excel, LD não localizada, documento ambíguo, revisão incompatível, fonte normativa indisponível, falha de autenticação, erro ao salvar, timeout, cancelamento, falha da IA, retomada incompatível, erro na exportação, contexto trocado, rede, operação ocupada, limites de lote, análise salva inconsistente, bloqueio de integridade da cópia, pré-condição faltando. **Guarda de cobertura:** o teste varre as ~118 mensagens que o próprio código lança; só `Operação desconhecida.` (interna) fica sem classificação.

A tela mostra as três partes, o detalhe técnico e o código, com cor por gravidade (informação ≠ alarme).

## 4. Logs técnicos seguros
- **Cliente:** registro circular (100 entradas) com **identificador, etapa, código, duração e contagem** — nada de conteúdo de documento, nomes de arquivo ou credenciais. Botão **Copiar diagnóstico** (JSON) na caixa de erro. O teste confere que o diagnóstico não contém código de documento, título, `.xlsx`, `Bearer` ou token.
- **Servidor:** `requestId` + etapa + código no log da consulta de IA, sem corpo do pedido (teste confere que título/mensagem "confidenciais" não aparecem no log).
- `sanitize` remove tokens, e-mails, caminhos, nomes de arquivo e pares `chave=valor` sensíveis.

## 5. Verificação
`tests/allocation_auditor_contract_stage8.cjs` (contrato × motor × API × cliente, catálogo, sanitização, prazos e cancelamento, carregando `service.ts` num contexto mínimo), `tests/allocation_auditor_errors_dom_stage8.cjs` (React + Worker reais em JSDOM: prazo explicado, repetição após prazo, cancelamento real, cancelamento de exportação, IA indisponível sem perder o cálculo, diagnóstico seguro) e ampliação de `tests/allocation_auditor_api.cjs` (campos do motor aceitos, 422, log sem conteúdo). Script de navegador real inalterado e passando. Suíte completa e matriz independente: ver resposta.

## 6. Limites
- Prazos são valores iniciais razoáveis, **não calibrados** com arquivos reais grandes; podem precisar de ajuste (há `setDeadlines`).
- Um prazo/cancelamento em gravação (RPC de escrita) não desfaz o que o servidor já gravou: a mensagem diz que pode ou não ter sido concluída e o fluxo de retomada confere o estado salvo.
- Gravidade/estilo e textos das mensagens não foram validados com usuários.
- A consulta de IA **não foi exercitada contra o Workers AI real** (testes usam o binding simulado).

## 7. Matriz
RA-08 e RA-11: **resolvidos e verificados localmente**. Resumo: **13 resolvidos localmente** (RA-01–06, 08–11, 13–15), 1 parcial (RA-07), 2 abertos (RA-12 ML, RA-16 cobertura do fluxo completo).

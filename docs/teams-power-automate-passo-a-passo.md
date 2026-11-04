# Teams + GitHub: montar o ramo interativo no Power Automate (passo a passo)

> Para quem **não tem** a exportação do fluxo interativo (o gerador `scripts/build-teams-github-package.py` exige uma). Este guia monta o mesmo ramo **à mão no designer**, ação por ação, com os nomes e expressões que o gerador produziria. Só conectores **padrão** (Teams e GitHub): nenhuma ação Premium.
>
> **Limites honestos:** os nomes de ação abaixo são os do conector em inglês; no designer em português podem aparecer traduzidos. O que importa é a ação (conector + operação) e o **nome interno** que você der a ela, porque as expressões referenciam esses nomes. Não foi testado no seu tenant.

## 0. Antes de começar

1. **Trava de custo do GitHub Actions.** Cada confirmação cria 2 issues e cada issue roda um workflow (~2 min de Actions por confirmação). Em *Settings > Billing* do GitHub: conta **sem cartão** cadastrado, ou orçamento de Actions em **US$ 0** com "parar uso ao atingir o limite".
2. **Conexão do GitHub no Power Automate autenticada como `dw-glitch`** (o dono do repositório). O workflow só aceita issues criadas por essa conta.
3. **Conexão do Teams** de uma conta que participe do grupo "Qualidade - Documentação".
4. O repositório `dw-glitch/GRCON-Teams-Retorno` já tem o workflow `relay.yml` (com o `User-Agent` corrigido) e a sonda passou.
5. Trabalhe numa **cópia** do fluxo atual ("Salvar como"). Só depois de testar, repita no fluxo oficial (a URL do webhook não muda se for o mesmo fluxo).

## 1. O que o GRCON envia ao fluxo (corpo do gatilho)

Já é o corpo que o fluxo atual recebe. O **Parse JSON** deve aceitar, além dos campos antigos:

- `traceability.attemptId` (UUID), `traceability.workspaceId` (UUID), `traceability.expiresAt`
- `egrdt.number`, `egrdt.documentCount` (número), `egrdt.items`
- `message.adaptiveCard` (cartão com os botões **Postado** e **Confirmar postagem parcial**) e `message.fallbackText`

Se `traceability` **não** vier: o fluxo deve seguir o caminho **antigo**, exatamente como hoje.

## 2. Estrutura final

```
Gatilho (o que já existe)
Parse JSON            ← o que já existe (inclua traceability e egrdt.documentCount no esquema)
Condição "Tem_tentativa_de_rastreabilidade"
 ├─ Sim: ramo interativo (seção 3)
 └─ Não: ação antiga de postar a mensagem (a que já existe hoje; mova-a para cá)
```

Expressão da condição (modo avançado):
```
@not(empty(body('Parse_JSON')?['traceability']?['attemptId']))
```
Nunca deixe a ação antiga e a nova ativas ao mesmo tempo para o mesmo pedido.

## 3. Ramo "Sim" (interativo), na ordem

Dê a cada ação **exatamente** o nome interno indicado (renomear a ação no designer).

| # | Nome interno | Ação (conector) | Campos |
|---|---|---|---|
| 1 | `Aguardar_postado` | Teams · **Post adaptive card in a chat or channel and wait for a response** (a versão atual; *não* a marcada como "deprecated") | Poster: **Flow bot** · Location: **Group chat** · Recipient: o chat "Qualidade - Documentação" · Message: `@{body('Parse_JSON')?['message']?['adaptiveCard']}` · Update message: `Resposta recebida. Registrando a declaração no GRCON.` · Configurações > **Timeout: `P7D`**. Mantenha as menções (Adriana e Janecleide) como já estão no fluxo atual. |
| 2 | `Capturar_horario` | Compose | `@utcNow()` |
| 3 | `Indices_selecionados` | Compose | `@if(equals(body('Aguardar_postado')?['data']?['type'],'partial'),split(coalesce(body('Aguardar_postado')?['data']?['selection'],''),','),json('[]'))` |
| 4 | `Validar_indices` | Filter array | From: `@range(0,int(body('Parse_JSON')?['egrdt']?['documentCount']))` · Condition (avançado): `@contains(outputs('Indices_selecionados'),string(item()))` |
| 5 | `Resposta_valida` | Condition | Expressão abaixo. Sim → seção 4. Não → ação **Terminate** (Failed) "Resposta inválida do Teams. Nenhuma postagem foi confirmada no GRCON." |

Expressão da condição `Resposta_valida` (uma linha):
```
@and(equals(body('Aguardar_postado')?['responder']?['tenantId'],'9f250032-dc8e-488c-b733-d6b3ef6e8685'),not(empty(body('Aguardar_postado')?['responder']?['objectId'])),not(empty(body('Aguardar_postado')?['responder']?['displayName'])),not(empty(body('Aguardar_postado')?['messageId'])),or(equals(body('Aguardar_postado')?['data']?['type'],'total'),and(equals(body('Aguardar_postado')?['data']?['type'],'partial'),greater(length(body('Validar_indices')),0),less(length(body('Validar_indices')),int(body('Parse_JSON')?['egrdt']?['documentCount'])),equals(length(body('Validar_indices')),length(outputs('Indices_selecionados'))))))
```

**Prazo vencido e falha** (ramos *Configure run after* da ação `Aguardar_postado`):
- Run after **has timed out** → GitHub · **Create an issue** com título `@concat('[GRCON] expired ',body('Parse_JSON')?['traceability']?['attemptId'])` e corpo
  `@string(setProperty(setProperty(setProperty(json('{"schema":"grcon-teams-github-v1","kind":"expired"}'),'attemptId',body('Parse_JSON')?['traceability']?['attemptId']),'workspaceId',body('Parse_JSON')?['traceability']?['workspaceId']),'source','Teams'))`
- Run after **has failed** → o mesmo, com `failed` no lugar de `expired`.

## 4. Dentro de "Resposta_valida" = Sim

| # | Nome interno | Ação | Campos |
|---|---|---|---|
| 6 | `Resposta` | Compose | JSON abaixo |
| 7 | `Guardar_confirmacao` | GitHub · **Create an issue** | Owner `dw-glitch` · Repo `GRCON-Teams-Retorno` · Title `@concat('[GRCON] confirm ',body('Parse_JSON')?['traceability']?['attemptId'])` · Body `@string(outputs('Resposta'))` |
| 8 | `Esperar_GRCON` | **Do until** | Condição `@equals(body('Ler_retorno')?['state'],'closed')` · Limite: 60 repetições, `PT10M`. Dentro: ação `Ler_retorno` (GitHub · **Get an issue**, número `@body('Guardar_confirmacao')?['number']`) e uma condição que, se a issue **não** estiver fechada, espera **10 segundos** (ação *Delay*). |
| 9 | `Retorno_GRCON` | Compose | `@json(body('Ler_retorno')?['body'])?['result']` |
| 10 | `Confirmacao_aceita` | Condition | `@equals(outputs('Retorno_GRCON')?['ok'],true)` · Não → **Terminate** (Failed) "O GRCON rejeitou o registro; conferir o fluxo antes de reenviar." |

Corpo do Compose `Resposta` (o `conversationId` é o ID do chat do grupo, o mesmo configurado no GRCON):
```json
{
  "schema": "grcon-teams-github-v1",
  "kind": "confirm",
  "attemptId": "@{body('Parse_JSON')?['traceability']?['attemptId']}",
  "workspaceId": "@{body('Parse_JSON')?['traceability']?['workspaceId']}",
  "messageId": "@{string(body('Aguardar_postado')?['messageId'])}",
  "conversationId": "19:000ba02b2d5a4f46b9b745319994ab9e@thread.v2",
  "messageUrl": "@{coalesce(body('Aguardar_postado')?['messageLink'],'')}",
  "type": "@{body('Aguardar_postado')?['data']?['type']}",
  "selection": "@{coalesce(body('Aguardar_postado')?['data']?['selection'],'')}",
  "respondedAt": "@{outputs('Capturar_horario')}",
  "responder": "@{body('Aguardar_postado')?['responder']}"
}
```
Regras que o GRCON verifica: `responder.tenantId` igual ao tenant, `objectId` e `displayName` preenchidos, `type` `total` ou `partial`, e, se parcial, `selection` com índices numéricos separados por vírgula e sem repetição. O título da issue **precisa** começar com `[GRCON]` e o corpo ser só JSON.

## 5. Dentro de "Confirmacao_aceita" = Sim

| # | Nome interno | Ação | Campos |
|---|---|---|---|
| 11 | `Atualizar_cartao` | Teams · **Update an adaptive card in a chat or channel** | Poster Flow bot · Group chat · Recipient o mesmo chat · Message ID `@{body('Aguardar_postado')?['messageId']}` · Message `@{outputs('Retorno_GRCON')?['updatedCard']}` |
| 12 | `Anunciar_uma_vez` | Condition | `@equals(outputs('Retorno_GRCON')?['publishConfirmation'],true)` · Sim → `Publicar_confirmacao` (Teams · **Post message in a chat or channel**, Flow bot, Group chat, mesmo chat, mensagem = expressão abaixo) |
| 13 | `Efeitos_no_Teams` | Compose (executar após `Atualizar_cartao` e `Anunciar_uma_vez` em qualquer resultado) | JSON abaixo |
| 14 | `Guardar_efeitos` | GitHub · **Create an issue** | Title `@concat('[GRCON] effects ',body('Parse_JSON')?['traceability']?['attemptId'])` · Body `@string(outputs('Efeitos_no_Teams'))` |

Mensagem de `Publicar_confirmacao` (escapa HTML e converte quebras de linha):
```
@replace(replace(replace(replace(outputs('Retorno_GRCON')?['confirmationText'],'&','&amp;'),'<','&lt;'),'>','&gt;'),decodeUriComponent('%0A'),'<br>')
```
Corpo de `Efeitos_no_Teams`:
```json
{
  "schema": "grcon-teams-github-v1",
  "kind": "effects",
  "attemptId": "@{body('Parse_JSON')?['traceability']?['attemptId']}",
  "workspaceId": "@{body('Parse_JSON')?['traceability']?['workspaceId']}",
  "messageId": "@{string(body('Aguardar_postado')?['messageId'])}",
  "conversationId": "19:000ba02b2d5a4f46b9b745319994ab9e@thread.v2",
  "confirmationIssueId": "@{string(body('Guardar_confirmacao')?['id'])}",
  "cardUpdated": "@{equals(actions('Atualizar_cartao')?['status'],'Succeeded')}",
  "noticeStatus": "@{if(equals(outputs('Retorno_GRCON')?['publishConfirmation'],false),'skipped',if(equals(actions('Publicar_confirmacao')?['status'],'Succeeded'),'sent','uncertain'))}",
  "replyMessageId": "@{coalesce(actions('Publicar_confirmacao')?['outputs']?['body']?['id'],'')}"
}
```
Se a publicação da confirmação terminar de forma incerta (timeout), **desligue a nova tentativa automática** dessa ação: o resultado vai como `uncertain` e não se repete o anúncio.

## 6. Teste (no máximo 3 execuções, para poupar minutos de Actions)

Faça tudo na **cópia**, com o cartão indo só para uma conta sua de teste, sem eGRDT real:

1. **Resposta total** ("Postado").
2. **Resposta parcial** (marque alguns documentos e confirme).
3. **Prazo vencido**: deixe o timeout curto (por exemplo `PT5M`) só nessa cópia e não responda.

Em cada uma confira: issue `[GRCON] confirm …` criada e depois **fechada** pela ponte com `state: confirmed`; cartão atualizado; confirmação publicada **uma vez**; issue `[GRCON] effects …` criada; no prazo vencido, só a issue `[GRCON] expired …`.

## 7. Quando tudo passar

Só então a flag `GRCON_TEAMS_TRACEABILITY_ENABLED` é ligada no Worker. Voltar a `false` restaura o aviso simples atual.

# Confirmação de postagem pelo Teams — implementação e implantação

## Estado desta entrega

Código implementado, com validação automatizada no PostgreSQL embarcado, Worker e Excel. O teste real no Teams/Power Automate depende do fluxo corporativo, dos segredos do Worker e de homologação com uma eGRDT operacional legítima. A funcionalidade interativa está desativada por padrão; o envio manual existente continua funcionando. Não foram criados documentos fictícios em produção.

## Arquitetura e arquivos

- `cloudflare/teams-traceability.mjs`: autenticação do callback, identidade Microsoft, cartão total/parcial, leitura em lote e compartilhamento com a API Node.
- `cloudflare/worker.mjs`: evolução condicionada do envio existente; documentos e número obtidos do histórico persistido; um envio por tentativa.
- `api/egrdt-teams-notification.js` e `api/egrdt-teams/[action].js`: compatibilidade com o ambiente Node/Vercel existente.
- `supabase/migrations/20261009141012_egrdt_teams_traceability.sql`: tentativas, eventos, operação transacional, notificações e publicação única da confirmação.
- `egrdt_teams_trace_core.js`: associação por workspace e identificador do histórico, revisão e apresentação das informações independentes.
- `egrdt_teams_trace_app.js`: carga em páginas de 500, índice em memória, atualização incremental a cada 15 segundos, recuperação ao reconectar e trocar de contrato.
- Histórico React: painel expansível de tentativas, responsável, documentos/revisões declarados, pendências, entrega e link original.
- `sigem_status_monitoring_app.js`: integração com a janela flutuante existente, destino direto para a eGRDT e supressão de toasts antigos de postagem na entrada.
- Relatórios: Histórico/resumo/documentos, Conferência geral/por eGRDT/pendências, Consultas quando há vínculo documental válido e preparação de repostagem. Workers recebem as mesmas informações em lote.

## Estados independentes

1. `requested` registra a solicitação antes de chamar o Power Automate.
2. `accepted` significa HTTP aceito pelo fluxo, sem presumir cartão publicado.
3. `delivered` exige retorno autenticado contendo cartão e conversa reais. `delivered_at` registra a comprovação no servidor, não a hora originalmente publicada.
4. `teams_created_at`, quando disponível, vem da data real da mensagem consultada no conector Teams. Sem esse valor o Excel indica que a data não foi informada pelo Teams.
5. `confirmed_at` registra a declaração humana, com data UTC do servidor. `total` cobre todos os documentos/revisões do snapshot; `partial` cobre somente os índices selecionados.
6. A Consulta Geral continua sendo a fonte da conferência SIGEM. A confirmação humana não escreve em `grcon_history.payload`, nas bases SIGEM, em status oficial ou nas regras de alocação.

O painel mostra todas as tentativas; as colunas de resumo se referem à tentativa mais recente, evitando misturar uma confirmação antiga com um reenvio novo. Não possuir registro antigo significa **Sem registro de envio ao Teams / Não informado**, nunca “não postado”.

## Banco e segurança

Tabelas privadas com RLS habilitada, sem acesso direto por `anon` ou `authenticated`. A função pública tem EXECUTE somente para `service_role`; chama-se exclusivamente pelo backend. O backend autentica a sessão GRCON e a função verifica novamente a associação ativa ao workspace e o perfil. Viewer pode ler, owner/admin/operator podem solicitar envio. Histórico removido não apaga os eventos já registrados.

A confirmação utiliza o segredo de integração e o tenant Microsoft autorizado. O funcionário não fornece seu nome: o fluxo DEVE obter `objectId`, `displayName` e `tenantId` da saída autenticada do conector Teams. O backend confia nessa integração autenticada; ele não valida um token Entra individual recebido do navegador. Nunca copie identidade de `Action.Submit.data`.

O UUID da tentativa é público, não uma credencial. Contrato, eGRDT e documentos vêm do banco. A mesma tentativa não pode ser usada para outra eGRDT, outra conversa ou outro cartão. Bloqueio de linha e transação garantem uma confirmação e uma notificação para chamadas simultâneas. Retentativas ficam auditadas. Não há alteração do status SIGEM como efeito desse clique.

## Configuração Cloudflare (após publicação da PR)

Acessar **Workers & Pages → grcon-cloudflare → Settings → Variables and Secrets**.

| Nome | Tipo | Configuração |
|---|---|---|
| `SUPABASE_URL` | variável | Já usada pelo projeto GRCON |
| `SUPABASE_SECRET_KEY` | segredo | Chave backend já utilizada pelo Cofre; nunca colocar no frontend |
| `POWER_AUTOMATE_EGRDT_WEBHOOK_URL` | segredo | Manter a URL do fluxo atual |
| `GRCON_TEAMS_CALLBACK_SECRET` | segredo | Novo valor aleatório com pelo menos 32 caracteres, compartilhado somente com a ação HTTP do fluxo |
| `GRCON_MICROSOFT_TENANT_ID` | variável | GUID real do locatário corporativo, verificado pelo administrador |
| `GRCON_TEAMS_TRACEABILITY_ENABLED` | variável | `false` durante preparação; `true` somente após validar o fluxo interativo |

Não anexar valores de segredos a mensagens, capturas ou PRs. Segredos do Worker permanecem no servidor. A ausência da flag conserva o caminho de envio anterior. A flag não deve ser gravada como `true` no repositório enquanto o fluxo externo não estiver homologado.

Endpoint de retorno: `POST https://grcon-cloudflare.grcon-qualidade.workers.dev/api/egrdt-teams/callback`.

Headers: `Content-Type: application/json` e `Authorization: Bearer <segredo de callback>`. Habilitar **Secure Inputs/Outputs** nas ações com esse header. Nunca incluir esse segredo no JSON do cartão.

## Alteração do Power Automate, preservando o fluxo funcionando

1. Em `make.powerautomate.com`, abrir **Meus fluxos**, localizar o fluxo cujo HTTP URL já está configurado no Worker. Exportar um backup e fazer uma cópia de homologação antes de editar o original. Usar as conexões corporativas já autorizadas.
2. Conservar o gatilho HTTP, destino **Qualidade - Documentação**, menções reais, resolução de usuários e conteúdo atual. Acrescentar ao schema campos opcionais `attemptId` e `traceability` (objeto). Preservar as propriedades já existentes.
3. Usar uma condição de compatibilidade: se `traceability.attemptId` estiver ausente, executar o ramo legado exatamente como antes. Se presente, executar somente o ramo interativo. Nunca executar as duas postagens para a mesma solicitação.
4. No ramo interativo, a resposta HTTP ao GRCON precisa ocorrer em poucos segundos, antes da espera humana: adicionar uma **Response 202** antes da ação de espera. A execução continua após Response. Não aguardar o funcionário para devolver o HTTP ao GRCON (o backend possui timeout de 15 segundos).
5. Substituir a ação de postagem desse ramo por **Post adaptive card and wait for a response**, a ação atual suportada, como Flow bot no chat/canal correto. Não usar a antiga ação marcada DEPRECATED nem combinar envio simples com o gatilho de resposta como se fossem equivalentes.
6. Usar `message.adaptiveCard` do gatilho como cartão. Preservar as menções/entidades `msteams` já montadas pelo fluxo, sem eliminar `actions`. Aplicar timeout `P7D` à ação; o mesmo prazo aparece no cartão. Não habilitar concorrência 1 no gatilho se o fluxo vai aguardar vários cartões: isso impediria novos envios enquanto alguém não responde.
7. Depois da resposta, obter da saída autenticada da ação o responsável, ID do cartão e ID da conversa. Os nomes das propriedades variam conforme a versão da ação: conferir a saída bruta no histórico de uma execução de homologação e usar os conteúdos dinâmicos **Responder / User ID / Display name / Message ID / Conversation ID**. Se faltar ID Entra, utilizar o conector corporativo **Get user profile (V2)** a partir do usuário autenticado retornado pelo Teams. O tenant é o tenant da conexão; não utilizar valores digitados pelo funcionário.
8. Quando disponível, executar **Get message details** para esse cartão/conversa e mapear a data real de criação da mensagem para `postedAt`. Não preencher esse campo com o horário do clique. Se indisponível, omitir o campo: a data do servidor de confirmação continua registrada separadamente.
9. Chamar o callback com `event: confirm`, usando o exemplo abaixo. A tentativa/workspace vêm do gatilho confiável; `type` e `selection` são os dados da resposta do cartão. `selection` usa os índices fornecidos no cartão, não códigos digitados.
10. Verificar HTTP 200 e `ok:true`. Em caso de falha, não publicar uma mensagem afirmando que a operação foi concluída. Executar retentativas controladas de callback (por exemplo 10s/30s/60s); reutilizar a mesma tentativa e a mesma resposta autenticada.
11. Atualizar o cartão original usando **Update an adaptive card in a chat or channel**, com `updatedCard` retornado pelo backend e os IDs originais. Em retentativas, a atualização do MESMO cartão é idempotente. Após sucesso, chamar o callback com `event: card_updated` e os IDs originais.
12. Para publicar a mensagem de confirmação, primeiro chamar o callback com `event: claim_notice`. Publicar somente se essa resposta retornar `publishConfirmation:true`. Essa etapa é obrigatória: duas execuções de callback podem pedir processamento, mas só uma execução obtém a publicação.
13. Publicar `confirmationText` por resposta à conversa original quando o destino for canal e o conector oferecer a ação. Em chat, usar o mesmo chat quando não houver resposta encadeada suportada. A autoria técnica é Flow bot; o texto identifica quem confirmou. Usar somente a mensagem devolvida pelo backend.
14. Após a mensagem ser publicada, chamar callback `event: notice_sent`, acrescentando `replyMessageId` real da mensagem publicada. Se a chamada de publicação tiver resultado incerto/timeout, desabilitar retentativa automática dessa postagem e chamar `notice_uncertain`. Conferir a conversa antes de qualquer reenvio manual.
15. No ramo **run after: timed out** da ação de espera, enviar callback `event: expired`, reutilizando workspace/tentativa do gatilho. Não inserir confirmação fictícia. A pessoa pode receber nova tentativa com outro UUID mediante reenvio manual pelo GRCON.

Exemplo de contrato de callback (placeholders; não importar como identidade real):

```json
{
  "event": "confirm",
  "attemptId": "<traceability.attemptId do gatilho>",
  "workspaceId": "<traceability.workspaceId do gatilho>",
  "messageId": "<ID real do cartão vindo do Teams>",
  "conversationId": "<ID real da conversa vindo do Teams>",
  "messageUrl": "<link HTTPS do Teams, se disponível>",
  "postedAt": "<data UTC real de criação da mensagem, se disponível>",
  "type": "partial",
  "selection": "0,2",
  "responder": {
    "objectId": "<GUID Entra autenticado retornado pelo conector>",
    "displayName": "<nome retornado pelo conector>",
    "tenantId": "<GUID do tenant corporativo da conexão>"
  }
}
```

Para total: `type: total`, sem `selection`. Para `delivered`, omitir campos de confirmação e manter os IDs reais; esse evento pode ser enviado quando a entrega for comprovada pelo conector. O fluxo com espera nem sempre disponibiliza o ID imediatamente após postar: até o retorno, o GRCON exibe **Recebido pelo fluxo; entrega não confirmada**, em vez de inventar uma comprovação.

Para `claim_notice`: manter `attemptId`, `workspaceId` e `event`; não enviar uma nova tentativa. Para `notice_sent`, `notice_uncertain` e `card_updated`, manter também os IDs originais do cartão/conversa.

## Retentativas, mensagens e limites reais

A transação impede eventos/notifications repetidos. O controle de publicação impede duas execuções de anunciarem a mesma confirmação. Entretanto, nenhum banco consegue provar sozinho se o Teams recebeu uma mensagem quando a conexão cai antes de devolver seu ID. Por isso `sending/uncertain` NÃO autoriza nova publicação automática. O painel sinaliza o estado pendente, e o operador confere a conversa antes da recuperação. Um callback perdido pode ser repetido; uma postagem de mensagem com resposta incerta não pode ser repetida cegamente.

Cartão `P7D` evita execuções aguardando indefinidamente. O limite geral da execução do Power Automate é 30 dias. Não foi implementado um bot Entra/Graph adicional: exigiria registro de aplicativo, permissões e nova infraestrutura não presentes. Para volumes que excedam a capacidade da conta, homologar um bot dedicado antes de ampliar o prazo. Não usar um listener incompatível para contornar a espera.

O conector Teams impõe aproximadamente 28 KB por mensagem. O backend compacta blocos mantendo os dados e rejeita cartões acima de 26 KB, em vez de ocultar documentos ou emitir cartão quebrado. Nenhum plano pago foi contratado. A disponibilidade/licença da ação HTTP de retorno deve ser verificada na organização antes da ativação; o fluxo existente não comprova automaticamente essa licença.

## Excel e desempenho

As colunas antigas permanecem na ordem anterior. Campos novos são anexados ao fim. O relatório de pendências preserva uma única aba e uma linha por código documental, mantendo últimas GRDTs/revisões e o alcance da pendência. Campos Teams descrevem a ocorrência representativa mais recente; o histórico de tentativas fica acessível no Histórico.

- Histórico: data da geração, número, propósito, arquivos, comentários e alocação preservados.
- Conferência: colunas oficiais anteriores preservadas, incluindo revisão enviada/encontrada, status SIGEM, data, observação e histórico de GRDTs. Informação de confirmação humana fica adicional.
- Consultas: conserva o template/filtro existente; acrescenta rastreabilidade somente quando o documento/revisão tem associação com a eGRDT do histórico GRCON. Uma coincidência de número sem vínculo documental não é suficiente.
- Preparação de repostagem: rastreabilidade da emissão de origem; não declara como enviada uma nova emissão ainda não gerada.
- Exportadores sem vínculo válido com eGRDT (por exemplo comparação SIGEM×PW e ferramentas PDF) permanecem sem informações inventadas de Teams.

Um índice por workspace/ID evita chamadas individuais por linha. Workers recebem snapshots em lote. Exportações aguardam a atualização do lote; uma falha de atualização é informada, evitando exportar silenciosamente uma confirmação desatualizada. Consultas incrementais utilizam índice de `updated_at/id` com janela de recuperação de cinco minutos; troca de contrato descarta o cache anterior.

## Homologação real, ativação e reversão

1. Publicar o código da PR, mantendo flag false e o ramo legado.
2. Aplicar/verificar a migração aditiva. Não testar criando registros fictícios na base operacional.
3. Configurar segredo, tenant e ramo de homologação; verificar identidade real, captura de ID, timeout e conexões disponíveis.
4. Validar o cartão com uma eGRDT legítima já destinada à postagem, sob controle da equipe: confirmar total ou parcial; verificar banco, janela flutuante, Histórico, mensagem e atualização de cartão.
5. Exportar Histórico, Consultas com vínculo e Conferência/pendências; conferir os campos antigos e os três estados independentes. Na Consulta Geral, os documentos ausentes continuam ausentes apesar da declaração.
6. Somente depois habilitar a flag true no Worker e o ramo interativo do fluxo de produção. Manter backup.
7. Reversão: flag false restaura o envio anterior; conservar as tabelas/eventos para auditoria. Não apagar histórico para desfazer a funcionalidade.

## Verificações técnicas

Migração aplicada ao projeto GRCON em 09/10/2026. Smoke de leitura retornou lista vazia, sem eventos operacionais fictícios. RLS habilitada; EXECUTE negado a `anon`/`authenticated` e permitido somente a `service_role`. A ativação do Worker e do fluxo externo continua pendente.


`npm run verify`; `npm run build:cloudflare`; `npm run verify:cloudflare`; `node scripts/validar-teams-trace-browser.cjs`; `node scripts/validar-document-workflows-browser.cjs`.

Todos os comandos acima passaram na branch integrada à `main` `632ef50`, em 09/10/2026. `verify` inclui typecheck, seis builds React, sintaxe, referências, versões, dependências, migrações e toda a suíte existente, incluindo o novo dashboard de alocação. O repositório não possui comando separado de lint. O pacote Cloudflare foi validado com 228 arquivos. Chromium validou atualização incremental, parcial, filtros, abertura direta da eGRDT, isolamento de contrato, Excel filtrado e regressão dos fluxos documentais existentes. Nenhuma dessas verificações representa execução real do Power Automate.

A suíte específica cobre persistência, falha de envio, identificação, total/parcial, tentativas inválidas, chamadas repetidas, concorrência lógica, bloqueio de publicação repetida, expiração, notificações, data e contrato, preservação SIGEM, round-trip Excel e índice com 30 mil tentativas. O PostgreSQL embarcado valida as transações/funções, mas não representa teste real de concorrência de múltiplas conexões em produção. O navegador utiliza fixtures locais, não o tenant corporativo.

Fontes oficiais consultadas em 09/10/2026: [Conector Teams](https://learn.microsoft.com/en-us/connectors/teams/), [limites Power Automate](https://learn.microsoft.com/en-us/power-automate/limits-and-config), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

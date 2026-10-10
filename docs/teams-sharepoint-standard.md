# Postagem pelo Teams sem Power Automate Premium

## Estado e dependências

O backend de sincronização e os modelos de dois fluxos usam SharePoint e Teams. A preparação não equivale a ativação: os fluxos precisam da lista real, de conexões autorizadas e de homologação com uma postagem legítima. A flag permanece desativada até essa validação. O fluxo de aviso atual continua sendo o caminho de produção.

É necessário um site com criação de listas e uma lista com escrita restrita à conta das conexões e administradores autorizados. A sessão no Power Automate não garante essas permissões no SharePoint.

Esta alternativa remove a dependência de ações HTTP/Response Premium do Power Automate. Teams/SharePoint ainda dependem dos direitos Microsoft 365 da organização. O aplicativo Graph que lê a lista exige consentimento e atribuição de acesso pela administração Microsoft; ter sessão no Power Automate não fornece esse acesso ao Worker.

## Fluxos e lista

1. **GRCON — Receber pedido de postagem:** conserva o gatilho Teams webhook, Parse JSON, menções e ramo de aviso legado. O ramo com `traceability.attemptId` grava um item `Queued` no SharePoint e termina sem esperar pelo funcionário. Não incluir `Response` ou HTTP genérico. O HTTP 202 do webhook comprova somente recebimento pelo serviço; não comprova criação da lista ou publicação do cartão.
2. **GRCON — Confirmar postagem no Teams:** disparado quando um item é criado. Lê o item atual e reserva `Queued → Processing` com SharePoint REST/ETag e `IF-MATCH` exato, sem retentativa dessa reserva. Somente a execução vencedora publica o cartão e aguarda até sete dias. Não ativar concorrência global igual a 1, pois a espera bloquearia os pedidos seguintes.
3. Após a resposta, captura data UTC e identidade exclusivamente de `responder` da saída autenticada do Teams. Dados de Action.Submit fornecem somente tipo e índices selecionados. A condição valida tenant, seleção parcial não vazia, índices do snapshot e quantidade inferior ao total. Grava `Confirmed`/`ResponseJson` antes de anunciar. Atualiza o cartão original preservando documentos/revisões. Registra `NoticeStatus=sending` antes da mensagem, usa retry `none` na publicação e grava `sent` com o ID retornado ou `uncertain` em falha/timeout. Não publicar de novo automaticamente em estado incerto.
4. **GRCON:** consulta as alterações da lista por Graph delta a cada minuto, em páginas de 20. Revalida tenant, conversa autorizada, identidade, documentos, data e associação ao workspace antes de registrar uma confirmação. Checkpoint e recibos ficam privados no banco. Uma falha impede avançar o cursor; replay não duplica notificações. Não escreve na lista nem publica mensagens pelo Graph.

A declaração do funcionário permanece distinta da conferência SIGEM. Histórico, notificações e campos Excel existentes consomem a mesma tentativa; as colunas antigas são preservadas.

Criar a lista **GRCON-Teams-Postagens** com os nomes internos abaixo, sem acentos. Habilitar versões. Configurar escrita somente para conta proprietária das conexões e administradores autorizados. Participantes respondem pelo Teams; não precisam editar a lista.

| Nome interno | Tipo | Regra |
|---|---|---|
| Title | Texto | Número da eGRDT; não obrigatório |
| RequestKey | Texto | Obrigatório, valores exclusivos e índice; UUID da tentativa |
| WorkspaceId | Texto | Obrigatório e índice; UUID do contrato/workspace |
| State | Escolha | Queued, Processing, Confirmed, Expired, Failed |
| CardJson | Várias linhas, texto simples | Cartão com menções montado no recebimento |
| ContextJson | Várias linhas, texto simples | Payload sem `message`; snapshot de número, contrato e documentos |
| ResponseJson | Várias linhas, texto simples | Resposta autenticada do Teams, tipo, seleção, IDs e data capturada |
| NoticeStatus | Escolha | pending, sending, sent, uncertain |
| ReplyMessageId | Texto | ID real da mensagem de confirmação |
| CardUpdated | Sim/Não | Padrão Não; atualizado somente após sucesso do conector |

Os modelos JSON são gerados a partir da exportação verificada da cópia Teams, para conservar gatilho, destino e menções:

```bash
python3 scripts/build-teams-standard-package.py exportacao-teams.zip pasta-modelos \
  --site-url https://empresa.sharepoint.com/sites/site-autorizado \
  --list-id GUID-REAL-DA-LISTA
```

O resultado é um conjunto de modelos revisáveis para configurar pelo designer, **não um ZIP importável pelo Power Automate**. Conexões, parâmetros da lista e saídas reais precisam ser conferidos no ambiente corporativo. O gerador valida dependências entre ações e ausência de HTTP/Response Premium; somente a verificação do Power Automate e uma execução real validam a compatibilidade do conector no tenant.

## Permissão Microsoft e configuração do Worker

Criar ou reutilizar um aplicativo corporativo Entra aprovado para o GRCON. Solicitar `Lists.SelectedOperations.Selected` de aplicação e uma atribuição **read** somente à lista de rastreabilidade. Consentimento sem atribuição à lista não permite ler dados. Não solicitar acesso amplo ao tenant como configuração padrão. Validar que Graph delta/list items funciona com a atribuição selecionada nesse ambiente; se houver restrição, a administração deve definir o escopo mínimo compatível.

A URL do webhook e o segredo Graph permanecem no servidor. O fluxo padrão não usa o antigo segredo de callback. Não enviar credenciais no chat, nos cartões, em capturas ou no repositório.

| Variável/segredo | Configuração |
|---|---|
| GRCON_TEAMS_TRANSPORT | `sharepoint` |
| GRCON_MICROSOFT_TENANT_ID | Tenant corporativo verificado |
| GRCON_GRAPH_CLIENT_ID | GUID do aplicativo aprovado |
| GRCON_GRAPH_CLIENT_SECRET | Segredo do aplicativo; entrada pelo responsável na infraestrutura |
| GRCON_SHAREPOINT_SITE_ID | ID Graph `host.sharepoint.com,siteCollectionGUID,webGUID` |
| GRCON_SHAREPOINT_LIST_ID | GUID real da lista |
| GRCON_TEAMS_CONVERSATION_ID | ID da conversa existente Qualidade - Documentação |
| POWER_AUTOMATE_EGRDT_WEBHOOK_URL | URL do novo fluxo receptor padrão, após homologação |
| GRCON_TEAMS_TRACEABILITY_ENABLED | Manter `false`; `true` somente ao concluir homologação |

Não é necessário abrir o painel Cloudflare pelo navegador. Um responsável com acesso de implantação pode aplicar as configurações por CLI/segredos já autorizados. O código conserva o agendamento diário de manutenção do Cofre e acrescenta o agendamento separado de sincronização; com a flag desativada, não chama Graph.

## Validação e recuperação

- `npm run test:teams-sharepoint`: banco PostgreSQL embarcado, isolamento entre contratos, identidade/tenant/conversa, recibos, RLS, horário capturado, replay, falha sem avanço do cursor e paginação Graph simulada.
- `node tests/egrdt_teams_traceability.cjs`: preservação do fluxo anterior, confirmação parcial/total, notificações, cartão, relatórios Excel e índice de 30 mil registros.
- Verificar zero ações Premium em ambos os fluxos salvos. Conferir corpo REST com nomes contendo aspas/apóstrofos; o gerador constrói objetos antes da serialização.
- Em postagem operacional legítima, conferir pedido na lista, cartão único no chat original, clique de funcionário real, resposta persistida, anúncio único e atualização no Histórico/Excel. Confirmar que SIGEM só muda mediante a Consulta Geral.
- `Processing` sem resposta/erro pode significar postagem incerta. Conferir o Teams antes de reenviar; não resetar automaticamente para Queued. Uma nova tentativa operacional usa novo UUID.
- `NoticeStatus=uncertain` exige verificação da conversa antes de qualquer recuperação manual. O backend não republica esse anúncio.
- Cursor 410 é reiniciado e a lista é relida com recibos idempotentes. Registro inválido bloqueia avanço e gera somente código de erro no log; corrigir a origem com um administrador, preservando a versão anterior.

Fontes oficiais: [Teams Standard](https://learn.microsoft.com/en-us/connectors/teams/), [SharePoint Standard](https://learn.microsoft.com/en-us/connectors/sharepointonline/), [Adaptive Cards](https://learn.microsoft.com/en-us/power-automate/overview-adaptive-cards), [Graph delta](https://learn.microsoft.com/en-us/graph/api/listitem-delta?view=graph-rest-1.0), [permissões selecionadas](https://learn.microsoft.com/en-us/graph/permissions-selected-overview).

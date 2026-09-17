# GRCON → Power Automate → Teams

Esta integração envia, somente após confirmação do operador, o aviso de uma eGRDT pronta para postagem no SIGEM ao grupo **Qualidade - Documentação**. O fluxo deve mencionar as contas corporativas corretas de **Adriana Nojosa da Silva** e **Janecleide Maria de Oliveira**.

## Comportamento no GRCON

- Gerar a eGRDT não envia mensagem automaticamente.
- Depois da geração, o GRCON mostra um botão por eGRDT.
- O mesmo botão aparece nos detalhes de cada registro do Histórico.
- Antes de enviar, o operador visualiza número, documento/revisão e disciplina.
- O envio só é liberado quando o operador confirma que colocou a eGRDT na pasta.
- A URL secreta do fluxo nunca fica no JavaScript do navegador.

## Criar o fluxo

1. No Power Automate, crie um fluxo com o gatilho do Microsoft Teams **When a Teams webhook request is received**.
2. Restrinja o gatilho conforme as políticas do locatário. Copie a URL gerada somente depois de salvar o fluxo.
3. Adicione **Parse JSON** usando o corpo recebido pelo gatilho e o esquema abaixo.
4. Adicione duas ações **Get an @mention token for a user**:
   - selecione a conta corporativa confirmada de Adriana Nojosa da Silva;
   - selecione a conta corporativa confirmada de Janecleide Maria de Oliveira.
5. Adicione **Post message in a chat or channel**:
   - Post as: `Flow bot`;
   - Post in: escolha o tipo real do destino no locatário (grupo de chat ou canal);
   - Destination: selecione explicitamente **Qualidade - Documentação**;
   - Message: use o modelo indicado abaixo.
6. Salve e teste o fluxo com uma eGRDT de teste antes de ativar em produção.

> Não procure Adriana ou Janecleide apenas pelo texto do nome. Selecione as contas no diretório corporativo e confirme os respectivos e-mails/UPNs para evitar homônimos.

## Esquema do Parse JSON

```json
{
  "type": "object",
  "required": ["eventType", "eventId", "destination", "egrdt", "confirmation"],
  "properties": {
    "eventType": { "type": "string" },
    "eventId": { "type": "string" },
    "destination": {
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    },
    "egrdt": {
      "type": "object",
      "required": ["number", "items"],
      "properties": {
        "number": { "type": "string" },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["document", "revision", "discipline"],
            "properties": {
              "document": { "type": "string" },
              "revision": { "type": "string" },
              "discipline": { "type": "string" }
            }
          }
        }
      }
    },
    "confirmation": {
      "type": "object",
      "properties": {
        "folderConfirmed": { "type": "boolean" },
        "confirmedBy": { "type": "string" },
        "confirmedByEmail": { "type": "string" }
      }
    },
    "requester": {
      "type": "object",
      "properties": {
        "email": { "type": "string" },
        "role": { "type": "string" }
      }
    }
  }
}
```

## Modelo da mensagem

No campo **Message**, comece inserindo os dois conteúdos dinâmicos produzidos pelas ações **Get an @mention token for a user**. Não digite `@Nome` manualmente, pois isso não gera uma notificação real.

Mensagem recomendada:

```text
📌 eGRDT pronta para postagem no SIGEM

[TOKEN ADRIANA] [TOKEN JANECLEIDE], a eGRDT abaixo já foi criada e colocada na pasta. Por favor, efetuem a postagem no SIGEM.

EGRDT: [egrdt.number]

Revisões enviadas na GRDT:
[para cada item: document · Rev. revision]

Disciplinas:
[para cada item: discipline]

Confirmação realizada por: [confirmation.confirmedBy] ([confirmation.confirmedByEmail])
```

Para várias linhas, use **Select** para transformar `egrdt.items` e **Join** com quebra de linha, ou uma ação **Apply to each** que acrescente cada documento à variável de mensagem.

## Evitar avisos duplicados

O GRCON envia `eventId` estável e o cabeçalho `Idempotency-Key`. Para a proteção valer entre computadores, o fluxo deve guardar o `eventId` em uma lista do SharePoint, por exemplo `GRCON_Notificacoes_eGRDT`:

- antes da postagem, procure o `eventId` na lista;
- se já existir com status `ENVIADO`, encerre sem postar novamente;
- se não existir, poste a mensagem e grave `eventId`, eGRDT, data, solicitante e status `ENVIADO`;
- em caso de falha, grave status `FALHA` e permita uma nova tentativa.

## Conectar a URL protegida na Vercel

Cadastre na Vercel, nos ambientes Production e Preview quando aplicável:

```text
POWER_AUTOMATE_EGRDT_WEBHOOK_URL=<URL secreta do gatilho>
```

Depois faça um novo deploy. Não coloque essa URL em `grcon_cloud_config.js`, arquivos `.env` versionados ou qualquer código enviado ao GitHub.

O endpoint do GRCON também valida a sessão Supabase e aceita apenas perfis ativos `owner`, `admin` ou `operator` da área compartilhada.

## Teste de aceite

1. Gere uma eGRDT de teste.
2. Confirme que nenhuma mensagem foi enviada automaticamente.
3. Coloque o arquivo na pasta corporativa.
4. Clique **Avisar no Teams**.
5. Confira no resumo o número, as revisões e as disciplinas.
6. Marque a confirmação da pasta e envie.
7. Confirme no grupo **Qualidade - Documentação**:
   - texto e tabela corretos;
   - menções clicáveis e notificações recebidas por Adriana e Janecleide;
   - somente uma mensagem para o mesmo `eventId`;
   - solicitante registrado no SharePoint.

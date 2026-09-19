# GRCON → Power Automate → Teams

Esta integração envia, somente após confirmação do operador, o aviso de uma eGRDT pronta para postagem no SIGEM ao grupo **Qualidade - Documentação**. O fluxo deve mencionar as contas corporativas corretas de **Adriana Nojosa da Silva** e **Janecleide Maria de Oliveira**.

## Comportamento no GRCON

- Gerar a eGRDT não envia mensagem automaticamente.
- Depois da geração, o GRCON mostra um botão por eGRDT.
- O mesmo botão aparece nos detalhes de cada registro do Histórico.
- Antes de enviar, o operador visualiza número, documento/revisão e disciplina.
- O envio só é liberado quando o operador confirma que colocou a eGRDT na pasta.
- A URL secreta do fluxo nunca fica no JavaScript do navegador.

## Apresentação visual com Adaptive Card

O endpoint do GRCON continua recebendo exatamente o mesmo payload funcional do navegador e continua chamando o mesmo webhook configurado em `POWER_AUTOMATE_EGRDT_WEBHOOK_URL`. A melhoria visual é acrescentada no servidor, de forma retrocompatível, sem expor o webhook no frontend.

Além dos campos já existentes, o corpo entregue ao Power Automate agora inclui:

- `message.adaptiveCard`: cartão pronto, em Adaptive Card **1.2**, sem ações interativas;
- `message.fallbackText`: texto completo para contingência;
- `message.mascot`: metadados da imagem usada pelo cartão.

O PNG fica versionado em `/assets/mascot/grcon-mascot-teams-thumbsup.png`. O cartão usa uma URL HTTPS pública e imutável do próprio repositório GRCON para que a imagem não dependa da sessão do usuário, do navegador, do SharePoint ou de URL temporária. Depois do merge, o mesmo arquivo também fica disponível no deploy estático do GRCON/Vercel no caminho `/assets/mascot/grcon-mascot-teams-thumbsup.png`.

A imagem é apenas decorativa. Se ela não carregar no Teams, o número da eGRDT, documentos, revisões, disciplinas, destino e instrução continuam dentro do próprio cartão. O fluxo não deve condicionar a postagem ao sucesso da imagem.

### Ajuste mínimo no fluxo existente

Não recrie o fluxo. Preserve gatilho, Parse JSON, validações, destino **Qualidade - Documentação**, controle de `eventId`, menções e demais passos já existentes. Altere somente a etapa final de apresentação depois de validar em cópia/teste do fluxo:

1. mantenha as ações atuais que obtêm as identidades/menções de Adriana e Janecleide;
2. substitua a ação final **Post message in a chat or channel** por **Post adaptive card in a chat or channel** / **Post your own adaptive card as the Flow bot to a channel**, conforme o conector disponível no locatário;
3. no campo do cartão, use o objeto dinâmico `message.adaptiveCard` recebido do GRCON;
4. não deixe a ação antiga de mensagem ativa em paralelo com a ação de cartão, para que um clique continue gerando somente uma notificação;
5. teste as menções reais no locatário antes de ativar. O GRCON continua enviando `mentions` sem alteração; se o método de menção do cartão no locatário não preservar a notificação, mantenha temporariamente a etapa antiga de mensagem em vez de publicar duas mensagens.

O `message.fallbackText` existe para contingência: se o conector de Adaptive Card não estiver disponível ou o cartão falhar na validação do locatário, a ação final pode continuar usando uma única mensagem textual com esse campo. Nunca publique cartão e fallback simultaneamente.

## Criar o fluxo

1. No Power Automate, crie um fluxo com o gatilho do Microsoft Teams **When a Teams webhook request is received**.
2. Restrinja o gatilho conforme as políticas do locatário. Copie a URL gerada somente depois de salvar o fluxo.
3. Adicione **Parse JSON** usando o corpo recebido pelo gatilho e o esquema abaixo.
4. Adicione duas ações **Get an @mention token for a user**:
   - selecione a conta corporativa confirmada de Adriana Nojosa da Silva;
   - selecione a conta corporativa confirmada de Janecleide Maria de Oliveira.
5. Para a configuração legada, a etapa final continua podendo ser **Post message in a chat or channel**. Para a melhoria visual desta alteração, substitua somente essa etapa final pela ação equivalente de **Post adaptive card in a chat or channel**, mantendo o mesmo destino **Qualidade - Documentação** e usando `message.adaptiveCard` como conteúdo do cartão.
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

## Modelo da mensagem / fallback

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
   - cartão com o mascote visível sem dominar a mensagem;
   - número, revisões e disciplinas corretos e com quebra de linha quando necessário;
   - menções clicáveis e notificações recebidas por Adriana e Janecleide, caso já funcionem no fluxo atual;
   - somente uma mensagem para o mesmo `eventId`;
   - se a imagem for bloqueada, os dados críticos continuam legíveis no cartão;
   - solicitante registrado no SharePoint.

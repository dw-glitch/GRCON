# Histórico de alterações

## 5.32.26 — 2026-08-17

- **Solicitações ganham aba e módulo próprios.** Registrar um pedido deixou de ser uma área dentro de Consultas: a aba Solicitações tem barra lateral, atalho no topo e três áreas próprias — Nova solicitação, Acompanhamento e Tipos de solicitação.
- A aba Consultas ficou só com o que é consulta: buscar documentos na LD e os modelos de exportação.
- **Anexar os arquivos preenche o campo Documento.** O código sai do nome de cada arquivo, sem a extensão e sem o sufixo de postagem (`_0001`, `_0001_A`). Ponto do código não é confundido com extensão: `LI-5290.00-22313-950-1LV-001` chega inteiro.
- Colar continua valendo e aceita as duas formas: o código puro ou o nome do arquivo com extensão.
- **LD opcional na solicitação.** Anexando a LD, o GRCON preenche o número da alocação, responde se o documento está alocado, traz o status no SIGEM e a versão da LD, e marca “Inclusão na LD necessária” quando o documento não está lá. Cada linha registra onde a evidência foi lida — arquivo, aba e linha.
- O que foi digitado à mão nunca é sobrescrito pela consulta, e sem LD anexada os campos ficam em branco em vez de receberem palpite.
- **Nova saída: “Gerar Excel no padrão da planilha”.** O arquivo reproduz o Controle de Solicitações — as 26 colunas na ordem e com a grafia da planilha oficial, cabeçalho na linha 5 e dados a partir da 6 —, para colar sob o que já existe sem rearrumar coluna. Copiar as linhas para a área de transferência continua disponível.
- A alocação mostrada na consulta e na solicitação passa a distinguir alocação confirmada, alocação evidenciada pelo número da ALOC, aba sem coluna de alocação e coluna vazia, seguindo a leitura da Triagem.

## 5.32.25 — 2026-08-17

- A alocação passa a ser lida da linha inteira da LD, e não só da célula de confirmação. Três fatos que antes saíam como o mesmo "vazio" agora são ditos de formas diferentes: a aba não possui coluna de alocação, a coluna existe e a célula está vazia, e há número de ALOC registrado.
- Ter número de ALOC (como `C1O-ALOC-CM-0028-2026`) passa a valer como evidência de alocação quando o campo de confirmação está vazio. Texto livre na mesma coluna não conta.
- O motivo escrito na triagem e no `Resumo` informa qual das situações ocorreu e onde a evidência foi lida — arquivo, aba, célula e linha.
- Regras de bloqueio inalteradas: somente `NÃO ALOCADO` bloqueia a postagem, e a consolidação entre várias LDs continua escolhendo o registro informado.
- Nova fonte opcional na análise: o **Apêndice 3 — Fornecimento de Bens Tagueados**. O GRCON localiza a aba e a coluna de TAG sozinho e cruza cada documento da triagem com a lista contratual.
- O TAG vem da coluna de TAG da LD quando a aba tiver uma e, na falta dela, do próprio código do documento (Grupo 7 da ET).
- Três colunas novas na tela da triagem e na planilha `Resumo`: `CÓDIGO DA LD`, `BUSCA NO APÊNDICE` e `Tagueado sim ou não?`. Sem Apêndice carregado, elas dizem exatamente isso — nunca sai "NÃO" por ausência de fonte.
- TAG ausente do Apêndice passa a sugerir o código com `nt-`, que marca o item não tagueado. A sugestão é informativa: nenhuma divergência com o Apêndice impede a postagem.
- O cruzamento é comparado por igualdade, tolerando apenas caixa, acento e espaço, e nunca reescreve o código ou o título da LD.

## 5.32.12 — 2026-08-15

- A geração passa a separar automaticamente os documentos por disciplina antes de aplicar o limite de itens de cada eGRDT.
- O painel de confirmação mostra, para cada lote, a disciplina, a quantidade de documentos, a posição dentro da disciplina e o nome final da eGRDT.
- Cada número sequencial continua editável individualmente e precisa ser confirmado pelo operador antes da reserva e da geração.
- Relações extensas podem formar quantas eGRDTs forem necessárias; uma disciplina com mais itens que o limite é dividida em lotes adicionais sem se misturar às demais.
- O seletor aceita uma ou mais LDs na mesma análise e consolida todas em um único índice, preservando em cada resultado a planilha, a aba e a linha de origem.
- A leitura de LD passa a reconhecer abas da mesma família documental, como `N-1710 MOD`, e prioriza a aba técnica visível sobre cópias antigas ocultas.
- Cabeçalhos podem estar em outras linhas ou colunas; quando o cabeçalho de propósito está vazio, o campo é identificado com segurança pelos valores oficiais de emissão.
- A LD real de comissionamento foi validada sem incluir seus dados no repositório: documentos exclusivos da aba vigente recebem `COMISSIONAMENTO` e `Para Construção` corretamente.
- Manifesto e texto de organização dos lotes informam a disciplina de cada eGRDT e, quando aplicável, a divisão da disciplina.
- A suíte passa a validar 55 cenários, incluindo LD de comissionamento, índice de múltiplas LDs, prioridade da aba vigente e separação por disciplina.

## 5.32.11 — 2026-08-14

- Criada uma camada responsiva final exclusiva da interface do navegador, mantendo o layout atual do desktop.
- A navegação muda para abas horizontais roláveis abaixo de 928 px, sem sobreposição com o cabeçalho.
- Cabeçalho, fontes de entrada, filtros, resumos, histórico, SIGEM, e-mails e configurações passam de duas colunas para uma conforme a largura disponível.
- Tabelas permanecem completas dentro de rolagem horizontal própria; em telas estreitas, as colunas congeladas deixam de encobrir os demais dados.
- Drawers, diálogos, menu da conta, filtros de coluna, mensagens e rodapé se ajustam à largura e à altura visíveis.
- Corrigido o conflito com regras legadas de largura mínima fixa, permitindo redimensionamento contínuo da janela do navegador.
- O novo CSS entra nos caches geral e crítico do Service Worker e a suíte valida sua ordem de carregamento e seus breakpoints.
- O relatório, a eGRDT e o nome final passam a priorizar explicitamente a grafia literal da linha técnica da LD, sem converter maiúsculas, minúsculas, `nt-` ou separadores.
- O histórico continua normalizado apenas para pesquisa e nunca substitui a grafia atual da linha técnica da LD.
- A suíte reabre um relatório Excel com um código de caixa mista e confirma que o valor e o arquivo final permanecem idênticos à LD.

## 5.32.10 — 2026-08-14

- Documentos com status `NÃO ALOCADO` continuam desmarcados por padrão, mas agora podem ser selecionados manualmente para entrar na GRDT.
- A inclusão manual não altera nem esconde a situação original da LD; tela, relatório `Resumo`, aba `Triagem` e manifesto identificam a decisão do operador.
- Outros bloqueios técnicos continuam protegidos e não podem ser superados por essa autorização.
- A caixa do cabeçalho passa a selecionar ou desmarcar todos os documentos visíveis disponíveis para GRDT, respeitando pesquisa e filtros ativos.
- Ao selecionar todos, documentos Não Alocados são registrados automaticamente como inclusões manuais.
- A suíte passa a validar 49 cenários, incluindo o estado inicial desmarcado, a autorização manual, a proteção dos demais bloqueios e a seleção em massa.

## 5.32.9 — 2026-08-14

- Corrigida a busca alternativa dos documentos ET para exigir sempre a combinação **tipo documental do Grupo 6 + TAG**.
- A regra é geral para todos os tipos definidos pela norma e não depende de uma lista fixa de siglas.
- Documentos de tipos diferentes nunca são associados pelo TAG: REP não localiza RUFF, nem qualquer outro tipo substitui o que foi informado.
- Se existir somente outro tipo com o mesmo TAG, o relatório informa que o documento do tipo solicitado não foi localizado e nenhuma renomeação é feita.
- Quando tipo + TAG identificam uma única linha, divergências nos Grupos 1 a 5 são corrigidas pelo código oficial da LD e o `DE → PARA` fica evidente no `Resumo`.
- A comparação também cobre separadores e uma única confusão alfanumérica comum no TAG, sempre mantendo o mesmo Grupo 6.
- A suíte passa a validar 47 cenários, incluindo REP/RUFF, regra genérica para outros tipos e 15.000 buscas indexadas por tipo + TAG.

## 5.32.8 — 2026-08-14

- A busca dos documentos ET passa a seguir quatro níveis: código exato, forma com/sem `nt-`, variações toleradas do Grupo 7 e busca final somente pelo TAG em toda a LD.
- A busca pelo TAG ignora diferenças nos seis grupos anteriores, mas só associa automaticamente quando encontra um único código controlado.
- TAG repetido em mais de um documento gera conferência manual; o GRCON não escolhe por aproximação.
- Quando o TAG único localiza outro código, o arquivo e a eGRDT usam exatamente o código existente na LD, com renomeação `DE → PARA` registrada no `Resumo`.
- A regra é exclusiva dos relatórios ET. Documentos N-1710 continuam fora das pesquisas com `nt-` e TAG.
- A implementação segue a ET-5290.00-22000-912-1LV-001 Rev. P: o Grupo 7 é o TAG e sua grafia controlada não deve ser alterada.
- A suíte passa a validar 15.000 buscas adicionais pelo TAG, além dos cenários de unicidade e ambiguidade.

## 5.32.7 — 2026-08-13

- Corrigido o aviso de reparo ao abrir o relatório Excel.
- Removida a `PROCX` que apontava para uma planilha externa de rede e fazia o Excel tratar o arquivo como contendo fonte não confiável.
- `STATUS INTERNO` agora é texto seguro: prioriza o comentário da fiscal já registrado na LD e, quando ele não existe, usa a situação apurada pelo GRCON.
- A central cadastrada aparece somente como referência informativa no `Resumo`; o arquivo não contém conexão, consulta ou fórmula externa.
- Adicionadas validações para impedir que fórmulas `XLOOKUP/PROCX` externas voltem ao relatório.

## 5.32.6 — 2026-08-13

- Removida a aba duplicada `Auditoria detalhada` do relatório de triagem.
- A aba `Resumo`, que permanece como primeira aba do arquivo, reúne o painel gerencial e todas as evidências técnicas antes separadas na auditoria.
- A relação única prioriza situação, inclusão na eGRDT, ação necessária, alocação, renomeação e arquivo final; as demais evidências continuam disponíveis à direita, com filtros no cabeçalho.
- As duas primeiras colunas permanecem visíveis durante a rolagem horizontal, facilitando a conferência de relações extensas.
- O relatório mantém busca com/sem `nt-`, revisão, postagem, origem e linha da LD, Databook, histórico, comentários e demais campos técnicos sem perda de informação.

## 5.32.4 — 2026-08-12

- Resumo do relatório reescrito para gerência e coordenação: começa respondendo quantos documentos foram analisados, quantos serão postados, quantos ficaram de fora e de quem depende resolver.
- Quadro "Por que alguns não serão postados" agrupa os pendentes por motivo, com a ação de cada grupo.
- Relação do Resumo reduzida a oito colunas de decisão; a conferência técnica continua inteira na Auditoria detalhada.
- Textos deixam de citar o funcionamento do aplicativo e passam a dizer o que acontece com o documento.
- Painel congelado removido do Resumo, que agora é lido de cima para baixo.

## 5.32.3 — 2026-08-12

- renomeia o status "Sem correspondência na LD" para "Não consta na LD"
- inclui a coluna ALOCAÇÃO no Resumo Executivo do relatório

## 5.32.2 — 2026-08-11

- Corrigida a exclusão individual do histórico compartilhado: a reserva consumida agora é removida na mesma transação e o número eGRDT pode ser usado novamente.
- Registros excluídos deixam de participar da validação de duplicidade e do cálculo do próximo número, embora o marcador de exclusão continue disponível para sincronizar os navegadores.
- A limpeza completa do histórico também libera as numerações consumidas, preservando somente reservas que ainda estejam em uma geração em andamento.
- A migração corrige automaticamente reservas antigas ligadas a registros já excluídos.
- O GRCON só remove a cópia local depois que o Supabase confirma a exclusão e a liberação da numeração.
- A busca ET passa a tolerar, somente no Grupo 7 (TAG), diferenças de separadores e uma única troca comum entre letra e número (`O/0`, `I/1`, `L/1`, `S/5`, `Z/2` ou `B/8`). A associação só é automática quando existe uma única linha possível na LD.
- Os seis primeiros grupos continuam exatos, N-1710 não participa dessa aproximação e o relatório não ganha novas colunas para essas tentativas internas.

## 5.32.1 — 2026-08-11

- Corrigida a apresentação do prefixo documental para `nt-` minúsculo na relação, no resumo, na auditoria e nas mensagens da busca.
- A pesquisa ET continua cobrindo as formas com e sem `nt-`, nos dois sentidos, sem alterar a regra exclusiva da N-1710.
- Adicionado teste explícito para impedir que a forma `NT-` maiúscula volte a aparecer na evidência da pesquisa.

## 5.32.0 — 2026-08-11

- Pesquisa ET com e sem `nt-`, nos dois sentidos, preservando a exclusão da família N-1710.
- Código e nome final passam a seguir exatamente a forma encontrada na LD.
- Aba `Resumo` didática com pesquisa, alocação, renomeação `DE → PARA`, inclusão na eGRDT e ação necessária.
- Nova aba `Auditoria detalhada` com todas as evidências técnicas.
- Formatação idêntica para relações pequenas e grandes.
- Workers externos substituem o pacote de 3,3 MB com cópias embutidas e eliminam divergência entre tela e exportação.
- Validação automática de 15.000 códigos nos dois sentidos da busca, sem dados operacionais no repositório.
- CI unificada em `npm run verify`, controle de hashes das bibliotecas e Dependabot para Actions.
- CSP reforçada, scripts inline removidos e cabeçalhos de segurança adicionados ao Vercel.
- Migração Supabase idempotente para explicitar privilégios mínimos nas tabelas privadas.

## 5.31.17

- Base recebida para esta atualização, já contendo o primeiro conjunto de correções da busca `nt-`.

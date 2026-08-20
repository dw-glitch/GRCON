# Histórico de alterações

## 5.33.1 — 2026-08-20

- A Operação de Consultas agora mostra a revisão associada à eGRDT mais recente no histórico do GRCON.
- A revisão é lida do mesmo documento e do mesmo registro histórico da eGRDT, sem usar a revisão atual da LD como substituta.
- O resultado no navegador ganhou a coluna `Revisão emitida no SIGEM`.
- A exportação Excel e os modelos de consulta ganharam o campo `REVISÃO EMITIDA NO SIGEM` ao lado da eGRDT e da data.
- Históricos antigos sem revisão explícita são informados como `Não registrada no histórico`; documentos nunca emitidos continuam como `Não emitido`.

## 5.33.0 — 2026-08-19

### O módulo de Solicitações saiu do GRCON

- **A aba Solicitações não existe mais aqui.** O módulo já tinha sido extraído para um aplicativo próprio, o GRCON Flow, mas o GRCON principal continuava carregando a mesma tela, o mesmo motor de tipos de solicitação e a mesma gravação no banco — os dois sistemas faziam o mesmo trabalho em paralelo. Agora só existe uma cópia: a de lá.
- No lugar da aba, a barra lateral e a navegação compacta trazem um atalho **Solicitações**, que abre o GRCON Flow (https://grcon-flow.vercel.app/) em outra aba.
- Saíram do pacote: `solicitacoes_app.js`; os tipos de solicitação, o painel de acompanhamento e a gravação de solicitações em `grcon_cloud_app.js` (RPCs `grcon_get_request_types`, `grcon_save_request_type`, `grcon_delete_request_type`, `grcon_list_request_items`, `grcon_save_request`, `grcon_update_request_items`, `grcon_request_item_history`); e as funções que só existiam para alimentar aquele módulo em `requests_core.js` (protocolo, tipos de solicitação, entrada de documento por arquivo, linha do Controle de Solicitações) e `requests_report.js` (as 26 colunas do Controle de Solicitações e o construtor da planilha correspondente).
- A aba **Consultas** continua exatamente como estava — a triagem por LD, a exportação em Excel e os modelos de exportação —, exceto pela base “Controle de Solicitações” dos modelos de exportação, que dependia inteiramente de dados que só existiam na tela removida e por isso saiu junto.
- As tabelas e funções do Supabase do GRCON principal usadas por aquele módulo continuam no banco por ora, sem nenhuma tela que as use; ficam para uma migração de limpeza à parte.

## 5.32.29 — 2026-08-18

### Célula mesclada na LD deixa de virar “sem alocação”

- **O valor de uma célula mesclada passa a valer para todas as linhas do intervalo.** No arquivo, a mescla guarda o valor só na célula do canto superior esquerdo; as demais chegam vazias na leitura. Quem abre a LD vê `ALOCADO` (ou `NÃO ALOCADO`) nas quatro linhas cobertas pela mescla, mas o GRCON só enxergava a primeira.
- **Isso corrigia um risco real na direção perigosa.** Com `NÃO ALOCADO` mesclado, só a primeira linha bloqueava; as demais ficavam sem confirmação, caíam na evidência seguinte — o número de ALOC — e eram respondidas como **alocadas**, liberando para a eGRDT justamente o que a LD recusava. Conferido sobre a LD_005 real: antes, 6 das 7 linhas de uma mescla passavam como `pronto`; agora as 7 bloqueiam.
- Vale para células ausentes e para as células vazias com formatação que o Excel costuma gravar dentro da mescla — as duas formas significam “sem valor próprio”.
- A mesma leitura foi aplicada ao painel oficial de solicitações e ao Apêndice 3 carregado de arquivo.

### A evidência da alocação diz em qual célula conferir

- O motivo e o texto curto passam a citar a **célula exata** (`aba ET, célula U138`), e não só arquivo, aba e linha. “A LD diz uma coisa e o GRCON diz outra” vira uma conferência de dez segundos: abrir a LD, `Ctrl+G`, olhar.
- O texto curto do estado `Aguardando retorno da alocação` deixa de ser o genérico “A LD informa que o documento não está alocado”. Agora diz o que de fato houve — `A ALOC C1O-ALOC-CM-0223-2026 foi enviada, mas a confirmação na LD continua “NÃO ALOCADO” (aba ET, célula U138)` — com a ação correspondente: aguardar o retorno da Fiscal ou atualizar a LD.
- A mensagem de conflito também localiza uma das células divergentes.

## 5.32.28 — 2026-08-18

### Alocação: o GRCON deixa de contradizer a LD

- **LD com ALOCADO e NÃO ALOCADO para o mesmo documento passa a ser tratada como conflito, não como não alocação.** Antes, qualquer linha `NÃO ALOCADO` no grupo bloqueava e o relatório afirmava “Não alocado”, mesmo com outra linha da mesma LD registrando `ALOCADO` e o número da ALOC. A situação agora é `Conferir alocação` / `CONFLITO — a LD registra ALOCADO e NÃO ALOCADO`, e o motivo cita as duas linhas, com arquivo, aba, linha e número de alocação de cada uma.
- **A evidência aponta para a linha atual da LD.** O bloqueio usava a primeira linha negativa encontrada na varredura; agora usa a mais recente (arquivo mais novo, aba mais nova, linha de baixo), que é a que a pessoa vê ao abrir a planilha. Título, revisão, GRDT e Databook também passam a vir dela.
- **`NÃO ALOCADO` com número de ALOC preenchido passa a ser dito como `Aguardando retorno da alocação`.** É o caso que mais confundia: a LD mostra a ALOC enviada e o relatório respondia apenas “Não alocado”. O bloqueio é o mesmo; o que muda é a frase, que agora nomeia o estado e cita o número da ALOC.
- A regra de segurança continua: nada com `NÃO ALOCADO` entra sozinho na eGRDT, em nenhum dos casos, e a inclusão manual segue disponível para quem decide caso a caso.
- A consulta de documentos deixa de responder alocação em branco quando as linhas divergem: diz o conflito. E, quando a divergência é dentro da mesma LD, o texto para de mandar procurar uma segunda LD que não existe — cita a aba e as linhas.

### Consulta

- A consulta de documentos passa a responder também **se o documento já foi emitido pelo GRCON**: a coluna “Emitido pelo GRCON” traz o número da eGRDT com a data logo abaixo, tanto na tabela da tela quanto na planilha exportada.
- Quando o documento saiu em mais de uma eGRDT, a mais recente encabeça e a tela indica quantas anteriores existem; a planilha lista todas, uma por linha dentro da célula.
- Documento consultado e sem registro no histórico responde “Não emitido” — resposta, e não uma célula vazia que se confunde com “não consultei”.
- A busca no histórico usa primeiro a grafia da LD, que é a que vai para a eGRDT, e só depois o código informado.
- A cópia por tabulação passa a manter um documento por linha mesmo com células de duas linhas.
- Removido `grcon_grdt_history_indicator.js`: ele definia o mesmo `window.GrconGrdtHistoryIndicator` que `grdt_history_indicator.js` e era sobrescrito por ele — carregava em toda sessão sem nunca ser usado.

## 5.32.27 — 2026-08-17

**Apêndice 3 embutido.** A base contratual dos bens tagueados (Rev. B, 5.682 TAGs) passa a acompanhar o aplicativo. Não há mais arquivo a selecionar: toda análise cruza o TAG e o relatório da triagem responde sempre `BUSCA NO APÊNDICE` e `Tagueado sim ou não?`. Para uma revisão nova do Apêndice, `apendice_base.js` é gerado de novo a partir da planilha.

**Tabela da triagem corrigida.** Eram quatro defeitos somados:

- `content-visibility: auto` no contêiner de rolagem fazia o navegador tratar o conteúdo fora da tela como tamanho zero: a tabela abria com 300 px de altura numa janela de 950, com 40.000 px de linhas por dentro.
- Três arquivos de CSS disputavam a altura da mesma tabela. Agora existe uma regra só.
- Existiam duas listas de largura de coluna — uma em px, outra em rem — e a segunda vencia calada. Quando as colunas do Apêndice entraram, cada medida passou a cair na coluna vizinha: o cabeçalho quebrava em quatro linhas e a tabela abria com um bloco vazio. Passou a haver uma lista só, com uma largura para cada coluna, e o modo “somente o essencial” voltou a esconder as colunas certas.
- Rolar até o fim empurrava o espaçador além do total de linhas: a barra de rolagem crescia sozinha e sobrava um vazio depois do último documento. A janela renderizada agora respeita o tamanho da lista, e a altura de linha é conferida contra o que o navegador desenhou.

**Aplicativo em tela cheia.** Em telas largas o quadro (topo e lateral) fica fixo e só a área de trabalho rola. Some a faixa branca sob a barra lateral, some a segunda barra de rolagem e a tabela deixa de nascer fora da vista — depois de analisar, a relação é trazida para o topo automaticamente.

**Acertos de interface:**

- Cabeçalho, rodapé e título da janela passam a nomear a aba aberta; antes diziam “Controle de GRDT” em todas.
- A barra de contexto mostrava a contagem de antes da análise (576 onde a relação já dizia 600).
- A faixa “Nenhum filtro adicional aplicado” ocupava uma linha inteira acima da tabela para informar que nada estava acontecendo; agora só aparece quando há filtro.
- A tabela do histórico de análises era fixa em 116rem e escondia motivo e alocação em qualquer tela de trabalho; passou a caber inteira.
- O botão de configurações da análise era um cartão largo com uma engrenagem e nenhum rótulo.
- As regras de largura de coluna deixaram de valer para toda tabela do aplicativo — o seletor não tinha escopo e obrigava as outras telas a se desfazerem dele uma a uma.

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

# Histórico de alterações

## 5.40.0 — 2026-09-03

### Resposta de e-mail: tabela na largura da mensagem, em 10 pt

- A tabela copiada passa a ocupar **toda a largura do corpo da mensagem**: ela termina onde a frase acima dela termina, em vez de parar antes num bloco de 695 px com uma faixa vazia à direita. Quem define isso é `width: 100%` no `<table>` (também como atributo, que é o que o Outlook lê).
- Com a largura deixando de ser fixa, cada coluna passa a declarar uma **proporção** dessa largura, e não px: com px o Outlook manteria a soma antiga e distribuiria a sobra por conta própria. A soma das proporções fecha exatamente em 100% — uma sobra de centésimo faz o Outlook recalcular a tabela inteira.
- **Cabeçalho e células em 10 pt**, no lugar dos 8 pt e 9 pt de quando a tabela era estreita. O espaço que obrigava aos tamanhos menores deixou de ser escasso.
- Os pisos de largura de cada coluna acompanham a fonte maior e crescem um quarto, para o nome da coluna continuar sem quebrar ao meio (`FAMÍL / IA DOCU / MENT / AL`). `DISCIPLINA` é a exceção que a fonte maior criou: seu piso vem do título, mas o conteúdo mais comum é `COMISSIONAMENTO`, que a 10 pt não cabia nele e quebrava ao meio — a coluna foi alargada para caber a palavra inteira, redistribuindo de `DOCUMENTO` e `TÍTULO`, que quebram em hífen e em espaço sem prejudicar a leitura.
- A prévia **Como será colado** deixa de centralizar a tabela num bloco fixo e passa a acompanhar o campo da mensagem logo acima, para o operador ver a tabela terminando onde a frase termina.

## 5.39.1 — 2026-09-02

### Triagem para de anunciar conflito em documento que tem uma linha só na LD

- **Cada arquivo de LD volta a ser uma fonte inteira, e não uma linha a mais da mesma planilha.** Com mais de uma LD aberta na mesma sessão, o mesmo documento aparecia uma vez em cada arquivo e a triagem comparava essas linhas entre si como se estivessem lado a lado numa única planilha — qualquer diferença virava **“A LD possui mais de um registro diferente para este documento”**. Quem abria a LD para conferir encontrava uma única linha e não tinha como confirmar nada do que o relatório afirmava. Agora quem responde é a LD mais recente; as anteriores continuam valendo como evidência e não bloqueiam mais a análise.
- A mesma separação vale para a **aba oculta**: uma linha que ninguém enxerga ao abrir a planilha deixa de competir com a linha da aba visível da mesma LD.
- **Nada disso adivinha qual LD vale quando não há como saber.** Duas LDs divergentes com a mesma data de arquivo, ou uma delas sem data, continuam pedindo conferência — como já pediam. Dentro de uma mesma LD nada mudou: duas linhas divergentes seguem interrompendo a análise, e o **NÃO ALOCADO** da LD vigente continua bloqueando de forma absoluta. O que deixou de bloquear é o NÃO ALOCADO de uma LD anterior já substituída por outra aberta na mesma sessão, que contradizia a planilha que a pessoa tinha aberta na frente.
- **O conflito, quando existe mesmo, passa a dizer onde está.** Antes o relatório citava só o nome do campo (“Situação de alocação”); agora traz cada valor com arquivo, aba e linha — `“ALOCADO” (LD-…-005.xlsx · ET · linha 120) × “PREVISTO” (LD-…-005.xlsx · ET · linha 340)` —, que é o que permite reabrir a LD e conferir.
- Quando o documento consta em mais de uma LD, o relatório e a tela passam a dizer **qual LD respondeu e quais foram tratadas como versão anterior**, no aviso informativo que não bloqueia.
- A **evidência de postagem** (GRDT e Data Efetiva na própria LD) parou de virar “conflito na evidência de postagem” só porque duas LDs abertas juntas repetiam a linha do documento com GRDTs de épocas diferentes.
- Com isso a Triagem passa a ler várias LDs pela mesma regra que a **Consulta** já usava: duas LDs com a mesma informação são repetição, não conflito.

## 5.39.0 — 2026-09-02

### Revisão na resposta de e-mail e nova leitura da relação

- **Nova coluna REVISÃO na tabela da resposta de e-mail**, logo depois de **DOCUMENTO**, como na planilha da GRDT — quem recebe a resposta confere documento e revisão lado a lado, do mesmo jeito nos dois lugares. O valor é a revisão efetivamente enviada na GRDT (inclusive quando foi escolhida à mão na triagem, desde a 5.37.0), nunca uma revisão recalculada na hora de responder; em registros antigos, sem a revisão gravada, ela é deduzida do nome do arquivo postado pela mesma regra do Histórico, e uma célula sem nenhuma pista vira travessão em vez de ficar vazia. A coluna sai também no texto tabulado, que é o que cola em colunas no Excel.
- A coluna nova **não alargou a tabela colada**: os 695 px continuam os mesmos, redistribuídos entre as oito colunas. Cada largura passa a ter como piso a maior palavra do próprio título, e o cabeçalho passa de 9 pt para 8 pt — antes, num espaço apertado, o Outlook partia o nome da coluna ao meio (“FAMÍL / IA DOCU / MENT / AL”) e quem recebia a resposta não sabia mais o que a coluna trazia.
- **A prévia da relação no painel ganhou duas leituras**, alternadas ali mesmo. **Como será colado** mostra a tabela no tamanho real do e-mail, com a mesma quebra de texto que o destinatário vai ver. **Leitura ampla** remonta a relação ajustada à tela, com as cores do tema (inclusive o escuro), linhas numeradas, faixas alternadas e cada coluna por extenso, para conferir código de documento e nome de arquivo antes de copiar. O que vai para a área de transferência é sempre a tabela do e-mail, qualquer que seja a leitura aberta, e trocar de leitura não apaga a mensagem já editada.
- **Correção da prévia:** desde a 5.38.1, quando a tabela do e-mail ganhou largura fixa por coluna, o painel ainda pedia que nenhuma célula quebrasse — o texto transbordava por cima da coluna vizinha e a prévia mostrava algo que o e-mail nunca receberia. As duas leituras acima substituem esse arranjo.
- O **cabeçalho da tabela acompanha a rolagem** nas duas leituras, e na leitura ampla a numeração das linhas acompanha a rolagem horizontal — com trinta linhas na relação, quem rolava até o fim não sabia mais qual coluna estava lendo.
- O painel mostra **documentos, arquivos e linhas** como selos no cabeçalho, no lugar da frase única separada por barras, e o quadro da prévia tem altura própria: a relação deixa de empurrar os botões de copiar para fora da tela. No celular, a mensagem encolhe para a relação não ficar reduzida a duas linhas visíveis.

## 5.38.5 — 2026-09-01

- Novo teste ponta a ponta da consulta, a partir de um arquivo de LD no formato real (cabeçalho institucional antes da linha de títulos, abas ET / N-1710 / Colar SIGEM, cabeçalhos reais e célula de confirmação de alocação mesclada). O teste percorre a cadeia inteira — leitura do `.xlsx`, `parseWorkbook`, índice, consulta, a linha exportada montada pela função real da tela e o construtor da planilha — e confere o resultado **relendo o arquivo gerado**, não o objeto em memória. Cobre o código localizado com/sem nt-, a situação de cada forma quando as duas constam na LD, a correção por tipo + TAG, a família documental sem regra de nt-, o documento não localizado e a parada da triagem em Em Análise com a GRDT da revisão analisada. Nenhuma mudança de comportamento nesta versão.

## 5.38.4 — 2026-09-01

- **Consulta:** as colunas **CÓDIGO LOCALIZADO NA LD**, **FORMA LOCALIZADA NA LD** e **PESQUISA COM/SEM nt- E TAG NA LD** voltam a sair preenchidas na planilha do Excel e na cópia para planilha. Elas existiam desde a 5.38.0, mas a linha enviada para a exportação não levava esses campos: o código corrigido (com ou sem nt-) aparecia na tela e sumia no arquivo gerado. Um teste passa a cobrir toda coluna da planilha, para nenhuma outra sair muda.
- **Consulta:** nova coluna **SITUAÇÃO DE CADA FORMA (com/sem nt-)**. Quando o mesmo código ET consta na LD nas duas grafias — com nt- e sem nt- —, cada uma sai com a sua própria situação (código como está na LD, revisão, revisão na Colar SIGEM, alocação, última GRDT e LD de origem), indicando qual delas respondeu à consulta. A forma que não consta é dita como ausente, em vez de ficar em branco. Na tela, a linha ganha o selo **“Consta com e sem nt-”** com a mesma informação. A escolha da consulta não muda: isto é evidência para conferência.

## 5.38.3 — 2026-09-01

- Corrige a evidência do balde **Em análise** (revisão com status oficial Em Análise na Colar SIGEM), introduzido na 5.38.2: o GRCON deixava `analysisEvidence` sempre vazio e mantinha GRDT/Data Efetiva da linha técnica de partida, mesmo quando a análise em aberto estava numa revisão diferente (ex.: LD na revisão 0, análise na revisão A). Agora a evidência da revisão realmente parada pela análise é preenchida (fonte do status e da GRDT/data na Colar SIGEM ou na linha técnica), e GRDT/Data Efetiva passam a refletir essa revisão — corrigindo a coluna "FONTE DO STATUS SIGEM" vazia e o cruzamento incorreto de GRDT/data entre revisões na exportação.

## 5.38.2 — 2026-09-01

- A revisão com status oficial **Em Análise** na Colar SIGEM deixa de avançar sozinha para a próxima revisão: o GRCON para na própria revisão e classifica o documento no balde **Em análise** (contador e filtro já existentes na barra da triagem, no Resumo e no relatório, mas que nunca recebiam nenhum documento). Diferente de Em Workflow e dos demais retornos, uma análise em aberto no SIGEM não é ultrapassada automaticamente — o documento fica fora da eGRDT até o retorno, com a inclusão manual continuando disponível para quem quiser prosseguir mesmo assim.

## 5.38.1 — 2026-09-01

- A tabela da resposta de e-mail fica mais compacta: cada coluna passa a ter uma largura fixa e o texto que não cabe (título, nome de arquivo) quebra dentro da própria célula, em vez de esticar a tabela inteira. O preenchimento de cada célula também diminui. Antes, um título ou nome de arquivo compridos deixavam a tabela colada muito maior do que o corpo do e-mail.

## 5.38.0 — 2026-09-01

### Consultas passa a pesquisar com e sem nt- e corrigir erros de transcrição no código

- A ferramenta **Consultas** agora usa a mesma regra da triagem para localizar o documento na LD: pesquisa o código completo com e sem `nt-` e, quando não bate, pela combinação tipo + TAG, tolerando a mesma confusão alfanumérica única (O/0, I/1, L/1, S/5, Z/2, B/8) já aceita na triagem — sempre que a LD for inequívoca. O TAG nunca é alterado ou adivinhado.
- Nova coluna **Código localizado na LD** na tela e na planilha exportada, com um selo **Código ajustado** quando o código informado precisou ser corrigido — a dica de texto explica o que foi informado e o que a LD tem, igual à triagem. A planilha ganha ainda **Forma localizada na LD** e **Pesquisa com/sem nt- e TAG na LD**.
- Quando mais de um documento da LD corresponde ao código informado, a consulta deixa de escolher um deles sozinha: passa a pedir conferência, com os candidatos listados, do mesmo jeito que a triagem já fazia.

## 5.37.2 — 2026-09-01

- A coluna e os rótulos da revisão editável na triagem passam de **Revisão da GRDT** para **Revisão do documento**: o campo já era editável por linha desde a 5.37.0 (cada documento mantém a sua, mesmo quando vários entram na mesma eGRDT), mas o nome anterior dava a entender um valor único para a GRDT inteira.

## 5.37.1 — 2026-09-01

- Gerar uma eGRDT não abre mais automaticamente o painel de resposta de e-mail.
- O atalho da barra da triagem e a preferência de abertura automática foram removidos; a opção **Resposta de e-mail** permanece exclusivamente na eGRDT selecionada no Histórico.
- O filtro de tipo documental do Histórico agora recorta também a lista de eGRDTs exibida abaixo, além dos totais e da relação exportada, para N-1710, ET e CV.

## 5.37.0 — 2026-08-31

### Escolha e alteração manual da revisão na geração de GRDT

- Nova coluna editável **REVISÃO DA GRDT** na tabela da triagem, ao lado da revisão encontrada na LD/arquivo. A revisão calculada automaticamente continua preenchendo o campo como sugestão inicial, mas o operador pode digitar outra revisão diretamente na célula antes de gerar a eGRDT — por exemplo quando já se sabe, pela fiscalização, que a revisão atual será recusada e a próxima já está em preparo.
- Documento alterado manualmente ganha um selo discreto **Alterada manualmente**, com a sugestão original em dica de texto e um botão para restaurá-la a qualquer momento. A alteração de um documento nunca afeta a revisão dos demais.
- Seleção múltipla no **Revisar dados selecionados** ganhou o campo **Revisão da GRDT**: preenchido, aplica a mesma revisão só aos documentos selecionados; em branco, mantém a revisão de cada um.
- A revisão escolhida — automática ou manual — passa a ser a única revisão usada em toda a geração: relação, planilha `.xls` da eGRDT, relatório de triagem, Resumo, pacote final, histórico e resposta de e-mail. Uma divergência entre a revisão informada e a encontrada na LD/arquivo gera alerta, sem bloquear a geração; um formato de revisão evidentemente inválido continua barrado pela mesma regra que já valia para a revisão calculada automaticamente.
- O histórico volta a registrar, por arquivo, a revisão efetivamente enviada e a sugestão que o sistema tinha calculado na época, preservando quando a escolha foi manual. Reabrir uma eGRDT pelo Histórico mostra a revisão que foi enviada, sem recalcular; eGRDTs geradas antes desta versão continuam completas, com a sugestão preenchida pela própria revisão já registrada.
- Dividir os documentos selecionados entre eGRDTs por disciplina preserva a revisão escolhida de cada documento.

## 5.36.1 — 2026-08-31

- A tabela da resposta de e-mail passa de `10,5 pt` para `9 pt`, com o tamanho gravado diretamente no cabeçalho e em cada célula para o Outlook preservar a formatação.
- O corpo padrão mantém a identificação da eGRDT e a data, mas deixa de acrescentar a frase automática `Seguem N documentos em N arquivos.`.

## 5.36.0 — 2026-08-31

### Resposta de e-mail da eGRDT

- Novo painel **Resposta de e-mail**, que monta a relação dos documentos postados pronta para colar na resposta ao solicitante. Ele abre sozinho ao gerar a eGRDT e pode ser reaberto pelo botão da barra da triagem ou pela eGRDT selecionada no Histórico.
- A relação usa as sete colunas da resposta — data da geração/postagem, eGRDT, família documental, documento, título, disciplina e arquivo postado — com uma linha por arquivo físico, como na eGRDT gerada.
- A cópia entra na área de transferência em dois formatos ao mesmo tempo: tabela HTML com estilo embutido, que o cliente de e-mail cola como tabela, e texto separado por tabulação para e-mail em texto puro e para colar em colunas no Excel. Antes a relação era copiada da tabela do Histórico e chegava ao Outlook desmontada, uma célula por linha.
- A mensagem de acompanhamento vem preenchida com o número da eGRDT, a data e a quantidade de documentos e arquivos, e é editável antes da cópia. **Abrir no e-mail** cria a mensagem com o assunto pronto; quando a relação passa do limite do link `mailto:`, ela segue pela área de transferência.
- A abertura automática pode ser desligada no próprio painel e a preferência fica neste navegador. A sincronização do Supabase dispara o mesmo evento de histórico da emissão, então a geração passou a ser identificada explicitamente para não abrir o painel com o histórico inteiro.

## 5.35.2 — 2026-08-31

- A eGRDT histórica `0130870-C1O-PGV-G-0177-2025` confirmou que os documentos `PR-5290.00-22313-175-C1O-040` e `PR-5290.00-22313-175-C1O-041` foram emitidos com a disciplina literal `MECÂNICA/SEGURANCA` nas linhas de DOCX e PDF.
- O workflow `RNEST UHDTD U-32 PROJETO` passa a usar essa equivalência histórica específica, em vez de `ENGENHARIA DE PROJETO`.
- `MECÂNICA/SEGURANCA` entra no conjunto aceito pela eGRDT; a disciplina continua sem bloquear a geração quando surgir um workflow ainda não mapeado.

## 5.35.1 — 2026-08-31

- `RNEST UHDTD U-32 PROJETO`, confirmado na lista oficial de workflows, passa a ser convertido para `ENGENHARIA DE PROJETO` na eGRDT.
- Os documentos `PR-5290.00-22313-175-C1O-040` e `PR-5290.00-22313-175-C1O-041` seguem com DOCX + PDF sem o erro incorreto `DISCIPLINA fora da lista oficial`.
- Disciplina deixa de ser critério bloqueante: workflows conhecidos são adaptados para o nome curto da eGRDT; um valor novo ou ainda não mapeado é preservado e gera alerta, sem impedir a geração.

## 5.35.0 — 2026-08-31

- Nova área **Combinar PDFs** no menu do GRCON para selecionar vários arquivos, conferir e editar a ordem e gerar um único PDF.
- A operação acontece integralmente no navegador, em Web Worker, sem upload, persistência, histórico ou gravação no Supabase.
- A ferramenta permite arrastar arquivos, usar os controles subir/descer, remover itens, limpar a fila, escolher o nome final, acompanhar o progresso, cancelar e baixar novamente o resultado enquanto a página permanecer aberta.
- PDFs inválidos, vazios, danificados ou protegidos por senha são recusados com uma mensagem objetiva. Arquivos repetidos na mesma seleção são ignorados.
- O motor preserva todas as páginas e seus tamanhos na ordem escolhida e usa gravação compacta com fluxos de objetos para reduzir tempo e tamanho de saída.
- A biblioteca pdf-lib 1.17.1 foi vendorizada com licença e hash SHA-256 conferido pelo CI; o código pesado só é carregado dentro do Worker quando a combinação começa.

## 5.34.2 — 2026-08-31

- A revisão atual só é postada quando seu status oficial é **Não Postado**. Assim, `0` com Não Postado permanece `0` para a eGRDT.
- Qualquer outro status oficial preenchido encerra a combinação atual e libera a próxima revisão ausente: `0` avança para `A`, `A` avança para `B` e assim sucessivamente.
- A regra inclui Em Análise, Em Workflow, comentários, Recusado, Para Construção, Conforme Construído, Para Compra, Pendente Certificação, Cancelado e qualquer outro status preenchido. Status vazio ou conflitante continua exigindo conferência.

## 5.34.1 — 2026-08-31

- O status oficial **Em Workflow** passa a avançar para a próxima revisão, assim como os demais retornos que autorizam continuidade. Se a revisão `0` está Em Workflow, o GRCON procura e prepara a revisão `A`; se `A` também já está Em Workflow, prepara `B`, e assim sucessivamente.
- A combinação de documento + revisão já presente na `Colar SIGEM` nunca é repostada. Somente a primeira revisão ausente, calculada como **Não Postado**, fica pronta para a nova eGRDT.
- A mensagem incorreta “Não será enviado novamente” deixa de aparecer nesse cenário; a decisão passa a informar a próxima revisão liberada.

## 5.34.0 — 2026-08-28

### Composição de arquivos da N-1710

- A N-1710 passa a aceitar **qualquer quantidade de arquivos físicos, em qualquer extensão**. As composições obrigatórias por tipo saem de cena: não há mais exigência de 1 nativo + 1 PDF, do trio dos `CR`, do PDF isolado dos códigos `955` nem do par Excel + PDF de `LI`/`MC`. A validade continua vindo de código + LD + revisão + disciplina.
- `TÍTULO` e `PROPÓSITO` continuam sendo gravados na eGRDT quando existem na LD, mas ausência ou divergência nesses dois campos deixa de bloquear a emissão. Documento, revisão, arquivo, formato, disciplina e tipo continuam protegidos pelo validador central.
- O seletor da pasta documental deixa de filtrar extensões: a decisão passa a ser tomada depois, com o código documental e a LD disponíveis.
- **A ordem das linhas continua sendo o modelo oficial**: nativo primeiro, PDF em seguida e TXT por último. Sem essa normalização o pacote herdava a ordem em que o sistema operacional devolveu os arquivos do seletor, de modo que a mesma seleção podia gerar eGRDTs com as linhas invertidas entre uma execução e outra.
- **Arquivo duplicado volta a ser ignorado** (regra da 5.33.8): dois arquivos que resolvem para o mesmo nome controlado são a mesma cópia do documento, e só a primeira segue para a eGRDT. A cópia deixa de ser emitida como uma segunda linha com sufixo `_ARQnn`, que produzia um nome fora da codificação controlada pela LD.
- O alerta de nome divergente volta a aparecer — a normalização interna deixava de avisar o operador — e agora informa o nome final que será gravado.

### Desempenho

- O Service Worker deixa de rebaixar cada revalidação a um download completo. Ele buscava todo arquivo com `cache: "no-store"`, o que fazia o app transferir de novo ~1,8 MB de código (48 scripts e 10 folhas de estilo) **a cada abertura**. Passa a usar requisição condicional (`cache: "no-cache"`, ETag/If-None-Match): a garantia de que uma correção publicada aparece na hora é a mesma, mas quando nada mudou o servidor responde `304` sem corpo.
- As folhas de estilo dos módulos que abrem ocultos — Consulta, Histórico de análises e SIGEM, cerca de 70 KB — saem do caminho crítico de renderização e passam a valer logo após a primeira pintura.

### Segurança

- `'unsafe-eval'` removido da Content-Security-Policy. O único uso de `new Function` nas bibliotecas vendorizadas é o polyfill de `setImmediate` do browserify, acionado somente quando se passa uma string — o que nenhuma delas faz. Conferido em navegador com a política restrita: ExcelJS grava o `.xlsx`, JSZip comprime com DEFLATE e SheetJS grava a planilha, sem violações.
- Índices de cobertura para as cinco chaves estrangeiras que não tinham nenhum (`SUPABASE_MIGRACAO_5.34.0.sql`). Sem eles, apagar um usuário ou excluir uma eGRDT do histórico obrigava o Postgres a varrer a tabela inteira para conferir a restrição — justamente nos dois pontos em que o operador espera a confirmação do Supabase.

### Interface e acessibilidade

- **Correção de contraste no tema escuro.** `--text-strong`, `--brand-500`, `--success-800` e `--danger-800` eram usados pelo Dashboard, pela Consulta e pelo anel de foco, mas nunca haviam sido definidos: cada `var()` caía no valor de reserva escrito no próprio arquivo, sempre uma cor do tema claro. No modo escuro os números dos indicadores, os títulos e os rótulos do gráfico apareciam em azul-marinho sobre fundo escuro, praticamente ilegíveis. Definidos como apelidos dos tokens reais, os 25 usos passam a acompanhar os dois temas — todos os pontos medidos ficam acima de 4,5:1 (WCAG AA) no claro e no escuro.
- O **Dashboard compara cada indicador com o período anterior** de mesmo tamanho: cada cartão mostra a variação percentual, com direção, cor e a frase completa para leitor de tela. Um indicador sozinho não diz se 412 documentos é muito ou pouco. Quando o período começa antes do primeiro registro — “Todo o histórico” — não existe janela anterior comparável e nenhuma variação é exibida. A mesma comparação vai para o Excel do Dashboard.
- O fundo da tela de acesso deixa de exibir uma borda circular: o gradiente terminava em `transparent`, que é preto com alfa 0, e a interpolação até ele passava por cinza.
- A tela de acesso, o menu da conta e os painéis de equipe ganham o **tema escuro**. Os tokens de `html[data-theme="dark"]` já existiam, mas essa folha só tinha cores fixas do tema claro: quem usava o app no escuro recebia essas telas em branco.
- O campo de e-mail recebe o foco ao abrir a tela de acesso; antes o foco ficava no `<body>`, atrás dela.
- A região viva de leitores de tela deixa de ser o cartão inteiro e passa a ser a mensagem de status. Na configuração anterior, qualquer alteração — inclusive a troca entre login e nova senha — fazia o leitor reler o formulário completo.
- O botão de exibir senha passa a expor seu estado (`aria-pressed`).

### Manutenção

- `history_app.js` e `sigem_posting_app.js` deixam de fixar a versão no próprio arquivo e passam a lê-la da configuração central. O valor de reserva entrou na conferência de versões, que subiu de 5 para 7 pontos de publicação — antes esses dois envelheciam em silêncio e carimbavam a versão errada nos relatórios.

## 5.33.15 — 2026-08-24

- Documentos do tipo **DE** passam a usar obrigatoriamente o formato **A3** na eGRDT.
- A regra prevalece sobre qualquer formato diferente informado na LD, inferido do arquivo ou alterado manualmente no painel.
- A normalização é aplicada tanto na triagem quanto na montagem final da eGRDT, garantindo que todas as linhas de um DE sejam emitidas como A3.

## 5.33.9 — 2026-08-24

- Sufixos inválidos no nome do arquivo (por exemplo `_RIR`, `_ERRADO` ou texto extra após `_0001`) deixam de ser tratados como revisão controlada. O GRCON ignora o conteúdo divergente, usa a revisão oficial da LD/histórico e mantém apenas um alerta visível.
- Nomes como `MC-5290.00-22313-970-C1O-009_0001_RIR.xlsx` e `.pdf` passam a gerar normalmente como `MC-5290.00-22313-970-C1O-009_0001_0.xlsx` e `.pdf` quando a LD controla a revisão `0`.
- Divergências de revisão escritas entre arquivos do mesmo documento também deixam de bloquear a postagem; a revisão controlada pela LD/histórico prevalece e a inconsistência do nome fica registrada somente como alerta.
- A regra preserva a validação de conteúdo da eGRDT: apenas o nome recebido fica tolerante, enquanto documento, revisão final, disciplina, tipo e propósito continuam sendo gravados pelos valores oficiais controlados.

## 5.33.8 — 2026-08-24

- Nomes de arquivo podem trazer o código junto do título ou com separadores/formatos divergentes; o GRCON localiza a codificação controlada na LD, usa a grafia oficial na eGRDT e transforma a divergência em alerta, não bloqueio.
- A correspondência tolerante remove pontuação e espaçamento apenas para pesquisa e aceita um único erro de transcrição no código. Quando códigos vizinhos ficam possíveis, o título presente no nome do arquivo é confrontado com o título controlado da LD para desempatar; sem evidência única, o GRCON continua exigindo conferência e não adivinha.
- Arquivos duplicados que resultam no mesmo nome final são ignorados automaticamente; apenas a primeira cópia segue para a composição e para a eGRDT, com alerta visível ao operador.
- A etapa final de emissão deixa de bloquear por nome/codificação divergente quando o código oficial foi resolvido pela LD: o nome é normalizado e a geração prossegue.

## 5.33.7 — 2026-08-24

- Documentos N-1710 de codificação **LI** e **MC** passam a seguir composição própria para postagem: exatamente **1 arquivo Excel + 1 PDF** do mesmo código.
- O Excel pode ser `.xls`, `.xlsx`, `.xlsm` ou `.xlsb`; outro nativo (`.dwg`, `.docx`, etc.) é rejeitado para LI/MC com mensagem específica.
- Na eGRDT, o arquivo Excel é gravado primeiro e o PDF logo abaixo, ambos com o mesmo código, revisão e sufixo obrigatório `_0001_<revisão>`.
- A regra geral dos demais documentos N-1710 permanece **1 nativo + 1 PDF**, sem alteração.
- O seletor de arquivos e o pacote final passam a tratar a saída como **arquivos + eGRDT**, refletindo corretamente conjuntos que incluem Excel, DWG e outros nativos além de PDF.

## 5.33.6 — 2026-08-21

- O Histórico ganhou filtro de **Tipo de documento** específico para a relação por período: `Todos`, `N-1710`, `ET` ou `CV`.
- A classificação usa primeiro a aba técnica registrada e, quando necessário, infere a família pelo próprio código, preservando compatibilidade com eGRDTs antigas já salvas no histórico.
- `N-1710` reconhece as categorias contratuais da família associadas aos códigos `5290.00`; `ET` reconhece o padrão RNEST e também as subdivisões históricas RIR/C&M; `CV` segue o padrão de cinco grupos da ET de codificação de currículos.
- Em eGRDTs mistas, o relatório de um tipo específico leva somente os arquivos/documentos daquela família e recalcula documentos, arquivos e alocações.
- O Excel passa a informar a **FAMÍLIA DOCUMENTAL** nas abas `eGRDTs` e `Documentos`, registra o tipo selecionado nos metadados e inclui o tipo no nome do arquivo exportado.

## 5.33.5 — 2026-08-21

- A triagem deixa de mostrar apenas o PDF seguido de `+1 arquivo(s)` quando o mesmo documento possui nativo e PDF.
- As colunas `ARQUIVOS ORIGINAIS` e `ARQUIVOS FINAIS` passam a exibir cada arquivo físico individualmente, com o nome completo e a extensão real (`DWG`, `PDF`, `DOCX`, `XLSX`, etc.).
- A exibição usa todos os arquivos associados ao documento, sem escolher o PDF como representação visual dos demais.
- A regra altera somente a apresentação/identificação no painel; a composição e a validação da eGRDT continuam preservando cada arquivo físico separadamente.

## 5.33.4 — 2026-08-21

- Corrige definitivamente `DISCIPLINA fora da lista oficial` na N-1710 com a LD_001 atual.
- A leitura rápida da LD não confunde mais a coluna técnica `DISCIPLINA` com a coluna auxiliar `Disciplina Torre`; quando as duas existem, `DISCIPLINA` tem prioridade obrigatória.
- Valores compostos da LD, como `RNEST UHDT-D U32 CIVIL/SEGURANCA`, passam a ser comparados na ordem em que aparecem com a lista oficial da eGRDT e são convertidos para `CIVIL`, reproduzindo o padrão observado no eGRDT 0613.
- A resolução de disciplina continua adaptativa: descrições longas, códigos contratuais e combinações separadas por `/` são reduzidas para uma opção realmente disponível na eGRDT, sem desativar a validação oficial.
- O cache do worker de leitura da LD foi invalidado para impedir que uma leitura antiga, com disciplina vazia, continue sendo reutilizada após a atualização.

## 5.33.3 — 2026-08-21

- Corrige a geração de N-1710 quando a LD informa a disciplina pelo código contratual (ex.: `CVL`) ou em workflow terminado pelo código (ex.: `.../CVL`).
- Antes da validação da eGRDT, os códigos conhecidos passam a ser convertidos para a descrição oficial (`CVL` → `CIVIL`, `ELE` → `ELÉTRICA`, `INS` → `INSTRUMENTAÇÃO`, etc.).
- Elimina o bloqueio incorreto `DISCIPLINA fora da lista oficial` para documentos N-1710 válidos, preservando a validação oficial da eGRDT.

## 5.33.2 — 2026-08-21

- N-1710 passa a seguir composição própria de eGRDT: exatamente 1 arquivo nativo + 1 PDF por código.
- Os dois arquivos são registrados como duas linhas da planilha GRDT, com o nativo antes do PDF.
- Na N-1710, o sufixo `_0001_<revisão>` é obrigatório nos dois arquivos, inclusive `_0001_0`.
- A geração é bloqueada quando falta o arquivo nativo, falta o PDF ou existem mais/menos de dois arquivos para o mesmo código.


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

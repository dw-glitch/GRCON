# GRCON

Aplicativo web estático para triagem documental de LD, conferência de alocação, geração de eGRDT e histórico compartilhado no Supabase.

## Regra com/sem `nt-`

A versão 5.32.12 pesquisa documentos **ET** nas duas formas:

1. o código informado, sem `nt-` no início do 7º grupo;
2. a mesma identidade, com `nt-` minúsculo no início do 7º grupo.

A relação, as mensagens de auditoria e as colunas de pesquisa preservam o prefixo como `nt-` minúsculo. A chave interna de comparação é normalizada apenas para permitir uma busca segura, sem alterar a grafia apresentada ao operador.

Se a LD possuir somente a forma alternativa, o GRCON adota o código exatamente como está na LD, renomeia o PDF para essa forma e registra claramente `DE → PARA` no relatório. A condição de alocação da linha encontrada continua determinando se o documento pode entrar na eGRDT.

A grafia da linha técnica da LD é preservada literalmente em todos os campos do relatório e no arquivo final: maiúsculas, minúsculas, `nt-` e separadores não são convertidos. A normalização para maiúsculas existe somente na chave interna de pesquisa e nunca é usada como valor de saída.

Documentos **N-1710 não participam dessa regra**. Eles são pesquisados somente pelo código informado.

## Busca pelo TAG dos documentos ET

Conforme a ET-5290.00-22000-912-1LV-001 Rev. P, o Grupo 7 identifica o TAG e o código final deve seguir a grafia controlada existente. O GRCON pesquisa na seguinte ordem:

1. código completo exatamente como informado;
2. código completo nas formas com e sem `nt-`;
3. TAG dentro do mesmo código, tolerando diferenças de separadores e uma única confusão comum de digitação entre letra e número (`O/0`, `I/1`, `L/1`, `S/5`, `Z/2` ou `B/8`);
4. combinação obrigatória entre o tipo documental do Grupo 6 e o TAG normalizado, mesmo quando os Grupos 1 a 5 foram informados de outra forma.

A quarta busca vale para todos os tipos documentais da norma, sem uma lista fixa de siglas. O tipo informado nunca é substituído: REP só pode localizar REP, RUFF só pode localizar RUFF, e a mesma regra é aplicada a qualquer outro código do Grupo 6. Se a LD contiver apenas outro tipo com o mesmo TAG, o documento é informado como não localizado e não é renomeado.

Quando a combinação **Grupo 6 + TAG** identifica uma única linha, o GRCON considera o código oficial da LD para corrigir eventuais divergências nos Grupos 1 a 5, adota exatamente essa codificação, renomeia o arquivo e registra `DE → PARA` no relatório. Se houver mais de uma linha do mesmo tipo com o mesmo TAG, o GRCON pede conferência. A comparação do TAG tolera separadores e uma única confusão comum entre letra e número, mas jamais atravessa tipos documentais.

Documentos N-1710 não participam da busca por TAG dos relatórios ET.

## Relatório

Na exportação do Histórico, a coluna `VERSÃO DA LD ENVIADA` (X) apresenta o valor literal de `Prazo` da linha do documento na LD, como `A01`, `E30` ou `Primeiras versões`. O prazo é guardado no momento da geração e preservado nas próximas exportações. A revisão da LD continua armazenada separadamente. Registros antigos sem prazo ficam vazios nessa coluna; não se infere prazo a partir da revisão ou de uma LD atual.

O Excel gerado concentra decisão e rastreabilidade sem duplicar a relação:

- `Resumo`: primeira aba do arquivo, com painel gerencial, decisão operacional e todas as evidências técnicas — buscas, código encontrado, alocação, renomeação, revisão, postagem, origem e linha da LD, Databook, histórico, arquivo final e ação necessária;
- `Triagem`: resultado operacional completo;
- `Linha do tempo`: histórico de revisões, quando disponível.

Na relação do `Resumo`, as colunas de decisão aparecem primeiro e as evidências complementares continuam à direita. O cabeçalho possui filtros e as duas primeiras colunas permanecem visíveis durante a rolagem horizontal.

O relatório não cria fórmulas ou conexões com planilhas externas. `STATUS INTERNO` usa o comentário da fiscal já registrado na LD e, quando ele não existe, a situação apurada pelo GRCON. Assim o arquivo abre sem reparo e sem aviso de fonte externa não confiável.

O processamento não impõe limite à quantidade da relação. A suíte pública valida 15.000 códigos ET nos dois sentidos da busca e mais 15.000 códigos localizados por tipo + TAG, sem incluir dados ou metadados de planilhas operacionais no repositório.

## Múltiplas LDs e LD de comissionamento

O seletor `Uma ou mais LDs` aceita várias planilhas na mesma análise. O GRCON lê cada arquivo, consolida as linhas técnicas e as bases SIGEM em um índice único e procura o documento em todas as LDs selecionadas. A origem exata da linha encontrada — arquivo, aba e linha — permanece no resultado e no relatório.

Os cabeçalhos não precisam estar em uma posição fixa. Abas da mesma família, como `N-1710` e `N-1710 MOD`, são tratadas como fontes compatíveis; quando existe uma cópia antiga oculta e uma aba vigente visível, a vigente tem prioridade. A leitura da LD de comissionamento também reconhece o propósito pelos valores oficiais quando a coluna contém os dados, mas o cabeçalho está vazio.

## Separação das eGRDTs por disciplina

Antes de aplicar o limite configurado, o GRCON agrupa todos os documentos selecionados por disciplina. Cada eGRDT contém somente uma disciplina. Se uma disciplina exceder o limite, ela é dividida em duas ou mais eGRDTs; relações grandes podem gerar quantos lotes forem necessários.

Na confirmação da saída, cada cartão informa a disciplina, a quantidade de documentos e a posição do lote dentro daquela disciplina. O número sequencial de cada eGRDT permanece editável individualmente, e o operador confirma a disponibilidade dos números antes da geração.

## Disciplina oficial da eGRDT

`discipline_resolver.js` é a fonte única de verdade para o catálogo permitido, os códigos disciplinares e os aliases validados. `core.js`, `grcon_config.js`, a triagem, os Workers, o relatório, o Histórico e `grdt_workbook.js` consomem esse mesmo catálogo.

Para documentos CV, a origem é obrigatoriamente a mesma linha localizada na `LD_001`, aba `CV`. A aba é reconhecida sem diferença de caixa ou espaços externos, mas nunca é confundida com outra família. A coluna técnica `DISCIPLINA` é localizada pelo cabeçalho e prevalece sobre campos auxiliares, como `Disciplina Torre`. A disciplina não é inferida do grupo `-CV-...-` do código.

O valor literal lido da LD é preservado como `disciplinaOriginalLd`; a eGRDT recebe outro campo, já resolvido para o vocabulário oficial. A resolução segue somente esta ordem:

1. correspondência exata normalizada;
2. alias integral validado;
3. código disciplinar contratual exato;
4. regra determinística que resulte em uma única opção;
5. escolha manual em combo fechado, quando houver ambiguidade ou ausência de mapa.

Não existe fuzzy matching, aprendizado automático nem fallback para `GERAL`. Uma confirmação manual vale somente para aquele resultado. Toda eGRDT é validada antes da escrita e novamente depois de reaberta; um valor fora do catálogo interrompe a geração.

Aliases integrais validados atualmente:

| Disciplina na LD | Disciplina oficial eGRDT |
|---|---|
| RNEST UHDTD U-32 PROJETO | ENGENHARIA DE PROJETO |
| RNEST UHDTD U-32 SMS/GERAL | GERAL |
| RNEST UHDTD U-32 SMS/MEIO AMBIENTE | MEIO AMBIENTE |
| RNEST UHDTD U-32 SMS/SAUDE | SAÚDE |
| RNEST UHDTD U-32 SMS/SEGURANCA | SEGURANÇA |
| RNEST UHDTD U-32 TIC TELECOM | COMUNICAÇÃO E RS |
| RNEST UHDTD U-32 TIC TELECOM SIT | COMUNICAÇÃO E RS |

Descrições com duas opções oficiais distintas, como `CIVIL/SEGURANCA`, `TUBULAÇÃO/INSTRUMENTAÇÃO` e `TUBULAÇÃO/SEGURANCA`, permanecem em conferência até uma escolha humana; o GRCON não seleciona a primeira disciplina encontrada.

Uma disciplina gravada em uma eGRDT antiga não amplia o catálogo do modelo vigente. Em particular, `MECÂNICA/SEGURANCA` não é uma opção oficial e nunca é aceita; o workflow `RNEST UHDTD U-32 PROJETO` é convertido para `ENGENHARIA DE PROJETO`.

## Responsividade no navegador

A interface preserva o layout operacional de desktop e se reorganiza continuamente quando a janela do navegador é reduzida ou ampliada. Em telas menores, a navegação vira uma faixa horizontal rolável, cartões e formulários passam para uma ou duas colunas, ações longas ocupam a largura disponível e drawers, diálogos e menus permanecem inteiramente acessíveis.

As tabelas continuam completas e usam rolagem horizontal própria, sem alargar a página. Nas larguras estreitas, as colunas congeladas da triagem são liberadas para não encobrir os dados. A adaptação cobre largura e altura da janela, inclusive redimensionamento livre no computador, sem alterar o conteúdo dos relatórios Excel.

## Inclusão manual de documentos Não Alocados

Documentos cuja LD informa `NÃO ALOCADO` permanecem desmarcados quando a análise termina. O operador pode marcar a caixa da linha para incluí-los manualmente na GRDT, sem alterar o status original lido da LD.

A caixa `Selecionar todos · Situação`, no cabeçalho da tabela, seleciona ou desmarca todos os documentos visíveis disponíveis para GRDT. Pesquisa, aba, situação e filtros de coluna são respeitados; assim é possível filtrar somente `NÃO ALOCADO` antes da seleção em massa.

Toda inclusão de um documento Não Alocado é registrada como decisão manual na tela, no `Resumo`, na `Triagem` e no manifesto do pacote. Bloqueios técnicos que não correspondem a Não Alocado continuam impedindo a emissão.

## Exclusão do histórico e reutilização da numeração

Ao excluir uma eGRDT do histórico compartilhado, o GRCON aguarda a confirmação do Supabase, marca o registro como excluído para sincronizar os demais navegadores e remove a reserva consumida na mesma transação. Aquele número deixa de bloquear uma nova geração e pode ser informado novamente.

A exclusão compartilhada exige conexão e perfil de proprietário ou administrador. A limpeza completa do histórico segue a mesma regra e libera todas as numerações que já estavam vinculadas a registros concluídos; reservas de gerações ainda em andamento são preservadas.

## Resposta de e-mail da eGRDT

Na eGRDT selecionada no **Histórico**, o botão **Resposta de e-mail** abre a relação dos arquivos postados nas mesmas oito colunas usadas no relatório: data da geração/postagem, eGRDT, família documental, documento, **revisão**, título, disciplina e arquivo postado. A revisão vem logo depois do documento, como na planilha da GRDT, e é a revisão efetivamente enviada — inclusive quando ela foi escolhida à mão na triagem. Uma linha por arquivo físico — o DOCX e o PDF do mesmo documento continuam sendo duas linhas.

A tabela ocupa toda a largura do corpo da mensagem: ela termina onde a frase acima dela termina, em vez de parar antes num bloco estreito com uma faixa vazia à direita. Cada coluna recebe uma proporção fixa dessa largura, e o texto que não cabe quebra dentro da própria célula. Cabeçalho e células usam fonte 10 pt.

## Contrato fixo — aba “Colar GRCON” (v1)

A **Relação de eGRDTs por período** contém `Resumo`, `eGRDTs`, `Documentos` (detalhada), **`Colar GRCON`** (contrato estável v1) e **`Colar GRCON v2`** (controle atualizado com alocação).

A aba operacional traz **exatamente cinco colunas A:E, sem fórmulas ou colunas ocultas**:

| Coluna | Cabeçalho imutável | Origem |
| --- | --- | --- |
| A | DATA DA GERAÇÃO / POSTAGEM | Data/hora real do histórico, como data/hora numérica do Excel |
| B | EGRDT | Número exato da eGRDT |
| C | DOCUMENTO | Código documental |
| D | REVISÃO ENVIADA NA GRDT | Revisão efetivamente gerada |
| E | VERSÃO DA LD ENVIADA | Campo literal `Prazo` da LD capturado na geração |

As linhas 1–2 são o título `COLAR GRCON` e os cabeçalhos; os dados começam na linha 3. **Não alterar nomes, posições, início dos dados, tipos nem quantidade das cinco colunas.** Se um dia for preciso ampliar os dados, criar uma nova aba versionada; nunca modificar este contrato v1. Os registros continuam por ocorrência de documento/eGRDT, incluindo repostagens; arquivos excluídos individualmente não são exportados. Prazo desconhecido permanece vazio: não utilizar versão ou revisão da LD como substituto.

**Colagem no Controle de Solicitações:** limpar somente `A:E` da aba de destino `Colar GRCON` e copiar `A1:E<última linha>` da aba exportada para `A1` do destino (colagem de valores e, se necessário, formatos de data). **Não sobrescrever a coluna F**, que contém a chave auxiliar do documento e data. A aba `Solicitações` deve consultar o documento pela coluna C, a data pela A, a eGRDT pela B e o Prazo pela E. Para documentos somente de inclusão/alocação ou com Prazo não informado no histórico, a fórmula da coluna L recorre ao registro correspondente da `Central de alocação` (J = documento; B = versão), sem inventar prazo.

### Colar GRCON v2 — alocação e visual operacional

A relação também inclui **`Colar GRCON v2`**. As primeiras cinco colunas e as linhas de título/cabeçalhos continuam iguais ao contrato v1, e a coluna **F — `ALOCAÇÃO`** traz o número capturado por documento no histórico da emissão. Informação ausente permanece vazia. Repostagens conservam a alocação de cada envio. A exportação não consulta a Central atual para preencher o passado.

O visual v2 acompanha o Controle de Solicitações anterior: título azul escuro em fundo branco, cabeçalho azul e registros cinza. A aba v1 de cinco colunas permanece intacta para os controles anteriores.

**No controle atualizado:** limpar somente `A:F` de `Colar GRCON` e colar os valores de `Colar GRCON v2!A1:F<última linha>` em `A1`. Preservar a coluna **G**, auxiliar. Em `Solicitações!M`, procurar primeiro o último número não vazio na `Central de alocação` (J = documento, H = alocação). Se não houver, usar F do envio vinculado por documento e data de recebimento. Se as duas fontes estiverem vazias, deixar vazio. Não usar coincidência parcial entre códigos.


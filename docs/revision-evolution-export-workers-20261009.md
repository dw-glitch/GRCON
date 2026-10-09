# Excel de Revisões e Evolução fora da thread da interface

A Situação das Revisões montava, compactava e reabria o ExcelJS na thread da interface. A Evolução também convertia e gravava a planilha com SheetJS nessa thread. Os demais relatórios já utilizavam o worker de exportação.

- Revisões delega ao worker existente, carregando o mesmo construtor de relatório, com as abas Lista Filtrada/Filtros Aplicados, validação do arquivo e formatação preservadas. Somente valores de logo necessários são transferidos; funções do objeto de identidade visual ficam fora da mensagem.
- Evolução utiliza o mesmo caminho de planilhas do worker, preservando Evolução/Escopo e os campos atuais. A exportação captura escopo e modo antes de aguardar: mudar a visão durante a geração não altera a descrição ou o nome do arquivo já solicitado.
- Sem suporte ao worker ou em caso de falha, o construtor local continua disponível. Não são criados serviços, bindings ou operações remotas para processar bases locais.
- A conferência de produção inclui SHA-256 do relatório de Revisões, worker de exportação e bundle da Evolução, além dos cinco ativos já verificados.

Validação: regressão XLSX de filtros/15.050 registros, delegação com payload clonável e fallback; Chromium com 20.000 registros nas duas exportações, comparação célula a célula, paridade worker/local e timer da interface. O teste do fluxo React troca o escopo enquanto uma exportação está pendente e verifica linhas, aba Escopo e nome do download. As medições usam fixtures e não substituem homologação com bases atuais no PC corporativo.

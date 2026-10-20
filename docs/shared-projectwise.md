# ProjectWise compartilhado — fase 2

O proprietário ou administrador pode publicar o PW carregado no Dashboard para
sua equipe. O CSV original normalizado é preservado em snapshots imutáveis;
a LD da Qualidade continua determinando a projeção N-1710 de cada análise.
Importar um CSV não publica automaticamente nem substitui a base compartilhada.

A publicação recebe páginas verificadas e troca o ponteiro ativo em uma única
transação. Uma base publicada por outro usuário durante o envio impede a
substituição silenciosa. Repetir o mesmo lote é seguro; alterar um lote já
recebido é recusado. Snapshots anteriores permanecem disponíveis.

Dashboard, Situação das Revisões e Evolução usam o serviço compartilhado.
O seletor do Dashboard combina versões compartilhadas com históricos locais,
identificando a origem. Selecionar uma versão para análise não muda a base
oficial da equipe. Edição de data é compartilhada e verifica concorrência.
Exclusão de snapshot compartilhado é exclusiva do proprietário master.

O cache local permanece disponível offline e identifica falha de atualização.
O serviço mantém até três payloads em memória, agrupa carregamentos ativos,
verifica conta/contrato após cada leitura e exige todas as linhas contíguas.
Datas operacionais e arquivo original são preservados nos metadados.
Uma base antiga sem todos os registros originais precisa do CSV original para
ser compartilhada; os registros ausentes não são reconstruídos.

Validação: PGlite com papéis reais, sessão revogada, isolamento, carga parcial,
concorrência, histórico e datas; cliente com 2.001 linhas e respostas incompletas;
Chromium com duas sessões e IndexedDB independentes. O teste de produção da RPC
usa transação com rollback, sem publicar base fictícia para os operadores.
A ferramenta de aplicação de migrations apresentou `Invalid or expired requestState`;
o DDL idempotente foi aplicado pelo executor SQL autenticado e conferido no banco.
O registro desta execução no histórico de migrations ainda está pendente; uma
tentativa de registro foi interrompida. O arquivo pode ser aplicado novamente
pelo fluxo normal de migrations, pois o DDL é idempotente.

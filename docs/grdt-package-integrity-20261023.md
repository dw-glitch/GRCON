# Integridade do pacote físico e erro temporário no cliente Java

O log de 23/10/2026 da GRDT 1953/2026 contém duas ocorrências distintas:

- Às 14:13:38, o cliente não localizou o PDF `C1O_RNEST_U32_7.6.1.1_EST_TH.SPIE_P-32009.pdf` na primeira tentativa.
- Às 14:14:18, uma nova tentativa registrou a compactação do XLS e de 19 PDFs. O XLS e nove PDFs foram enviados. Às 14:15:19, o Java não encontrou seu ZIP temporário `C1O_RNEST_U32_7.6.1.1_EST_TH.SPIE_P-32023-pdf.zip`. As seis tentativas de leitura falharam e o processo terminou às 14:16:35.

O log não informa o motivo do desaparecimento desse ZIP temporário nem comprova que o PDF original estivesse inválido. Falha de transferência e confirmação de postagem no SIGEM são estados diferentes. A confirmação deve ser consultada antes de reenviar itens de uma remessa parcialmente transferida.

## Alteração no GRCON 5.44.16

Antes de liberar o download e registrar a emissão, o gerador reabre o ZIP final. Para cada lote, confere o XLS e cada arquivo físico no diretório correto e compara integralmente seus bytes com os bytes de origem. Rejeita arquivos ausentes, vazios, diferentes, duplicados por nome no Windows, em subdiretórios incorretos ou com nomes incompatíveis com extração. Confere também a correspondência entre nome físico e coluna ARQUIVO.

A conferência funciona no Worker e no caminho alternativo da interface. Processa um arquivo por vez para limitar a memória. A seleção manual de documentos e de composições excepcionais permanece disponível; esta validação trata da integridade material da saída.

O arquivo `ORGANIZACAO_DOS_LOTES.txt` orienta a extrair o pacote completo para uma pasta local curta e abrir o XLS na pasta extraída, ao lado dos documentos.

## Limite da correção

O GRCON não controla a pasta temporária nem o FTP do programa Java externo. A conferência do ZIP elimina entregas incompletas detectáveis no momento da geração; ela não garante a permanência dos arquivos temporários criados posteriormente pelo cliente Java. Se a mesma exceção reaparecer, preserve o ZIP original do GRCON e compare a pasta extraída. Reabra o cliente Java antes de uma nova tentativa. Persistindo a ausência do ZIP temporário, o diagnóstico deve ser feito no ambiente do cliente SIGEM.

## Testes

`tests/grdt_package_integrity.cjs` gera e reabre o XLS oficial e um pacote com 19 PDFs, incluindo o código com ponto interno `TH.SPIE` e o documento `P-32023`. Exercita arquivo ausente, vazio, alterado sem mudança de tamanho, diretório incorreto, ZIP truncado, conflito de nomes, cancelamento, pacote apenas com XLS, composição manual e as funções reais do Worker.

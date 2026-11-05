# SIGEM × PW — recuperação da importação e exportação em segundo plano

Base de implementação: `bc73f8ba2a8011d2a14384979fe87046dc705a28`.

## Comportamento

- A importação PW confirma a geração e as fontes do modelo antes de anunciar sucesso. Falhas após a gravação distinguem base salva de comparação pendente e oferecem repetir a análise sem reimportar.
- Eventos externos e chamadas de atualização durante a importação são agrupados para execução posterior. Resultados de contexto ou fontes ultrapassadas não são aplicados.
- A abertura pode exibir a última base local identificada no workspace enquanto verifica as bases compartilhadas. Falhas de sincronização preservam o resultado válido com aviso.
- A demanda operacional e a montagem/serialização do Excel usam um Worker dedicado. Há timeout, tratamento de messageerror e encerramento das instâncias. Bases grandes não passam silenciosamente para processamento síncrono em caso de falha.
- A exportação captura bases e filtros no início; o Resumo usa rótulos legíveis e o arquivo identifica horário UTC e escopo.
- `DATA DE INCLUSÃO NO SIGEM` vem exclusivamente de `includedAt` da mesma revisão na Consulta Geral. Ausência permanece vazia; datas diferentes da mesma revisão são preservadas com ` | `. Não se usa a data da base, de modificação ou de outra revisão. A coluna fica após as revisões para preservar as posições dos X e das fórmulas F:H, também nas abas por classe.

As regras de empresas CSG/QTM, LDs, cadastro, emissão, revisões em sequência, duplicidades e exceções permanecem no motor existente. A geração do novo Worker integra `npm run build` e o precache offline.

## Validação

- `npm run build`: typecheck, paridade semântica e build de todas as ilhas React, incluindo o novo Worker.
- 21 suítes específicas do SIGEM × PW aprovadas, incluindo recuperação, concorrência, timeout/cancelamento, inclusão no SIGEM, regras documentais, histórico, filtros e XLSX reaberto.
- Homologações sintéticas adicionais phase6 e phase8 aprovadas (incluindo referência de 6.041 documentos e 29.421 linhas PW).
- O teste do Worker executa o bundle compilado em runtime isolado e reabre o XLSX produzido para conferir células, filtros e colunas.
- Um uso anterior de `Array.at(-1)` no controle de foco de Alocação foi substituído por indexação equivalente, compatível com a lib ES2020 do projeto, para permitir o typecheck normal sem alterar sua configuração.

Não foi executada a suíte global `npm test`. Homologação visual em navegador, com as bases corporativas e no Microsoft Excel, permanece pendente. Não há medição nova de latência ou memória de produção nem comprovação de eliminação de toda lentidão. Persistem custos de clonagem do modelo e o limite de tamanho da base ativa do IndexedDB.

O fluxo existente do Cloudflare é acionado pela integração em main; nenhum workflow manual do GitHub é necessário para esta alteração.

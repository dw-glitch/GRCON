# Desempenho — bases grandes e interface responsiva

A abertura do SIGEM × PW repetia a identificação de cada documento, a ordenação e a gravação de bases já confirmadas. A Consulta Geral compartilhada carregava páginas em sequência. As exportações de Consultas, Conferência, Cofre e Dashboard construíam a planilha na thread da interface.

## Alterações

- Uma identificação por registro na normalização, preservando as regras ET, N-1710, LD e revisão.
- Instâncias reutilizadas de Intl.Collator, com a mesma ordem portuguesa/natural. Agregação sem filtros reutiliza sua classificação; o agrupamento documental só ocorre se o PW realmente precisar da conciliação sem revisão.
- Migração local reaproveita PW já saneado para a mesma versão de regra e LD. Mudança da LD ainda exige saneamento.
- Refresh não regrava a Consulta Geral e seu histórico se a projeção já está atualizada. Filtros reutilizam o resultado entre páginas; o texto pesquisável é normalizado uma vez por linha, com WeakMap.
- Detecção de cabeçalho no modo compatível lê somente as primeiras 40 linhas.
- Consulta Geral ativa/histórica baixa no máximo quatro páginas simultâneas. Cada página exige numeração contígua e contagem exata; troca de contrato invalida o resultado antes de ativar ou armazenar a base. Snapshots publicados são imutáveis e têm linhas 1..record_count.
- Excel em Web Worker para SIGEM × PW, Consultas, Cofre e Conferência. Reutiliza os construtores existentes e transfere o ArrayBuffer de saída. Existe fallback compatível para falha/indisponibilidade de Worker.
- Progresso do Cofre é limitado a uma atualização por 100 ms; transições de estado continuam imediatas. Corrigida a referência indefinida ao identificador do arquivo na fila de upload. Saúde, catálogo e métricas são consultados em paralelo ao abrir o Cofre.
- Cache PWA renovado.

## Medições locais

`node tests/sigem_pw_performance_stability.cjs`, mesma máquina e dados sintéticos, antes/depois:

| Cenário | Antes | Depois (execução final) |
| --- | ---: | ---: |
| Modelo: 50 mil SIGEM + 50 mil PW | 3021,8 ms | 1236,9 ms |
| Agregação desses registros | 966,5 ms | 181,5 ms |
| Modelo: 50 mil SIGEM + 50 mil PW + 25 mil LD | 2310,2 ms | 1056,7 ms |
| Agregação combinada | 766,1 ms | 207,9 ms |

Chromium, Excel simples de 20 mil linhas: a compactação anterior bloqueou a interface por 146,3 ms. A geração em Worker levou 371 ms incluindo inicialização, com 23 atualizações do timer de interface e maior intervalo de 16,2 ms. O objetivo desta alteração é eliminar o bloqueio; o primeiro Worker pode custar mais tempo total. Foram conferidos a quantidade de linhas, primeiros/últimos registros e as abas Relação/Metadados, além dos binários de Consulta, Cofre e Conferência.

Leitura paralela: regressão com 20.001 linhas, respostas fora de ordem, pico de quatro requisições e exatamente 21 páginas. A base permanece íntegra; páginas corrompidas ou mudança de contrato são rejeitadas. Latência de RPC simulada: não representa tempo real do Supabase.

## Verificação

- `npm run verify`: TypeScript, builds React, referências, sintaxe e regressões automatizadas.
- Pacote Cloudflare: 222 arquivos com referências locais válidas.
- Chromium: exportações em Worker e responsividade; papéis owner/admin/operator/viewer e base de 20 mil registros; datas e seleção histórica; Consultas; fila de upload; Cofre → análise → GRDT → Histórico; recuperação automática local/Cofre.
- CI inclui a nova regressão de leitura paralela e o teste Chromium de exportação responsiva. O pipeline de publicação verifica o commit servido.

## Cloudflare e limites

As alterações são publicadas pelo Worker/Static Assets existentes. Não exigem novos serviços, bindings, secrets ou painel Cloudflare. A medição mostrou gargalos no código executado pelo navegador e no encadeamento das leituras, portanto os cálculos e as planilhas passam por Web Workers locais e a leitura de páginas mantém a autorização atual do Supabase. Transferir arquivos locais e bases completas para um serviço remoto acrescentaria upload e latência sem ganho demonstrado neste diagnóstico.

Não foi utilizado login humano em produção, nem foram alterados documentos reais para teste. Não há promessa de eliminar todas as lentidões: rede corporativa, tamanhos reais de PDFs/planilhas, memória do computador e tempo do banco ainda influenciam os fluxos. As métricas locais não são uma garantia de latência em produção. A precisão, os filtros, os escopos, as regras de emissão e as permissões permanecem cobertos por regressões.

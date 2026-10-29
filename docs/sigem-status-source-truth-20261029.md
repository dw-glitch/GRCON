# Fidelidade do Status da Consulta Geral — 29/10/2026

## Problema e comportamento corrigido

Uma importação feita na Conferência era salva como base local, mas `current()` e a resolução de status continuavam priorizando a publicação compartilhada anterior. Conflitos nessa publicação também podiam recorrer silenciosamente à LD ou à base local antiga. A interface ainda agrupava arquivos retirados da seleção automática como “Em análise”, inclusive quando a revisão estava Recusada.

A importação explícita passa a ser a fonte usada neste navegador tanto pela Conferência quanto pela análise de arquivos. A seleção fica vinculada ao identificador da publicação compartilhada observada na importação e sobrevive à recarga. Uma publicação compartilhada diferente volta a ser a fonte corrente. A tela identifica a fonte utilizada; publicar continua sendo uma ação separada do proprietário para atualizar a equipe.

Uma Consulta Geral carregada é um retrato completo: ausência de documento/revisão significa Não Postado nessa fonte, sem recuperar um status de outra base. Sem Consulta Geral, o caminho legado continua disponível. Conflitos e valores vazios exigem conferência; não se convertem em Em Análise. Duplicatas da mesma combinação usam a data mais recente. Status diferentes empatados na mesma data não escolhem uma linha arbitrária.

O código completo exato tem precedência sobre variantes com/sem `nt-`. As variantes continuam ajudando quando só existe uma grafia; quando ambas existem, os status e revisões não são misturados. EAP, disciplina e identificador permanecem integrantes da identidade.

A presença de documento/revisão continua comprovando postagem, inclusive quando o resultado técnico é Recusado. A correção não transforma recusa em aprovação e não cria uma nova revisão de um arquivo físico automaticamente.

## Verificação com o arquivo original

Arquivo: `Consulta Geral - UHDTD U-32 MANHA (FTP) - 261029[100101].XLSX`.

- Cabeçalho na linha 5; campo oficial `Status`, separado de `Status Workflow` e de Situação do Documento.
- 26.435 registros e 26.435 combinações verificadas contra os valores da matriz original: nenhum status divergente, vazio ou conflitante no resultado da verificação.
- `3.6.9.1_EST_RIR_nt-NF-0007-PARAFUSOS`: revisão 0 Recusado, linha 13670.
- `3.6.9.1_EST_RIR_nt-NF-136122-PARAFUSOS`: revisão 0 Recusado, linha 13671.
- `3.6.9.1_EST_RIR_nt-NF-141446-PARAFUSOS`: revisão 0 Recusado, linha 13672.
- `6.10.4.1_CVL_RIR_nt-EMT-NF-3857-ABRASIVO`: revisões 0, A e B Recusado, linhas 15245–15247.
- `6.10.4.1_CVL_RIR_nt-EMT-NF-50006-TINTA`: revisão 0 Recusado, linha 15250.

O arquivo também contém `3.1.1.1_CVL_RIR_B-32001A` e `3.1.1.1_CVL_RIR_nt-B-32001A` com resultados diferentes. O teste protege a precedência exata de cada código, além dos cinco códigos relatados.

Reprodução somente leitura:

```sh
node scripts/verify-sigem-source-status.cjs '/caminho/Consulta Geral original.xlsx'
node tests/sigem_status_source_truth.cjs
```

Os testes cobrem importação, persistência, recarga, atualização da mesma publicação, substituição por nova publicação, contexto serializado para Worker, triagem, conferência, conflitos, status vazios, código exato e agrupamento visual. O arquivo corporativo completo não é incluído no repositório.

## Uso após a publicação

Reabrir o GRCON, importar a Consulta Geral original na Conferência e executar uma nova análise. Para disponibilizar a mesma base à equipe, usar “Publicar Consulta Geral compartilhada”. Resultados antigos não são provas de status atual; o identificador local exclusivo invalida análises associadas à fonte anterior. Nenhuma base corporativa é substituída pela execução dos testes.

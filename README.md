# GRCON

Aplicativo web estático para triagem documental de LD, conferência de alocação, geração de eGRDT e histórico compartilhado no Supabase.

## Regra com/sem `nt-`

A versão 5.32.6 pesquisa documentos **ET** nas duas formas:

1. o código informado, sem `nt-` no início do 7º grupo;
2. a mesma identidade, com `nt-` minúsculo no início do 7º grupo.

A relação, as mensagens de auditoria e as colunas de pesquisa preservam o prefixo como `nt-` minúsculo. A chave interna de comparação é normalizada apenas para permitir uma busca segura, sem alterar a grafia apresentada ao operador.

Se a LD possuir somente a forma alternativa, o GRCON adota o código exatamente como está na LD, renomeia o PDF para essa forma e registra claramente `DE → PARA` no relatório. A condição de alocação da linha encontrada continua determinando se o documento pode entrar na eGRDT.

Documentos **N-1710 não participam dessa regra**. Eles são pesquisados somente pelo código informado.

## Busca tolerante do TAG ET

Com base na ET-5290.00-22000-912-1LV-001, o GRCON preserva os seis primeiros grupos do código ET e amplia somente a comparação do Grupo 7 (TAG). Se a busca exata e a busca com/sem `nt-` não encontrarem o documento, o índice também verifica diferenças de separadores e uma única confusão comum de digitação entre letra e número (`O/0`, `I/1`, `L/1`, `S/5`, `Z/2` ou `B/8`).

A aproximação só é aceita quando identifica uma única linha na LD. Se duas linhas forem possíveis, o GRCON pede conferência em vez de adivinhar. Essas tentativas são internas: não criam colunas extras no relatório, e o arquivo final continua adotando exatamente o código controlado na LD.

## Relatório

O Excel gerado concentra decisão e rastreabilidade sem duplicar a relação:

- `Resumo`: primeira aba do arquivo, com painel gerencial, decisão operacional e todas as evidências técnicas — buscas, código encontrado, alocação, renomeação, revisão, postagem, origem e linha da LD, Databook, histórico, arquivo final e ação necessária;
- `Triagem`: resultado operacional completo;
- `Linha do tempo`: histórico de revisões, quando disponível.

Na relação do `Resumo`, as colunas de decisão aparecem primeiro e as evidências complementares continuam à direita. O cabeçalho possui filtros e as duas primeiras colunas permanecem visíveis durante a rolagem horizontal.

O processamento não impõe limite à quantidade da relação. A suíte pública valida 15.000 códigos ET nos dois sentidos da busca, sem incluir dados ou metadados de planilhas operacionais no repositório.

## Exclusão do histórico e reutilização da numeração

Ao excluir uma eGRDT do histórico compartilhado, o GRCON aguarda a confirmação do Supabase, marca o registro como excluído para sincronizar os demais navegadores e remove a reserva consumida na mesma transação. Aquele número deixa de bloquear uma nova geração e pode ser informado novamente.

A exclusão compartilhada exige conexão e perfil de proprietário ou administrador. A limpeza completa do histórico segue a mesma regra e libera todas as numerações que já estavam vinculadas a registros concluídos; reservas de gerações ainda em andamento são preservadas.

## Desenvolvimento e validação

Requer Node.js 22 ou superior apenas para os testes; a aplicação publicada continua estática.

```bash
npm ci --ignore-scripts
npm run verify
```

`npm run verify` confere sintaxe, workers, referências, versão, hashes das bibliotecas vendorizadas, regras estáticas do Supabase e testes funcionais.

Os Web Workers ficam em `workers/` e carregam os módulos oficiais diretamente. Não existem mais cópias embutidas de `core.js` ou `report_summary.js`.

## Publicação

A branch publicada pela Vercel é `main`. O Service Worker tenta a rede primeiro para código e muda de cache a cada versão, evitando que correções fiquem presas em cache antigo.

As orientações operacionais e a ordem das migrações estão em `LEIA-ME_PUBLICACAO.txt`. Para atualizar uma base existente, aplique `SUPABASE_MIGRACAO_5.32.0.sql` e depois `SUPABASE_MIGRACAO_5.32.2.sql`.

## Segurança

- o cliente contém apenas a chave `sb_publishable_`, que é pública por definição;
- autorização e isolamento continuam no banco por privilégios, funções e RLS;
- o Vercel envia CSP, HSTS, COOP, CORP e políticas de navegador;
- scripts inline foram removidos do HTML;
- hashes das bibliotecas distribuídas são verificados em CI.

Consulte `SUPABASE_AUDITORIA.md` e `THIRD_PARTY_NOTICES.md`.

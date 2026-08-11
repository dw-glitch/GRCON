# GRCON

Aplicativo web estático para triagem documental de LD, conferência de alocação, geração de eGRDT e histórico compartilhado no Supabase.

## Regra com/sem `NT-`

A versão 5.32.0 pesquisa documentos **ET** nas duas formas:

1. o código informado, sem `NT-` no início do 7º grupo;
2. a mesma identidade, com `NT-` no início do 7º grupo.

Se a LD possuir somente a forma alternativa, o GRCON adota o código exatamente como está na LD, renomeia o PDF para essa forma e registra claramente `DE → PARA` no relatório. A condição de alocação da linha encontrada continua determinando se o documento pode entrar na eGRDT.

Documentos **N-1710 não participam dessa regra**. Eles são pesquisados somente pelo código informado.

## Relatório

O Excel gerado separa decisão e rastreabilidade:

- `Resumo`: leitura didática com as duas pesquisas, código encontrado, alocação, renomeação, arquivo final, inclusão na eGRDT e ação necessária;
- `Auditoria detalhada`: todas as colunas técnicas, evidências, revisão, postagem e origem na LD;
- `Triagem`: resultado operacional completo;
- `Linha do tempo`: histórico de revisões, quando disponível.

O processamento não impõe limite à quantidade da relação. A suíte pública valida 15.000 códigos ET nos dois sentidos da busca, sem incluir dados ou metadados de planilhas operacionais no repositório.

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

As orientações operacionais e a ordem das migrações estão em `LEIA-ME_PUBLICACAO.txt`. A migração `SUPABASE_MIGRACAO_5.32.0.sql` precisa ser aplicada manualmente ao projeto Supabase antes de considerar o banco atualizado para esta versão.

## Segurança

- o cliente contém apenas a chave `sb_publishable_`, que é pública por definição;
- autorização e isolamento continuam no banco por privilégios, funções e RLS;
- o Vercel envia CSP, HSTS, COOP, CORP e políticas de navegador;
- scripts inline foram removidos do HTML;
- hashes das bibliotecas distribuídas são verificados em CI.

Consulte `SUPABASE_AUDITORIA.md` e `THIRD_PARTY_NOTICES.md`.

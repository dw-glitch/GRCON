# GRCON

Aplicativo web estático para triagem documental de LD, conferência de alocação, geração de eGRDT e histórico compartilhado no Supabase.

## Regra com/sem `nt-`

A versão 5.32.8 pesquisa documentos **ET** nas duas formas:

1. o código informado, sem `nt-` no início do 7º grupo;
2. a mesma identidade, com `nt-` minúsculo no início do 7º grupo.

A relação, as mensagens de auditoria e as colunas de pesquisa preservam o prefixo como `nt-` minúsculo. A chave interna de comparação é normalizada apenas para permitir uma busca segura, sem alterar a grafia apresentada ao operador.

Se a LD possuir somente a forma alternativa, o GRCON adota o código exatamente como está na LD, renomeia o PDF para essa forma e registra claramente `DE → PARA` no relatório. A condição de alocação da linha encontrada continua determinando se o documento pode entrar na eGRDT.

Documentos **N-1710 não participam dessa regra**. Eles são pesquisados somente pelo código informado.

## Busca pelo TAG dos documentos ET

Conforme a ET-5290.00-22000-912-1LV-001 Rev. P, o Grupo 7 identifica o TAG e o código final deve seguir a grafia controlada existente. O GRCON pesquisa na seguinte ordem:

1. código completo exatamente como informado;
2. código completo nas formas com e sem `nt-`;
3. TAG dentro do mesmo código, tolerando diferenças de separadores e uma única confusão comum de digitação entre letra e número (`O/0`, `I/1`, `L/1`, `S/5`, `Z/2` ou `B/8`);
4. TAG normalizado em toda a LD, mesmo quando algum dos seis grupos anteriores foi informado de outra forma.

A quarta busca só associa automaticamente quando o TAG identifica um único documento ET. Se o mesmo TAG aparecer em dois ou mais códigos, o GRCON pede conferência. Quando encontra uma única linha, adota exatamente o código da LD, renomeia o arquivo e registra `DE → PARA` no relatório.

Documentos N-1710 não participam da busca por TAG dos relatórios ET.

## Relatório

O Excel gerado concentra decisão e rastreabilidade sem duplicar a relação:

- `Resumo`: primeira aba do arquivo, com painel gerencial, decisão operacional e todas as evidências técnicas — buscas, código encontrado, alocação, renomeação, revisão, postagem, origem e linha da LD, Databook, histórico, arquivo final e ação necessária;
- `Triagem`: resultado operacional completo;
- `Linha do tempo`: histórico de revisões, quando disponível.

Na relação do `Resumo`, as colunas de decisão aparecem primeiro e as evidências complementares continuam à direita. O cabeçalho possui filtros e as duas primeiras colunas permanecem visíveis durante a rolagem horizontal.

O relatório não cria fórmulas ou conexões com planilhas externas. `STATUS INTERNO` usa o comentário da fiscal já registrado na LD e, quando ele não existe, a situação apurada pelo GRCON. Assim o arquivo abre sem reparo e sem aviso de fonte externa não confiável.

O processamento não impõe limite à quantidade da relação. A suíte pública valida 15.000 códigos ET nos dois sentidos da busca e mais 15.000 códigos localizados somente pelo TAG, sem incluir dados ou metadados de planilhas operacionais no repositório.

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

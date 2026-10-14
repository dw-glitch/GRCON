# Correção das bases anteriores na Evolução SIGEM × PW

Versão: **5.44.11**. Repositório: `dw-glitch/GRCON`.

## Causas confirmadas

- A Evolução consultava somente `GrconSigemPwHistory.listSourceSnapshots` e o conteúdo `sourcePayload:*` no IndexedDB do histórico evolutivo. Não consultava os snapshots completos do histórico do Dashboard nem todas as versões compartilhadas da Consulta Geral. Assim, bases preservadas em outra fonte não apareciam.
- Sem LD da Qualidade validada, `loadSnapshots` esvaziava as duas listas antes de consultar os históricos. Uma dependência do cálculo era apresentada como ausência de bases.
- Snapshots sem conteúdo recuperável eram descartados da lista, sem identificação individual do motivo.
- A Evolução não escutava os eventos de publicação/invalidação dos metadados da Consulta Geral compartilhada.
- “Gerenciar histórico” apontava para `GrconSigemPwHistoryRuntimeFix`, uma interface legada que o carregamento atual do Dashboard não inicializa.

## Correção

O catálogo reúne o histórico completo do Dashboard, o histórico evolutivo local e as versões compartilhadas autorizadas do SIGEM. Conserva os IDs reais das importações. A relação `historySourceSnapshotId` e os IDs de origem eliminam projeções duplicadas da mesma importação, sem eliminar versões independentes de datas diferentes. Uma versão compartilhada excluída não reaparece por causa de uma projeção local sobrevivente.

As bases permanecem identificáveis sem a LD, com indicação de que a LD é necessária para comparar. Conteúdo indisponível também permanece identificado, com a opção desabilitada e falha de consulta explícita; nenhuma dessas situações gera contagens zero fictícias. O comando **Atualizar bases** permite repetir a consulta.

O cálculo mantém o motor atual, a validação da LD, os Workers, revisão 0/todas as revisões, filtros, paginação e exportações. A seleção manual é preservada ao atualizar. A data operacional da versão compartilhada rege sua posição cronológica. O botão de histórico abre o diálogo React do Dashboard, com fallback para abas que ainda possuam a fachada anterior.

Leituras independentes de metadados são paralelas. Snapshots preparados são reutilizados antes de buscar conteúdo remoto; no máximo duas versões remotas são lidas simultaneamente. A leitura paginada utiliza a API compartilhada existente, com uma única listagem de versões por atualização. Não existem consultas por documento. Respostas e gravações de cache de contextos antigos são descartadas; o cache derivado considera conta e contrato.

## Arquivos principais

- `src/react/sigem-pw/evolution/services/evolutionSourceCatalog.ts`
- `src/react/sigem-pw/evolution/services/sigemPwEvolutionAdapter.ts`
- `src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx`
- `src/react/sigem-pw/evolution/types/domain.ts`
- `src/react/sigem-pw/index.tsx` e `types/legacy-globals.d.ts`
- `tests/sigem_pw_evolution_sources.cjs`
- `scripts/validar-evolution-sources-browser.cjs`
- `scripts/validar-sigem-pw-react-browser.cjs` e workflow de regressão React
- Arquivos de versão, lockfile e Service Worker.

## Verificação

- `npm run verify`: compilação TypeScript, seis bundles React, sintaxe, referências, versões, dependências, integração Supabase e suíte global.
- Teste de fontes: históricos completos/local/compartilhado, LD ausente, duplicidade, exclusão compartilhada, data operacional, cache, falha e retry, seleção e resposta tardia após troca de contrato.
- Navegador específico: IndexedDB e Workers reais, três bases SIGEM e duas PW iniciais, seleção de anteriores, comparação real, falta de LD, falha de uma quarta base SIGEM e recuperação. Backend compartilhado controlado; nenhuma alteração de dados corporativos.
- Regressão completa do Dashboard/Evolução: importações, seleções, filtros, exportações, diálogo real de histórico e cenários de 20 mil registros.
- Pacote Cloudflare: verificação de referências e integridade do runtime.

As execuções CI e a confirmação do commit servido em produção ficam registradas na PR e no workflow Cloudflare correspondente. Uma preparação ou compilação local não é prova de publicação.

## Limites preservados

O histórico do PW continua na persistência local já utilizada pelo aplicativo. Esta correção não cria sincronização de históricos PW entre computadores. Metadados antigos cujo conteúdo não foi preservado não são reconstruídos artificialmente: a interface mostra a indisponibilidade. Nenhuma base, histórico, permissão ou política RLS é apagada ou alterada por esta correção.

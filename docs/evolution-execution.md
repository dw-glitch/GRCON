# Evolução do GRCON — execução progressiva

## Referência e sequência

Base inicial: `b1e96b68727d5b28b9b27be2f5143e6c86e9cc02`.
Plano autorizado em 20/10/2026: preparação, desempenho/conferência, PW compartilhado,
Registro Mestre, pendências, bases/recuperação/relatórios, ferramentas/integrações e assistência com fontes.

Cada entrega mantém os modelos oficiais, revisão física, julgamento pelo último
envio, isolamento por contrato e capacidades exclusivas do proprietário master.
Novos serviços externos dependem de benefício demonstrado e acessos disponíveis.

## Fases 0 e 1

- Teste integrado acompanha o acesso centralizado de Administração; não recria o atalho removido.
- `npm run benchmark:conference` mede cálculo completo, repetição e edição de um
  documento sobre dados sintéticos. Grava contagens de cálculos reaproveitados e
  duração em `artifacts/evolution/conference-benchmark.json`.
- O cálculo completo permanece disponível como referência. A conferência
  persistida utiliza um reconciliador por sessão, com assinatura exata da base,
  histórico, contexto e parâmetros. Detecta alterações no mesmo objeto de entrada.
- O índice SIGEM e a normalização das emissões são reaproveitados. Somente a
  avaliação dos eventos inalterados é reutilizada; os totais e o último envio
  são sempre derivados do histórico completo atual.
- A mudança de base/contexto invalida evidências; a passagem da janela de
  confirmação também invalida os eventos afetados. Dados retornados não
  compartilham arrays mutáveis com o cache.
- Gravações de reconciliação são serializadas. A interface agrupa eventos
  próximos, descarta resultados ultrapassados e preserva a rolagem.
- Recálculo continua silencioso e Relatório Excel continua baixando diretamente.

## Validação e recuperação

1. Executar regressões específicas e comparação integral com o motor de referência.
2. Executar `npm run verify`, `npm run build:cloudflare` e `npm run verify:cloudflare`.
3. Conferir os testes Chromium da PR, inclusive contexto, Administração e navegação.
4. Publicar pelo workflow existente e verificar o commit servido em produção.
5. Em caso de regressão, reverter a entrega pelo GitHub e executar novamente o
   workflow de produção. Reversão de código não restaura dados do banco ou R2.

Estas fases não modificam o schema nem apagam dados. O cache é derivado e
descartável. Medições locais não equivalem a tempos reais na rede corporativa;
o reaproveitamento deve ser avaliado junto do tempo total e do uso de memória.

## Próximas entregas

2. Snapshots PW compartilhados, publicação atômica e seleção pelos módulos consumidores.
3. Registro Mestre com fontes, paginação e ações existentes.
4. Fila de pendências vigentes, prioridade e visualizações salvas.
5. Prévia de importação, continuidade operacional e relatórios configuráveis.
6. Diagnóstico integrado e provas de conceito condicionadas a benefício e acesso.
7. Consulta e explicação com fontes, sem alterar revisão ou confirmar postagem por inferência.

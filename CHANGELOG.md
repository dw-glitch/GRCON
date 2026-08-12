# Histórico de alterações

## 5.32.3 — 2026-08-12

- renomeia o status "Sem correspondência na LD" para "Não consta na LD"
- inclui a coluna ALOCAÇÃO no Resumo Executivo do relatório

## 5.32.2 — 2026-08-11

- Corrigida a exclusão individual do histórico compartilhado: a reserva consumida agora é removida na mesma transação e o número eGRDT pode ser usado novamente.
- Registros excluídos deixam de participar da validação de duplicidade e do cálculo do próximo número, embora o marcador de exclusão continue disponível para sincronizar os navegadores.
- A limpeza completa do histórico também libera as numerações consumidas, preservando somente reservas que ainda estejam em uma geração em andamento.
- A migração corrige automaticamente reservas antigas ligadas a registros já excluídos.
- O GRCON só remove a cópia local depois que o Supabase confirma a exclusão e a liberação da numeração.
- A busca ET passa a tolerar, somente no Grupo 7 (TAG), diferenças de separadores e uma única troca comum entre letra e número (`O/0`, `I/1`, `L/1`, `S/5`, `Z/2` ou `B/8`). A associação só é automática quando existe uma única linha possível na LD.
- Os seis primeiros grupos continuam exatos, N-1710 não participa dessa aproximação e o relatório não ganha novas colunas para essas tentativas internas.

## 5.32.1 — 2026-08-11

- Corrigida a apresentação do prefixo documental para `nt-` minúsculo na relação, no resumo, na auditoria e nas mensagens da busca.
- A pesquisa ET continua cobrindo as formas com e sem `nt-`, nos dois sentidos, sem alterar a regra exclusiva da N-1710.
- Adicionado teste explícito para impedir que a forma `NT-` maiúscula volte a aparecer na evidência da pesquisa.

## 5.32.0 — 2026-08-11

- Pesquisa ET com e sem `nt-`, nos dois sentidos, preservando a exclusão da família N-1710.
- Código e nome final passam a seguir exatamente a forma encontrada na LD.
- Aba `Resumo` didática com pesquisa, alocação, renomeação `DE → PARA`, inclusão na eGRDT e ação necessária.
- Nova aba `Auditoria detalhada` com todas as evidências técnicas.
- Formatação idêntica para relações pequenas e grandes.
- Workers externos substituem o pacote de 3,3 MB com cópias embutidas e eliminam divergência entre tela e exportação.
- Validação automática de 15.000 códigos nos dois sentidos da busca, sem dados operacionais no repositório.
- CI unificada em `npm run verify`, controle de hashes das bibliotecas e Dependabot para Actions.
- CSP reforçada, scripts inline removidos e cabeçalhos de segurança adicionados ao Vercel.
- Migração Supabase idempotente para explicitar privilégios mínimos nas tabelas privadas.

## 5.31.17

- Base recebida para esta atualização, já contendo o primeiro conjunto de correções da busca `nt-`.

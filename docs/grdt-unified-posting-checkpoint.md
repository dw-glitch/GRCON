# Migração GRDT integrada — checkpoint 06/10/2026

## Ponto recuperado

O chat anterior estava na auditoria inicial. Não havia PR nova nem implementação das fases B–L na main. Base desta entrega: `986a57e` (PR #184), versão 5.44.9. Branch: `feat/grdt-unified-posting-phases`.

## Arquitetura encontrada (fase A)

- `app.js`: seleção/revisão manual, prévia e três saídas de GRDT; todas utilizam `GrconEmission.createPlan` e `splitPlan`.
- `emission.js`: identidade física, campos, consistência, disciplina e limite configurável.
- `history_core.js`: ocorrências por eGRDT e arquivos, `payload` compartilhado; cópia local limitada a 1.000 registros/4,5 MB.
- `grcon_cloud_app.js`: autenticação e workspace, sincronização/paginação do Histórico, reserva de sequências; dados novos do Histórico cabem no payload existente.
- `grdt_reissue_core/app.js`: busca da última GRDT, recuperação de campos, edição/validação, prévia, geração e registro. Deve permanecer até a paridade de Cofre → GRDT e retirada da interface na fase J.
- `grcon_reposting_core/search/storage/report/app.js`: localização de arquivos em pastas/referências locais, conflitos e relatório. A correspondência física é distinta da classificação de emissão. Pode apoiar identificação e retomada, mas não deve decidir FIRST_POSTING/NEW_REVISION/REPOST.
- `cloudflare/worker.mjs`: entrega assets e API de aviso Teams. Não contém Document API, assinatura R2, catálogo de arquivos ou binding R2.
- `wrangler.jsonc`: Worker `grcon-cloudflare`, apenas binding ASSETS; deploy main automático por GitHub Actions. Nenhum segredo deve ser colocado na configuração versionada.

## Implementado nesta branch (B–E)

- `history_classification.js`: motor único para primeira postagem/nova revisão/repostagem; documento normalizado com equivalência `nt-`, revisão normalizada com regras centrais do GRCON.
- Uma emissão é uma ocorrência de documento+revisão na GRDT; múltiplas extensões naquela GRDT não duplicam contagem. Ordenação temporal determinística; vínculo com última ocorrência na mesma revisão e primeira emissão.
- Revisão regressiva é aviso. O motor não exclui documentos, não muda seleção nem cria bloqueios.
- Sem consulta completa, não inferir primeira postagem ou revisão inédita pela ausência no cache. Mostrar `UNCONFIRMED`; uma coincidência real de revisão ainda permite confirmar REPOST. Históricos antigos sem revisão permanecem explicitamente inconclusivos.
- `loadClassificationHistory`: lê o Histórico compartilhado em páginas de até 500 com ordem estável, avançando pelo tamanho efetivamente retornado até uma página vazia, fora do limite da cópia local, adicionando registros locais pendentes do mesmo workspace. Uma consulta para o lote, nunca uma por documento. Sessão/workspace precisam permanecer iguais durante a consulta.
- `posting_flow.js`: índice/memo por workspace; invalidação por alterações históricas; atualiza antes da confirmação e geração. Falhas conservam aviso; não reutilizar a ausência de um retrato incompleto como evidência.
- Fluxo normal mostra resumo por documento+revisão, detalhes expansíveis, filtros Postagens/Repostagens/A confirmar e preferência de organização dos lotes.
- `posting_batch_planner.js`: separação postagem/repostagem → disciplina → limite. Mantém a ordem dentro dos conjuntos; aplica o mesmo planejamento à prévia e às três saídas normais. Quando a separação estiver ativa, registros a confirmar têm conjunto próprio.
- Histórico salva snapshot compacto da classificação no arquivo da ocorrência. Interface React mostra a classificação, referências e avisos. Legado sem snapshot continua sem reclassificação retroativa.
- Novas colunas de exportação são acrescentadas ao final: não deslocar posições existentes, inclusive a coluna W utilizada nas planilhas de controle.
- SW inclui os novos arquivos e um sufixo novo de cache; número de release será fechado na publicação final.

## Extensão solicitada: alocação no Cofre e base de Solicitações

Publicação compartilhada da Central implementada com prévia, páginas completas e ativação atômica; consulta dos vínculos/status/workflow no Fazer GRDT e snapshot no Histórico. Parser validado com uma versão da planilha real (3.546 vínculos), sem publicar dados reais no repositório. `document_allocation_context.js` mantém Documentos Previstos como autoridade de Alocado/Não alocado e oferece filtros para o Cofre. Migration criada pela CLI e validada em Postgres local; ainda não aplicada ao banco GRCON. A interface do Cofre continua pendente. Operação e ativação: `docs/grdt-shared-allocation-setup.md`.

## Ainda pendente

| Fase | Situação |
|---|---|
| A | Auditoria concluída |
| B–E | Implementadas na branch; verificação e QA registrados na PR |
| F | Bloqueada na verificação do projeto Supabase GRCON e configuração R2; não aplicada |
| G–I | Cofre, fila/hash/deduplicação/multipart/retomada e integração ainda não implementados |
| J | Interface antiga preservada até paridade funcional; não removida prematuramente |
| K | Testes de classificação/lotes e QA desta etapa; QA de armazenamento depende de F–I |
| L | Não publicada; não mesclar antes de completar e validar as fases dependentes |

## Impedimento concreto de F

A integração Supabase desta conversa lista apenas `CCP CONSAG` (`aimvjsbrxnyqjurgicec`). A consulta de metadados de `kvyrttccwzdhasplfxnr` (banco utilizado pelo GRCON) foi recusada por falta de permissão. Não aplicar tabelas do GRCON em outro projeto nem executar migrations em produção sem conferir o schema real.

Próximo ponto: autorizar o projeto GRCON na conexão Supabase; confirmar tabelas/roles/RLS e desenhar metadados/índices/idempotência. Depois implementar Document API privada, verificação de identidade e autorização por workspace, R2 privado e os endpoints de upload/download. O bucket solicitado é `grcon-documents`. Não há acesso autenticado à administração Cloudflare disponível nesta conversa para cadastrar bindings/secrets.

Ver `docs/grdt-r2-setup.md` para preparo pelo painel web. Esse preparo não liga o Cofre sozinho: a fase F ainda precisa implementar e validar a API e o catálogo.

## Validação

Nesta entrega passaram typecheck, build React, verificações de sintaxe/referências/versões/dependências/Supabase/pacote, a suíte completa `npm test` e o cenário novo em Chromium. Evidência local do navegador: 60 documentos, 20 de cada classificação; modo misto 48+12, separado 40+20; zero erros de página. Os testes de desempenho da suíte foram executados sem o navegador em paralelo.

- `tests/history_classification.cjs`: primeira postagem, revisão inédita, repostagem repetida, regressão consultiva, normalização, formatos múltiplos, identidade/workspace, histórico incompleto/sem revisão, persistência/legado, loteamento em ambos os modos e limites 48/49/96/97/110/1.000/3.000, limite alternativo.
- `tests/cloud_history_pagination.cjs`: limite de servidor menor que o solicitado, leitura até página vazia e rejeição da consulta se uma página falhar.
- Medição local do motor: índice de 5.000 registros e classificação de 3.000 entradas em aproximadamente 30–35 ms. Não mede a rede nem a análise integral de LD/arquivos.
- `scripts/validar-unified-posting-browser.cjs`: arquivos locais → análise → 20 primeiras/20 novas revisões/20 repostagens → filtros → prévia mista/separada → geração BIFF8 real/reabertura → snapshot Histórico → offline → persistência da preferência; 1440/1366/1024 e tema escuro.
- Workflow Chromium existente de Repostagem executa também o novo cenário. QA de R2 real, integridade SHA-256 após upload, sessão recuperável e carga 13,7 GB ficam em F–K, não são declarados concluídos.

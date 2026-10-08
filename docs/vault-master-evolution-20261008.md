# Cofre versionado, rastreabilidade de GRDT e Registro Mestre

O Cofre preserva versões anteriores e o Histórico identifica o arquivo efetivamente utilizado na emissão. O Registro Mestre consulta as fontes existentes; Dashboard e Evolução compartilham a seleção Revisão 0 / Todas as revisões.

## Arquitetura e comportamento

- Frontend → Worker autenticado → Supabase para metadados, autorização e auditoria; R2 privado para conteúdo. Auth e banco permanecem no Supabase.
- Cada arquivo tem versão, anterior, situação ativa/histórica, hash SHA-256, MIME e contexto de origem. A reserva de uma nova versão não desativa a anterior antes da verificação do conteúdo.
- SHA-256 é conferido pelo R2 no envio simples e por leitura em streaming no multipart. Conteúdo idêntico pode reutilizar o objeto físico; uma nova versão não sobrescreve conteúdo anterior.
- Restauração de um objeto ausente/corrompido preserva seu identificador e hash, mediante reenvio do conteúdo correto.
- A GRDT procura primeiro os arquivos locais e completa a seleção pelo Cofre. Somente arquivos realmente selecionados para emissão são persistidos; ausentes permanecem separados. Falha no Cofre informa o operador e conserva hash/proveniência local sem bloquear a emissão local.
- Vínculos imutáveis registram arquivo, versão, hash e GRDT/eGRDT. A exclusão de arquivo vinculado é recusada antes de apagar o R2.
- Download, visualização, metadados, restauração e uso em emissão são auditados. Permissões dependem da associação real ao contrato no banco.
- Métricas físicas usam inventário do R2, com referências do catálogo, órfãos, tipos, classes declaradas e escopo global do proprietário. Alocação do Cofre mantém a fonte Controle de Solicitações; a regra de Documentos Previstos continua nos módulos correspondentes.
- Registro Mestre reúne SIGEM ativo, PW local carregado, histórico, versões do Cofre, Solicitações, monitoramento do próprio usuário e auditoria. Pesquisa parcial com debounce; respostas antigas são descartadas ao mudar de contrato. Códigos ET com separadores distintos e TAG com/sem NT- são equivalentes para consulta.
- Histórico de bases compartilhado, seleção sem reupload, datas, repostagem informativa, monitoramento e notificações existentes permanecem cobertos pelas regressões. Dashboard e Evolução sincronizam o escopo; Evolução invalida dados ao mudar de contrato.

## Migrações aplicadas

- `20261008100836_vault_versions_traceability_master.sql`: versões, vínculos de emissões, proteção de exclusão, operações privadas e manutenção.
- `20261008101708_master_document_identity_aliases.sql`: identidade equivalente ET, índices de consulta e integração no Registro Mestre.
- Validação no banco real: 109 arquivos catalogados, 48 vínculos históricos, versões válidas e nenhuma execução direta das novas operações privilegiadas por `authenticated`.
- RLS de tabelas privadas sem policies é intencional: acesso somente pelas funções autorizadas. Advisor mantém um aviso anterior de proteção contra senhas vazadas desabilitada; configuração de Auth não foi alterada.

## Cloudflare

- Rotas privadas em `/api/document-vault/`: upload, multipart, download, versões/detail, metadata, master, search e métricas.
- Binding R2 existente `GRCON_DOCUMENTS`, bucket `grcon-documents`; nenhum novo segredo é necessário.
- Cron declarativo `17 5 * * *`: 05:17 UTC / 02:17 Recife. Registra diariamente métricas físicas por contrato, isola erros e não exclui objetos.
- Queues, Workflows e Durable Objects avaliados: não adicionados. Multipart e hash usam streaming; a rotina periódica atual não exige fila ou coordenação distribuída.
- Publicação pelo workflow existente `Deploy Cloudflare`, após merge em main. O pipeline verifica o commit exato publicado e o bloqueio de downloads anônimos.

## Validação realizada

- `npm run verify`: build TypeScript/React, referências estáticas, PWA/SW, Worker e suíte completa, incluindo grandes volumes.
- Banco PGlite + Worker: versões, pendência/ativação, deduplicação, arquivo histórico exato, vínculos idempotentes, exclusão negada antes do R2, hash adulterado, restauração, metadados, métricas, proprietário/global, Cron e isolamento entre contratos.
- Chromium: Registro Mestre, busca local+Cofre, histórico compartilhado de 20 mil registros e suíte ampla SIGEM/PW, Evolução, seleção histórica, exportações e console sem erros. APIs de negócio em fixtures; não equivale a login humano em produção.
- Build/pacote Cloudflare e Wrangler 4.34 dry-run com binding R2 e assets existentes.

## Limites verificáveis

- Arquivos de emissões antigas sem hash/identificador disponível não podem ser reconstruídos retroativamente. Versões com vínculo verificável são preservadas.
- PW no Registro Mestre corresponde à base carregada no contrato/dispositivo; fonte não carregada aparece como indisponível, sem afirmar ausência do documento.
- Registro Mestre limita cada fonte compartilhada a 100 registros e busca PW local a 50 resultados; detalhes identificam a limitação.
- Execução agendada real do novo Cron somente será observável após o primeiro horário programado. Sua lógica foi exercitada nos testes com inventário físico.
- Não é necessária ação manual no painel Cloudflare para esta alteração. Para validação operacional, abrir Cofre, enviar duas versões do mesmo documento/revisão, gerar GRDT e recuperar a versão anterior pelo Histórico/Registro Mestre; conferir armazenamento e escopo do proprietário.

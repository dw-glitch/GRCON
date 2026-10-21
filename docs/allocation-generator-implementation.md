# Gerador de Alocação nativo do GRCON

## Escopo

Reconstrução do módulo de alocação, sem integrar o aplicativo RECON, sem iframe e sem dependência de abrir o RECON. Interface React/TypeScript nativa em Ferramentas adicionais. Os motores necessários são preservados em `vendor/recon`; `provenance.json` identifica o commit de origem e os hashes de cada arquivo.

## Fases e arquitetura

| Fase | Implementação |
| --- | --- |
| A | Operador pode importar/publicar PW; data operacional continua owner/admin; exclusão continua Master. IA operacional mantém autenticação, contrato ativo e cotas existentes. |
| B | Motores RECON de identificação, alocação, lotes, hierarquia EAP, títulos, catálogos, preservação de LD, planilhas oficiais e busca de caminhos. Os controladores DOM `allocation_app.js` e `bases_app.js` foram estudados e reconstruídos na interface nativa. |
| C | Bases versionadas Databook, EAP, títulos, normas/regras, modelo oficial, LI, SCON, Apêndice e configuração contratual. Prévia, publicação atômica, conflito de versão e restauração. |
| D | Quatro áreas: gerar, bases, histórico e aprendizado; tabela virtual; revisão lateral; importações complementares recolhidas; pacote com prévia e downloads individuais. |
| E | IA escolhe exclusivamente entre caminhos existentes; fontes verificadas novamente no servidor; referências normativas limitadas às cadastradas; cotas compartilhadas com a IA documental. |
| F | Ação Sugerir alocação para documento sem linha na LD, conservando a revisão física e a triagem de GRDT. |
| G | Exportador oficial RECON para GERAL/16 colunas e Central, relatório revisável de títulos e pacote ZIP. Arquivos preservados no histórico com SHA-256. |
| H | Testes de banco, motores, API, paridade OOXML, Excel reaberto, ZIP, regressões GRDT/PW e Chromium no CI. |
| I | Pull Request, migrations Supabase e publicação Cloudflare condicionadas aos testes críticos. |

## Aprendizado supervisionado

Uma confirmação registra código, revisão, família, disciplina, EAP, título, proposta original, caminho confirmado, níveis, fontes, versões, origem, confiança, justificativa e responsável. Registros enviados diretamente pelo cliente nunca podem se declarar confiáveis. A API autentica o usuário, verifica o contrato, relê as fontes e aplica os validadores RECON antes de registrar validação de servidor.

Experiências são recuperadas apenas no mesmo contrato, família, disciplina e EAP, com exatamente as versões atuais das bases e caminho ainda válido. Mudanças de fontes tornam a experiência inelegível sem apagar o histórico. Correções de outra família não contaminam recomendações. Títulos de outro código não são copiados como se pertencessem ao documento atual. A confirmação humana continua obrigatória; nenhuma alteração de pesos do modelo é presumida.

O reconhecimento estrutural e as regras precedem a IA. Chamadas são explícitas, com até 6.000 bytes de mensagens e 384 tokens de saída, sem documentos completos, sem serviços pagos adicionais, sem retentativa automática de inferência. O resultado permanece em memória na análise atual e é invalidado quando as fontes mudam. As cotas existentes continuam globais: 32 tentativas por dia, incluindo teste técnico, 6 por usuário e intervalo de 10 segundos.

## Fontes e normas

O commit RECON de origem é `fadf2f33dbf32a6ab713770cecb69f333ec862bb`. As referências incorporadas citam ET-5290.00-22000-912-1LV-001 Rev. R, Tabela 13 e demais tabelas indicadas pelos validadores, N-1710 Rev. N e os recortes de anexos declarados pelo catálogo, e N-381. Estas identificações são referências do código de origem: não constituem comprovação independente de vigência contratual. O gestor deve conferir a revisão autorizada ao publicar a base do contrato. Regras de revisão diferente permanecem consultáveis, mas não herdam silenciosamente os validadores da revisão incorporada.

Databook Rev.C, hierarquia EAP UHDT-D, modelo oficial e catálogos do RECON podem ser conferidos na prévia e publicados no contrato apropriado. Não são aplicados a outros contratos automaticamente. A configuração define unidade e prefixo de numeração. Sem mapa ativo ou caminho existente, não há caminho inventado.

## Histórico e emissão

Numeração reservada sob bloqueio do contrato, considerando histórico gerado e Central compartilhada, com idempotência por requisição. Histórico complementar pode elevar o piso da sequência, nunca diminuí-lo. Uma mesma revisão exige justificativa para realocação. Os estados gerada/enviada/aceita/rejeitada/cancelada são separados. Download não é aceitação. O histórico preserva títulos, caminhos, níveis, referências, versões e os arquivos efetivamente gerados.

As listagens não transportam os binários de todos os arquivos: o pacote de uma alocação é recuperado somente ao solicitar download. A pesquisa do histórico consulta o servidor, com paginação.

## Migrations

- `pw_operator_publication`: restringe a ampliação ao envio/publicação do PW, separando o controle de data.
- `intelligent_allocation_workspace`: bases, linhas, decisões, gerações e auditoria em esquema privado, RLS e RPC com contrato ativo e permissões explícitas.

## Validação

- `tests/shared_pw_database.cjs` e `shared_pw_client.cjs`: operador publica; data e exclusão continuam protegidas; concorrência e integridade preservadas.
- `tests/allocation_generator_database.cjs`: isolamento, versões, restauração, invalidação por fontes, feedback não confiável, sequência, idempotência e situação real.
- `tests/allocation_generator.cjs`: hashes de origem, normas/EAP, documento ausente na LD, correções supervisionadas, outra família, mudança de base, três Excel reabertos, ZIP e paridade das partes OOXML do arquivo oficial e valores da Central com o motor original.
- `tests/allocation_api.cjs`: identidade verificada, contrato, validação normativa e de caminho, cota comum e revisão determinística sem IA.
- Suítes portadas `ALLOCATION_HIERARCHY_TESTS` e `PR_N1710_ALLOCATION_TESTS`: regressões do RECON.
- `scripts/validar-allocation-browser.cjs`: interface nativa com Worker real, título manual, confirmação de servidor, pacote, histórico, operador, 1440/1280 px e troca de contrato. Capturas disponíveis no artefato `cloudflare-browser` do CI.

Os testes automatizados usam dados sintéticos. Nenhuma mensagem externa é enviada para Teams ou Outlook durante a validação.

## Conclusão da validação em 21/10/2026

Migrations `20261021094140_pw_operator_publication` e `20261021094333_intelligent_allocation_workspace` executadas e registradas com os mesmos identificadores do repositório. A aplicação transacional via SQL foi utilizada após o endpoint de migrations retornar requestState expirado. O teste em produção publicou um snapshot sintético como operador dentro de uma transação revertida: data operacional, exclusão master e contexto de servidor continuaram protegidos. As cinco tabelas privadas mantêm RLS e nenhum SELECT direto para anon/authenticated.

A revisão adicional rejeita caminhos existentes quando a disciplina ou a unidade divergem do documento. A validação usa os mesmos reconhecedores de disciplina do RECON, preservando suas compatibilidades. O filtro também se aplica aos candidatos enviados à IA.

No Chromium, a abertura direta a partir da GRDT foi testada antes do primeiro efeito React, com atualização de bases em andamento e revisão física A. O pedido aguarda a atualização e permanece no estado observado pela interface; trocas de contexto o invalidam. A área de download fica depois da tabela e não encobre suas linhas. A altura da tabela se adapta a lotes pequenos. Capturas foram revisadas em 1440 e 1280 pixels.

O primeiro uso exige publicar, em **Bases de referência**, o mapa Databook, EAP, configuração de numeração e referências normativas autorizadas do contrato. Referências do RECON estão disponíveis para prévia, sem declarar automaticamente sua vigência contratual. O modelo oficial incorporado é preservado pelo exportador; um modelo contratual alternativo pode ser versionado. As bases não são copiadas silenciosamente entre contratos.

## Correção de interferência global e validação da Rev. E

O refinamento global `ui-v3.js` criava um contêiner ao redor da região das tabelas React. Ao alternar abas, a reconciliação tentava remover a região de seu pai original e falhava com `removeChild/NotFoundError`. Isolar apenas os botões do progresso não eliminava essa segunda origem de alteração de DOM. O refinamento agora ignora as ilhas React também em escopos aninhados, observação e foco de diálogos; o comportamento de tabelas legadas continua ativo. As tabelas do gerador possuem legendas e cabeçalhos acessíveis declarados pelo próprio React.

A regressão administrativa carrega o refinamento global junto com o módulo, importa, publica, alterna abas e recarrega. Uma tabela legada externa comprova que o refinamento continua funcionando. O arquivo real Rev. E foi verificado localmente com seus 312 caminhos e testado em envio/publicação via RPC em uma transação revertida. Uma variável opcional `GRCON_DATABOOK_FIXTURE_PATH` permite repetir o teste de navegador com arquivo privado local; o CI utiliza somente a fixture sintética. Nenhum arquivo privado é incluído no repositório.

Realtime continua opcional. Após falha de transporte, a sincronização HTTP permanece imediata e periódica a cada 45 segundos; o circuito de uma hora é persistido por origem/projeto para evitar que recargas abram repetidamente o mesmo WebSocket com falha. O prazo é limitado, nova rede permite retestar e uma conexão bem-sucedida limpa o estado. Isso não remove bloqueios de rede nem promete que a primeira tentativa WebSocket terá sucesso. Nenhum token, identificação de usuário ou documento é guardado nesse estado de rede.

## RECON workflow and Central master hierarchy (2026-10-21)

The generator now follows RECON's sources → relation → decision table → package
sequence. Sources are compact file cards; confirmations and history accept
multiple spreadsheets in one selection and retain individual source names.
Confirmation parsing/classification uses the preserved RECON confirmation engine.
The table exposes confirmation/Fiscal evidence, EAP, hierarchy origin and Databook.
Filter-wide selection uses one store update and covers rows outside the virtual
viewport. Batch confirmation validates each document through the existing server
endpoint; successes retain their decision IDs, failures stay pending with their
reason, and package generation requires every selected document to be confirmed.

Shared Central import retains `Base - Caminho das Pastas` in snapshot metadata.
The new private trigger publishes its N1–N10 rows into the existing versioned EAP
base in the same transaction as Central activation. It preserves source sheet,
snapshot and file identity, retires stale Central-derived hierarchies if the next
Central has no master sheet, and leaves private-table access unchanged. The
browser and server therefore resolve from the same EAP version. The generator
continues to use RECON's RNEST field-4 EAP extraction, structural prefix matching
and discipline disambiguation; ambiguous branches do not acquire invented levels.

Validation includes two-file confirmation import, filter-wide selection, partial
server failure, package blocking with pending decisions, private database trigger
activation/rollback/retirement, EAP parser parity and actual desktop screenshots.
The private Central workbook available in this session has 372 master entries;
its parsed hierarchy matches RECON exactly. Corporate source workbooks are not
included in repository fixtures.

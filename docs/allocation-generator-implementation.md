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

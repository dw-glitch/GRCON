# Robô Auditor — execução da publicação em 07/11/2026

O proprietário solicitou concluir o bloqueio técnico do banco e autorizou a publicação após os requisitos técnicos. Esta nota atualiza os documentos históricos de preparação: as duas migrações agora estão aplicadas no projeto GRCON, sem criar serviço pago, modificar alocações ou registrar aprovações documentais.

## Banco e rastreabilidade

| Recurso | Versão registrada em produção e no repositório | Identificador anterior de preparação |
|---|---|---|
| Entrada completa/checkpoint | `20261107120803_allocation_auditor_complete_checkpoint.sql` | `20261106104652` |
| Validações de referências | `20261107120824_allocation_auditor_reference_validations.sql` | `20261107090000` |

Os arquivos, testes e rollbacks foram alinhados às versões efetivamente registradas pelo serviço de migração, evitando reaplicação por divergência de identificador. Os nomes lógicos foram preservados.

Antes da alteração, foi obtida somente a definição da função existente (sem linhas documentais) e repetido o teste de migração e rollback em PGlite isolado. A definição inicial tinha MD5 `34c59c9fddfaade8ef378b54a6dfa470`; após a atualização, o valor esperado e confirmado em produção é `c28b2a15e22e34cd88d4315d9f50e484`. A aplicação recusaria uma definição inicial diferente da validada. Rollback testado inclui proteção contra apagar entradas salvas.

Conferência posterior: ambas as tabelas com RLS ativo; usuários anônimos e autenticados sem acesso direto; função pública de referências `SECURITY INVOKER`, função privada com controle de sessão/contrato/perfil; anônimos sem execução. O registro humano continua vazio por omissão: localizar um arquivo não aprova uma norma. Não foram criados dados sintéticos em produção.

Os avisos informativos de RLS sem política nas duas novas tabelas refletem o acesso exclusivo por RPC. O aviso de proteção contra senhas vazadas já existia antes desta alteração; não foi alterada configuração de autenticação nesta publicação.

## Código e verificação

- Base revisada: PR #431, commit `8ffce5f5295566eed1064982af93d027880d022f`, mais correções locais e preservação da main `0c3572b1768e28408409e56048e38460799d001e`.
- Revisão técnica do Codex nesta continuidade: referências/hash/vigência, restauração, idempotência, permissões, erros, preparação do aprendizado e consistência com a main. Consultados os comentários e threads do PR: nenhuma revisão externa ou thread pendente encontrada. Não se afirma aprovação de um revisor externo.
- `npm test` e build geral passaram antes do alinhamento dos identificadores; após o alinhamento, a suíte completa do auditor (42 comandos) e o build também passaram. Não criar execução automática paga de GitHub Actions.
- Publicação pelo merge do PR na main, seguindo a integração existente com Cloudflare. Verificar depois `/deployment-meta.json`, integridade dos ativos, proteção dos endpoints e disponibilidade das novas funções.

## Limites operacionais explícitos

Treinamento real desligado. A Central disponível tem 15.441 registros sem revisão e título da submissão; o fluxo de preparação identifica essas lacunas, preserva o original e gera revisão humana. Nenhum rótulo ou estado documental foi inventado.

Fontes/revisão/vigência ainda exigem aprovação humana; sem evidência, o motor mantém pendências. Validação visual e aceite da Qualidade permanecem manuais: o Chromium local foi bloqueado pelo executor e o navegador compartilhado não acessou o servidor local. Os testes React/Worker e banco isolado não são apresentados como teste autenticado de usuário em produção.

Se houver necessidade de reversão, preferir retornar o frontend à versão anterior e conservar os dados das tabelas novas. Os rollbacks de banco recusam apagar dados sem confirmação específica; não executá-los automaticamente com dados salvos.

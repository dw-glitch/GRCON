# Execução — 23/10/2026

Estado: **preparação implementada; migração operacional parcialmente concluída**.

- Inspeção do repositório e banco real realizada; base main `cfb294123e4bfe8193e5e321c4a900ec56ebf4c0`.
- 35 snapshots / 817.351 linhas inventariados no diagnóstico global.
- 0 snapshots corporativos copiados ao Turso; 0 linhas corporativas migradas ou removidas nesta execução.
- 0 divergências corporativas medidas: a verificação corporativa ainda não ocorreu.
- Snapshot sintético de 501 linhas copiado, validado e restaurado integralmente em SQLite local; testes incluem corrupção deliberada e falhas.
- Novo cliente, API autenticada, RPC aditiva, interface master, CLI, restauração e documentação preparados.
- `supabase` permanece a fonte oficial; modo `turso` bloqueado até implementação e testes do protocolo de publicação e projeções SQL.
- Falta autorização corporativa para armazenamento externo, configuração do banco/segredos, capacidade real do R2 e testes com serviços reais.
- Não houve habilitação de plano pago ou cobrança excedente.

Migração aditiva `20261023152857_turso_sigem_preparation.sql` aplicada ao Supabase. Consulta real verificou ACL restrita a authenticated e rejeição sem sessão. Advisors antes/depois: os mesmos 40 informativos de RLS sem políticas em tabelas privadas e 1 aviso preexistente de proteção de senhas; nenhum novo aviso. `npm test`, testes específicos e geração/validação do pacote Cloudflare aprovados. QA local de Chromium bloqueado pelo ambiente (socket não permitido); execução incluída no CI do PR. CI e publicação serão registrados após sua execução. Os limites e os passos técnicos estão em `docs/turso-sigem-migration.md`.

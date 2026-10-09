# GRCON — Versão C, Fase 1 e foto pessoal de perfil

Data: 09/10/2026. Esta etapa preserva todas as regras documentais do GRCON. A versão C das 18 telas foi escolhida como guia visual; imagens de IA não representam métricas de produção.

## Implementado nesta etapa
- O novo CSS grcon-version-c.css aplica espaçamento, navegação, cabeçalho e densidade de tabelas aprimorados, no desktop a partir de 1184px; sem remover controles existentes.
- grcon-profile-avatar.js integra-se ao menu de conta autenticada GrconCloud: avatar circular com fallback para iniciais, indicador de presença mantido.
- Cada usuário gerencia a própria imagem em Cabeçalho → Usuário → Foto de perfil → Escolher foto / Remover foto.
- JPG, PNG e WebP até 6MB de entrada; imagem recortada localmente ao centro e reduzida a WebP 256x256, máximo 1MB.
- Bucket privado grcon-profile-photos, path individual user-id/avatar.webp; política RLS autoriza somente o próprio usuário autenticado com vínculo ativo em contrato. Não há foto pública nem alteração na base R2 do Cofre.
- O navegador exibe URLs assinadas temporárias com expiração de 10 minutos. A foto acompanha a conta entre contratos, navegadores e computadores.
- Ao sair da sessão, a foto é ocultada. O usuário pode apagar a própria foto, restaurando as iniciais.
- index.html inclui os novos CSS/JS e autoriza no CSP somente imagens do projeto Supabase já conectado.
- Testes de regressão adicionados em tests/profile_photo_vc.cjs e npm test.

## Checklist de homologação ainda necessária
1. Verificar execução de npm run verify, Cloudflare QA e Chromium.
2. Login com usuário real A; trocar e remover foto; usuário real B não pode ler nem substituir foto A.
3. Foto persiste em outros computadores e ao alternar contrato; ao sair oculta imediatamente.
4. Testar PNG, JPEG, WebP, arquivo acima do limite, modo offline, erros de rede.
5. A publicação Cloudflare exige verificação posterior do commit de produção no deployment-meta.json.

## Fases posteriores (não concluídas nesta PR)
- Fase 2: GRDT etapas, tabela e toolbar; garantir revisão, loteamento, repostagem e Teams.
- Fase 3: Cofre e Consultas, comentários Fiscal 01, sem mudar R2 ou bases.
- Fase 4: Conferência e Pendências, distinção GRDT inteira/documento, exportações e deduplicação.
- Fase 5: SIGEM×PW, Revisão 0/Todas, Situação, Evolução e snapshots.
- Fase 6: Ferramentas, Combinar PDFs, Adicionar Capa, Controle de Solicitações, Administração e Notificações.

## Rollback
Reverter CSS/JS e inclusão no index.html se necessário. A migração cria bucket isolado, sem modificar históricos; não apagar automaticamente o bucket que pode conter fotos já enviadas.

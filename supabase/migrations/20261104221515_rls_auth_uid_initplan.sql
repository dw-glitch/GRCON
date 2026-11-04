-- Aplicada em produção em 04/11/2026 (versão 20261104221515).
-- Alerta do Supabase (auth_rls_initplan): auth.uid() era reavaliado linha a linha nas políticas abaixo.
-- Com (select auth.uid()) o valor é calculado uma vez por consulta. Mesma regra de acesso, só o desempenho muda.
-- Conferido: a visibilidade de notificações, leituras e contratos de 8 usuários ativos ficou idêntica antes e depois.
alter policy grcon_contracts_select on public.grcon_contracts
  using (private.grcon_is_global_owner() or exists (select 1 from public.grcon_memberships m where m.workspace_id = grcon_contracts.workspace_id and m.user_id = (select auth.uid()) and m.active));

alter policy grcon_notifications_select on public.grcon_notifications
  using (((recipient_id is null) and private.grcon_is_member(workspace_id))
      or ((recipient_id = (select auth.uid())) and exists (select 1 from public.grcon_memberships m where m.user_id = (select auth.uid()) and m.active)));

alter policy grcon_notification_reads_select on public.grcon_notification_reads
  using ((user_id = (select auth.uid())) and exists (select 1 from public.grcon_notifications n where n.id = grcon_notification_reads.notification_id));

alter policy grcon_notification_reads_insert on public.grcon_notification_reads
  with check ((user_id = (select auth.uid())) and exists (select 1 from public.grcon_notifications n where n.id = grcon_notification_reads.notification_id));

alter policy grcon_notification_reads_update on public.grcon_notification_reads
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy grcon_notification_reads_delete on public.grcon_notification_reads
  using (user_id = (select auth.uid()));

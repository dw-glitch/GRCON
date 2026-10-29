(function (root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const cloud = () => root.GrconCloud;
  const master = () => Boolean(cloud()?.isMasterOwner?.());
  const state = { users: [], workspace: "", open: false, editing: null, generation: 0, saving: false, section: "users", opening: 0, migrationReport: null };
  const labels = { owner: "Proprietário", admin: "Administrador", operator: "Operador", viewer: "Consulta" };
  const escape = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const notify = (message, kind) => root.GrconNotify?.(message, kind || "info");

  async function usersApi(operation, input = {}) {
    if (!master()) throw new Error("Acesso restrito ao Proprietário ADM.");
    const response = await cloud().state.client.functions.invoke("owner-manage-users", { body: { ...input, operation, workspaceId: state.workspace } });
    if (response.error) {
      let detail;
      try { detail = await response.error.context?.clone?.().json(); } catch (_) { /* resposta sem corpo */ }
      throw new Error(detail?.message || response.error.message || "Não foi possível administrar os usuários.");
    }
    if (!response.data?.ok) throw new Error("Resposta inválida da administração.");
    return response.data;
  }

  function install() {
    if (!master() || $("#grcon-administration-shortcut")) return;
    const host = $(".runtime-status"); if (!host) return;
    const button = document.createElement("button");
    button.id = "grcon-administration-shortcut"; button.type = "button";
    button.className = "secondary-button compact"; button.textContent = "Administração";
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", "grcon-admin-dialog");
    host.insertBefore(button, $("#grcon-cloud-account"));
    document.body.insertAdjacentHTML("beforeend", `<dialog id="grcon-admin-dialog" aria-labelledby="grcon-admin-title">
      <header><div><small>ÁREA EXCLUSIVA</small><h2 id="grcon-admin-title">Administração</h2><p>Controle de usuários, contratos e operações do GRCON.</p></div><button id="grcon-admin-close" type="button" aria-label="Voltar ao GRCON">Voltar ao GRCON</button></header>
      <div class="grcon-admin-layout"><nav class="grcon-admin-nav" aria-label="Administração"><button type="button" data-admin-section="users" aria-current="page">Usuários e acessos</button><button type="button" data-admin-section="contracts">Contratos</button><button type="button" data-admin-section="technical">Painel técnico</button><button type="button" data-admin-section="storage">Infraestrutura e armazenamento</button><button type="button" data-admin-section="activity">Registro de atividades</button><small>Exclusivo do Proprietário ADM</small></nav><div class="grcon-admin-main">
      <div class="grcon-admin-toolbar"><label>Contrato administrado<select id="grcon-admin-contract"></select></label></div>
      <p id="grcon-admin-feedback" role="status" aria-live="polite"></p>
      <section data-admin-panel="users" aria-labelledby="grcon-admin-users-title"><h3 id="grcon-admin-users-title" tabindex="-1">Usuários e acessos</h3><div class="grcon-admin-toolbar"><label>Buscar colaborador<input id="grcon-admin-search" type="search" placeholder="Nome ou e-mail"></label><button id="admin-user-new" type="button">Novo usuário</button></div>
      <div id="grcon-admin-users" aria-live="polite"></div>
      <section id="grcon-admin-editor" hidden><h3 id="grcon-admin-editor-title">Novo usuário</h3><form id="grcon-admin-user-form"><input id="admin-user-id" type="hidden"><div class="grcon-admin-grid"><label>Nome<input id="admin-user-name" required maxlength="160"></label><label>E-mail<input id="admin-user-email" type="email" required></label><label>Função<select id="admin-user-role"><option value="operator">Operador</option><option value="admin">Administrador</option><option value="owner">Proprietário</option></select></label><label><input id="admin-user-active" type="checkbox" checked> Acesso ativo</label></div><div class="egrdt-email-actions"><button type="submit">Salvar usuário</button><button id="admin-user-cancel" type="button">Cancelar</button></div><p id="admin-user-password" hidden></p></form></section>
      <details id="grcon-cloud-invitations-panel"><summary>Convites pendentes</summary><div id="grcon-cloud-invitations"></div></details>
      </section><section data-admin-panel="activity" hidden aria-labelledby="grcon-admin-activity-title"><h3 id="grcon-admin-activity-title" tabindex="-1">Registro de atividades</h3><details id="grcon-cloud-audit-panel" open><summary>Registro de atividades</summary><div id="grcon-cloud-audit"></div></details>
      </section><section data-admin-panel="contracts" hidden aria-labelledby="grcon-admin-contracts-title"><h3 id="grcon-admin-contracts-title" tabindex="-1">Contratos e configurações</h3><div id="grcon-admin-contract-settings"><form id="grcon-admin-contract-form"><input id="admin-contract-id" type="hidden"><div class="grcon-admin-grid"><label>Código<input id="admin-contract-code" required maxlength="60"></label><label>Nome<input id="admin-contract-name" required maxlength="160"></label><label>Identificação<input id="admin-contract-display" required maxlength="255"></label><label>Empresa<input id="admin-contract-company" maxlength="100"></label><label>Cliente<input id="admin-contract-client" maxlength="100"></label><label>Local<input id="admin-contract-site" maxlength="100"></label><label>Projeto<input id="admin-contract-project" maxlength="100"></label><label>Perfil de regras<input id="admin-contract-profile" maxlength="100"></label><label><input id="admin-contract-active" type="checkbox"> Contrato ativo</label><label><input id="admin-contract-inherit" type="checkbox"> Usar regras documentais da UHDT</label></div><div class="egrdt-email-actions"><button type="submit">Salvar contrato</button><button id="admin-contract-new" type="button">Novo contrato</button></div><small>Desativar preserva os dados e o histórico. Novos contratos começam com suas próprias configurações.</small></form></div></section>
      <section data-admin-panel="technical" hidden aria-labelledby="grcon-admin-technical-title"><h3 id="grcon-admin-technical-title" tabindex="-1">Painel técnico</h3><p>Saúde dos serviços, integrações, falhas e tarefas de todos os contratos.</p><div id="grcon-admin-technical"></div></section>
      <section data-admin-panel="storage" hidden aria-labelledby="grcon-admin-storage-title"><h3 id="grcon-admin-storage-title" tabindex="-1">Infraestrutura e armazenamento</h3><div id="grcon-admin-storage"></div></section>
      </div></div>
    </dialog>`);
    button.addEventListener("click", () => void open());
    $("#grcon-admin-close").addEventListener("click", () => { if (!state.saving) close(); });
    $("#grcon-admin-dialog").addEventListener("cancel", event => { event.preventDefault(); if (!state.saving) close(); });
    $("#grcon-admin-dialog").addEventListener("close", event => { if (event.target === $("#grcon-admin-dialog") && !event.target.open && state.open) close(); });
    $("#grcon-admin-contract").addEventListener("change", () => { state.workspace = $("#grcon-admin-contract").value; state.users = []; state.generation++; clearSecrets(); $("#grcon-admin-editor").hidden = true; renderContract(); void selectSection(state.section, false); });
    $(".grcon-admin-nav").addEventListener("click", event => { const button = event.target.closest("[data-admin-section]"); if (button && !state.saving) void selectSection(button.dataset.adminSection); });
    $("#grcon-admin-search").addEventListener("input", renderUsers);
    $("#grcon-admin-user-form").addEventListener("submit", saveUser);
    $("#admin-user-new").addEventListener("click", () => editUser(null));
    $("#admin-user-cancel").addEventListener("click", () => { clearSecrets(); $("#grcon-admin-editor").hidden = true; });
    $("#grcon-admin-contract-form").addEventListener("submit", saveContract);
    $("#admin-contract-new").addEventListener("click", () => renderContract(true));
    $("#grcon-cloud-invitations-panel").addEventListener("toggle", event => { if (event.target.open && state.open && master()) void cloud().loadInvitations(state.workspace); });
    $("#grcon-cloud-audit-panel").addEventListener("toggle", event => { if (event.target.open && state.open && state.section === "activity" && master()) void cloud().loadAuditEvents(state.workspace); });
    $("#grcon-admin-users").addEventListener("click", event => {
      const edit = event.target.closest("[data-admin-edit]");
      const password = event.target.closest("[data-admin-password]");
      const user = state.users.find(u => u.id === (edit?.dataset.adminEdit || password?.dataset.adminPassword));
      if (!user || user.isMaster || !master() || state.saving) return;
      if (edit) editUser(user);
      if (password) cloud().openAdminPasswordModal({ userId: user.id, role: user.role, name: user.name, email: user.email, workspaceId: state.workspace, isMaster: user.isMaster }, password);
    });
  }

  function close() {
    state.open = false; state.opening++; state.generation++;
    root.GrconBackgroundJobs?.unmount?.(); clearSecrets();
    if ($("#grcon-admin-editor")) $("#grcon-admin-editor").hidden = true;
    $("#grcon-admin-dialog")?.close();
  }
  function clearSecrets() {
    if ($("#admin-user-password")) { $("#admin-user-password").textContent = ""; $("#admin-user-password").hidden = true; }
  }
  function permissions() {
    // Nenhum atalho ou conteúdo de administração é montado para outros perfis.
    if (master()) { install(); return; }
    state.opening++; state.generation++; state.users = []; state.workspace = ""; state.open = false; state.editing = null; state.migrationReport = null;
    root.GrconBackgroundJobs?.unmount?.();
    cloud()?.closeAdminPasswordModal?.({ force: true });
    $("#grcon-admin-dialog")?.close();
    $("#grcon-admin-dialog")?.remove();
    $("#grcon-administration-shortcut")?.remove();
    $("#grcon-administration")?.remove();
  }
  function renderUsers() {
    if (!master() || !$("#grcon-admin-users")) return;
    const term = $("#grcon-admin-search").value.trim().toLocaleLowerCase("pt-BR");
    const users = state.users.filter(u => `${u.name} ${u.email}`.toLocaleLowerCase("pt-BR").includes(term));
    $("#grcon-admin-users").innerHTML = '<div class="grcon-admin-table-wrap"><table><thead><tr><th>Colaborador</th><th>E-mail</th><th>Função</th><th>Acesso</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>' + users.map(u => `<tr><td>${escape(u.name)}</td><td>${escape(u.email)}</td><td>${escape(u.isMaster ? "Proprietário ADM" : labels[u.role] || u.role)}</td><td>${u.active ? "Ativo" : "Inativo"}</td><td>${escape(u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("pt-BR") : "Sem acesso registrado")}</td><td>${u.isMaster ? '<span title="Conta protegida; função alterada somente diretamente no banco">Conta protegida</span>' : `<div class="grcon-admin-row-actions"><button type="button" data-admin-edit="${escape(u.id)}">Editar acesso</button><button type="button" data-admin-password="${escape(u.id)}">Alterar senha</button></div>`}</td></tr>`).join("") + '</tbody></table></div>' + (users.length ? '' : '<p>Nenhum colaborador encontrado.</p>');
  }
  function renderContract(isNew = false) {
    const c = isNew ? {} : cloud().state.contracts.find(c => c.workspace_id === state.workspace) || {};
    state.editing = c;
    for (const [field,key] of [["id","contract_id"],["code","code"],["name","name"],["display","display_name"],["company","company"],["client","client"],["site","site"],["project","project"]]) $("#admin-contract-" + field).value = c[key] || "";
    $("#admin-contract-profile").value = c.settings?.ruleProfile || "UNCONFIGURED";
    $("#admin-contract-active").checked = c.active !== false;
    $("#admin-contract-inherit").checked = c.settings?.inheritLegacyRules === true;
  }
  function editUser(user) {
    if (!master() || user?.isMaster) return;
    clearSecrets();
    $("#grcon-admin-editor").hidden = false;
    $("#grcon-admin-editor-title").textContent = user ? "Editar acesso do colaborador" : "Novo usuário";
    $("#admin-user-id").value = user?.id || "";
    $("#admin-user-name").value = user?.name || "";
    $("#admin-user-email").value = user?.email || "";
    $("#admin-user-email").disabled = Boolean(user);
    const select = $("#admin-user-role");
    select.querySelector('[value="viewer"]')?.remove();
    if (user?.role === "viewer") select.insertAdjacentHTML("beforeend", '<option value="viewer">Consulta (existente)</option>');
    select.value = user?.role || "operator";
    $("#admin-user-active").checked = user?.active !== false;
    $("#admin-user-name").focus();
  }
  async function loadUsers() {
    const workspace = state.workspace, generation = ++state.generation;
    $("#grcon-admin-users").textContent = "Carregando usuários…";
    $("#grcon-admin-editor").hidden = true; clearSecrets();
    $("#grcon-cloud-invitations").textContent = ""; $("#grcon-cloud-audit").textContent = "";
    try {
      const data = await usersApi("list");
      if (generation !== state.generation || workspace !== state.workspace || !master() || !state.open) return;
      state.users = data.users || []; renderUsers();
      if ($("#grcon-cloud-invitations-panel").open) void cloud().loadInvitations(workspace);
    } catch (error) { if (generation === state.generation && $("#grcon-admin-users")) $("#grcon-admin-users").textContent = error.message; }
  }
  async function loadStorage() {
    const host = $("#grcon-admin-storage"), workspace = state.workspace, generation = state.generation;
    if (!host || !master()) return;
    const valid = () => state.open && state.section === "storage" && state.workspace === workspace && state.generation === generation && master();
    const api = async (action, data) => {
      const retryable = ["copy", "seal", "audit", "inventory"].includes(action);
      for (let attempt = 0; attempt < (retryable ? 4 : 1); attempt++) {
        const token = cloud()?.state?.session?.access_token;
        if (!token || !valid()) throw new Error("A sessão ou o contrato mudou.");
        let response, result;
        try {
        response = await root.fetch("/api/sigem-storage/" + action + (data ? "" : "?workspace=" + encodeURIComponent(workspace)), {
          method: data ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, ...(data ? { "content-type": "application/json" } : {}) },
          ...(data ? { body: JSON.stringify({ workspace, ...data }) } : {}), signal: AbortSignal.timeout(45000),
        });
        result = await response.json();
        } catch (_) {
          if (retryable && attempt < 3 && valid()) { await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
          throw new Error("SIGEM_STORAGE_NETWORK_UNAVAILABLE");
        }
        if ((!response.ok || !result.ok) && retryable && attempt < 3 && valid() && [429, 502, 503, 504].includes(response.status) && !["TURSO_NOT_CONFIGURED", "TURSO_URL_INVALID", "TURSO_TOKEN_FORMAT_INVALID", "TURSO_AUTH_REJECTED", "TURSO_REDIRECT_REJECTED"].includes(result.error)) { await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
        if (!response.ok || !result.ok) throw new Error(result.error === "SIGEM_STORAGE_AUTHORIZATION_REQUIRED" ? "Falta confirmar a autorização para armazenamento externo." : "Não foi possível verificar o armazenamento: " + (result.error || response.status));
        if (!valid()) throw new Error("A sessão ou o contrato mudou.");
        return result;
      }
    };
    const mib = bytes => Number.isFinite(bytes) ? (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MiB" : "Não medido";
    // O percentual existe apenas se há um limite aplicável explicitamente configurado.
    // Tamanho ocupado e espaço total são métricas diferentes: nunca presumir o plano.
    const storageCard = (name, usedValue, limitValue, description, connected = true) => {
      const used = Number(usedValue), limit = Number(limitValue);
      const measured = usedValue !== null && usedValue !== undefined && Number.isFinite(used) && used >= 0;
      const limited = limitValue !== null && limitValue !== undefined && Number.isFinite(limit) && limit > 0;
      const ratio = measured && limited ? Math.round(used / limit * 100) : null;
      const progress = ratio === null ? 0 : Math.min(100, Math.max(0, ratio));
      const tone = ratio === null ? "unknown" : ratio >= 95 ? "critical" : ratio >= 85 ? "warning" : ratio >= 70 ? "attention" : "healthy";
      const usedText = measured ? mib(used) : "Não medido";
      const availableText = limited && measured ? mib(Math.max(0, limit - used)) : "Não disponível";
      const capText = limited ? mib(limit) : "Não informado";
      return `<article class="grcon-storage-card" data-storage-service="${escape(name)}" data-storage-tone="${tone}">
        <div class="grcon-storage-card-header"><strong>${escape(name)}</strong><small>${escape(description)}</small></div>
        <div class="grcon-storage-card-body">
          <div class="grcon-storage-donut" role="img" aria-label="${escape(name)}: ${ratio === null ? "percentual indisponível" : ratio + "% utilizado"}" style="--storage-progress:${progress}%">
            <span><strong>${ratio === null ? "—" : ratio + "%"}</strong><small>${ratio === null ? "sem limite conhecido" : "utilizado"}</small></span>
          </div>
          <dl class="grcon-storage-card-values"><div><dt>Utilizado</dt><dd>${escape(usedText)}</dd></div>
          <div><dt>Disponível</dt><dd>${escape(availableText)}</dd></div>
          <div><dt>Capacidade</dt><dd>${escape(capText)}</dd></div></dl>
        </div>
        <p class="grcon-storage-card-footnote">${connected ? "Medição do banco" : "Medição indisponível ou desatualizada"} · ${limited ? "Limite configurado no servidor (verifique o plano)" : "Limite não fornecido pelo serviço"}</p>
      </article>`;
    };
    host.textContent = "Verificando armazenamento…";
    try {
      const status = await api("status"); if (!valid()) return;
      const connectionMessages = {
        TURSO_NOT_CONFIGURED: "Falta configurar TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN no Worker de produção. Salve os segredos e clique em Deploy na Cloudflare.",
        TURSO_URL_INVALID: "O endereço do banco é inválido. Copie Database URL no painel do banco Turso e salve somente o endereço em TURSO_DATABASE_URL.",
        TURSO_TOKEN_FORMAT_INVALID: "O token foi colado com formatação extra. Salve somente o token em TURSO_AUTH_TOKEN, sem aspas, Bearer ou o nome da variável.",
        TURSO_AUTH_REJECTED: "O Turso recusou o acesso. Confira se o token pertence a este banco e está válido, e se as regras de acesso do banco permitem a conexão.",
        TURSO_REDIRECT_REJECTED: "O endereço do banco respondeu com um redirecionamento, que foi bloqueado para proteger o token. Confira Database URL no painel do banco Turso.",
        TURSO_DATABASE_NOT_FOUND: "O endereço não encontrou o banco no Turso. Confira Database URL no painel do banco e atualize TURSO_DATABASE_URL.",
        TURSO_TIMEOUT: "O Turso não respondeu no prazo. Tente Verificar conexão novamente; se persistir, envie o relatório de diagnóstico.",
        TURSO_RATE_LIMIT: "O Turso limitou as solicitações. Aguarde e verifique os limites do plano antes de tentar novamente.",
        TURSO_UNAVAILABLE: "Não foi possível alcançar o Turso. Confira o endereço e a disponibilidade do banco; se persistir, envie o relatório de diagnóstico.",
        TURSO_QUERY_FAILED: "O Turso respondeu, mas recusou a consulta de teste. Confira as permissões do token e as restrições do banco.",
        TURSO_RESPONSE_INVALID: "O Turso retornou uma resposta inesperada. Tente novamente; se persistir, envie o relatório de diagnóstico.",
        TURSO_INTEGER_RANGE: "O Turso retornou um valor inesperado na consulta de teste. Envie o relatório de diagnóstico."
      };
      const connectionError = Object.prototype.hasOwnProperty.call(connectionMessages, status.turso.error) ? status.turso.error : "TURSO_UNAVAILABLE";
      const copied = (status.turso.snapshots || []).filter(s => s.state === "verified");
      const copyAllowed = status.turso.connected && status.externalStorageAuthorized && status.preflightApproved;
      host.innerHTML = `<div class="grcon-storage-visuals">
        ${storageCard("Supabase", status.databaseBytes, status.supabaseCapacityBytes, status.newImportsTarget ? "Permissões, metadados e índice operacional" : "Banco operacional · fonte oficial")}
        ${storageCard("Turso", status.turso.databaseBytes, status.turso.capacityBytes, status.payloadSource === "turso" ? "Consulta Geral · fonte dos dados" : status.newImportsTarget ? "Consulta Geral · novas importações" : "Consulta Geral · cópia em homologação", status.turso.connected)}
      </div><p class="grcon-storage-measured-at">Última verificação: ${escape(new Date().toLocaleString("pt-BR"))}. Percentuais aparecem apenas quando o limite é informado de forma explícita.</p>
      <section class="grcon-storage-diagnostics" aria-label="Diagnóstico dos serviços">
        <h4>Diagnóstico dos serviços</h4>
        <p>${status.turso.connected ? "Supabase: medição disponível. Turso: conexão confirmada." : "Turso: " + escape(connectionMessages[connectionError]) + " Código: " + escape(connectionError) + "."}</p>
        <p>Neon: ${status.neon?.connected ? (status.neon.ready ? "conexão e estrutura auxiliar confirmadas" : "conectado; estrutura auxiliar pendente") : status.neon?.configured ? "conexão não confirmada" : "configuração da conexão pendente"}. A divisão de módulos será definida separadamente.</p>
        <small>${status.newImportsTarget ? "Novas planilhas são publicadas diretamente no Turso. O Supabase mantém permissões, metadados e o índice operacional." : "Uma conexão confirmada não comprova conclusão da migração. A fonte oficial permanece no Supabase."}</small>
      </section>
      <details class="grcon-storage-technical"><summary>Ver detalhes de infraestrutura e migração</summary><dl class="grcon-admin-storage-metrics"><div><dt>Dados completos da Consulta Geral</dt><dd>${status.payloadSource === "turso" ? "Turso" : status.newImportsTarget ? "Turso (bases novas) e Supabase (bases antigas)" : "Supabase"}</dd></div><div><dt>Modo do servidor</dt><dd>${escape(status.mode)}</dd></div><div><dt>Banco Supabase completo</dt><dd>${escape(mib(status.databaseBytes))}</dd></div><div><dt>Tabela da Consulta Geral completa</dt><dd>${escape(mib(status.sourceBytes))}</dd></div><div><dt>Snapshots deste contrato</dt><dd>${escape(Number(status.snapshots || 0).toLocaleString("pt-BR"))}</dd></div><div><dt>Registros deste contrato</dt><dd>${escape(Number(status.records || 0).toLocaleString("pt-BR"))}</dd></div><div><dt>Turso</dt><dd>${status.turso.connected ? "Conexão confirmada" : status.turso.configured ? "Conexão não confirmada" : "Configuração pendente"}</dd></div><div><dt>Banco Turso completo</dt><dd>${escape(mib(status.turso.databaseBytes))}</dd></div><div><dt>Cópias validadas neste contrato</dt><dd>${copied.length}</dd></div></dl></details><p>${status.payloadSource === "turso" ? "As bases completas são consultadas no Turso. O índice operacional no Supabase não armazena as planilhas completas." : status.newImportsTarget ? "As bases antigas continuam no Supabase até a liberação das cópias verificadas." : "A fonte oficial permanece no Supabase. A ativação do Turso depende da conclusão dos testes de migração e recuperação."}</p><div class="grcon-admin-row-actions"><button type="button" data-storage-refresh>Atualizar métricas</button><button type="button" data-storage-report>Baixar relatório</button><button type="button" data-storage-copy ${status.turso.connected && status.externalStorageAuthorized && status.preflightApproved ? "" : "disabled"}>Iniciar / retomar cópia</button></div><p data-storage-progress role="status" aria-live="polite"></p>`;
      const backgroundButton=document.createElement("button");
      backgroundButton.type="button";backgroundButton.dataset.storageBackground="";backgroundButton.textContent="Copiar em segundo plano";
      backgroundButton.disabled=!copyAllowed;
      host.querySelector(".grcon-admin-row-actions").append(backgroundButton);
      const backgroundProgress=document.createElement("p");backgroundProgress.setAttribute("role","status");backgroundProgress.dataset.storageBackgroundProgress="";host.append(backgroundProgress);
      const monitor=async()=>{
        if(!valid())return;
        try{
          const job=await api("background-status");if(!job.started)return;
          state.migrationReport={...job,workspace,cutoverReady:false,cleanupAllowed:false,officialSource:"supabase"};
          const failed=(job.reports||[]).find(lane=>lane.status==="failed");
          const next=job.nextWaveReady===true;
          const reconcile=job.reconciliationReady===true;
          backgroundProgress.textContent=job.complete?`Cópia e auditoria integral concluídas: ${Number(job.validated||0).toLocaleString("pt-BR")} registros. A fonte oficial permanece no Supabase; restauração e homologação ainda são necessárias.`:
            next?`Etapa ${Number(job.wave||0)+1} auditada. Ainda faltam ${Number(job.pendingSnapshots||0).toLocaleString("pt-BR")} versões no Turso. Clique em Iniciar próxima etapa após conferir a franquia gratuita de Workflows.`:
            reconcile?`A execução anterior terminou e o inventário mudou. Clique em Reconciliar novas versões após conferir a franquia gratuita de Workflows. Os recibos anteriores serão revalidados; a fonte oficial permanece no Supabase.`:
            `Cópia em segundo plano: ${Number(job.copied||0).toLocaleString("pt-BR")} de ${Number(job.records||0).toLocaleString("pt-BR")} registros; auditoria integral: ${Number(job.validated||0).toLocaleString("pt-BR")}. `+
            (!job.inventoryStable?"O inventário mudou; reconcilie as versões antes da homologação. ":"")+
            (failed?"Execução interrompida: "+failed.error+". Os lotes foram preservados.":"Pode sair desta tela; o servidor continua o processamento.");
          backgroundButton.textContent=reconcile?"Reconciliar novas versões":next?"Iniciar próxima etapa":"Copiar em segundo plano";
          backgroundButton.disabled=!copyAllowed||job.complete||(!failed&&!next&&!reconcile);
          host.querySelector("[data-storage-copy]").disabled=!copyAllowed||!failed;
          if(!job.complete&&!failed&&!next&&!reconcile)root.setTimeout(()=>void monitor(),10000);
        }catch(error){if(valid())backgroundProgress.textContent="Não foi possível atualizar o progresso. A execução do servidor independe desta tela.";}
      };
      backgroundButton.addEventListener("click",async()=>{
        backgroundButton.disabled=true;host.querySelector("[data-storage-copy]").disabled=true;
        try{await api("background-copy",{});backgroundProgress.textContent="Cópia iniciada no servidor. Conferindo progresso…";await monitor();}
        catch(error){if(valid()){backgroundProgress.textContent=error.message;backgroundButton.disabled=false;host.querySelector("[data-storage-copy]").disabled=false;}}
      });
      if(status.payloadSource==='turso'){
        backgroundButton.hidden=true;host.querySelector('[data-storage-copy]').hidden=true;
        backgroundProgress.textContent='Migração concluída. As bases completas e as novas importações são consultadas no Turso.';
      }else void monitor();
      host.querySelector("[data-storage-refresh]").addEventListener("click", () => void loadStorage());
      host.querySelector("[data-storage-report]").addEventListener("click", async () => {
        const refreshed = await api("status").catch(() => status); if (!valid()) return;
          const migration = state.migrationReport?.workspace === workspace ? state.migrationReport : undefined;
        const link = document.createElement("a"), url = URL.createObjectURL(new Blob([JSON.stringify({ ...refreshed, migration, reportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
        link.href = url; link.download = "GRCON-Armazenamento.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      host.querySelector("[data-storage-copy]").addEventListener("click", async () => {
        const progress = host.querySelector("[data-storage-progress]");
        let report;
        const canonical = value => value && typeof value === "object" ? Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);
        const hash = async value => Array.from(new Uint8Array(await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), n => n.toString(16).padStart(2, "0")).join("");
        for (const button of host.querySelectorAll("button")) button.disabled = true;
        try {
          const inventory = await api("inventory"); let done = 0;
          const total = inventory.snapshots.reduce((n, s) => n + s.record_count, 0);
          report = { workspace, startedAt: new Date().toISOString(), inventoryCount: inventory.snapshots.length, records: total, validatedRecords: 0, snapshots: [], complete: false, cutoverReady: false, cleanupAllowed: false };
          state.migrationReport = report;
          if (inventory.pendingSnapshots !== 0) throw new Error("Há uma importação pendente. Conclua ou resolva essa importação antes da cópia.");
          for (const snapshot of inventory.snapshots) {
            // Re-read every batch on resume. Exact replay validates checkpoints,
            // source, destination and backup rather than trusting an offset alone.
            for (let after = 0; after < snapshot.record_count; after += 250) {
              await api("copy", { snapshot: snapshot.id, after }); done += Math.min(250, snapshot.record_count - after);
              progress.textContent = `${done.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} registros copiados. Validados em segunda passagem: ${report.validatedRecords.toLocaleString("pt-BR")}. Sair desta seção interrompe após o lote atual; a cópia pode ser retomada.`;
            }
            const sealed = await api("seal", { snapshot: snapshot.id });
            let digest = "0".repeat(64), validatedRecords = 0;
            for (let after = 0; after < snapshot.record_count; after += 250) {
              const audit = await api("audit", { snapshot: snapshot.id, after });
              const expected = Math.min(250, snapshot.record_count - after);
              if (audit.after !== after + expected || audit.count !== expected || audit.snapshotChecksum !== sealed.checksum || !/^[a-f0-9]{64}$/.test(audit.checksum)) throw new Error("SIGEM_AUDIT_INCOMPLETE");
              digest = await hash(digest + "\n" + audit.checksum); validatedRecords += audit.count;
              progress.textContent = `Conferindo a cópia, o backup e a origem: ${(report.validatedRecords + validatedRecords).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} registros.`;
            }
            if (digest !== sealed.checksum || validatedRecords !== snapshot.record_count) throw new Error("SIGEM_AUDIT_HASH_MISMATCH");
            report.validatedRecords += validatedRecords;
            report.snapshots.push({ id: snapshot.id, ...sealed, validatedRecords, fullAudit: true });
          }
          const current = await api("inventory");
          report.inventoryStable = canonical(inventory) === canonical(current);
          report.pendingSnapshots = current.pendingSnapshots;
          report.complete = report.inventoryStable && current.pendingSnapshots === 0 && report.validatedRecords === total;
          progress.textContent = report.complete ? "Cópia e conferência integral concluídas. Baixe o relatório. A fonte oficial permanece no Supabase; homologação e teste de restauração ainda são necessários." : "O inventário mudou durante a cópia. Baixe o relatório e reconcilie as novas versões antes de continuar. A fonte oficial permanece no Supabase.";
        } catch (error) { if (report) report.error = error.message; if (valid()) progress.textContent = error.message + " Os lotes já conferidos foram preservados."; }
        finally { if (report) report.finishedAt = new Date().toISOString(); if (valid()) for (const button of host.querySelectorAll("button")) button.disabled = false; }
      });
      await loadBaseManagement(host,api,valid);
    } catch (error) { if (valid()) host.textContent = error.message; }
  }
  async function loadBaseManagement(host,api,valid) {
    const panel=document.createElement("section");panel.className="grcon-admin-storage-bases";host.append(panel);
    panel.innerHTML='<h4>Bases da Consulta Geral</h4><p>Exclua versões obsoletas. A base ativa fica protegida. A exclusão permanente também remove a cópia e o backup daquela versão.</p><div data-base-list>Carregando bases…</div><p data-base-message role="status" aria-live="polite"></p>';
    const message=panel.querySelector("[data-base-message]"),list=panel.querySelector("[data-base-list]");
    try {
      const {bases}=await api("bases");if(!valid())return;
      list.innerHTML='<div style="overflow:auto;max-height:400px"><table class="grcon-admin-table"><thead><tr><th>Versão</th><th>Data</th><th>Arquivo</th><th>Registros</th><th>Ação</th></tr></thead><tbody>'+bases.map(b=>`<tr><td>${escape(b.version)}</td><td>${escape(String(b.date||"").slice(0,10))}</td><td>${escape(b.fileName)}</td><td>${Number(b.records).toLocaleString("pt-BR")}</td><td>${b.status==='active'?'<strong>Base ativa</strong>':`<button type="button" data-delete-base="${escape(b.id)}">${b.deletionPending?'Concluir exclusão':'Excluir permanentemente'}</button>`}</td></tr>`).join("")+'</tbody></table></div>';
      for(const button of list.querySelectorAll("[data-delete-base]"))button.addEventListener("click",async()=>{
        const base=bases.find(b=>b.id===button.dataset.deleteBase);if(!base||base.status==='active'||!valid())return;
        if(!root.confirm(`Excluir permanentemente a versão ${base.version}?\n${base.fileName}\n${Number(base.records).toLocaleString("pt-BR")} registros.\nA cópia no Turso, os registros no Supabase e o backup desta versão serão removidos. Essa ação não pode ser desfeita pela tela.`))return;
        button.disabled=true;
        try {
          let result;do{result=await api("delete-base",{snapshot:base.id,confirm:base.id});}while(!result.complete&&valid());
          if(!valid())return;
          root.dispatchEvent(new CustomEvent("grcon:shared-sigem-metadata-invalidated"));
          panel.remove();await loadBaseManagement(host,api,valid);
        }catch(error){message.textContent=error.message+" A exclusão pode ser retomada nesta tela.";button.disabled=false;}
      });
      // The Master may release verified legacy payloads without deleting the
      // historical snapshot. Every release is checked again in the Worker:
      // full audit, immutable R2 manifest, verified Turso destination and
      // exact source fields. A failed request leaves all unproven rows intact.
      const releasable=bases.filter(b=>!b.storage&&(b.status==='active'||b.status==='archived'));
      if(releasable.length){
        const transfer=document.createElement("section");transfer.className="grcon-admin-storage-release";
        transfer.innerHTML='<h4>Liberar espaço da Consulta Geral no Supabase</h4><p>As planilhas completas de '+releasable.length+' base(s) ainda estão no Supabase. Libere apenas as que tiverem cópia, auditoria integral e backup comprovados no Turso. As bases continuam disponíveis no GRCON; a base ativa não será excluída.</p><button type="button" data-release-verified>Liberar cópias verificadas</button><p data-release-progress role="status" aria-live="polite"></p>';
        panel.append(transfer);
        const releaseButton=transfer.querySelector("[data-release-verified]"),progress=transfer.querySelector("[data-release-progress]");
        releaseButton.addEventListener("click",async()=>{
          if(!valid()||!root.confirm('Liberar do Supabase apenas os registros completos das '+releasable.length+' bases com cópia integral comprovada no Turso?\\nAs bases e os índices operacionais permanecem; o servidor recusará qualquer base sem auditoria e backup válidos.'))return;
          releaseButton.disabled=true;
          let released=0,failed=null;
          for(const base of releasable){
            if(!valid())break;
            progress.textContent='Verificando e liberando '+(released+1)+' de '+releasable.length+' base(s): versão '+base.version+'.';
            try{
              let result=null,steps=0;
              do{
                if(!valid())break;
                if(++steps>650)throw new Error("SIGEM_RELEASE_PROGRESS_LIMIT");
                result=await api("release-base",{snapshot:base.id,confirm:base.id});
                if(!result||result.ok!==true||typeof result.released!=="boolean")throw new Error("SIGEM_RELEASE_RESPONSE_INVALID");
                if(!result.released){
                  const expected=Number(result.expected)||base.records||0;
                  const processed=Number(result.processed)||0;
                  const percent=expected?Math.min(100,Math.round(100*processed/expected)):0;
                  const phase=result.phase==="projecting"?"Preparando e verificando a projeção operacional":result.phase==="cleaning"?"Removendo os registros antigos já protegidos pelo Turso":"Verificando";
                  progress.textContent=phase+" — versão "+base.version+" ("+percent+"%; etapa "+steps+"). "+(released)+" de "+releasable.length+" bases liberadas. Pode sair da tela e retomar depois.";
                }
              }while(valid()&&result?.released!==true);
              if(!valid())break;
              if(result?.released!==true)throw new Error("SIGEM_RELEASE_NOT_CONFIRMED");
              released++;
            }catch(error){failed='Versão '+base.version+': '+error.message;break;}
          }
          if(!valid())return;
          panel.remove();
          await loadBaseManagement(host,api,valid);
          const status=host.querySelector("[data-base-message]");
          if(status)status.textContent=failed?'Liberadas '+released+' base(s). Interrompido em '+failed+' As demais continuam preservadas. Recarregue e retome após conferir a auditoria.':'Liberadas '+released+' base(s) verificadas. Os registros operacionais permaneceram no Supabase. Confira o tamanho físico do banco e realize manutenção somente após esvaziar a tabela legada.';
        });
      }
      const retire=document.createElement("div");retire.innerHTML='<h4>Desativação do armazenamento documental</h4><p>Os envios e acessos ao antigo Cofre estão desativados.</p><button type="button" data-document-inventory>Verificar arquivos para remoção</button><p data-document-message role="status" aria-live="polite"></p>';panel.append(retire);
      const preview=retire.querySelector("button"),status=retire.querySelector("[data-document-message]");
      preview.addEventListener("click",async()=>{
        preview.disabled=true;
        try {
          const inventory=await api("document-inventory");if(!valid())return;
          status.textContent=`${inventory.objects.toLocaleString("pt-BR")} arquivos · ${(inventory.bytes/1073741824).toLocaleString("pt-BR",{maximumFractionDigits:2})} GiB · ${inventory.multipartUploads} envios multipartes.`;
          if(!inventory.objects&&!inventory.catalogRecords&&!inventory.multipartUploads){status.textContent="Armazenamento documental removido. Nenhum arquivo ou envio pendente do antigo Cofre.";return;}
          const remove=document.createElement("button");remove.type="button";remove.textContent="Excluir arquivos do antigo Cofre";retire.append(remove);
          remove.addEventListener("click",async()=>{
            if(!root.confirm(`Excluir permanentemente os ${inventory.objects.toLocaleString("pt-BR")} arquivos do antigo Cofre e cancelar os ${inventory.multipartUploads} envios multipartes?\nOs arquivos do seu computador serão preservados. Os backups da Consulta Geral não fazem parte desta exclusão.`))return;
            remove.disabled=true;let deleted=0;
            try{
              let result;do{result=await api("document-purge",{confirm:"EXCLUIR ARQUIVOS DO COFRE"});deleted+=result.deleted;if(valid())status.textContent=`${deleted.toLocaleString("pt-BR")} arquivos removidos…`;}while(!result.complete&&valid());
              if(valid())status.textContent="Arquivos do antigo Cofre removidos e catálogo limpo.";
            }catch(error){status.textContent=error.message+" A remoção pode ser retomada.";remove.disabled=false;}
          });
        }catch(error){status.textContent=error.message;preview.disabled=false;}
      });
    }catch(error){message.textContent=error.message;}
  }
  async function selectSection(section, focus = true) {
    if (!master() || !state.open || !["users", "contracts", "technical", "activity", "storage"].includes(section)) return;
    root.GrconBackgroundJobs?.unmount?.();
    state.section = section; state.generation++; clearSecrets();
    $("#grcon-admin-editor").hidden = true;
    $("#grcon-admin-feedback").textContent = "";
    for (const panel of document.querySelectorAll("[data-admin-panel]")) panel.hidden = panel.dataset.adminPanel !== section;
    for (const button of document.querySelectorAll("[data-admin-section]")) {
      if (button.dataset.adminSection === section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    $("#grcon-admin-contract").closest(".grcon-admin-toolbar").hidden = section === "technical";
    if (focus) document.querySelector(`[data-admin-panel="${section}"] h3`)?.focus();
    if (section === "storage") await loadStorage();
    else if (section === "users") await loadUsers();
    else if (section === "contracts") renderContract();
    else if (section === "activity") { $("#grcon-cloud-audit").textContent = ""; await cloud().loadAuditEvents(state.workspace); }
    else if (section === "technical" && root.GrconBackgroundJobs?.mount) root.GrconBackgroundJobs.mount($("#grcon-admin-technical"), { technical: true, workspace: state.workspace });
  }
  async function open(section = "users") {
    const opening = ++state.opening;
    const identity = cloud()?.state?.session?.user?.id;
    const workspace = cloud()?.state?.membership?.workspace_id;
    if (!await cloud()?.refreshMasterOwner?.()) { permissions(); return; }
    if (opening !== state.opening || identity !== cloud()?.state?.session?.user?.id || workspace !== cloud()?.state?.membership?.workspace_id) return;
    install(); state.open = true;
    $("#grcon-admin-contract").innerHTML = cloud().state.contracts.map(c => '<option value="' + escape(c.workspace_id) + '">' + escape(c.code) + (c.active ? "" : " · inativo") + '</option>').join("");
    state.workspace = state.workspace && cloud().state.contracts.some(c => c.workspace_id === state.workspace) ? state.workspace : workspace;
    $("#grcon-admin-contract").value = state.workspace;
    $("#grcon-admin-search").value = "";
    renderContract(); if (!$("#grcon-admin-dialog").open) $("#grcon-admin-dialog").showModal();
    await selectSection(["users", "contracts", "technical", "activity", "storage"].includes(section) ? section : "users");
  }
  async function saveContract(event) {
    event.preventDefault(); if (!master() || state.saving) return;
    const code = $("#admin-contract-code").value.trim().toUpperCase(), inherit = $("#admin-contract-inherit").checked;
    const input = { id: $("#admin-contract-id").value || null, code, slug: code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""), name: $("#admin-contract-name").value.trim(), displayName: $("#admin-contract-display").value.trim(), company: $("#admin-contract-company").value.trim(), client: $("#admin-contract-client").value.trim(), site: $("#admin-contract-site").value.trim(), project: $("#admin-contract-project").value.trim(), active: $("#admin-contract-active").checked, settings: { ...(state.editing?.settings || {}), ruleProfile: $("#admin-contract-profile").value.trim() || "UNCONFIGURED", inheritLegacyRules: inherit, enabledModules: { ...(state.editing?.settings?.enabledModules || {}), legacyUhdtRules: inherit } } };
    setSaving(true);
    try {
      const { error } = await cloud().state.client.rpc("grcon_contract_save", { input }); if (error) throw error;
      await cloud().refreshContracts(); notify("Contrato salvo.", "success"); await open("contracts");
    } catch (error) { feedback(error.message, "error"); } finally { setSaving(false); }
  }
  function feedback(message, kind) { if ($("#grcon-admin-feedback")) $("#grcon-admin-feedback").textContent = message; notify(message, kind); }
  function setSaving(value) {
    state.saving = value;
    const dialog = $("#grcon-admin-dialog"); if (!dialog) return;
    dialog.setAttribute("aria-busy", String(value));
    dialog.querySelectorAll("button,input,select").forEach(el => { el.disabled = value; });
    if (!value) $("#admin-user-email").disabled = Boolean($("#admin-user-id").value);
  }
  async function saveUser(event) {
    event.preventDefault(); if (!master() || state.saving) return;
    const id = $("#admin-user-id").value, workspace = state.workspace;
    if (state.users.some(u => u.id === id && u.isMaster)) return;
    setSaving(true); clearSecrets();
    const input = { userId: id || undefined, name: $("#admin-user-name").value.trim(), email: $("#admin-user-email").value.trim(), role: $("#admin-user-role").value, active: $("#admin-user-active").checked };
    try {
      const result = await usersApi(id ? "update" : "create", input);
      if (!master() || workspace !== state.workspace || !state.open) return;
      await loadUsers();
      if (result.temporaryPassword && master() && state.open) {
        $("#grcon-admin-editor").hidden = false;
        $("#admin-user-id").value = result.user.id;
        $("#admin-user-email").disabled = true;
        $("#admin-user-password").textContent = "Senha temporária (copie agora): " + result.temporaryPassword;
        $("#admin-user-password").hidden = false;
      }
      feedback(id ? "Acesso atualizado." : "Usuário criado e vinculado ao contrato.", "success");
    } catch (error) { feedback(error.message, "error"); } finally { setSaving(false); }
  }
  root.GrconAdministration = Object.freeze({ open });
  for (const event of ["grcon:cloud-ready", "grcon:cloud-signed-out", "grcon:permissions-changed"]) root.addEventListener(event, permissions);
  root.addEventListener("grcon:contract-context-changed", () => { state.workspace = ""; close(); permissions(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", permissions, { once:true }); else permissions();
})(window);





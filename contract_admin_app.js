(function (root) {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const cloud = () => root.GrconCloud;
  const master = () => Boolean(cloud()?.isMasterOwner?.());
  const state = { users: [], workspace: "", open: false, editing: null, generation: 0, saving: false };
  const labels = { owner: "Proprietário", admin: "Administrador", operator: "Operador", viewer: "Consulta" };
  const escape = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const notify = (message, kind) => root.GrconNotify?.(message, kind || "info");

  async function usersApi(operation, input = {}) {
    if (!master()) throw new Error("Acesso restrito ao proprietário master.");
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
    if (!master() || $("#grcon-users-shortcut")) return;
    const host = $(".runtime-status"); if (!host) return;
    const button = document.createElement("button");
    button.id = "grcon-users-shortcut"; button.type = "button";
    button.className = "secondary-button compact"; button.textContent = "Administração de usuários";
    host.insertBefore(button, $("#grcon-cloud-account"));
    document.body.insertAdjacentHTML("beforeend", `<dialog id="grcon-admin-dialog" aria-labelledby="grcon-admin-title">
      <header><div><small>ÁREA EXCLUSIVA</small><h2 id="grcon-admin-title">Administração de usuários</h2><p>Gerencie contas, funções e acessos por contrato.</p></div><button id="grcon-admin-close" type="button" aria-label="Voltar ao GRCON">Voltar ao GRCON</button></header>
      <div class="grcon-admin-toolbar"><label>Contrato<select id="grcon-admin-contract"></select></label><label>Buscar colaborador<input id="grcon-admin-search" type="search" placeholder="Nome ou e-mail"></label><button id="admin-user-new" type="button">Novo usuário</button></div>
      <p id="grcon-admin-feedback" role="status" aria-live="polite"></p>
      <div id="grcon-admin-users" aria-live="polite"></div>
      <section id="grcon-admin-editor" hidden><h3 id="grcon-admin-editor-title">Novo usuário</h3><form id="grcon-admin-user-form"><input id="admin-user-id" type="hidden"><div class="grcon-admin-grid"><label>Nome<input id="admin-user-name" required maxlength="160"></label><label>E-mail<input id="admin-user-email" type="email" required></label><label>Função<select id="admin-user-role"><option value="operator">Operador</option><option value="admin">Administrador</option><option value="owner">Proprietário</option></select></label><label><input id="admin-user-active" type="checkbox" checked> Acesso ativo</label></div><div class="egrdt-email-actions"><button type="submit">Salvar usuário</button><button id="admin-user-cancel" type="button">Cancelar</button></div><p id="admin-user-password" hidden></p></form></section>
      <details id="grcon-cloud-invitations-panel"><summary>Convites pendentes</summary><div id="grcon-cloud-invitations"></div></details>
      <details id="grcon-cloud-audit-panel"><summary>Registro de atividades</summary><div id="grcon-cloud-audit"></div></details>
      <details id="grcon-admin-contract-settings"><summary>Contratos e configurações</summary><form id="grcon-admin-contract-form"><input id="admin-contract-id" type="hidden"><div class="grcon-admin-grid"><label>Código<input id="admin-contract-code" required maxlength="60"></label><label>Nome<input id="admin-contract-name" required maxlength="160"></label><label>Identificação<input id="admin-contract-display" required maxlength="255"></label><label>Empresa<input id="admin-contract-company" maxlength="100"></label><label>Cliente<input id="admin-contract-client" maxlength="100"></label><label>Local<input id="admin-contract-site" maxlength="100"></label><label>Projeto<input id="admin-contract-project" maxlength="100"></label><label>Perfil de regras<input id="admin-contract-profile" maxlength="100"></label><label><input id="admin-contract-active" type="checkbox"> Contrato ativo</label><label><input id="admin-contract-inherit" type="checkbox"> Usar regras documentais da UHDT</label></div><div class="egrdt-email-actions"><button type="submit">Salvar contrato</button><button id="admin-contract-new" type="button">Novo contrato</button></div><small>Desativar preserva os dados e o histórico. Novos contratos começam com suas próprias configurações.</small></form></details>
    </dialog>`);
    button.addEventListener("click", () => void open());
    $("#grcon-admin-close").addEventListener("click", () => { if (!state.saving) $("#grcon-admin-dialog").close(); });
    $("#grcon-admin-dialog").addEventListener("cancel", event => { if (state.saving) event.preventDefault(); });
    $("#grcon-admin-dialog").addEventListener("close", event => { if (event.target !== $("#grcon-admin-dialog")) return; state.open = false; state.generation++; clearSecrets(); $("#grcon-admin-editor").hidden = true; });
    $("#grcon-admin-contract").addEventListener("change", () => { state.workspace = $("#grcon-admin-contract").value; renderContract(); void loadUsers(); });
    $("#grcon-admin-search").addEventListener("input", renderUsers);
    $("#grcon-admin-user-form").addEventListener("submit", saveUser);
    $("#admin-user-new").addEventListener("click", () => editUser(null));
    $("#admin-user-cancel").addEventListener("click", () => { clearSecrets(); $("#grcon-admin-editor").hidden = true; });
    $("#grcon-admin-contract-form").addEventListener("submit", saveContract);
    $("#admin-contract-new").addEventListener("click", () => renderContract(true));
    $("#grcon-cloud-invitations-panel").addEventListener("toggle", event => { if (event.target.open) void cloud().loadInvitations(state.workspace); });
    $("#grcon-cloud-audit-panel").addEventListener("toggle", event => { if (event.target.open) void cloud().loadAuditEvents(state.workspace); });
    $("#grcon-admin-users").addEventListener("click", event => {
      const edit = event.target.closest("[data-admin-edit]");
      const password = event.target.closest("[data-admin-password]");
      const user = state.users.find(u => u.id === (edit?.dataset.adminEdit || password?.dataset.adminPassword));
      if (!user || user.isMaster || !master() || state.saving) return;
      if (edit) editUser(user);
      if (password) cloud().openAdminPasswordModal({ userId: user.id, role: user.role, name: user.name, email: user.email, workspaceId: state.workspace, isMaster: user.isMaster }, password);
    });
  }

  function clearSecrets() {
    if ($("#admin-user-password")) { $("#admin-user-password").textContent = ""; $("#admin-user-password").hidden = true; }
  }
  function permissions() {
    // Nenhum atalho ou conteúdo de administração é montado para outros perfis.
    if (master()) { install(); return; }
    state.generation++; state.users = []; state.workspace = ""; state.open = false; state.editing = null;
    cloud()?.closeAdminPasswordModal?.({ force: true });
    $("#grcon-admin-dialog")?.close();
    $("#grcon-admin-dialog")?.remove();
    $("#grcon-users-shortcut")?.remove();
    $("#grcon-administration")?.remove();
  }
  function renderUsers() {
    if (!master() || !$("#grcon-admin-users")) return;
    const term = $("#grcon-admin-search").value.trim().toLocaleLowerCase("pt-BR");
    const users = state.users.filter(u => `${u.name} ${u.email}`.toLocaleLowerCase("pt-BR").includes(term));
    $("#grcon-admin-users").innerHTML = '<div class="grcon-admin-table-wrap"><table><thead><tr><th>Colaborador</th><th>E-mail</th><th>Função</th><th>Acesso</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>' + users.map(u => `<tr><td>${escape(u.name)}</td><td>${escape(u.email)}</td><td>${escape(u.isMaster ? "Proprietário master" : labels[u.role] || u.role)}</td><td>${u.active ? "Ativo" : "Inativo"}</td><td>${escape(u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("pt-BR") : "Sem acesso registrado")}</td><td>${u.isMaster ? '<span title="Conta protegida; função alterada somente diretamente no banco">Conta protegida</span>' : `<div class="grcon-admin-row-actions"><button type="button" data-admin-edit="${escape(u.id)}">Editar acesso</button><button type="button" data-admin-password="${escape(u.id)}">Alterar senha</button></div>`}</td></tr>`).join("") + '</tbody></table></div>' + (users.length ? '' : '<p>Nenhum colaborador encontrado.</p>');
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
      if ($("#grcon-cloud-audit-panel").open) void cloud().loadAuditEvents(workspace);
    } catch (error) { if (generation === state.generation && $("#grcon-admin-users")) $("#grcon-admin-users").textContent = error.message; }
  }
  async function open() {
    if (!await cloud()?.refreshMasterOwner?.()) { permissions(); return; }
    install(); state.open = true;
    $("#grcon-admin-contract").innerHTML = cloud().state.contracts.map(c => '<option value="' + escape(c.workspace_id) + '">' + escape(c.code) + (c.active ? "" : " · inativo") + '</option>').join("");
    state.workspace = cloud().state.membership.workspace_id;
    $("#grcon-admin-contract").value = state.workspace;
    $("#grcon-admin-search").value = ""; $("#grcon-admin-feedback").textContent = "";
    renderContract(); if (!$("#grcon-admin-dialog").open) $("#grcon-admin-dialog").showModal();
    await loadUsers();
  }
  async function saveContract(event) {
    event.preventDefault(); if (!master() || state.saving) return;
    const code = $("#admin-contract-code").value.trim().toUpperCase(), inherit = $("#admin-contract-inherit").checked;
    const input = { id: $("#admin-contract-id").value || null, code, slug: code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""), name: $("#admin-contract-name").value.trim(), displayName: $("#admin-contract-display").value.trim(), company: $("#admin-contract-company").value.trim(), client: $("#admin-contract-client").value.trim(), site: $("#admin-contract-site").value.trim(), project: $("#admin-contract-project").value.trim(), active: $("#admin-contract-active").checked, settings: { ...(state.editing?.settings || {}), ruleProfile: $("#admin-contract-profile").value.trim() || "UNCONFIGURED", inheritLegacyRules: inherit, enabledModules: { ...(state.editing?.settings?.enabledModules || {}), legacyUhdtRules: inherit } } };
    setSaving(true);
    try {
      const { error } = await cloud().state.client.rpc("grcon_contract_save", { input }); if (error) throw error;
      await cloud().refreshContracts(); notify("Contrato salvo.", "success"); await open();
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
  for (const event of ["grcon:cloud-ready", "grcon:cloud-signed-out", "grcon:permissions-changed"]) root.addEventListener(event, permissions);
  root.addEventListener("grcon:contract-context-changed", () => { $("#grcon-admin-dialog")?.close(); permissions(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", permissions, { once:true }); else permissions();
})(window);

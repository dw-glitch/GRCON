(function (root) {
  "use strict";
  const state = { users: [], editing: null, workspace: "", open: false };
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const cloud = () => root.GrconCloud;
  const normalizedRole = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const owner = () => Boolean(cloud()?.state?.session && cloud()?.state?.membership && cloud()?.state?.contracts?.some(c => ["owner", "proprietario"].includes(normalizedRole(c.role))));
  const manager = owner;
  const notify = (message, kind) => root.GrconNotify?.(message, kind || "info");
  async function usersApi(operation, input = {}) {
    if (!owner()) throw new Error("Acesso restrito ao proprietário.");
    const response = await cloud().state.client.functions.invoke("owner-manage-users", { body: { operation, workspaceId: state.workspace, ...input } });
    if (response.error) {
      const detail = await response.error.context?.json?.().catch(() => null);
      throw new Error(detail?.message || response.error.message || "Não foi possível administrar os usuários.");
    }
    return response.data;
  }
  function install() {
    if ($("#grcon-administration")) return;
    const host = $(".runtime-status") || $(".topbar");
    if (!host) return;
    const button = document.createElement("button"); button.id = "grcon-administration"; button.type = "button"; button.className = "secondary-button compact"; button.textContent = "Administração"; button.hidden = true; host.appendChild(button);
    document.body.insertAdjacentHTML("beforeend", '<dialog id="grcon-admin-dialog" aria-labelledby="grcon-admin-title"><header><h2 id="grcon-admin-title">Administração</h2><button id="grcon-admin-close" type="button" aria-label="Fechar administração">Fechar</button></header><label>Contrato<select id="grcon-admin-contract"></select></label><details id="grcon-admin-contract-settings"><summary>Contratos e configurações</summary><form id="grcon-admin-contract-form"><input id="admin-contract-id" type="hidden"><div class="grcon-admin-grid"><label>Código<input id="admin-contract-code" required maxlength="60"></label><label>Nome<input id="admin-contract-name" required maxlength="160"></label><label>Identificação<input id="admin-contract-display" required maxlength="255"></label><label>Empresa<input id="admin-contract-company" maxlength="100"></label><label>Cliente<input id="admin-contract-client" maxlength="100"></label><label>Local<input id="admin-contract-site" maxlength="100"></label><label>Projeto<input id="admin-contract-project" maxlength="100"></label><label>Perfil de regras<input id="admin-contract-profile" maxlength="100"></label><label><input id="admin-contract-active" type="checkbox"> Contrato ativo</label><label><input id="admin-contract-inherit" type="checkbox"> Usar regras documentais da UHDT</label></div><div class="egrdt-email-actions"><button type="submit">Salvar contrato</button><button id="admin-contract-new" type="button">Novo contrato</button></div><small>Desativar preserva os dados e o histórico. Novos contratos começam com suas próprias configurações.</small></form></details><section><h3>Usuários do contrato</h3><div id="grcon-admin-users" aria-live="polite"></div><form id="grcon-admin-user-form"><input id="admin-user-id" type="hidden"><div class="grcon-admin-grid"><label>Nome<input id="admin-user-name" required maxlength="160"></label><label>E-mail<input id="admin-user-email" type="email" required></label><label>Perfil<select id="admin-user-role"><option value="operator">Operador</option><option value="viewer">Consulta</option><option value="admin">Administrador</option></select></label><label><input id="admin-user-active" type="checkbox" checked> Acesso ativo</label></div><div class="egrdt-email-actions"><button type="submit">Salvar usuário</button><button id="admin-user-new" type="button">Novo usuário</button></div><p id="admin-user-password" hidden></p></form></section></dialog>');
    button.addEventListener("click", open);
    $("#grcon-admin-close").addEventListener("click", () => $("#grcon-admin-dialog").close());
    $("#grcon-admin-dialog").addEventListener("close", () => { state.open = false; $("#admin-user-password").textContent = ""; $("#admin-user-password").hidden = true; });
    $("#grcon-admin-contract").addEventListener("change", () => { state.workspace = $("#grcon-admin-contract").value; renderContract(); void loadUsers(); });
    $("#grcon-admin-contract-form").addEventListener("submit", saveContract);
    $("#grcon-admin-user-form").addEventListener("submit", saveUser);
    $("#admin-user-new").addEventListener("click", () => editUser(null));
    $("#admin-contract-new").addEventListener("click", () => renderContract(true));
    $("#grcon-admin-users").addEventListener("click", event => { const id = event.target.closest("[data-admin-edit]")?.dataset.adminEdit; if (id) editUser(state.users.find(u => u.id === id)); });
    permissions();
  }
  function permissions() {
    install();
    if (!$("#grcon-administration")) return;
    $("#grcon-administration").hidden = !owner();
    if (!owner()) {
      if ($("#grcon-admin-dialog").open) $("#grcon-admin-dialog").close();
      state.users = []; state.editing = null; state.workspace = "";
      $("#grcon-admin-users").textContent = "";
      $("#grcon-admin-user-form").reset();
    }
    $("#grcon-admin-contract-settings").hidden = !owner();
    $("#admin-user-new").hidden = !owner();
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
    $("#admin-user-password").hidden = true; $("#admin-user-password").textContent = "";
    $("#admin-user-id").value = user?.id || "";
    $("#admin-user-name").value = user?.name || "";
    $("#admin-user-email").value = user?.email || "";
    $("#admin-user-email").disabled = Boolean(user);
    $("#admin-user-role").value = user?.role || "operator";
    $("#admin-user-active").checked = user?.active !== false;
    $("#grcon-admin-user-form").hidden = !owner() && !user;
  }
  async function loadUsers() {
    const workspace = state.workspace;
    $("#grcon-admin-users").textContent = "Carregando usuários…";
    editUser(null);
    try {
      const data = await usersApi("list");
      if (workspace !== state.workspace || !owner()) return;
      state.users = data.users || [];
      $("#grcon-admin-users").innerHTML = '<div class="grcon-admin-table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Contrato</th><th>Status</th><th>Último acesso</th><th>Ação</th></tr></thead><tbody>' + state.users.map(u => '<tr><td>' + escape(u.name) + '</td><td>' + escape(u.email) + '</td><td>' + escape(u.role) + '</td><td>' + escape(data.contract?.code) + '</td><td>' + (u.active ? "Ativo" : "Inativo") + '</td><td>' + escape(u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("pt-BR") : "Sem acesso registrado") + '</td><td>' + (u.role === "owner" ? "Proprietário" : '<button type="button" data-admin-edit="' + escape(u.id) + '">Editar</button>') + '</td></tr>').join("") + '</tbody></table></div>';
    } catch (error) { $("#grcon-admin-users").textContent = error.message; }
  }
  function open() {
    if (!owner()) { notify("Acesso restrito ao proprietário.", "error"); return; }
    permissions(); state.open = true;
    $("#grcon-admin-contract").innerHTML = cloud().state.contracts.filter(c => owner() || c.workspace_id === cloud().state.membership.workspace_id).map(c => '<option value="' + escape(c.workspace_id) + '">' + escape(c.code) + (c.active ? "" : " · inativo") + '</option>').join("");
    state.workspace = cloud().state.membership.workspace_id;
    $("#grcon-admin-contract").value = state.workspace;
    renderContract(); void loadUsers(); $("#grcon-admin-dialog").showModal();
  }
  async function saveContract(event) {
    event.preventDefault(); if (!owner()) return;
    const code = $("#admin-contract-code").value.trim().toUpperCase();
    const inherit = $("#admin-contract-inherit").checked;
    const input = { id: $("#admin-contract-id").value || null, code, slug: code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""), name: $("#admin-contract-name").value.trim(), displayName: $("#admin-contract-display").value.trim(), company: $("#admin-contract-company").value.trim(), client: $("#admin-contract-client").value.trim(), site: $("#admin-contract-site").value.trim(), project: $("#admin-contract-project").value.trim(), active: $("#admin-contract-active").checked, settings: { ...(state.editing?.settings || {}), ruleProfile: $("#admin-contract-profile").value.trim() || "UNCONFIGURED", inheritLegacyRules: inherit, enabledModules: { ...(state.editing?.settings?.enabledModules || {}), legacyUhdtRules: inherit } } };
    try {
      const { error } = await cloud().state.client.rpc("grcon_contract_save", { input }); if (error) throw error;
      await cloud().refreshContracts();
      notify("Contrato salvo. O histórico foi preservado.", "success"); open();
    } catch (error) { notify(error.message, "error"); }
  }
  async function saveUser(event) {
    event.preventDefault(); if (!owner()) { notify("Acesso restrito ao proprietário.", "error"); return; }
    const id = $("#admin-user-id").value;
    if (!id && !owner()) return;
    const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const result = await usersApi(id ? "update" : "create", { userId: id || undefined, name: $("#admin-user-name").value.trim(), email: $("#admin-user-email").value.trim(), role: $("#admin-user-role").value, active: $("#admin-user-active").checked });
      await loadUsers();
      if (result.temporaryPassword) { $("#admin-user-password").textContent = "Senha temporária (copie agora): " + result.temporaryPassword; $("#admin-user-password").hidden = false; }
      notify(id ? "Acesso atualizado." : "Usuário criado e vinculado ao contrato.", "success");
    } catch (error) { notify(error.message, "error"); } finally { button.disabled = false; }
  }
  root.addEventListener("grcon:cloud-ready", permissions);
  root.addEventListener("grcon:cloud-signed-out", permissions);
  root.addEventListener("grcon:contract-context-changed", () => { if (state.open) $("#grcon-admin-dialog").close(); permissions(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true }); else install();
})(window);

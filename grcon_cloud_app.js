(function () {
  "use strict";

  const Config = window.GRCON_CLOUD_CONFIG || {};
  const History = window.GrconHistory;
  const roleLabels = Object.freeze({ owner: "Proprietário", admin: "Administrador", operator: "Operador", viewer: "Consulta" });
  const state = {
    client: null,
    session: null,
    membership: null,
    online: navigator.onLine,
    syncing: false,
    syncTimer: 0,
    realtime: null,
    activationKey: "",
    profiles: new Map(),
    passwordRecovery: false,
    passwordView: "login",
  };

  const $ = (selector, context) => (context || document).querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function notify(message, kind) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind || "info");
  }

  function cleanRedirectUrl() {
    if (!/^https?:$/.test(location.protocol)) return "";
    return `${location.origin}${location.pathname}`;
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  function removeStored(key) {
    try { localStorage.removeItem(key); } catch (_) { /* armazenamento opcional */ }
  }

  function isEmailRateLimit(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    return Number(error?.status) === 429
      || code.includes("email_send_rate_limit")
      || code.includes("rate_limit")
      || message.includes("email rate limit")
      || message.includes("rate limit exceeded");
  }

  function passwordProblem(password) {
    const value = String(password || "");
    if (value.length < 12) return "Use pelo menos 12 caracteres.";
    if (!/[a-z]/.test(value)) return "Inclua pelo menos uma letra minúscula.";
    if (!/[A-Z]/.test(value)) return "Inclua pelo menos uma letra maiúscula.";
    if (!/\d/.test(value)) return "Inclua pelo menos um número.";
    if (!/[^A-Za-z0-9]/.test(value)) return "Inclua pelo menos um símbolo.";
    return "";
  }

  function createSurface() {
    const surface = document.createElement("section");
    surface.id = "grcon-cloud-auth";
    surface.className = "grcon-cloud-auth";
    surface.setAttribute("aria-live", "polite");
    surface.innerHTML = `
      <div class="grcon-cloud-auth-card">
        <img alt="GRCON — Controle de GRDT" src="grcon-logo-app.png"/>
        <span class="grcon-cloud-eyebrow">GRCON COMPARTILHADO</span>
        <div id="grcon-cloud-login-view">
          <h1>Acesse o controle de GRDT</h1>
          <p>Entre com o e-mail corporativo autorizado e sua senha. O GRCON reconhece a conta existente no Supabase e mantém a sessão neste navegador.</p>
          <form id="grcon-cloud-login-form">
            <label for="grcon-cloud-email"><span>E-mail</span><input id="grcon-cloud-email" autocomplete="username" inputmode="email" required type="email" placeholder="nome@empresa.com"/></label>
            <label for="grcon-cloud-password"><span>Senha</span><span class="grcon-cloud-password-field"><input id="grcon-cloud-password" autocomplete="current-password" minlength="8" required type="password"/><button aria-label="Mostrar senha" class="grcon-cloud-password-toggle" data-password-target="grcon-cloud-password" type="button">Mostrar</button></span></label>
            <button class="primary-button" type="submit">Entrar</button>
            <button class="grcon-cloud-link-button" id="grcon-cloud-forgot-password" type="button">Esqueci minha senha</button>
          </form>
        </div>
        <div hidden id="grcon-cloud-password-view">
          <h1 id="grcon-cloud-password-title">Defina sua nova senha</h1>
          <p id="grcon-cloud-password-description">Crie uma senha forte para continuar usando sua conta.</p>
          <form id="grcon-cloud-password-form">
            <label for="grcon-cloud-new-password"><span>Nova senha</span><span class="grcon-cloud-password-field"><input id="grcon-cloud-new-password" autocomplete="new-password" minlength="12" required type="password"/><button aria-label="Mostrar nova senha" class="grcon-cloud-password-toggle" data-password-target="grcon-cloud-new-password" type="button">Mostrar</button></span></label>
            <label for="grcon-cloud-confirm-password"><span>Confirmar nova senha</span><input id="grcon-cloud-confirm-password" autocomplete="new-password" minlength="12" required type="password"/></label>
            <small class="grcon-cloud-password-rule">Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.</small>
            <button class="primary-button" type="submit">Salvar nova senha</button>
            <button class="secondary-button compact" id="grcon-cloud-password-cancel" type="button">Cancelar</button>
          </form>
        </div>
        <p class="grcon-cloud-auth-message" id="grcon-cloud-auth-message">Acesso disponível somente para usuários autorizados.</p>
        <button class="secondary-button compact" hidden id="grcon-cloud-auth-signout" type="button">Sair e usar outra conta</button>
        <small>Os documentos, PDFs e planilhas permanecem neste navegador. Somente o histórico operacional é compartilhado.</small>
      </div>`;
    document.body.appendChild(surface);

    $("#grcon-cloud-login-form", surface).addEventListener("submit", signInWithPassword);
    $("#grcon-cloud-password-form", surface).addEventListener("submit", saveNewPassword);
    $("#grcon-cloud-forgot-password", surface).addEventListener("click", requestPasswordRecovery);
    $("#grcon-cloud-password-cancel", surface).addEventListener("click", cancelPasswordChange);
    $("#grcon-cloud-auth-signout", surface).addEventListener("click", signOut);
    surface.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => togglePasswordVisibility(button));
    });
    return surface;
  }

  function togglePasswordVisibility(button) {
    const input = document.getElementById(button.dataset.passwordTarget || "");
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Mostrar" : "Ocultar";
    button.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  }

  function authMessage(message, tone) {
    const target = $("#grcon-cloud-auth-message");
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = tone || "info";
  }

  function lockApp() {
    document.documentElement.classList.add("grcon-cloud-pending");
    $("#grcon-cloud-auth")?.removeAttribute("hidden");
  }

  function unlockApp() {
    document.documentElement.classList.remove("grcon-cloud-pending");
    $("#grcon-cloud-auth")?.setAttribute("hidden", "");
  }

  function setAuthView(view, options) {
    const passwordMode = view === "password";
    state.passwordView = passwordMode ? "password" : "login";
    const loginView = $("#grcon-cloud-login-view");
    const passwordView = $("#grcon-cloud-password-view");
    if (loginView) loginView.hidden = passwordMode;
    if (passwordView) passwordView.hidden = !passwordMode;
    if (passwordMode) {
      const title = $("#grcon-cloud-password-title");
      const description = $("#grcon-cloud-password-description");
      if (title) title.textContent = options?.title || "Defina sua nova senha";
      if (description) description.textContent = options?.description || "Crie uma senha forte para continuar usando sua conta.";
      $("#grcon-cloud-new-password")?.focus();
    } else {
      $("#grcon-cloud-password")?.focus();
    }
  }

  function setFormBusy(form, busy, busyText, idleText) {
    if (!form) return;
    form.dataset.busy = busy ? "true" : "false";
    [...form.elements].forEach((control) => { control.disabled = Boolean(busy); });
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = busy ? busyText : idleText;
  }

  function friendlyLoginError(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
      return "Este e-mail ainda não foi confirmado no Supabase.";
    }
    if (code.includes("invalid_credentials") || message.includes("invalid login credentials")) {
      return "E-mail ou senha inválidos. Confirme os dados ou use “Esqueci minha senha”.";
    }
    if (code.includes("weak_password")) return "A senha não atende aos requisitos de segurança do projeto.";
    return error?.message || "Não foi possível entrar agora.";
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    if (!state.client) return;
    const form = event.currentTarget;
    const email = String($("#grcon-cloud-email")?.value || "").trim().toLowerCase();
    const password = String($("#grcon-cloud-password")?.value || "");
    if (!email || !password) return;

    setFormBusy(form, true, "Entrando…", "Entrar");
    authMessage("Validando sua conta e sua senha…", "info");
    try {
      const { data: currentData } = await state.client.auth.getSession();
      const current = currentData?.session;
      if (current?.user) {
        const currentEmail = String(current.user.email || "").trim().toLowerCase();
        if (currentEmail === email) {
          authMessage("Sessão já encontrada neste navegador. Confirmando sua autorização…", "success");
          await activateSession(current);
          return;
        }
        await state.client.auth.signOut({ scope: "local" });
      }

      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error("O Supabase não retornou uma sessão válida.");
      $("#grcon-cloud-password").value = "";
      authMessage("Login concluído. Confirmando sua autorização no GRCON…", "success");
      await activateSession(data.session);
    } catch (error) {
      authMessage(friendlyLoginError(error), "error");
    } finally {
      setFormBusy(form, false, "Entrando…", "Entrar");
    }
  }

  async function requestPasswordRecovery() {
    if (!state.client) return;
    const email = String($("#grcon-cloud-email")?.value || "").trim().toLowerCase();
    const redirectTo = cleanRedirectUrl();
    if (!email) {
      authMessage("Informe seu e-mail antes de solicitar a recuperação.", "error");
      $("#grcon-cloud-email")?.focus();
      return;
    }
    if (!redirectTo) {
      authMessage("Abra o GRCON pelo link publicado para recuperar a senha.", "error");
      return;
    }
    const button = $("#grcon-cloud-forgot-password");
    if (button) button.disabled = true;
    authMessage("Solicitando a recuperação de senha…", "info");
    try {
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      authMessage("Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha. Solicite apenas uma vez.", "success");
    } catch (error) {
      authMessage(isEmailRateLimit(error)
        ? "O limite temporário de e-mails do Supabase foi atingido. O login normal por senha continua funcionando; tente a recuperação mais tarde."
        : (error?.message || "Não foi possível solicitar a recuperação de senha."), "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function openPasswordChange(options) {
    state.passwordRecovery = Boolean(options?.recovery);
    lockApp();
    setAuthView("password", {
      title: state.passwordRecovery ? "Crie uma nova senha" : "Alterar minha senha",
      description: state.passwordRecovery
        ? "O link de recuperação foi validado. Agora defina a nova senha da sua conta."
        : "Defina uma nova senha para sua conta do GRCON.",
    });
    authMessage(state.passwordRecovery
      ? "Escolha uma senha forte para concluir a recuperação."
      : "Sua sessão atual será mantida depois da alteração.", "info");
  }

  async function saveNewPassword(event) {
    event.preventDefault();
    if (!state.client) return;
    const form = event.currentTarget;
    const password = String($("#grcon-cloud-new-password")?.value || "");
    const confirmation = String($("#grcon-cloud-confirm-password")?.value || "");
    const problem = passwordProblem(password);
    if (problem) {
      authMessage(problem, "error");
      return;
    }
    if (password !== confirmation) {
      authMessage("As duas senhas não são iguais.", "error");
      return;
    }

    setFormBusy(form, true, "Salvando…", "Salvar nova senha");
    authMessage("Atualizando sua senha com segurança…", "info");
    try {
      const { data, error } = await state.client.auth.updateUser({ password });
      if (error) throw error;
      $("#grcon-cloud-new-password").value = "";
      $("#grcon-cloud-confirm-password").value = "";
      state.passwordRecovery = false;
      const { data: sessionData } = await state.client.auth.getSession();
      const session = sessionData?.session || state.session;
      authMessage("Senha atualizada com sucesso.", "success");
      if (session?.user) await activateSession(session);
      else showLogin();
    } catch (error) {
      authMessage(error?.message || "Não foi possível atualizar a senha.", "error");
    } finally {
      setFormBusy(form, false, "Salvando…", "Salvar nova senha");
    }
  }

  function cancelPasswordChange() {
    if (state.passwordRecovery && !state.membership) {
      signOut();
      return;
    }
    state.passwordRecovery = false;
    setAuthView("login");
    if (state.session?.user && state.membership) unlockApp();
    else showLogin();
  }

  function cachedMembershipFor(userId) {
    const cached = readJson(Config.membershipStorageKey, null);
    return cached && cached.userId === userId ? cached : null;
  }

  function storeMembership(membership) {
    if (!state.session?.user || !membership) return;
    writeJson(Config.membershipStorageKey, {
      userId: state.session.user.id,
      workspaceId: membership.workspace_id,
      workspaceName: membership.workspace_name,
      role: membership.role,
      email: state.session.user.email || "",
      cachedAt: new Date().toISOString(),
    });
  }

  function normalizeMembership(value) {
    if (!value) return null;
    return {
      workspace_id: value.workspace_id || value.workspaceId,
      workspace_name: value.workspace_name || value.workspaceName || "GRCON Compartilhado",
      role: value.role || "viewer",
    };
  }

  async function acceptMembership() {
    try {
      const { data, error } = await state.client.rpc("grcon_accept_my_invitation");
      if (error) throw error;
      const membership = normalizeMembership(Array.isArray(data) ? data[0] : data);
      if (membership?.workspace_id) return membership;
      return null;
    } catch (error) {
      const cached = cachedMembershipFor(state.session?.user?.id);
      if (!state.online && cached) return normalizeMembership(cached);
      throw error;
    }
  }

  function canWriteHistory() {
    return ["owner", "admin", "operator"].includes(state.membership?.role);
  }

  function canManageHistory() {
    return ["owner", "admin"].includes(state.membership?.role);
  }

  function updateHistoryCopy() {
    const eyebrow = $("#history-module .history-heading > div > span");
    const paragraph = $("#history-module .history-heading p");
    const storage = $("#analysis-history-storage");
    if (eyebrow) eyebrow.textContent = "HISTÓRICO COMPARTILHADO";
    if (paragraph) paragraph.textContent = "Consulte as eGRDTs geradas pelos usuários autorizados e confira documentos, revisões e alocações.";
    if (storage) storage.textContent = "Histórico local com sincronização segura entre usuários do GRCON.";
    const clear = $("#history-clear");
    if (clear) {
      clear.hidden = true;
      clear.title = "A exclusão em massa foi desativada no histórico compartilhado.";
    }
  }

  function createAccountMenu() {
    if ($("#grcon-cloud-account")) return;
    const host = $(".runtime-status");
    if (!host) return;
    const container = document.createElement("div");
    container.className = "grcon-cloud-account";
    container.id = "grcon-cloud-account";
    container.innerHTML = `
      <button aria-expanded="false" class="grcon-cloud-account-button" id="grcon-cloud-account-button" type="button">
        <span class="grcon-cloud-account-dot"></span>
        <span><strong id="grcon-cloud-account-name">Usuário</strong><small id="grcon-cloud-account-role">Sincronizando</small></span>
        <svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>
      </button>
      <section class="grcon-cloud-account-menu" hidden id="grcon-cloud-account-menu">
        <header><strong id="grcon-cloud-menu-workspace">GRCON Compartilhado</strong><span id="grcon-cloud-menu-email"></span></header>
        <div class="grcon-cloud-sync-line"><i></i><span id="grcon-cloud-sync-label">Histórico sincronizado</span></div>
        <div class="grcon-cloud-invite" hidden id="grcon-cloud-invite">
          <h3>Convidar usuário</h3>
          <form id="grcon-cloud-invite-form">
            <input aria-label="E-mail do usuário" autocomplete="email" id="grcon-cloud-invite-email" placeholder="nome@empresa.com" required type="email"/>
            <select aria-label="Perfil" id="grcon-cloud-invite-role"><option value="operator">Operador</option><option value="viewer">Consulta</option><option value="admin">Administrador</option></select>
            <button class="primary-button compact" type="submit">Autorizar</button>
          </form>
          <small>Autorize somente contas existentes no Supabase Auth. O usuário entra pelo mesmo link com e-mail e senha.</small>
        </div>
        <div class="grcon-cloud-members" id="grcon-cloud-members"></div>
        <footer><button class="secondary-button compact" id="grcon-cloud-change-password" type="button">Alterar senha</button><button class="secondary-button compact" id="grcon-cloud-copy-link" type="button">Copiar link</button><button class="secondary-button compact" id="grcon-cloud-signout" type="button">Sair</button></footer>
      </section>`;
    host.appendChild(container);

    $("#grcon-cloud-account-button").addEventListener("click", toggleAccountMenu);
    $("#grcon-cloud-signout").addEventListener("click", signOut);
    $("#grcon-cloud-copy-link").addEventListener("click", copyAppLink);
    $("#grcon-cloud-change-password").addEventListener("click", () => { closeAccountMenu(); openPasswordChange({ recovery: false }); });
    $("#grcon-cloud-invite-form").addEventListener("submit", inviteUser);
    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) closeAccountMenu();
    });
  }

  function updateAccountMenu() {
    createAccountMenu();
    const email = state.session?.user?.email || "Usuário";
    const name = state.profiles.get(state.session?.user?.id)?.display_name || email.split("@")[0];
    $("#grcon-cloud-account-name").textContent = name;
    $("#grcon-cloud-account-role").textContent = `${roleLabels[state.membership?.role] || "Usuário"} · ${state.online ? "online" : "offline"}`;
    $("#grcon-cloud-menu-workspace").textContent = state.membership?.workspace_name || "GRCON Compartilhado";
    $("#grcon-cloud-menu-email").textContent = email;
    $("#grcon-cloud-invite").hidden = !canManageHistory();
    document.body.dataset.grconCloudRole = state.membership?.role || "viewer";
    setSyncLabel(state.online ? "Histórico sincronizado" : "Offline · alterações ficam neste navegador", state.online ? "success" : "warn");
  }

  function toggleAccountMenu() {
    const menu = $("#grcon-cloud-account-menu");
    const button = $("#grcon-cloud-account-button");
    if (!menu || !button) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    if (opening) loadMembers();
  }

  function closeAccountMenu() {
    const menu = $("#grcon-cloud-account-menu");
    const button = $("#grcon-cloud-account-button");
    if (menu) menu.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }

  function setSyncLabel(label, tone) {
    const target = $("#grcon-cloud-sync-label");
    const line = target?.parentElement;
    if (target) target.textContent = label;
    if (line) line.dataset.tone = tone || "info";
  }

  async function copyAppLink() {
    const link = cleanRedirectUrl();
    try {
      await navigator.clipboard.writeText(link);
      notify("Link do GRCON copiado.", "success");
    } catch (_) {
      window.prompt("Copie o link do GRCON:", link);
    }
  }

  async function inviteUser(event) {
    event.preventDefault();
    const emailInput = $("#grcon-cloud-invite-email");
    const roleInput = $("#grcon-cloud-invite-role");
    const button = $("#grcon-cloud-invite-form button");
    const email = String(emailInput?.value || "").trim().toLowerCase();
    const role = String(roleInput?.value || "operator");
    if (!email || !canManageHistory()) return;
    if (button) button.disabled = true;
    try {
      const { error } = await state.client.rpc("grcon_invite_user", { target_email: email, target_role: role });
      if (error) throw error;
      emailInput.value = "";
      notify(`${email} foi autorizado. Confirme que a conta existe no Supabase Auth e possui uma senha definida.`, "success");
      await loadMembers();
    } catch (error) {
      notify(error?.message || "Não foi possível autorizar o usuário.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadMembers() {
    const target = $("#grcon-cloud-members");
    if (!target || !state.membership?.workspace_id) return;
    target.innerHTML = "<small>Atualizando usuários…</small>";
    try {
      const { data: memberships, error } = await state.client.from("grcon_memberships")
        .select("user_id, role, active, joined_at")
        .eq("workspace_id", state.membership.workspace_id)
        .eq("active", true)
        .order("joined_at");
      if (error) throw error;
      const ids = [...new Set((memberships || []).map((item) => item.user_id))];
      let profiles = [];
      if (ids.length) {
        const response = await state.client.from("grcon_profiles").select("id, email, display_name").in("id", ids);
        if (response.error) throw response.error;
        profiles = response.data || [];
      }
      profiles.forEach((profile) => state.profiles.set(profile.id, profile));
      updateAccountMenu();
      target.innerHTML = (memberships || []).map((membership) => {
        const profile = state.profiles.get(membership.user_id) || {};
        return `<div><span><strong>${escapeHtml(profile.display_name || profile.email || "Usuário")}</strong><small>${escapeHtml(profile.email || "")}</small></span><b>${escapeHtml(roleLabels[membership.role] || membership.role)}</b></div>`;
      }).join("") || "<small>Nenhum usuário ativo.</small>";
    } catch (error) {
      target.innerHTML = `<small>${escapeHtml(error?.message || "Usuários indisponíveis.")}</small>`;
    }
  }

  function cloudPayload(record) {
    const payload = { ...record };
    ["cloudId", "workspaceId", "createdBy", "createdByEmail", "createdByName", "syncedAt"].forEach((key) => delete payload[key]);
    return payload;
  }

  function rowForRecord(record) {
    return {
      workspace_id: state.membership.workspace_id,
      client_record_id: String(record.id || `${record.egrdtNumber}|${record.generatedAt}`),
      egrdt_number: String(record.egrdtNumber || ""),
      generated_at: record.generatedAt,
      output_type: record.outputType || "eGRDT final",
      document_count: Number(record.documentCount || 0),
      file_count: Number(record.fileCount || 0),
      allocations: Array.isArray(record.allocations) ? record.allocations : [],
      payload: cloudPayload(record),
      updated_by: state.session.user.id,
    };
  }

  function matchesPreviousNumber(record, row) {
    const localNumbers = new Set([record.egrdtNumber, ...(record.numberHistory || [])].map((value) => String(value || "").toUpperCase()));
    const cloudNumbers = [row.egrdt_number, ...((row.payload && row.payload.numberHistory) || [])].map((value) => String(value || "").toUpperCase());
    return cloudNumbers.some((value) => localNumbers.has(value))
      && String(row.generated_at || "") === String(record.generatedAt || "")
      && String(row.output_type || "") === String(record.outputType || "");
  }

  async function pushLocalHistory(records) {
    if (!state.online || !canWriteHistory() || state.syncing || !records?.length) return;
    state.syncing = true;
    setSyncLabel("Enviando alterações…", "info");
    try {
      const response = await state.client.from("grcon_history")
        .select("id, client_record_id, egrdt_number, generated_at, output_type, payload")
        .eq("workspace_id", state.membership.workspace_id);
      if (response.error) throw response.error;
      const existing = response.data || [];
      const updates = [];
      const inserts = [];
      for (const record of records) {
        const row = rowForRecord(record);
        const own = existing.find((item) => item.client_record_id === row.client_record_id)
          || existing.find((item) => matchesPreviousNumber(record, item));
        if (own) updates.push({ ...row, id: own.id });
        else inserts.push(row);
      }
      for (let index = 0; index < updates.length; index += 50) {
        const result = await state.client.from("grcon_history").upsert(updates.slice(index, index + 50));
        if (result.error) throw result.error;
      }
      for (let index = 0; index < inserts.length; index += 50) {
        const result = await state.client.from("grcon_history").upsert(inserts.slice(index, index + 50), { onConflict: "workspace_id,client_record_id" });
        if (result.error) throw result.error;
      }
      setSyncLabel("Histórico sincronizado", "success");
    } catch (error) {
      console.warn("GRCON Cloud: histórico aguardando sincronização", error);
      setSyncLabel("Sincronização pendente", "warn");
    } finally {
      state.syncing = false;
    }
  }

  async function pullCloudHistory() {
    if (!state.online || !state.membership?.workspace_id || !History || state.syncing) return;
    state.syncing = true;
    setSyncLabel("Atualizando histórico…", "info");
    try {
      const response = await state.client.from("grcon_history")
        .select("id, client_record_id, egrdt_number, generated_at, output_type, payload, created_by, updated_at")
        .eq("workspace_id", state.membership.workspace_id)
        .order("generated_at", { ascending: false })
        .limit(1000);
      if (response.error) throw response.error;
      const rows = response.data || [];
      const creatorIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))];
      if (creatorIds.length) {
        const profiles = await state.client.from("grcon_profiles").select("id, email, display_name").in("id", creatorIds);
        if (!profiles.error) (profiles.data || []).forEach((profile) => state.profiles.set(profile.id, profile));
      }
      const records = rows.map((row) => {
        const profile = state.profiles.get(row.created_by) || {};
        return History.cleanRecord({
          ...(row.payload || {}),
          id: row.client_record_id,
          egrdtNumber: row.egrdt_number,
          generatedAt: row.generated_at,
          outputType: row.output_type,
          cloudId: row.id,
          workspaceId: state.membership.workspace_id,
          createdBy: row.created_by,
          createdByEmail: profile.email || "",
          createdByName: profile.display_name || "",
          syncedAt: row.updated_at,
        });
      });
      if (records.length) History.saveMany(records);
      window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { cloudPull: true, records } }));
      setSyncLabel("Histórico sincronizado", "success");
      updateAccountMenu();
    } catch (error) {
      console.warn("GRCON Cloud: leitura compartilhada indisponível", error);
      setSyncLabel("Usando histórico deste navegador", "warn");
    } finally {
      state.syncing = false;
    }
  }

  function scheduleSync(records) {
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(async () => {
      await flushDeleteQueue();
      await pushLocalHistory(records?.length ? records : History?.read?.() || []);
      await pullCloudHistory();
    }, 500);
  }

  function enqueueDelete(recordId) {
    if (!recordId || !canManageHistory()) return;
    const queue = readJson(Config.deleteQueueStorageKey, []);
    if (!queue.includes(recordId)) queue.push(recordId);
    writeJson(Config.deleteQueueStorageKey, queue);
  }

  async function flushDeleteQueue() {
    if (!state.online || !canManageHistory()) return;
    const queue = readJson(Config.deleteQueueStorageKey, []);
    if (!queue.length) return;
    const remaining = [];
    for (const recordId of queue) {
      const result = await state.client.from("grcon_history").delete()
        .eq("workspace_id", state.membership.workspace_id)
        .eq("client_record_id", recordId);
      if (result.error) remaining.push(recordId);
    }
    writeJson(Config.deleteQueueStorageKey, remaining);
  }

  function subscribeRealtime() {
    if (!state.online || !state.client || !state.membership?.workspace_id) return;
    if (state.realtime) state.client.removeChannel(state.realtime);
    let timer = 0;
    state.realtime = state.client.channel(`grcon-history-${state.membership.workspace_id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "grcon_history",
        filter: `workspace_id=eq.${state.membership.workspace_id}`,
      }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(pullCloudHistory, 450);
      })
      .subscribe();
  }

  async function activateSession(session) {
    if (!session?.user) return showLogin();
    const key = `${session.user.id}|${session.access_token?.slice(-12) || "session"}`;
    if (state.activationKey === key && state.membership) return;
    state.activationKey = key;
    state.session = session;
    lockApp();
    authMessage("Confirmando sua autorização…", "info");
    try {
      const membership = await acceptMembership();
      if (!membership) {
        authMessage(`O e-mail ${session.user.email || "informado"} ainda não foi autorizado. Peça a um administrador do GRCON para adicioná-lo.`, "error");
        $("#grcon-cloud-auth-signout").hidden = false;
        return;
      }
      state.membership = membership;
      storeMembership(membership);
      updateHistoryCopy();
      createAccountMenu();
      unlockApp();
      updateAccountMenu();
      await loadMembers();
      if (state.online) {
        await pushLocalHistory(History?.read?.() || []);
        await pullCloudHistory();
        await flushDeleteQueue();
        subscribeRealtime();
      }
      window.dispatchEvent(new CustomEvent("grcon:cloud-ready", { detail: { membership } }));
    } catch (error) {
      const cached = cachedMembershipFor(session.user.id);
      if (!state.online && cached) {
        state.membership = normalizeMembership(cached);
        updateHistoryCopy();
        unlockApp();
        updateAccountMenu();
        return;
      }
      console.error("GRCON Cloud: falha ao confirmar acesso", error);
      authMessage(error?.message || "Não foi possível confirmar seu acesso agora.", "error");
      $("#grcon-cloud-auth-signout").hidden = false;
    }
  }

  function showLogin() {
    state.session = null;
    state.membership = null;
    state.activationKey = "";
    state.passwordRecovery = false;
    lockApp();
    setAuthView("login");
    $("#grcon-cloud-auth-signout")?.setAttribute("hidden", "");
    authMessage("Acesso disponível somente para usuários autorizados.", "info");
  }

  async function signOut() {
    try { await state.client?.auth?.signOut({ scope: "local" }); } catch (_) { /* sessão local será removida abaixo */ }
    removeStored(Config.membershipStorageKey);
    if (state.realtime) state.client?.removeChannel?.(state.realtime);
    $("#grcon-cloud-account")?.remove();
    showLogin();
  }

  function bindHistoryEvents() {
    window.addEventListener("grcon:history-updated", (event) => {
      const detail = event.detail || {};
      if (detail.cloudPull) return;
      if (detail.deleted && detail.recordId) enqueueDelete(detail.recordId);
      scheduleSync(detail.records || History?.read?.() || []);
    });
  }

  function bindNetworkEvents() {
    window.addEventListener("online", () => {
      state.online = true;
      updateAccountMenu();
      if (state.membership) {
        subscribeRealtime();
        scheduleSync(History?.read?.() || []);
      }
    });
    window.addEventListener("offline", () => {
      state.online = false;
      updateAccountMenu();
      setSyncLabel("Offline · alterações ficam neste navegador", "warn");
    });
  }

  async function init() {
    createSurface();
    lockApp();
    updateHistoryCopy();
    bindHistoryEvents();
    bindNetworkEvents();

    if (!Config.enabled) {
      authMessage("A integração compartilhada não está configurada.", "error");
      return;
    }
    if (!window.supabase?.createClient) {
      authMessage("O módulo seguro de acesso não pôde ser carregado.", "error");
      return;
    }
    if (!/^https?:$/.test(location.protocol)) {
      authMessage("Abra o GRCON pelo link publicado. O modo compartilhado não funciona abrindo o arquivo index.html diretamente.", "error");
      return;
    }

    state.client = window.supabase.createClient(Config.projectUrl, Config.publishableKey, {
      auth: {
        storageKey: Config.authStorageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });

    state.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") showLogin();
      if (event === "PASSWORD_RECOVERY" && session) {
        state.session = session;
        window.setTimeout(() => openPasswordChange({ recovery: true }), 0);
        return;
      }
      if (session && ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        window.setTimeout(() => activateSession(session), 0);
      }
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) console.warn("GRCON Cloud: sessão indisponível", error);
    if (data?.session) await activateSession(data.session);
    else showLogin();
  }

  window.GrconCloud = {
    state,
    init,
    pull: pullCloudHistory,
    sync: () => scheduleSync(History?.read?.() || []),
    canWriteHistory,
    canManageHistory,
    inviteUser,
  };

  init();
})();

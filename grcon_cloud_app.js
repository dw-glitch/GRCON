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
    syncQueued: false,
    syncTimer: 0,
    realtime: null,
    activationKey: "",
    profiles: new Map(),
    passwordRecovery: false,
    passwordView: "login",
    clearingHistory: false,
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
        <button class="primary-button compact" hidden id="grcon-cloud-auth-retry" type="button">Tentar confirmar novamente</button>
        <button class="secondary-button compact" hidden id="grcon-cloud-auth-signout" type="button">Sair e usar outra conta</button>
        <small>Os documentos, PDFs e planilhas permanecem neste navegador. Somente o histórico operacional é compartilhado.</small>
      </div>`;
    document.body.appendChild(surface);

    $("#grcon-cloud-login-form", surface).addEventListener("submit", signInWithPassword);
    $("#grcon-cloud-password-form", surface).addEventListener("submit", saveNewPassword);
    $("#grcon-cloud-forgot-password", surface).addEventListener("click", requestPasswordRecovery);
    $("#grcon-cloud-password-cancel", surface).addEventListener("click", cancelPasswordChange);
    $("#grcon-cloud-auth-signout", surface).addEventListener("click", signOut);
    $("#grcon-cloud-auth-retry", surface).addEventListener("click", retryActivation);
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
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data, error } = await state.client.rpc("grcon_accept_my_invitation");
        if (error) throw error;
        const membership = normalizeMembership(Array.isArray(data) ? data[0] : data);
        if (membership?.workspace_id) return membership;
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
      } catch (error) {
        lastError = error;
        if (attempt < 2 && state.online) {
          await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
    const cached = cachedMembershipFor(state.session?.user?.id);
    if (!state.online && cached) return normalizeMembership(cached);
    if (lastError) throw lastError;
    return null;
  }

  async function retryActivation() {
    const button = $("#grcon-cloud-auth-retry");
    if (button) button.disabled = true;
    authMessage("Verificando novamente o convite e o vínculo do usuário…", "info");
    try {
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (!data?.session) return showLogin();
      state.activationKey = "";
      await activateSession(data.session);
    } catch (error) {
      authMessage(error?.message || "A confirmação continua indisponível. Verifique a conexão e tente novamente.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function canWriteHistory() {
    return ["owner", "admin", "operator"].includes(state.membership?.role);
  }

  function canManageHistory() {
    return ["owner", "admin"].includes(state.membership?.role);
  }

  function newReservationRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto?.getRandomValues?.(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function reservationRequestFor(year, count, requested) {
    const key = Config.reservationRequestStorageKey || "grcon.cloud.reservation.request.v1";
    const fingerprint = JSON.stringify({
      workspaceId: state.membership?.workspace_id || "",
      userId: state.session?.user?.id || "",
      year,
      count,
      requested: requested || [],
    });
    const current = readJson(key, null);
    const age = Date.now() - Number(current?.createdAt || 0);
    if (current?.requestId && current.fingerprint === fingerprint && age >= 0 && age < 86400000) {
      return current.requestId;
    }
    const requestId = newReservationRequestId();
    writeJson(key, { requestId, fingerprint, createdAt: Date.now() });
    return requestId;
  }

  function completeEgrdtReservationRequest(generated) {
    const requestIds = new Set((generated || [])
      .map((file) => String(file?.official?.requestId || ""))
      .filter(Boolean));
    if (!requestIds.size) return false;
    const key = Config.reservationRequestStorageKey || "grcon.cloud.reservation.request.v1";
    const current = readJson(key, null);
    if (!current?.requestId || !requestIds.has(String(current.requestId))) return false;
    removeStored(key);
    return true;
  }

  async function reserveEgrdtSequences(year, amount, requestedSequences) {
    if (!state.membership?.workspace_id) return null;
    if (!canWriteHistory()) throw new Error("Seu perfil não pode reservar números de eGRDT.");
    if (!state.online) throw new Error("Reconecte o GRCON para reservar a numeração oficial antes de gerar os arquivos.");
    const count = Math.max(1, Math.trunc(Number(amount) || 1));
    const requested = Array.isArray(requestedSequences) && requestedSequences.length
      ? requestedSequences.map((value) => Math.trunc(Number(value)))
      : null;
    const normalizedYear = Math.trunc(Number(year));
    const requestId = reservationRequestFor(normalizedYear, count, requested);
    const { data, error } = await state.client.rpc("grcon_reserve_egrdt_numbers", {
      target_workspace: state.membership.workspace_id,
      target_year: normalizedYear,
      amount: count,
      requested_sequences: requested,
      target_request_id: requestId,
    });
    if (error) {
      const message = String(error.message || "");
      if (/já (?:está )?reservad|already|duplicate|unique/i.test(message)) {
        throw new Error("Um dos números informados já foi reservado por outro usuário. Atualize a sequência e tente novamente.");
      }
      throw new Error(message || "Não foi possível reservar a numeração oficial no histórico compartilhado.");
    }
    const rows = Array.isArray(data) ? data : [];
    if (rows.length !== count) throw new Error("O servidor não confirmou todas as numerações solicitadas.");
    return rows.map((row) => ({
      sequence: Number(row.reserved_sequence),
      sequenceText: String(Number(row.reserved_sequence)).padStart(4, "0"),
      year: Number(row.reserved_year),
      baseName: String(row.base_name || ""),
      reservationId: String(row.reservation_id || ""),
      requestId,
      shared: true,
    }));
  }

  function updateHistoryCopy() {
    const eyebrow = $("#history-module .history-heading > div > span");
    const paragraph = $("#history-module .history-heading p");
    const storage = $("#analysis-history-storage");
    if (eyebrow) eyebrow.textContent = "HISTÓRICO COMPARTILHADO";
    if (paragraph) paragraph.textContent = "Consulte as eGRDTs geradas pelos usuários autorizados e confira documentos, revisões e alocações.";
    if (storage) storage.textContent = "Histórico local com sincronização segura entre usuários do GRCON.";
    updateHistoryClearControl();
  }

  function updateHistoryClearControl() {
    const clear = $("#history-clear");
    if (!clear) return;
    const authorized = Boolean(state.membership?.workspace_id) && canManageHistory();
    clear.hidden = !authorized;
    clear.disabled = !authorized || !state.online || state.syncing || state.clearingHistory;
    if (!authorized) clear.title = "Somente proprietários e administradores podem limpar o histórico compartilhado.";
    else if (!state.online) clear.title = "Reconecte o GRCON para apagar o histórico também no Supabase.";
    else if (state.syncing || state.clearingHistory) clear.title = "Aguarde a sincronização atual terminar.";
    else clear.title = "Apaga o histórico deste workspace no navegador e no Supabase. A numeração das eGRDTs não é reutilizada.";
  }

  async function clearSharedHistory() {
    const workspaceId = state.membership?.workspace_id;
    if (!workspaceId) {
      notify("O histórico compartilhado ainda não está disponível.", "error");
      return false;
    }
    if (!canManageHistory()) {
      notify("Seu perfil não pode limpar o histórico compartilhado.", "error");
      return false;
    }
    if (!state.online) {
      notify("Reconecte o GRCON para apagar o histórico também no Supabase.", "warn");
      return false;
    }
    if (state.syncing || state.clearingHistory) {
      notify("Aguarde a sincronização do histórico terminar e tente novamente.", "warn");
      return false;
    }

    state.clearingHistory = true;
    updateHistoryClearControl();
    setSyncLabel("Limpando histórico compartilhado…", "info");
    try {
      const { data, error } = await state.client.rpc("grcon_clear_history", { target_workspace: workspaceId });
      if (error) throw error;
      const removed = Number(data || 0);
      History?.clear?.();
      writeJson(Config.deleteQueueStorageKey, []);
      window.dispatchEvent(new CustomEvent("grcon:history-updated", {
        detail: { cloudPull: true, sharedClear: true, removed },
      }));
      setSyncLabel("Histórico sincronizado", "success");
      notify(removed === 1
        ? "1 eGRDT foi removida do histórico compartilhado e do Supabase."
        : `${removed} eGRDTs foram removidas do histórico compartilhado e do Supabase.`, "success");
      return true;
    } catch (error) {
      console.error("GRCON Cloud: falha ao limpar histórico compartilhado", error);
      setSyncLabel("Falha ao limpar · nenhuma limpeza local foi aplicada", "warn");
      notify(error?.message || "Não foi possível limpar o histórico no Supabase.", "error");
      return false;
    } finally {
      state.clearingHistory = false;
      updateHistoryClearControl();
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
    updateHistoryClearControl();
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
    ["cloudId", "workspaceId", "clientRecordId", "createdBy", "createdByEmail", "createdByName", "syncedAt", "cloudUpdatedAt", "localUpdatedAt", "syncState"].forEach((key) => delete payload[key]);
    return payload;
  }

  function rowForRecord(record) {
    return {
      workspace_id: state.membership.workspace_id,
      client_record_id: String(record.clientRecordId || record.id || `${record.egrdtNumber}|${record.generatedAt}`),
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

  async function fetchHistoryRows(columns) {
    const rows = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const response = await state.client.from("grcon_history")
        .select(columns)
        .eq("workspace_id", state.membership.workspace_id)
        .is("deleted_at", null)
        .order("generated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (response.error) throw response.error;
      rows.push(...(response.data || []));
      if ((response.data || []).length < pageSize) break;
    }
    return rows;
  }

  async function pushLocalHistory(records) {
    const pending = (records || []).filter((record) => record?.syncState !== "synced"
      && (!record.workspaceId || record.workspaceId === state.membership?.workspace_id));
    if (!state.online || !canWriteHistory() || !pending.length) return { pushed: 0, conflicts: 0 };
    setSyncLabel("Enviando alterações…", "info");
    let pushed = 0;
    let conflicts = 0;
    try {
      const existing = await fetchHistoryRows("id, workspace_id, client_record_id, egrdt_number, generated_at, output_type, payload, updated_at");
      for (const record of pending) {
        const row = rowForRecord(record);
        const own = existing.find((item) => item.client_record_id === row.client_record_id)
          || existing.find((item) => matchesPreviousNumber(record, item));
        if (own) {
          const expected = String(record.cloudUpdatedAt || record.syncedAt || "");
          if (!expected || expected !== String(own.updated_at || "")) {
            History.markSynced(record.id, own);
            conflicts += 1;
            continue;
          }
          const result = await state.client.from("grcon_history")
            .update(row)
            .eq("id", own.id)
            .eq("updated_at", expected)
            .select("id, workspace_id, client_record_id, updated_at")
            .maybeSingle();
          if (result.error) throw result.error;
          if (!result.data) {
            History.markSynced(record.id, own);
            conflicts += 1;
            continue;
          }
          History.markSynced(record.id, result.data);
          pushed += 1;
          continue;
        }
        if (record.cloudId) {
          // O registro existia na nuvem e foi excluído por outro usuário.
          // A exclusão remota vence para impedir ressurreição por cache antigo.
          conflicts += 1;
          continue;
        }
        const result = await state.client.from("grcon_history")
          .insert(row)
          .select("id, workspace_id, client_record_id, updated_at")
          .single();
        if (result.error) throw result.error;
        History.markSynced(record.id, result.data);
        pushed += 1;
      }
      if (conflicts) notify(`${conflicts} alteração(ões) local(is) não substituíram versões mais novas do histórico compartilhado.`, "warn");
      return { pushed, conflicts };
    } catch (error) {
      console.warn("GRCON Cloud: histórico aguardando sincronização", error);
      throw error;
    }
  }

  async function pullCloudHistory() {
    if (!state.online || !state.membership?.workspace_id || !History) return { records: [], removed: 0 };
    setSyncLabel("Atualizando histórico…", "info");
    try {
      const rows = await fetchHistoryRows("id, client_record_id, egrdt_number, generated_at, output_type, payload, created_by, updated_at");
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
          clientRecordId: row.client_record_id,
          egrdtNumber: row.egrdt_number,
          generatedAt: row.generated_at,
          outputType: row.output_type,
          cloudId: row.id,
          workspaceId: state.membership.workspace_id,
          createdBy: row.created_by,
          createdByEmail: profile.email || "",
          createdByName: profile.display_name || "",
          syncedAt: row.updated_at,
          cloudUpdatedAt: row.updated_at,
          localUpdatedAt: row.updated_at,
          syncState: "synced",
        });
      });
      const reconciled = History.replaceWorkspaceSnapshot(records, state.membership.workspace_id);
      if (reconciled.error) throw new Error(reconciled.error);
      window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { cloudPull: true, records: reconciled.records, removed: reconciled.removed } }));
      return { records: reconciled.records, removed: reconciled.removed };
    } catch (error) {
      console.warn("GRCON Cloud: leitura compartilhada indisponível", error);
      throw error;
    }
  }

  async function runSyncCycle() {
    if (!state.online || !state.membership?.workspace_id || !History) return;
    if (state.clearingHistory) { state.syncQueued = true; return; }
    if (state.syncing) {
      state.syncQueued = true;
      return;
    }
    state.syncing = true;
    state.syncQueued = false;
    updateHistoryClearControl();
    try {
      await flushDeleteQueue();
      await pullCloudHistory();
      const pushed = await pushLocalHistory(History.read());
      if (pushed.pushed || pushed.conflicts) await pullCloudHistory();
      setSyncLabel("Histórico sincronizado", "success");
      updateAccountMenu();
    } catch (error) {
      console.warn("GRCON Cloud: ciclo de sincronização pendente", error);
      setSyncLabel("Sincronização pendente · tente novamente", "warn");
    } finally {
      state.syncing = false;
      updateHistoryClearControl();
      if (state.syncQueued) scheduleSync();
    }
  }

  function scheduleSync() {
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(runSyncCycle, 500);
  }

  function enqueueDelete(recordId, cloudId, workspaceId) {
    if (!recordId || !canManageHistory()) return;
    const queue = readJson(Config.deleteQueueStorageKey, []);
    const entry = {
      recordId: String(recordId),
      cloudId: String(cloudId || ""),
      workspaceId: String(workspaceId || state.membership?.workspace_id || ""),
      queuedAt: new Date().toISOString(),
    };
    const exists = queue.some((item) => String(typeof item === "string" ? item : item.recordId) === entry.recordId
      && String(typeof item === "string" ? entry.workspaceId : item.workspaceId || entry.workspaceId) === entry.workspaceId);
    if (!exists) queue.push(entry);
    writeJson(Config.deleteQueueStorageKey, queue);
  }

  async function flushDeleteQueue() {
    if (!state.online || !canManageHistory()) return { processed: 0, pending: 0 };
    const queue = readJson(Config.deleteQueueStorageKey, []);
    if (!queue.length) return { processed: 0, pending: 0 };
    const remaining = [];
    let processed = 0;
    for (const raw of queue) {
      const entry = typeof raw === "string"
        ? { recordId: raw, cloudId: "", workspaceId: state.membership.workspace_id }
        : raw;
      if (entry.workspaceId && entry.workspaceId !== state.membership.workspace_id) {
        remaining.push(raw);
        continue;
      }
      let query = state.client.from("grcon_history").update({
        deleted_at: new Date().toISOString(),
        deleted_by: state.session.user.id,
        updated_by: state.session.user.id,
      }).eq("workspace_id", state.membership.workspace_id).is("deleted_at", null);
      query = entry.cloudId ? query.eq("id", entry.cloudId) : query.eq("client_record_id", entry.recordId);
      const result = await query.select("id");
      if (result.error) remaining.push(raw);
      else processed += 1;
    }
    writeJson(Config.deleteQueueStorageKey, remaining);
    return { processed, pending: remaining.length };
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
        timer = window.setTimeout(scheduleSync, 450);
      })
      .subscribe();
  }

  async function activateSession(session) {
    if (!session?.user) return showLogin();
    const key = `${session.user.id}|${session.access_token?.slice(-12) || "session"}`;
    if (state.activationKey === key) return;
    state.activationKey = key;
    state.session = session;
    lockApp();
    authMessage("Confirmando sua autorização…", "info");
    try {
      const membership = await acceptMembership();
      if (!membership) {
        authMessage(`O e-mail ${session.user.email || "informado"} ainda não foi autorizado. Peça a um administrador do GRCON para adicioná-lo.`, "error");
        $("#grcon-cloud-auth-retry").hidden = false;
        $("#grcon-cloud-auth-signout").hidden = false;
        return;
      }
      $("#grcon-cloud-auth-retry").hidden = true;
      state.membership = membership;
      storeMembership(membership);
      updateHistoryCopy();
      createAccountMenu();
      unlockApp();
      updateAccountMenu();
      await loadMembers();
      if (state.online) {
        await runSyncCycle();
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
      authMessage(state.online
        ? (error?.message || "Não foi possível confirmar seu acesso agora. Tente novamente sem refazer o login.")
        : "Sem conexão para confirmar o primeiro acesso. Reconecte e tente novamente.", "error");
      $("#grcon-cloud-auth-retry").hidden = false;
      $("#grcon-cloud-auth-signout").hidden = false;
    }
  }

  function showLogin() {
    state.session = null;
    state.membership = null;
    state.activationKey = "";
    state.passwordRecovery = false;
    updateHistoryClearControl();
    lockApp();
    setAuthView("login");
    $("#grcon-cloud-auth-retry")?.setAttribute("hidden", "");
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
      if (detail.deleted && detail.recordId) enqueueDelete(detail.recordId, detail.cloudId, detail.workspaceId);
      scheduleSync();
    });
  }

  function bindNetworkEvents() {
    window.addEventListener("online", () => {
      state.online = true;
      updateAccountMenu();
      if (state.membership) {
        subscribeRealtime();
        scheduleSync();
      }
    });
    window.addEventListener("offline", () => {
      state.online = false;
      updateAccountMenu();
      setSyncLabel("Offline · alterações ficam neste navegador", "warn");
      updateHistoryClearControl();
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
    pull: runSyncCycle,
    sync: scheduleSync,
    canWriteHistory,
    canManageHistory,
    reserveEgrdtSequences,
    inviteUser,
    completeEgrdtReservationRequest,
    clearHistory: clearSharedHistory,
  };

  init();
})();

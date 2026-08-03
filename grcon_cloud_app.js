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
    authCooldownTimer: 0,
  };

  const OTP_GUARD_KEY = Config.otpGuardStorageKey || "grcon.cloud.otp.guard.v1";
  const OTP_SENT_COOLDOWN_MS = 10 * 60 * 1000;
  const OTP_RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;

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

  function readOtpGuard() {
    const guard = readJson(OTP_GUARD_KEY, null);
    if (!guard || !guard.email || !Number.isFinite(Number(guard.blockedUntil))) return null;
    return {
      email: String(guard.email).trim().toLowerCase(),
      blockedUntil: Number(guard.blockedUntil),
      reason: guard.reason || "sent",
    };
  }

  function storeOtpGuard(email, blockedUntil, reason) {
    writeJson(OTP_GUARD_KEY, {
      email: String(email || "").trim().toLowerCase(),
      blockedUntil: Number(blockedUntil) || 0,
      reason: reason || "sent",
    });
  }

  function formatCooldown(milliseconds) {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} h`;
  }

  function activeOtpGuard(email) {
    const guard = readOtpGuard();
    if (!guard || guard.email !== String(email || "").trim().toLowerCase()) return null;
    if (guard.blockedUntil <= Date.now()) {
      removeStored(OTP_GUARD_KEY);
      return null;
    }
    return guard;
  }

  function applyOtpCooldown() {
    window.clearTimeout(state.authCooldownTimer);
    const form = $("#grcon-cloud-login-form");
    if (!form || form.dataset.busy === "true") return;
    const input = $("#grcon-cloud-email", form);
    const button = $("button", form);
    if (!button) return;
    const guard = activeOtpGuard(input?.value);
    if (!guard) {
      button.disabled = false;
      button.textContent = "Enviar link de acesso";
      return;
    }
    const remaining = guard.blockedUntil - Date.now();
    button.disabled = true;
    button.textContent = `Aguarde ${formatCooldown(remaining)}`;
    state.authCooldownTimer = window.setTimeout(applyOtpCooldown, Math.min(1000, remaining));
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

  function createSurface() {
    const surface = document.createElement("section");
    surface.id = "grcon-cloud-auth";
    surface.className = "grcon-cloud-auth";
    surface.setAttribute("aria-live", "polite");
    surface.innerHTML = `
      <div class="grcon-cloud-auth-card">
        <img alt="GRCON — Controle de GRDT" src="grcon-logo-app.png"/>
        <span class="grcon-cloud-eyebrow">GRCON COMPARTILHADO</span>
        <h1>Acesse o controle de GRDT</h1>
        <p>Use seu e-mail autorizado. Você receberá um link de acesso e não precisará criar senha.</p>
        <form id="grcon-cloud-login-form">
          <label for="grcon-cloud-email"><span>E-mail</span><input id="grcon-cloud-email" autocomplete="email" inputmode="email" required type="email" placeholder="nome@empresa.com"/></label>
          <button class="primary-button" type="submit">Enviar link de acesso</button>
        </form>
        <p class="grcon-cloud-auth-message" id="grcon-cloud-auth-message">Acesso disponível somente para usuários convidados.</p>
        <button class="secondary-button compact" hidden id="grcon-cloud-auth-signout" type="button">Sair e usar outro e-mail</button>
        <small>Os documentos, PDFs e planilhas permanecem neste navegador. Somente o histórico operacional é compartilhado.</small>
      </div>`;
    document.body.appendChild(surface);

    const form = $("#grcon-cloud-login-form", surface);
    const emailInput = $("#grcon-cloud-email", surface);
    const guard = readOtpGuard();
    if (guard?.email && emailInput) emailInput.value = guard.email;
    form.addEventListener("submit", sendMagicLink);
    emailInput?.addEventListener("input", applyOtpCooldown);
    $("#grcon-cloud-auth-signout", surface).addEventListener("click", signOut);
    applyOtpCooldown();
    return surface;
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

  function setAuthBusy(busy) {
    const form = $("#grcon-cloud-login-form");
    if (!form) return;
    form.dataset.busy = busy ? "true" : "false";
    [...form.elements].forEach((control) => { control.disabled = Boolean(busy); });
    const button = $("button", form);
    if (button) button.textContent = busy ? "Verificando…" : "Enviar link de acesso";
    if (!busy) applyOtpCooldown();
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    if (!state.client) return;
    const email = String($("#grcon-cloud-email")?.value || "").trim().toLowerCase();
    if (!email) return;
    const redirectTo = cleanRedirectUrl();
    if (!redirectTo) {
      authMessage("Abra o GRCON pelo link publicado para entrar. O login não funciona ao abrir index.html diretamente.", "error");
      return;
    }

    const guard = activeOtpGuard(email);
    if (guard) {
      const remaining = guard.blockedUntil - Date.now();
      const message = guard.reason === "rate-limit"
        ? `O serviço de e-mail atingiu o limite temporário. Tente novamente em ${formatCooldown(remaining)}.`
        : `Um link já foi solicitado para este e-mail. Aguarde ${formatCooldown(remaining)} antes de pedir outro.`;
      authMessage(message, "warn");
      applyOtpCooldown();
      return;
    }

    setAuthBusy(true);
    authMessage("Verificando se este navegador já possui uma sessão válida…", "info");
    try {
      const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
      if (sessionError) console.warn("GRCON Cloud: não foi possível consultar a sessão local", sessionError);
      const existingSession = sessionData?.session;
      if (existingSession?.user) {
        const existingEmail = String(existingSession.user.email || "").trim().toLowerCase();
        if (!existingEmail || existingEmail === email) {
          authMessage("Sessão já encontrada neste navegador. Confirmando seu acesso…", "success");
          await activateSession(existingSession);
          return;
        }
        authMessage(`Já existe uma sessão ativa para ${existingEmail}. Use “Sair e usar outro e-mail” para trocar de conta.`, "error");
        $("#grcon-cloud-auth-signout")?.removeAttribute("hidden");
        return;
      }

      authMessage("Enviando um único link de acesso…", "info");
      const { error } = await state.client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      storeOtpGuard(email, Date.now() + OTP_SENT_COOLDOWN_MS, "sent");
      authMessage("Link enviado. Abra o e-mail neste navegador. Para evitar bloqueio, não solicite outro link enquanto este estiver válido.", "success");
    } catch (error) {
      if (isEmailRateLimit(error)) {
        storeOtpGuard(email, Date.now() + OTP_RATE_LIMIT_COOLDOWN_MS, "rate-limit");
        authMessage("O Supabase bloqueou temporariamente novos e-mails porque o limite foi atingido. A sessão existente será reutilizada automaticamente; caso não exista, tente novamente em cerca de 1 hora.", "error");
      } else {
        authMessage(error?.message || "Não foi possível enviar o link de acesso.", "error");
      }
    } finally {
      setAuthBusy(false);
    }
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
          <small>O usuário acessa pelo mesmo link e solicita o link mágico com o e-mail autorizado.</small>
        </div>
        <div class="grcon-cloud-members" id="grcon-cloud-members"></div>
        <footer><button class="secondary-button compact" id="grcon-cloud-copy-link" type="button">Copiar link do GRCON</button><button class="secondary-button compact" id="grcon-cloud-signout" type="button">Sair</button></footer>
      </section>`;
    host.appendChild(container);

    $("#grcon-cloud-account-button").addEventListener("click", toggleAccountMenu);
    $("#grcon-cloud-signout").addEventListener("click", signOut);
    $("#grcon-cloud-copy-link").addEventListener("click", copyAppLink);
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
      notify(`${email} foi autorizado. Envie o mesmo link do GRCON para esse usuário.`, "success");
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
      window.clearTimeout(state.authCooldownTimer);
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
    lockApp();
    $("#grcon-cloud-auth-signout")?.setAttribute("hidden", "");
    authMessage("Acesso disponível somente para usuários convidados.", "info");
    applyOtpCooldown();
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

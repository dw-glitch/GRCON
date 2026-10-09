/* GRCON — foto de perfil privada vinculada ao usuário autenticado. */
(function (root) {
  "use strict";
  const BUCKET = "grcon-profile-photos";
  const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
  const MAX_STORED_BYTES = 1024 * 1024;
  const SIZE = 256;
  const SIGNED_URL_TTL = 600;
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const state = { userId: "", lastReadAt: 0, inFlight: false, hasPhoto: false };
  const $ = id => document.getElementById(id);
  const cloud = () => root.GrconCloud;
  const session = () => cloud()?.state?.session;
  const client = () => cloud()?.state?.client;
  const authorized = () => Boolean(session()?.user?.id && cloud()?.state?.membership?.workspace_id && client());
  const keyFor = id => id + "/avatar.webp";

  function initials() {
    const user = session()?.user;
    const profile = cloud()?.state?.profiles?.get(user?.id);
    const name = String(profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "U");
    return name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0).toLocaleUpperCase("pt-BR")).join("") || "U";
  }
  function notice(message, tone) {
    const target = $("grcon-profile-photo-status");
    if (target) { target.textContent = message; target.dataset.tone = tone || "info"; }
    if (tone === "error") root.GrconNotify?.(message, "error");
  }
  function install() {
    const button = $("grcon-cloud-account-button");
    const menu = $("grcon-cloud-account-menu");
    if (!button || !menu) return false;
    if (!$("grcon-cloud-account-avatar")) {
      const avatar = document.createElement("span");
      avatar.id = "grcon-cloud-account-avatar";
      avatar.className = "grcon-cloud-account-avatar";
      const fallback = document.createElement("span");
      fallback.id = "grcon-profile-avatar-fallback";
      fallback.className = "grcon-profile-avatar-fallback";
      fallback.textContent = initials();
      const photo = document.createElement("img");
      photo.id = "grcon-profile-avatar-image";
      photo.alt = "";
      photo.decoding = "async";
      photo.hidden = true;
      photo.referrerPolicy = "no-referrer";
      photo.addEventListener("error", showFallback);
      avatar.append(fallback, photo);
      const dot = button.querySelector(".grcon-cloud-account-dot");
      if (dot) avatar.appendChild(dot);
      button.insertBefore(avatar, button.firstChild);
    }
    if (!$("grcon-profile-photo-controls")) {
      const controls = document.createElement("div");
      controls.id = "grcon-profile-photo-controls";
      controls.className = "grcon-profile-photo-controls";
      controls.innerHTML = '<strong>Foto de perfil</strong>'
        + '<p>Sua foto acompanha a conta em outros computadores.</p>'
        + '<div class="grcon-profile-photo-actions">'
        + '<label for="grcon-profile-photo-file" class="secondary-button compact">Escolher foto</label>'
        + '<input id="grcon-profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>'
        + '<button id="grcon-profile-photo-remove" type="button" class="secondary-button compact">Remover foto</button>'
        + '</div><small id="grcon-profile-photo-status" role="status" aria-live="polite">JPG, PNG ou WebP. Imagem reduzida automaticamente.</small>';
      menu.insertBefore(controls, menu.querySelector(".grcon-contract-context") || menu.firstChild);
      $("grcon-profile-photo-file").addEventListener("change", onChoose);
      $("grcon-profile-photo-remove").addEventListener("click", removePhoto);
    }
    if ($("grcon-profile-avatar-fallback")) $("grcon-profile-avatar-fallback").textContent = initials();
    setBusy(state.inFlight);
    return true;
  }
  function showFallback() {
    const image = $("grcon-profile-avatar-image");
    const fallback = $("grcon-profile-avatar-fallback");
    if (image) { image.hidden = true; image.removeAttribute("src"); }
    if (fallback) { fallback.hidden = false; fallback.textContent = initials(); }
    state.hasPhoto = false;
    const remove = $("grcon-profile-photo-remove");
    if (remove) remove.disabled = true;
  }
  function setBusy(busy) {
    state.inFlight = busy;
    const input = $("grcon-profile-photo-file");
    const remove = $("grcon-profile-photo-remove");
    if (input) input.disabled = busy;
    if (remove) remove.disabled = busy || !state.hasPhoto;
    $("grcon-profile-photo-controls")?.setAttribute("aria-busy", String(busy));
  }
  async function refreshPhoto(force) {
    if (!authorized() || !install()) return;
    const id = session().user.id;
    if (!force && id === state.userId && Date.now() - state.lastReadAt < 8 * 60 * 1000) return;
    state.userId = id;
    const { data, error } = await client().storage.from(BUCKET).createSignedUrl(keyFor(id), SIGNED_URL_TTL);
    if (session()?.user?.id !== id) return;
    state.lastReadAt = Date.now();
    if (error || !data?.signedUrl) { showFallback(); return; }
    const image = $("grcon-profile-avatar-image");
    if (!image) return;
    const fallback = $("grcon-profile-avatar-fallback");
    image.onload = () => {
      if (session()?.user?.id !== id) return;
      state.hasPhoto = true;
      image.hidden = false;
      if (fallback) fallback.hidden = true;
      const remove = $("grcon-profile-photo-remove");
      if (remove) remove.disabled = state.inFlight;
    };
    image.src = data.signedUrl + (data.signedUrl.includes("?") ? "&" : "?") + "grcon_v=" + Date.now();
  }
  async function compressedPhoto(file) {
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
    if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("A foto original deve ter até 6 MB.");
    const temporaryUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = temporaryUrl;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width < 32 || height < 32 || width > 6000 || height > 6000)
        throw new Error("Use uma foto entre 32 e 6.000 pixels por dimensão.");
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Este navegador não permite preparar a imagem.");
      const crop = Math.min(width, height);
      context.drawImage(image, (width - crop)/2, (height - crop)/2, crop, crop, 0, 0, SIZE, SIZE);
      const photo = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!photo || photo.type !== "image/webp" || photo.size > MAX_STORED_BYTES)
        throw new Error("Não foi possível otimizar a foto em WebP (limite de 1 MB).");
      return photo;
    } finally { URL.revokeObjectURL(temporaryUrl); }
  }
  async function onChoose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || state.inFlight || !authorized()) return;
    const id = session().user.id;
    setBusy(true);
    notice("Preparando foto…");
    try {
      const photo = await compressedPhoto(file);
      if (session()?.user?.id !== id) throw new Error("A sessão mudou. Faça login e tente novamente.");
      const { error } = await client().storage.from(BUCKET).upload(keyFor(id), photo, {
        upsert: true, contentType: "image/webp", cacheControl: "60"
      });
      if (error) throw error;
      if (session()?.user?.id !== id) return;
      await refreshPhoto(true);
      notice("Foto de perfil atualizada.", "success");
    } catch (error) {
      notice(error?.message || "Não foi possível salvar a foto.", "error");
    } finally { if (session()?.user?.id === id) setBusy(false); }
  }
  async function removePhoto() {
    if (!authorized() || state.inFlight || !state.hasPhoto) return;
    const id = session().user.id;
    setBusy(true);
    try {
      const { error } = await client().storage.from(BUCKET).remove([keyFor(id)]);
      if (error) throw error;
      if (session()?.user?.id !== id) return;
      showFallback();
      state.lastReadAt = Date.now();
      notice("Foto removida. Suas iniciais aparecerão no cabeçalho.", "success");
    } catch (error) {
      notice(error?.message || "Não foi possível remover a foto.", "error");
    } finally { if (session()?.user?.id === id) setBusy(false); }
  }
  function clear() {
    state.userId = "";
    state.lastReadAt = 0;
    state.hasPhoto = false;
    state.inFlight = false;
    showFallback();
  }
  root.addEventListener("grcon:cloud-ready", () => { void refreshPhoto(true); });
  root.addEventListener("grcon:cloud-signed-out", clear);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && authorized()) void refreshPhoto(false);
  });
  if (document.readyState !== "loading") {
    if (authorized()) void refreshPhoto(true);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (authorized()) void refreshPhoto(true);
    }, { once: true });
  }
})(window);

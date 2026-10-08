(function (root) {
  "use strict";
  // UHDT keeps the exact existing keys and databases. Other contracts receive
  // independent operational stores before any application module is loaded.
  let cached = null;
  try { cached = JSON.parse(root.localStorage.getItem("grcon.cloud.membership.v1") || "null"); } catch (_) {}
  const workspace = cached?.workspaceId || "";
  const legacy = !workspace || !cached?.contractCode || cached.contractCode === "UHDT-D";
  const suffix = legacy ? "" : "::contract::" + workspace;
  function scopedKey(key) {
    const value = String(key);
    if (!suffix || /^grcon\.cloud\./.test(value) || !/^(grcon[.-]|sigem-pw)/i.test(value)) return value;
    return value.endsWith(suffix) ? value : value + suffix;
  }
  if (root.Storage && suffix) {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = root.Storage.prototype[method];
      root.Storage.prototype[method] = function (key, ...args) { return original.call(this, scopedKey(key), ...args); };
    }
    root.addEventListener("storage", (event) => {
      if (!event.key || !/::contract::/.test(event.key)) return;
      event.stopImmediatePropagation();
      if (!event.key.endsWith(suffix)) return;
      root.dispatchEvent(new StorageEvent("storage", {
        key: event.key.slice(0, -suffix.length), oldValue: event.oldValue,
        newValue: event.newValue, url: event.url, storageArea: event.storageArea,
      }));
    }, true);
  }
  if (root.indexedDB && suffix) {
    for (const method of ["open", "deleteDatabase"]) {
      const original = root.indexedDB[method].bind(root.indexedDB);
      root.indexedDB[method] = (name, ...args) => original(scopedKey(name), ...args);
    }
  }
  if (root.BroadcastChannel && suffix) {
    const Original = root.BroadcastChannel;
    root.BroadcastChannel = class extends Original { constructor(name) { super(scopedKey(name)); } };
  }
  root.GrconContractStorage = Object.freeze({
    workspace, legacy, scopedKey,
    needsReload(membership) {
      const nextLegacy = membership?.contract_code === "UHDT-D";
      return nextLegacy !== legacy || (!nextLegacy && membership?.workspace_id !== workspace);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);

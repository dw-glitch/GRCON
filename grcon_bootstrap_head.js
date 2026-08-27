(function () {
  "use strict";
  try {
    const savedTheme = localStorage.getItem("quality-theme-grcon") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.style.colorScheme = savedTheme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }

  function installTconsagShortcut() {
    if (document.getElementById("app-shortcut-tconsag")) return;
    const host = document.querySelector(".runtime-status");
    if (!host) return;

    const link = document.createElement("a");
    link.id = "app-shortcut-tconsag";
    link.className = "app-shortcut-link app-shortcut-link-tconsag";
    link.href = "https://taxonomia-consag.vercel.app/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Abrir Taxonomia Consag";
    link.setAttribute("aria-label", "Abrir Taxonomia Consag em uma nova aba");
    link.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"></path></svg><span>TCONSAG</span>';

    const workspaceButton = document.getElementById("workspace-new-tab");
    if (workspaceButton && workspaceButton.parentElement === host) host.insertBefore(link, workspaceButton);
    else host.appendChild(link);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installTconsagShortcut, { once: true });
  } else {
    installTconsagShortcut();
  }
})();

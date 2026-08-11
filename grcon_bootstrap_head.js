(function () {
  "use strict";
  try {
    const savedTheme = localStorage.getItem("quality-theme-grcon") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.style.colorScheme = savedTheme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
})();

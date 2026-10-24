/* Pre-hydration theme + skin. Same-origin file so the CSP needs no inline script hash. */
(function () {
  var d = document.documentElement;
  try {
    var t = localStorage.getItem("rk-theme");
    var s = localStorage.getItem("rk-skin");
    if (t !== "light" && t !== "dark") t = "dark";
    if (s !== "pop") s = "classic";
    d.setAttribute("data-theme", t);
    d.setAttribute("data-skin", s);
    d.classList.toggle("dark", t === "dark");
    d.style.colorScheme = t;
  } catch {
    d.setAttribute("data-theme", "dark");
    d.setAttribute("data-skin", "classic");
    d.classList.add("dark");
  }
})();

// ===== BUYE IELTS — shared frontend config =====
// After deploying code.gs (Deploy > New deployment > Web app), paste the
// resulting URL below. Every page (login, dashboard, admin, test) reads
// from this one file.

const API_URL = "https://script.google.com/macros/s/AKfycbzJ8lXzI-loqvk4csdwOqcxVEahQkWBXQjiPhJlgqL4v5K9z1pE81ei5q9HN2zieHsMkg/exec";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("buye_theme", theme);
}

function initializeTheme() {
  const saved = localStorage.getItem("buye_theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(saved || preferred);

  const nav = document.querySelector(".appbar .wrap, .nav-wrap, .nav-row");
  if (!nav || document.querySelector(".theme-toggle")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "theme-toggle";
  toggle.setAttribute("aria-label", "Toggle dark mode");
  toggle.addEventListener("click", function () {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    updateThemeLabel(toggle);
  });
  nav.appendChild(toggle);
  updateThemeLabel(toggle);
}

function updateThemeLabel(toggle) {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  toggle.textContent = dark ? "☀ Light" : "☾ Dark";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTheme);
} else {
  initializeTheme();
}

function apiGet(action, params) {
  params = params || {};

  const qs = new URLSearchParams(
    Object.assign({ action: action }, params)
  ).toString();

  return fetch(API_URL + "?" + qs).then(function (r) {
    return r.json();
  });
}

function apiPost(action, body) {
  const payload = Object.assign(
    { action: action },
    body || {}
  );

  return fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    credentials: "omit",
    mode: "cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("Server returned HTTP " + response.status);
    }

    return response.json();
  });
}

function saveSession(data) {
  localStorage.setItem("buye_token", data.token);
  localStorage.setItem("buye_role", data.role);
  localStorage.setItem("buye_name", data.name);
}

function getToken() {
  return localStorage.getItem("buye_token");
}

function getRole() {
  return localStorage.getItem("buye_role");
}

function getName() {
  return localStorage.getItem("buye_name") || "there";
}

function clearSession() {
  localStorage.removeItem("buye_token");
  localStorage.removeItem("buye_role");
  localStorage.removeItem("buye_name");
}

// Redirect if not logged in (or wrong role). Call at the top of protected pages.
function requireAuth(role) {
  if (!getToken()) {
    window.location.href = "login.html";
    return false;
  }

  if (role && getRole() !== role) {
    window.location.href = "dashboard.html";
    return false;
  }

  return true;
}

function logout() {
  clearSession();
  window.location.href = "login.html";
}
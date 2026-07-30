// ===== Passcode gate =====
// NOTE: this is a simple deterrent, not real security -- the hash below
// lives in a public file, so anyone technical could brute-force it.
// See README.md for how to change the passcode and regenerate this hash.
const PASSCODE_HASH_HEX =
  "700ecea8b0339384b33abcee2ae994e5dd5679fd7c1df8364e22d92e8158fcc0"; // default passcode: multivista2026 -- CHANGE THIS, see README.md

const SESSION_KEY = "mv-dashboard-unlocked";

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function showApp() {
  document.getElementById("gate").hidden = true;
  document.getElementById("app").hidden = false;
  initDashboard();
}

async function tryUnlock(code) {
  const hash = await sha256Hex(code);
  if (hash === PASSCODE_HASH_HEX) {
    sessionStorage.setItem(SESSION_KEY, "1");
    showApp();
    return true;
  }
  return false;
}

document.getElementById("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("gate-input");
  const errorEl = document.getElementById("gate-error");
  const ok = await tryUnlock(input.value.trim());
  if (!ok) {
    errorEl.hidden = false;
    input.value = "";
    input.focus();
  }
});

// Skip the gate if already unlocked this session
if (sessionStorage.getItem(SESSION_KEY) === "1") {
  showApp();
}

// ===== Dashboard =====
let allData = null;
let activeProjectKey = null;

async function initDashboard() {
  try {
    const res = await fetch(`data/data.json?_=${Date.now()}`);
    allData = await res.json();
  } catch (err) {
    document.getElementById("sync-text").textContent =
      "No se pudieron cargar los datos.";
    console.error(err);
    return;
  }

  renderSyncStatus();
  renderProjectFilter();
  renderProjectGrid();
  renderTable();

  document
    .getElementById("project-filter")
    .addEventListener("change", () => { activeProjectKey = document.getElementById("project-filter").value || null; syncActiveCard(); renderTable(); });
  document.getElementById("status-filter").addEventListener("change", renderTable);
  document.getElementById("search-filter").addEventListener("input", renderTable);
}

function renderSyncStatus() {
  const pulse = document.getElementById("pulse");
  const text = document.getElementById("sync-text");

  if (!allData.generatedAt) {
    text.textContent = "Sin sincronizar aún — mostrando datos de ejemplo";
    pulse.classList.add("stale");
    return;
  }

  const generated = new Date(allData.generatedAt);
  const hoursAgo = Math.round((Date.now() - generated.getTime()) / 3600000);
  const label =
    hoursAgo <= 0
      ? "hace instantes"
      : hoursAgo === 1
      ? "hace 1 hora"
      : `hace ${hoursAgo} horas`;

  text.textContent = `Sincronizado ${label}`;
  if (hoursAgo > 30) pulse.classList.add("stale");
}

function renderProjectFilter() {
  const select = document.getElementById("project-filter");
  for (const project of allData.projects) {
    const opt = document.createElement("option");
    opt.value = project.key;
    opt.textContent = `${project.key} — ${project.name}`;
    select.appendChild(opt);
  }
}

function renderProjectGrid() {
  const grid = document.getElementById("project-grid");
  const countEl = document.getElementById("project-count");
  grid.innerHTML = "";
  countEl.textContent = `${allData.projects.length} proyecto${allData.projects.length === 1 ? "" : "s"}`;

  for (const project of allData.projects) {
    const { statusSummary, totalIssues } = project;
    const total = Math.max(totalIssues, 1);
    const pctTodo = (statusSummary["To Do"] / total) * 100;
    const pctProgress = (statusSummary["In Progress"] / total) * 100;
    const pctDone = (statusSummary["Done"] / total) * 100;

    const card = document.createElement("div");
    card.className = "project-card";
    card.tabIndex = 0;
    card.dataset.key = project.key;
    card.innerHTML = `
      <div class="project-card-top">
        <span class="project-key">${project.key}</span>
        <span class="project-total">${project.totalIssues} tickets</span>
      </div>
      <div class="project-name">${escapeHtml(project.name)}</div>
      <div class="progress-bar">
        <div class="progress-seg-todo" style="width:${pctTodo}%"></div>
        <div class="progress-seg-progress" style="width:${pctProgress}%"></div>
        <div class="progress-seg-done" style="width:${pctDone}%"></div>
      </div>
      <div class="progress-legend">
        <span class="legend-todo">${statusSummary["To Do"]}</span>
        <span class="legend-progress">${statusSummary["In Progress"]}</span>
        <span class="legend-done">${statusSummary["Done"]}</span>
      </div>
    `;
    card.addEventListener("click", () => selectProject(project.key));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectProject(project.key); }
    });
    grid.appendChild(card);
  }
}

function selectProject(key) {
  activeProjectKey = activeProjectKey === key ? null : key;
  document.getElementById("project-filter").value = activeProjectKey || "";
  syncActiveCard();
  renderTable();
}

function syncActiveCard() {
  document.querySelectorAll(".project-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.key === activeProjectKey);
  });
}

function statusPillClass(statusCategory) {
  if (statusCategory === "Done") return "status-done";
  if (statusCategory === "In Progress") return "status-progress";
  return "status-todo";
}

function statusLabel(statusCategory, originalStatus) {
  const map = { "To Do": "Por hacer", "In Progress": "En curso", Done: "Terminado" };
  return map[statusCategory] || originalStatus;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderTable() {
  const body = document.getElementById("issues-body");
  const emptyState = document.getElementById("empty-state");
  const statusFilter = document.getElementById("status-filter").value;
  const searchTerm = document.getElementById("search-filter").value.trim().toLowerCase();

  let issues = [];
  for (const project of allData.projects) {
    if (activeProjectKey && project.key !== activeProjectKey) continue;
    issues.push(...project.issues);
  }

  if (statusFilter) issues = issues.filter((i) => i.statusCategory === statusFilter);
  if (searchTerm) {
    issues = issues.filter(
      (i) =>
        i.key.toLowerCase().includes(searchTerm) ||
        (i.summary || "").toLowerCase().includes(searchTerm)
    );
  }

  issues.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));

  body.innerHTML = "";
  emptyState.hidden = issues.length > 0;

  for (const issue of issues.slice(0, 500)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-key">${issue.key}</td>
      <td>${escapeHtml(issue.summary)}</td>
      <td><span class="status-pill ${statusPillClass(issue.statusCategory)}">${statusLabel(issue.statusCategory, issue.status)}</span></td>
      <td>${escapeHtml(issue.priority || "—")}</td>
      <td>${escapeHtml(issue.assignee || "Sin asignar")}</td>
      <td class="col-updated">${formatDate(issue.updated)}</td>
    `;
    body.appendChild(tr);
  }
}

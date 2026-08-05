// list.js
// Renders the Issues List page: a filterable table of every Jira issue.

let allData = null;
let activeProjectKey = null;

async function initListPage() {
  try {
    allData = await loadDashboardData();
  } catch (err) {
    document.getElementById("sync-text").textContent = "Could not load data.";
    console.error(err);
    return;
  }

  renderSyncStatus(allData);
  renderProjectFilter();
  renderTerritoryFilter();
  renderServiceFilter();
  renderTable();

  document.getElementById("project-filter").addEventListener("change", () => {
    activeProjectKey = document.getElementById("project-filter").value || null;
    renderTable();
  });
  document.getElementById("status-filter").addEventListener("change", renderTable);
  document.getElementById("territory-filter").addEventListener("change", renderTable);
  document.getElementById("service-filter").addEventListener("change", renderTable);
  document.getElementById("search-filter").addEventListener("input", renderTable);
}

function renderProjectFilter() {
  const select = document.getElementById("project-filter");
  for (const project of allData.projects) {
    const opt = document.createElement("option");
    opt.value = project.key;
    opt.textContent = `${project.key} \u2014 ${project.name}`;
    select.appendChild(opt);
  }
}

function renderTerritoryFilter() {
  const select = document.getElementById("territory-filter");
  const territories = new Set();
  for (const project of allData.projects) {
    for (const issue of project.issues) {
      territories.add(issue.territory || "Unassigned");
    }
  }
  for (const t of Array.from(territories).sort()) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  }
}

function renderServiceFilter() {
  const select = document.getElementById("service-filter");
  const services = new Set();
  for (const project of allData.projects) {
    for (const issue of project.issues) {
      if (issue.serviceType) services.add(issue.serviceType);
    }
  }
  for (const s of Array.from(services).sort()) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  }
}

function statusLabel(statusCategory, originalStatus) {
  const map = { "To Do": "To Do", "In Progress": "In Progress", Done: "Done" };
  return map[statusCategory] || originalStatus;
}

function renderTable() {
  const body = document.getElementById("issues-body");
  const emptyState = document.getElementById("empty-state");
  const statusFilter = document.getElementById("status-filter").value;
  const territoryFilter = document.getElementById("territory-filter").value;
  const serviceFilter = document.getElementById("service-filter").value;
  const searchTerm = document.getElementById("search-filter").value.trim().toLowerCase();

  let issues = [];
  for (const project of allData.projects) {
    if (activeProjectKey && project.key !== activeProjectKey) continue;
    issues.push(...project.issues);
  }

  if (statusFilter) issues = issues.filter((i) => i.statusCategory === statusFilter);
  if (territoryFilter) {
    issues = issues.filter((i) => (i.territory || "Unassigned") === territoryFilter);
  }
  if (serviceFilter) issues = issues.filter((i) => i.serviceType === serviceFilter);
  if (searchTerm) {
    issues = issues.filter(
      (i) =>
        i.key.toLowerCase().includes(searchTerm) ||
        (i.projectId || "").toLowerCase().includes(searchTerm) ||
        (i.summary || "").toLowerCase().includes(searchTerm)
    );
  }

  issues.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));

  body.innerHTML = "";
  emptyState.hidden = issues.length > 0;

  for (const issue of issues.slice(0, 1000)) {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.innerHTML = `
      <td class="col-key">${issue.key}</td>
      <td class="col-updated">${escapeHtml(issue.projectId || "\u2014")}</td>
      <td>${escapeHtml(issue.summary)}</td>
      <td><span class="status-pill ${statusPillClass(issue.statusCategory)}">${statusLabel(issue.statusCategory, issue.status)}</span></td>
      <td>${escapeHtml(issue.priority || "\u2014")}</td>
      <td>${escapeHtml(issue.assignee || "Unassigned")}</td>
      <td>${escapeHtml(issue.territory || "\u2014")}</td>
      <td>${escapeHtml(issue.serviceType || "\u2014")}</td>
      <td class="col-updated">${formatDate(issue.dueDate)}</td>
    `;
    tr.addEventListener("click", () => openProjectModal(issue));
    body.appendChild(tr);
  }
}

initListPage();

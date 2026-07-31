// dashboard.js
// Renders the Dashboard page: KPIs + charts + a projects table, all driven
// by the filter bar (Territory / Service Type / Status).

const TERRITORY_COLORS = [
  "#005198", "#D98E3D", "#4B7A52", "#8B5FBF", "#C0555A",
  "#4A9BA8", "#B08642", "#6B7A99", "#7A9B4E", "#A8617D",
];

function territoryColor(index) {
  return TERRITORY_COLORS[index % TERRITORY_COLORS.length];
}

let allIssues = [];
let territoryChartInstance = null;
let statusChartInstance = null;

async function initDashboardPage() {
  let data;
  try {
    data = await loadDashboardData();
  } catch (err) {
    document.getElementById("sync-text").textContent = "Could not load data.";
    console.error(err);
    return;
  }

  renderSyncStatus(data);
  allIssues = flattenIssues(data);

  populateFilters(allIssues);
  renderAll();

  document.getElementById("territory-filter").addEventListener("change", renderAll);
  document.getElementById("service-filter").addEventListener("change", renderAll);
  document.getElementById("status-filter").addEventListener("change", renderAll);
  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("territory-filter").value = "";
    document.getElementById("service-filter").value = "";
    document.getElementById("status-filter").value = "";
    renderAll();
  });
}

function populateFilters(issues) {
  const territories = new Set();
  const services = new Set();
  for (const issue of issues) {
    territories.add(issue.territory || "Unassigned");
    if (issue.serviceType) services.add(issue.serviceType);
  }

  const territorySelect = document.getElementById("territory-filter");
  for (const t of Array.from(territories).sort()) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    territorySelect.appendChild(opt);
  }

  const serviceSelect = document.getElementById("service-filter");
  for (const s of Array.from(services).sort()) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    serviceSelect.appendChild(opt);
  }
}

function getFilteredIssues() {
  const territory = document.getElementById("territory-filter").value;
  const service = document.getElementById("service-filter").value;
  const status = document.getElementById("status-filter").value;

  return allIssues.filter((issue) => {
    if (territory && (issue.territory || "Unassigned") !== territory) return false;
    if (service && issue.serviceType !== service) return false;
    if (status && issue.statusCategory !== status) return false;
    return true;
  });
}

function renderAll() {
  const issues = getFilteredIssues();
  renderKpis(issues);
  renderTerritoryChart(issues);
  renderStatusChart(issues);
  renderTerritoryBreakdown(issues);
  renderProjectsTable(issues);
}

function groupByTerritory(issues) {
  const groups = {};
  for (const issue of issues) {
    const key = issue.territory || "Unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(issue);
  }
  return groups;
}

function formatCurrency(amount) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function renderKpis(issues) {
  const total = issues.length;
  const inProgress = issues.filter((i) => i.statusCategory === "In Progress").length;
  const territories = new Set(issues.map((i) => i.territory || "Unassigned")).size;
  const revenue = issues.reduce((sum, i) => sum + (i.price || 0), 0);

  const kpis = [
    { label: "Total Tickets", value: total.toLocaleString("en-US") },
    { label: "Territories", value: territories.toLocaleString("en-US") },
    { label: "In Progress", value: inProgress.toLocaleString("en-US") },
    { label: "Total Revenue", value: formatCurrency(revenue) },
  ];

  const grid = document.getElementById("kpi-grid");
  grid.innerHTML = kpis
    .map(
      (k) => `
      <div class="kpi-card">
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
      </div>`
    )
    .join("");
}

function renderTerritoryChart(issues) {
  const groups = groupByTerritory(issues);
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  if (territoryChartInstance) territoryChartInstance.destroy();
  const ctx = document.getElementById("territory-chart");
  territoryChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: entries.map(([territory]) => territory),
      datasets: [
        {
          label: "Issues",
          data: entries.map(([, list]) => list.length),
          backgroundColor: entries.map((_, i) => territoryColor(i)),
          borderRadius: 4,
          maxBarThickness: 48,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#DBDBDD" } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderStatusChart(issues) {
  const counts = { "To Do": 0, "In Progress": 0, Done: 0 };
  for (const issue of issues) {
    if (counts[issue.statusCategory] !== undefined) counts[issue.statusCategory] += 1;
  }

  if (statusChartInstance) statusChartInstance.destroy();
  const ctx = document.getElementById("status-chart");
  statusChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["To Do", "In Progress", "Done"],
      datasets: [
        {
          data: [counts["To Do"], counts["In Progress"], counts["Done"]],
          backgroundColor: ["#51565C", "#D98E3D", "#4B7A52"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, font: { family: "Inter" } } },
      },
    },
  });
}

function renderTerritoryBreakdown(issues) {
  const groups = groupByTerritory(issues);
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  const container = document.getElementById("territory-breakdown");
  if (entries.length === 0) {
    container.innerHTML = `<p class="empty-state">No issues match these filters.</p>`;
    return;
  }

  container.innerHTML = entries
    .map(([territory, list]) => {
      const total = Math.max(list.length, 1);
      const todo = list.filter((i) => i.statusCategory === "To Do").length;
      const inProgress = list.filter((i) => i.statusCategory === "In Progress").length;
      const done = list.filter((i) => i.statusCategory === "Done").length;
      const revenue = list.reduce((sum, i) => sum + (i.price || 0), 0);

      return `
        <div class="territory-row">
          <div class="territory-row-head">
            <span class="territory-name">${escapeHtml(territory)}</span>
            <span class="territory-total">${list.length} ticket${list.length === 1 ? "" : "s"} \u00b7 ${formatCurrency(revenue)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-seg-todo" style="width:${(todo / total) * 100}%"></div>
            <div class="progress-seg-progress" style="width:${(inProgress / total) * 100}%"></div>
            <div class="progress-seg-done" style="width:${(done / total) * 100}%"></div>
          </div>
          <div class="progress-legend">
            <span class="legend-todo">${todo} To Do</span>
            <span class="legend-progress">${inProgress} In Progress</span>
            <span class="legend-done">${done} Done</span>
          </div>
        </div>`;
    })
    .join("");
}

function renderProjectsTable(issues) {
  const body = document.getElementById("projects-body");
  const emptyState = document.getElementById("projects-empty-state");

  const sorted = [...issues].sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));

  body.innerHTML = "";
  emptyState.hidden = sorted.length > 0;

  for (const issue of sorted.slice(0, 200)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-key">${issue.key}</td>
      <td>${escapeHtml(issue.summary)}</td>
      <td>${escapeHtml(issue.serviceType || issue.type || "\u2014")}</td>
      <td>${issue.price != null ? formatCurrency(issue.price) : "\u2014"}</td>
      <td><span class="status-pill ${statusPillClass(issue.statusCategory)}">${issue.statusCategory}</span></td>
      <td>${escapeHtml(issue.territory || "Unassigned")}</td>
      <td class="col-updated">${formatDate(issue.dueDate)}</td>
    `;
    body.appendChild(tr);
  }
}

initDashboardPage();

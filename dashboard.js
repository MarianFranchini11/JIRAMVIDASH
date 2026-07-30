// dashboard.js
// Renders the Dashboard page: KPI cards + charts, grouped by MDS Territory.

const TERRITORY_COLORS = [
  "#3B6E8F", "#D98E3D", "#4B7A52", "#8B5FBF", "#C0555A",
  "#4A9BA8", "#B08642", "#6B7A99", "#7A9B4E", "#A8617D",
];

function territoryColor(index) {
  return TERRITORY_COLORS[index % TERRITORY_COLORS.length];
}

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

  const issues = flattenIssues(data);
  renderKpis(issues, data.projects.length);
  renderTerritoryChart(issues);
  renderStatusChart(issues);
  renderTerritoryBreakdown(issues);
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

function renderKpis(issues, projectCount) {
  const total = issues.length;
  const inProgress = issues.filter((i) => i.statusCategory === "In Progress").length;
  const done = issues.filter((i) => i.statusCategory === "Done").length;
  const territories = new Set(issues.map((i) => i.territory || "Unassigned")).size;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  const kpis = [
    { label: "Total Issues", value: total.toLocaleString("en-US") },
    { label: "Territories", value: territories.toLocaleString("en-US") },
    { label: "In Progress", value: inProgress.toLocaleString("en-US") },
    { label: "Completion Rate", value: `${completionRate}%` },
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

  const ctx = document.getElementById("territory-chart");
  new Chart(ctx, {
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
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#E4E0D4" } },
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

  const ctx = document.getElementById("status-chart");
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["To Do", "In Progress", "Done"],
      datasets: [
        {
          data: [counts["To Do"], counts["In Progress"], counts["Done"]],
          backgroundColor: ["#5B6472", "#D98E3D", "#4B7A52"],
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
  container.innerHTML = entries
    .map(([territory, list]) => {
      const total = Math.max(list.length, 1);
      const todo = list.filter((i) => i.statusCategory === "To Do").length;
      const inProgress = list.filter((i) => i.statusCategory === "In Progress").length;
      const done = list.filter((i) => i.statusCategory === "Done").length;

      return `
        <div class="territory-row">
          <div class="territory-row-head">
            <span class="territory-name">${escapeHtml(territory)}</span>
            <span class="territory-total">${list.length} issue${list.length === 1 ? "" : "s"}</span>
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

initDashboardPage();

// shared.js
// Utilities shared by index.html (Dashboard) and issues.html (Issues List).

async function loadDashboardData() {
  const res = await fetch(`data/data.json?_=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
  return res.json();
}

function renderSyncStatus(data) {
  const pulse = document.getElementById("pulse");
  const text = document.getElementById("sync-text");
  if (!pulse || !text) return;

  if (!data.generatedAt) {
    text.textContent = "Not synced yet -- showing sample data";
    pulse.classList.add("stale");
    return;
  }

  const generated = new Date(data.generatedAt);
  const hoursAgo = Math.round((Date.now() - generated.getTime()) / 3600000);
  const label =
    hoursAgo <= 0 ? "moments ago" : hoursAgo === 1 ? "1 hour ago" : `${hoursAgo} hours ago`;

  text.textContent = `Synced ${label}`;
  if (hoursAgo > 30) pulse.classList.add("stale");
}

// Flatten every project's issues into one array, tagging each with its
// project key/name so cross-project views (like the Dashboard) can use them.
function flattenIssues(data) {
  const all = [];
  for (const project of data.projects) {
    for (const issue of project.issues) {
      all.push({ ...issue, projectKey: project.key, jiraProjectName: project.name });
    }
  }
  return all;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function statusPillClass(statusCategory) {
  if (statusCategory === "Done") return "status-done";
  if (statusCategory === "In Progress") return "status-progress";
  return "status-todo";
}

// rm-projects.js
// "Projects" sub-tab inside Resource Management: find a Jira ticket, then
// assign team members and log hours per day against it. Hours live in a
// Firestore collection ("assignments"), separate from Jira.

let rmDataLoaded = false;
let rmProjectsInitialized = false;
let rmOverviewInitialized = false;
let rmAllTickets = [];
let rmAssignments = [];
let rmSelectedTicketKey = null;
let rmSelectedWeekStart = null;
let rmActiveSubTab = "roster";

// Loads Jira tickets + starts the live assignments listener. Safe to call
// from either the Projects or the Resource Overview tab -- runs once.
function ensureRMDataLoaded() {
  if (rmDataLoaded) return;
  rmDataLoaded = true;
  rmSelectedWeekStart = rmMondayOf(rmToISO(new Date()));

  loadDashboardData()
    .then((data) => {
      rmAllTickets = flattenIssues(data);
      if (rmActiveSubTab === "projects") renderRMTicketDetail();
    })
    .catch((err) => console.error("Could not load Jira tickets for assignment:", err));

  db.collection("assignments").onSnapshot(
    (snapshot) => {
      rmAssignments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (rmActiveSubTab === "projects") {
        renderRMStats();
        renderRMTicketDetail();
      } else if (rmActiveSubTab === "overview") {
        renderRMOverviewTable();
      }
    },
    (err) => console.error("Failed to load assignments:", err)
  );
}

function initRMProjectsTab() {
  rmActiveSubTab = "projects";
  ensureRMDataLoaded();

  if (rmProjectsInitialized) {
    renderRMWeekLabel();
    renderRMStats();
    renderRMTicketDetail();
    return;
  }
  rmProjectsInitialized = true;

  document.getElementById("rm-week-search").addEventListener("input", (e) => {
    renderRMTicketSearchResults(e.target.value.trim());
  });
  document.getElementById("rm-week-prev").addEventListener("click", () => {
    rmSelectedWeekStart = rmAddDays(rmSelectedWeekStart, -7);
    renderRMWeekLabel();
    renderRMOverviewWeekLabel();
    renderRMStats();
    renderRMTicketDetail();
  });
  document.getElementById("rm-week-next").addEventListener("click", () => {
    rmSelectedWeekStart = rmAddDays(rmSelectedWeekStart, 7);
    renderRMWeekLabel();
    renderRMOverviewWeekLabel();
    renderRMStats();
    renderRMTicketDetail();
  });

  renderRMWeekLabel();
  renderRMStats();
  renderRMTicketDetail();
}

function initRMOverviewTab() {
  rmActiveSubTab = "overview";
  ensureRMDataLoaded();

  if (rmOverviewInitialized) {
    renderRMOverviewWeekLabel();
    renderRMOverviewTable();
    return;
  }
  rmOverviewInitialized = true;

  document.getElementById("rm-ov-week-prev").addEventListener("click", () => {
    rmSelectedWeekStart = rmAddDays(rmSelectedWeekStart, -7);
    renderRMWeekLabel();
    renderRMOverviewWeekLabel();
    renderRMStats();
    renderRMOverviewTable();
  });
  document.getElementById("rm-ov-week-next").addEventListener("click", () => {
    rmSelectedWeekStart = rmAddDays(rmSelectedWeekStart, 7);
    renderRMWeekLabel();
    renderRMOverviewWeekLabel();
    renderRMStats();
    renderRMOverviewTable();
  });

  renderRMOverviewWeekLabel();
  renderRMOverviewTable();
}

// ---- Date helpers (this sub-tab needs a plain Mon-Sun week, distinct from
// the "Due month" filter on the Dashboard) ----
function rmToISO(d) {
  return d.toISOString().slice(0, 10);
}
function rmAddDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return rmToISO(d);
}
function rmMondayOf(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const wd = d.getUTCDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return rmToISO(d);
}
function rmDayLabel(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}
function rmIsWeekend(iso) {
  const wd = new Date(iso + "T00:00:00Z").getUTCDay();
  return wd === 0 || wd === 6;
}
function rmCurrentWeekDates() {
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(rmAddDays(rmSelectedWeekStart, i));
  return dates;
}

function renderRMWeekLabel() {
  const dates = rmCurrentWeekDates();
  document.getElementById("rm-week-label").textContent =
    `${rmDayLabel(dates[0])} \u2013 ${rmDayLabel(dates[6])}`;
}

function renderRMOverviewWeekLabel() {
  const el = document.getElementById("rm-ov-week-label");
  if (!el) return;
  const dates = rmCurrentWeekDates();
  el.textContent = `${rmDayLabel(dates[0])} \u2013 ${rmDayLabel(dates[6])}`;
}

function renderRMOverviewTable() {
  const container = document.getElementById("rm-overview-table");
  if (!container) return;

  const week = rmCurrentWeekDates();
  const active = allResources.filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name));

  if (active.length === 0) {
    container.innerHTML = `<p class="empty-state">No active resources yet. Add some in the Team Roster tab.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="rm-grid">
        <thead>
          <tr>
            <th style="min-width:160px;">Resource</th>
            ${week.map((d) => `<th class="rm-daycol ${rmIsWeekend(d) ? "weekend" : ""}">${rmDayLabel(d)}</th>`).join("")}
            <th>Week Total</th>
          </tr>
        </thead>
        <tbody>
          ${active
            .map((r) => {
              let weekTotal = 0;
              const cells = week
                .map((d) => {
                  const total = rmTotalForResourceDay(r.id, d);
                  weekTotal += total;
                  const status = rmClassify(total, rmIsWeekend(d));
                  const tip = rmBreakdownForResourceDay(r.id, d).join(" \u00b7 ") || "No hours assigned";
                  return `<td class="rm-daycell rm-st-${status}" title="${rmStatusLabel(status)}: ${escapeHtml(tip)}">
                    <span class="rm-cellbox" style="cursor:default;">${total}</span>
                  </td>`;
                })
                .join("");
              return `<tr><td class="namecell">${escapeHtml(r.name)} <span class="teambadge">${escapeHtml(r.team)}</span></td>${cells}<td class="totalcell">${weekTotal}h</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="legend">
      <span><span class="dot" style="background:var(--moss);"></span>Full 8h</span>
      <span><span class="dot" style="background:var(--amber);"></span>Under 8h</span>
      <span><span class="dot" style="background:var(--rm-over);"></span>Over 8h (overtime)</span>
      <span><span class="dot" style="background:var(--rm-sat);"></span>Worked weekend (overtime)</span>
      <span><span class="dot" style="background:var(--slate);"></span>Unassigned that day</span>
    </div>
  `;
}

// ---- Data helpers ----
function rmAssignmentsForTicket(ticketKey) {
  return rmAssignments.filter((a) => a.ticketKey === ticketKey);
}
function rmTotalForResourceDay(resourceId, date) {
  return rmAssignments
    .filter((a) => a.resourceId === resourceId)
    .reduce((sum, a) => sum + (a.hours && a.hours[date] ? a.hours[date] : 0), 0);
}
function rmBreakdownForResourceDay(resourceId, date) {
  return rmAssignments
    .filter((a) => a.resourceId === resourceId && a.hours && a.hours[date])
    .map((a) => `${a.ticketKey}: ${a.hours[date]}h`);
}
function rmClassify(total, isWeekend) {
  if (isWeekend) return total > 0 ? "satOT" : "weekendoff";
  if (total === 0) return "unassigned";
  if (total < 8) return "under";
  if (total === 8) return "ok";
  return "over";
}
function rmStatusLabel(s) {
  return {
    ok: "Full 8h",
    under: "Under 8h",
    over: "Overtime (>8h)",
    unassigned: "Unassigned",
    satOT: "Worked weekend (overtime)",
    weekendoff: "No work (weekend)",
  }[s];
}
function rmResourceById(id) {
  return allResources.find((r) => r.id === id);
}
function rmResourceName(id) {
  const r = rmResourceById(id);
  return r ? r.name : "\u2014";
}

// ---- Alerts / stats bar (mirrors the Dashboard's KPI card look) ----
function computeRMAlerts(week) {
  const unassignedWeek = [], underInstances = [], overInstances = [], weekendInstances = [];
  allResources.filter((r) => r.active).forEach((r) => {
    let weekTotal = 0;
    week.forEach((d) => (weekTotal += rmTotalForResourceDay(r.id, d)));
    if (weekTotal === 0) {
      unassignedWeek.push(r.name);
      return;
    }
    week.forEach((d) => {
      const total = rmTotalForResourceDay(r.id, d);
      const we = rmIsWeekend(d);
      if (!we) {
        if (total > 0 && total < 8) underInstances.push({ name: r.name, day: rmDayLabel(d) });
        else if (total > 8) overInstances.push({ name: r.name, day: rmDayLabel(d), total });
      } else if (total > 0) {
        weekendInstances.push({ name: r.name, day: rmDayLabel(d), total });
      }
    });
  });
  return { unassignedWeek, underInstances, overInstances, weekendInstances };
}

function renderRMStats() {
  const grid = document.getElementById("rm-stats-grid");
  if (!grid) return;
  const alerts = computeRMAlerts(rmCurrentWeekDates());
  const kpis = [
    { label: "No Assignment This Week", value: alerts.unassignedWeek.length },
    { label: "Days Under 8h", value: alerts.underInstances.length },
    { label: "Days Overtime (>8h)", value: alerts.overInstances.length },
    { label: "Weekend Work Logged", value: alerts.weekendInstances.length },
  ];
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

// ---- Ticket search ----
function renderRMTicketSearchResults(query) {
  const container = document.getElementById("rm-ticket-results");
  if (!query) {
    container.innerHTML = "";
    return;
  }
  const q = query.toLowerCase();
  const matches = rmAllTickets
    .filter(
      (t) =>
        t.key.toLowerCase().includes(q) ||
        (t.projectName || "").toLowerCase().includes(q) ||
        (t.summary || "").toLowerCase().includes(q)
    )
    .slice(0, 15);

  if (matches.length === 0) {
    container.innerHTML = `<p class="empty-state">No tickets match "${escapeHtml(query)}".</p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap rm-ticket-pick-wrap">
      <table>
        <thead><tr><th>Key</th><th>Project Name</th><th>Territory</th><th>Status</th></tr></thead>
        <tbody>
          ${matches
            .map(
              (t) => `
            <tr class="clickable-row" data-ticketkey="${t.key}">
              <td class="col-key">${t.key}</td>
              <td>${escapeHtml(t.projectName)}</td>
              <td>${escapeHtml(t.territory || "Unassigned")}</td>
              <td><span class="status-pill ${statusPillClass(t.statusCategory)}">${t.statusCategory}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("tr[data-ticketkey]").forEach((row) => {
    row.addEventListener("click", () => selectRMTicket(row.dataset.ticketkey));
  });
}

function selectRMTicket(key) {
  rmSelectedTicketKey = key;
  document.getElementById("rm-week-search").value = "";
  document.getElementById("rm-ticket-results").innerHTML = "";
  renderRMTicketDetail();
}

// ---- Ticket detail + hour grid ----
function renderRMTicketDetail() {
  const container = document.getElementById("rm-ticket-detail");
  if (!rmSelectedTicketKey) {
    container.innerHTML = "";
    return;
  }
  const ticket = rmAllTickets.find((t) => t.key === rmSelectedTicketKey);
  if (!ticket) {
    container.innerHTML = `<p class="empty-state">Ticket ${escapeHtml(rmSelectedTicketKey)} not found.</p>`;
    return;
  }

  const week = rmCurrentWeekDates();
  const rows = rmAssignmentsForTicket(rmSelectedTicketKey);
  const assignedIds = new Set(rows.map((r) => r.resourceId));
  const available = allResources.filter((r) => r.active && !assignedIds.has(r.id));

  container.innerHTML = `
    <div class="panel-head" style="margin-top:24px;">
      <h2><span class="col-key">${ticket.key}</span> &middot; ${escapeHtml(ticket.projectName)}</h2>
      <span class="rm-roster-hint">Hours per day &middot; lives only in this ledger, does not sync back to Jira</span>
    </div>
    <div class="table-wrap">
      <table class="rm-grid">
        <thead>
          <tr>
            <th style="min-width:160px;">Resource</th>
            ${week.map((d) => `<th class="rm-daycol ${rmIsWeekend(d) ? "weekend" : ""}">${rmDayLabel(d)}</th>`).join("")}
            <th>Total</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length === 0
              ? `<tr><td colspan="${week.length + 3}" class="empty">No resources assigned to this ticket yet.</td></tr>`
              : rows
                  .map((a) => {
                    let rowTotal = 0;
                    const cells = week
                      .map((d) => {
                        const totalDay = rmTotalForResourceDay(a.resourceId, d);
                        const own = (a.hours && a.hours[d]) || 0;
                        rowTotal += own;
                        const status = rmClassify(totalDay, rmIsWeekend(d));
                        const tip = rmBreakdownForResourceDay(a.resourceId, d).join(" \u00b7 ") || "No hours";
                        return `<td class="rm-daycell rm-st-${status}" title="${rmStatusLabel(status)}: ${escapeHtml(tip)}">
                          <span class="rm-cellbox"><input type="number" min="0" step="1" value="${own}" data-assign="${a.id}" data-date="${d}"></span>
                        </td>`;
                      })
                      .join("");
                    const m = rmResourceById(a.resourceId);
                    return `<tr class="${m && !m.active ? "inactive-row" : ""}">
                      <td class="namecell">${rmResourceName(a.resourceId)} ${m ? `<span class="teambadge ${escapeHtml(m.team)}">${escapeHtml(m.team)}</span>` : ""}</td>
                      ${cells}
                      <td class="totalcell">${rowTotal}h</td>
                      <td><button type="button" class="rm-remove-btn" data-removeassign="${a.id}">Remove</button></td>
                    </tr>`;
                  })
                  .join("")
          }
        </tbody>
      </table>
    </div>
    <div class="rm-addrow">
      <select id="rm-new-assignee">
        ${
          available.length
            ? available.map((r) => `<option value="${r.id}">${escapeHtml(r.name)} (${escapeHtml(r.team)})</option>`).join("")
            : '<option value="">— everyone active is already assigned —</option>'
        }
      </select>
      <button type="button" class="rm-add-btn" id="rm-add-existing">+ Add to this ticket</button>
      <span class="muted">or</span>
      <input type="text" class="rm-search" id="rm-new-name" placeholder="New resource name (no Jira account)" />
      <button type="button" class="rm-add-btn" id="rm-add-new">+ Create and add</button>
    </div>
    <div class="legend">
      <span><span class="dot" style="background:var(--moss);"></span>Full 8h</span>
      <span><span class="dot" style="background:var(--amber);"></span>Under 8h</span>
      <span><span class="dot" style="background:var(--rm-over);"></span>Over 8h (overtime)</span>
      <span><span class="dot" style="background:var(--rm-sat);"></span>Worked weekend (overtime)</span>
      <span><span class="dot" style="background:var(--slate);"></span>Unassigned that day</span>
    </div>
  `;

  container.querySelectorAll("input[data-assign]").forEach((el) => {
    el.addEventListener("change", (e) => {
      const val = Math.max(0, parseFloat(e.target.value) || 0);
      updateRMAssignmentHour(e.target.dataset.assign, e.target.dataset.date, val);
    });
  });
  container.querySelectorAll("[data-removeassign]").forEach((el) => {
    el.addEventListener("click", () => removeRMAssignment(el.dataset.removeassign));
  });
  const addExistingBtn = document.getElementById("rm-add-existing");
  if (addExistingBtn) {
    addExistingBtn.addEventListener("click", () => {
      const sel = document.getElementById("rm-new-assignee");
      if (!sel.value) return;
      addRMAssignment(rmSelectedTicketKey, sel.value);
    });
  }
  const addNewBtn = document.getElementById("rm-add-new");
  if (addNewBtn) {
    addNewBtn.addEventListener("click", async () => {
      const input = document.getElementById("rm-new-name");
      const name = input.value.trim();
      if (!name) return;
      const resourceRef = await db.collection("resources").add({
        name,
        team: "Other",
        email: "",
        level: "Junior",
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await addRMAssignment(rmSelectedTicketKey, resourceRef.id);
    });
  }
}

async function updateRMAssignmentHour(assignmentId, date, value) {
  try {
    await db.collection("assignments").doc(assignmentId).update({ [`hours.${date}`]: value });
  } catch (err) {
    console.error("Failed to update hours:", err);
    alert(`Could not save hours: ${err.message}`);
  }
}

async function addRMAssignment(ticketKey, resourceId) {
  try {
    await db.collection("assignments").add({ ticketKey, resourceId, hours: {} });
  } catch (err) {
    console.error("Failed to add assignment:", err);
    alert(`Could not add resource to this ticket: ${err.message}`);
  }
}

async function removeRMAssignment(id) {
  if (!confirm("Remove this resource from the ticket? Their logged hours for it will be deleted.")) return;
  try {
    await db.collection("assignments").doc(id).delete();
  } catch (err) {
    console.error("Failed to remove assignment:", err);
    alert(`Could not remove: ${err.message}`);
  }
}

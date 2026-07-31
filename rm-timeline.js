// rm-timeline.js
// "Timeline" sub-tab: Gantt view + upcoming deadlines for tickets that are
// To Do or In Progress, with a pace bar comparing hours logged vs. an
// estimate (Price / 2 / 25, or a manual override stored in Firestore).

let rmTimelineInitialized = false;
let rmEstimates = {}; // ticketKey -> { hours, manual }

function initRMTimelineTab() {
  rmActiveSubTab = "timeline";
  ensureRMDataLoaded();

  if (rmTimelineInitialized) {
    renderRMTimeline();
    return;
  }
  rmTimelineInitialized = true;

  db.collection("estimates").onSnapshot(
    (snapshot) => {
      rmEstimates = {};
      snapshot.docs.forEach((doc) => {
        rmEstimates[doc.id] = doc.data();
      });
      renderRMTimeline();
    },
    (err) => console.error("Failed to load estimates:", err)
  );

  // Re-render once Jira tickets/assignments finish loading (ensureRMDataLoaded
  // is async), in case Timeline was opened before Projects/Overview.
  loadDashboardData().then(() => renderRMTimeline());
}

function rmTicketsForTimeline() {
  return rmAllTickets.filter(
    (t) => (t.statusCategory === "To Do" || t.statusCategory === "In Progress") && t.dueDate
  );
}

function rmEstimatedHours(ticket) {
  const override = rmEstimates[ticket.key];
  if (override && override.hours != null) return override.hours;
  if (ticket.price != null) return Math.round((ticket.price / 2 / 25) * 10) / 10;
  return null;
}

function rmHoursLoggedTotal(ticketKey) {
  return rmAssignments
    .filter((a) => a.ticketKey === ticketKey)
    .reduce((sum, a) => sum + Object.values(a.hours || {}).reduce((s, h) => s + (h || 0), 0), 0);
}

function rmDaysBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 86400000);
}

function rmUrgency(daysLeft) {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "urgent";
  if (daysLeft <= 21) return "soon";
  return "ok";
}
function rmUrgencyLabel(daysLeft) {
  if (daysLeft < 0) return `Overdue by ${Math.abs(daysLeft)}d`;
  if (daysLeft === 0) return "Due today";
  return `${daysLeft}d left`;
}

function rmComputePace(ticket) {
  const est = rmEstimatedHours(ticket);
  const created = ticket.created ? ticket.created.slice(0, 10) : ticket.dueDate;
  const today = rmToISO(new Date());
  const usedHours = rmHoursLoggedTotal(ticket.key);
  if (!est) return { est, usedHours, usedPct: null, expectedPct: null, status: "no-estimate" };

  const usedPct = Math.min(999, Math.round((usedHours / est) * 100));
  const totalSpan = Math.max(1, rmDaysBetween(created, ticket.dueDate));
  const elapsed = Math.max(0, Math.min(totalSpan, rmDaysBetween(created, today)));
  const expectedPct = Math.round((elapsed / totalSpan) * 100);
  const diff = usedPct - expectedPct;
  const status = diff > 10 ? "over" : diff < -10 ? "under" : "pace";
  return { est, usedHours, usedPct, expectedPct, status };
}
function rmPaceLabel(status) {
  return {
    over: "Using more hours than estimated",
    under: "Using fewer hours than estimated",
    pace: "On pace with estimate",
    "no-estimate": "No estimate yet",
  }[status];
}

function renderRMTimeline() {
  renderRMGantt();
  renderRMDeadlines();
}

function renderRMGantt() {
  const container = document.getElementById("rm-gantt");
  if (!container) return;
  const tickets = rmTicketsForTimeline();
  if (tickets.length === 0) {
    container.innerHTML = `<p class="empty-state">No To Do / In Progress tickets with a due date.</p>`;
    return;
  }

  const today = rmToISO(new Date());
  const starts = tickets.map((t) => (t.created ? t.created.slice(0, 10) : t.dueDate));
  const rangeStart = starts.reduce((a, b) => (a < b ? a : b));
  const rangeEnd = tickets.map((t) => t.dueDate).reduce((a, b) => (a > b ? a : b), today);
  const totalDays = Math.max(1, rmDaysBetween(rangeStart, rangeEnd));
  const pct = (iso) => Math.max(0, Math.min(100, (rmDaysBetween(rangeStart, iso) / totalDays) * 100));

  const sorted = [...tickets].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  container.innerHTML = `
    <div class="rm-ganttwrap">
      <div class="rm-ganttbody">
        <div class="rm-todayline" style="left:${pct(today)}%;"><span class="rm-todaytag">Today</span></div>
        ${sorted
          .map((t) => {
            const start = t.created ? t.created.slice(0, 10) : t.dueDate;
            const left = pct(start);
            const width = Math.max(1.2, pct(t.dueDate) - left);
            const daysLeft = rmDaysBetween(today, t.dueDate);
            const u = rmUrgency(daysLeft);
            return `<div class="rm-ganttrow">
              <div class="rm-ganttlabel">${t.key}<span class="sub">${escapeHtml(t.projectName)}</span></div>
              <div class="rm-ganttrack">
                <div class="rm-ganttbar rm-gb-${u}" style="left:${left}%;width:${width}%;" title="${escapeHtml(t.projectName)} \u00b7 ${start} \u2013 ${t.dueDate}">${t.dueDate}</div>
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderRMDeadlines() {
  const container = document.getElementById("rm-deadlines");
  if (!container) return;
  const tickets = rmTicketsForTimeline();
  if (tickets.length === 0) {
    container.innerHTML = "";
    return;
  }
  const today = rmToISO(new Date());
  const sorted = [...tickets].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  container.innerHTML = sorted
    .map((t) => {
      const daysLeft = rmDaysBetween(today, t.dueDate);
      const u = rmUrgency(daysLeft);
      const pace = rmComputePace(t);
      const crew = rmAssignmentsForTicket(t.key).map((a) => rmResourceName(a.resourceId));
      const created = t.created ? t.created.slice(0, 10) : "\u2014";

      const paceHtml =
        pace.est == null
          ? `<div class="rm-pacewrap">
              <p class="modal-note" style="margin:0 0 6px;">No hour estimate for this ticket (Price not set).</p>
              <div class="rm-estimate-input">
                <input type="number" min="0" step="0.5" placeholder="Manual estimate (hours)" data-estimatefor="${t.key}" />
                <button type="button" class="clear-filters-btn" data-saveestimate="${t.key}">Save</button>
              </div>
            </div>`
          : `<div class="rm-pacewrap">
              <div class="rm-pacebar">
                <div class="rm-pacefill" style="width:${Math.min(100, pace.usedPct)}%;"></div>
                <div class="rm-pacemark" style="left:${Math.min(100, pace.expectedPct)}%;" title="Expected pace if hours were spent evenly"></div>
              </div>
              <div class="rm-pacetext">
                <span>${pace.usedHours}h logged of ${pace.est}h estimated (${pace.usedPct}%)</span>
                <span class="rm-pacepill rm-pace-${pace.status}">${rmPaceLabel(pace.status)}</span>
              </div>
            </div>`;

      return `<div class="rm-deadlinerow">
        <span class="rm-deadlinedate">${created} \u2013 ${t.dueDate}</span>
        <span class="rm-deadlinename">
          <span class="col-key">${t.key}</span> &middot; ${escapeHtml(t.projectName)}
          ${paceHtml}
        </span>
        <span class="daysbadge-${u}">${rmUrgencyLabel(daysLeft)}</span>
        <span class="rm-crew">${crew.length ? escapeHtml(crew.join(", ")) : "\u2014"}</span>
      </div>`;
    })
    .join("");

  container.querySelectorAll("[data-saveestimate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.saveestimate;
      const input = container.querySelector(`input[data-estimatefor="${key}"]`);
      const val = parseFloat(input.value);
      if (!val || val <= 0) return;
      db.collection("estimates")
        .doc(key)
        .set({ hours: val, manual: true })
        .catch((err) => alert(`Could not save estimate: ${err.message}`));
    });
  });
}

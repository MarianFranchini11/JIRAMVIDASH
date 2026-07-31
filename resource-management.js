// resource-management.js
// Add/list/edit resources stored in Firestore (collection "resources").

let allResources = [];
let activeTeamFilter = "";
let unsubscribe = null;

// Full team roster from the PM's mockup (57 people): 42 GCS + 10 ARG + 5 OUT.
const MOCKUP_TEAM_GCS = [
  "SAHOO Monalisha", "Rarish P", "Sirajudheen K P", "C Rojes Malachi", "Sujavudeen A", "Akshaya T",
  "A Guruprasath", "Vishnu Itagi", "Rejin James J L", "Nandhakumar S", "Bharath Kumar K",
  "Poongothai Subramanian", "Shreya P S", "Elbinston Camil C", "Sumit Kumar", "Leo Pauly P",
  "Sreejith J S", "Pulivarthi Ravi Teja", "Abhilasha Kumari", "Mallikarjun R Bannuri", "Karthi E",
  "Naidili B", "Nikesh Vishwanath Meshram", "Krishnaveni Pothala", "Nihad Khan N N", "Mohamed Fayis M",
  "Binobin Dubas Baludin", "Mohamed Thoufeek M", "Satyanarayana Ramoji", "Doddi Chakradhara Rao",
  "Naveen Kumar R", "Sheik Moideen S", "Venugopal K", "Vigneshwar Mani", "Muthu Ramachandran",
  "Priyadharshini Venkatesan", "Vimal Raghu", "E Ebisho", "A Ajisha", "Begini Praveen kumar",
  "Prasanna Kumara", "Mohammed Afroz",
];
const MOCKUP_TEAM_ARG = [
  "Maria Constanza, Aguero Gomez", "Rocio, Ferreyra", "Melina Aldana, Gavioli", "Fernanda Yasmin, Soria",
  "Erick Miguel, Saldarriaga Ordinola", "David Antonio, Paredes Coronel", "Diana Carolina, Rodriguez Viana",
  "Natalia, Tolosa", "Mircko Alexandro, Hijar Torres", "Agustina, Bustamante",
];
const MOCKUP_TEAM_OUT = ["CadBricks", "One Click", "Virtual Building", "Value 3D", "BIM Prove"];

function slugifyMockupName(name) {
  return name
    .toLowerCase()
    .replace(/,/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
}

function buildMockupMember(name, team) {
  if (team === "OUT") {
    const domain = slugifyMockupName(name).replace(/\./g, "");
    return { name, team, email: `contact@${domain}.com`, level: "Mid", active: true };
  }
  return { name, team, email: `${slugifyMockupName(name)}@multivista.com`, level: "Mid", active: true };
}

async function importMockupTeam() {
  const members = [
    ...MOCKUP_TEAM_GCS.map((n) => buildMockupMember(n, "GCS")),
    ...MOCKUP_TEAM_ARG.map((n) => buildMockupMember(n, "ARG")),
    ...MOCKUP_TEAM_OUT.map((n) => buildMockupMember(n, "OUT")),
  ];

  const existingEmails = new Set(allResources.map((r) => r.email.toLowerCase()));
  const toAdd = members.filter((m) => !existingEmails.has(m.email.toLowerCase()));

  if (toAdd.length === 0) {
    alert("Everyone from the mockup team is already in the roster.");
    return;
  }
  if (!confirm(`Import ${toAdd.length} resource(s) from the mockup team?`)) return;

  const batch = db.batch();
  for (const m of toAdd) {
    const ref = db.collection("resources").doc();
    batch.set(ref, { ...m, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  try {
    await batch.commit();
  } catch (err) {
    console.error("Failed to import mockup team:", err);
    alert(`Could not import team: ${err.message}`);
  }
}

function initResourceManagementPage() {
  // Sub-tab switching (Team Roster / Projects / Resource Overview).
  document.querySelectorAll(".rm-subnav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = link.dataset.rmtab;
      document.querySelectorAll(".rm-subnav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.getElementById("rm-tab-roster").style.display = target === "roster" ? "block" : "none";
      document.getElementById("rm-tab-projects").style.display = target === "projects" ? "block" : "none";
      document.getElementById("rm-tab-overview").style.display = target === "overview" ? "block" : "none";
      if (target === "projects" && typeof initRMProjectsTab === "function") {
        initRMProjectsTab();
      }
      if (target === "overview" && typeof initRMOverviewTab === "function") {
        initRMOverviewTab();
      }
    });
  });

  // Live-updates: re-render automatically whenever the collection changes,
  // including changes made by other people viewing the page.
  unsubscribe = db.collection("resources").orderBy("name").onSnapshot(
    (snapshot) => {
      allResources = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderChips();
      renderRoster();
    },
    (err) => {
      console.error("Failed to load resources:", err);
      document.getElementById("rm-empty-state").hidden = false;
      document.getElementById("rm-empty-state").textContent =
        "Could not load resources. Check the Firebase setup.";
    }
  );

  document.getElementById("add-resource-form").addEventListener("submit", handleAddResource);
  document.getElementById("rm-search").addEventListener("input", renderRoster);
  document.getElementById("rm-import-mockup-btn").addEventListener("click", importMockupTeam);
}

async function handleAddResource(e) {
  e.preventDefault();
  const errorEl = document.getElementById("rm-add-error");
  errorEl.hidden = true;

  const name = document.getElementById("rm-name").value.trim();
  const email = document.getElementById("rm-email").value.trim();
  const team = document.getElementById("rm-team").value.trim();
  const level = document.getElementById("rm-level").value;

  if (!name || !email || !team) return;

  try {
    await db.collection("resources").add({
      name,
      email,
      team,
      level,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById("add-resource-form").reset();
    document.getElementById("rm-level").value = "Mid";
  } catch (err) {
    errorEl.textContent = `Could not add resource: ${err.message}`;
    errorEl.hidden = false;
    console.error(err);
  }
}

async function updateResourceField(id, field, value) {
  try {
    await db.collection("resources").doc(id).update({ [field]: value });
  } catch (err) {
    console.error(`Failed to update ${field} for ${id}:`, err);
    alert(`Could not save change: ${err.message}`);
  }
}

async function deleteResource(id, name) {
  if (!confirm(`Remove ${name} from the roster?`)) return;
  try {
    await db.collection("resources").doc(id).delete();
  } catch (err) {
    console.error("Failed to delete resource:", err);
    alert(`Could not remove resource: ${err.message}`);
  }
}

function renderChips() {
  const teams = Array.from(new Set(allResources.map((r) => r.team))).sort();

  // Keep the datalist of team suggestions for the Add form in sync too.
  const datalist = document.getElementById("rm-team-suggestions");
  datalist.innerHTML = teams.map((t) => `<option value="${escapeHtml(t)}"></option>`).join("");

  const container = document.getElementById("rm-team-chips");
  const chips = [{ label: "All", value: "", count: allResources.length }].concat(
    teams.map((t) => ({
      label: t,
      value: t,
      count: allResources.filter((r) => r.team === t).length,
    }))
  );

  container.innerHTML = chips
    .map(
      (c) => `
      <button type="button" class="rm-chip ${activeTeamFilter === c.value ? "active" : ""}" data-value="${escapeHtml(c.value)}">
        ${escapeHtml(c.label)} <span class="rm-chip-count">${c.count}</span>
      </button>`
    )
    .join("");

  container.querySelectorAll(".rm-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTeamFilter = btn.dataset.value;
      renderChips();
      renderRoster();
    });
  });
}

function renderRoster() {
  const search = document.getElementById("rm-search").value.trim().toLowerCase();

  let filtered = allResources;
  if (activeTeamFilter) filtered = filtered.filter((r) => r.team === activeTeamFilter);
  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search)
    );
  }

  const container = document.getElementById("rm-roster");
  const emptyState = document.getElementById("rm-empty-state");
  emptyState.hidden = filtered.length > 0;

  if (filtered.length === 0) {
    container.innerHTML = "";
    return;
  }

  const groups = {};
  for (const r of filtered) {
    if (!groups[r.team]) groups[r.team] = [];
    groups[r.team].push(r);
  }

  container.innerHTML = Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([team, members]) => `
      <details class="rm-group" open>
        <summary>${escapeHtml(team)} <span class="rm-group-count">${members.length} member${members.length === 1 ? "" : "s"}</span></summary>
        <table class="rm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Level</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${members.map((r) => `
              <tr>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.email)}</td>
                <td>
                  <select class="rm-level-select" data-id="${r.id}">
                    ${["Junior", "Mid", "Senior", "Lead"].map((lvl) => `<option value="${lvl}" ${r.level === lvl ? "selected" : ""}>${lvl}</option>`).join("")}
                  </select>
                </td>
                <td>
                  <label class="rm-toggle">
                    <input type="checkbox" class="rm-active-toggle" data-id="${r.id}" ${r.active ? "checked" : ""} />
                    <span class="rm-toggle-slider"></span>
                  </label>
                </td>
                <td>
                  <button type="button" class="rm-remove-btn" data-id="${r.id}" data-name="${escapeHtml(r.name)}">Remove</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </details>
    `)
    .join("");

  container.querySelectorAll(".rm-level-select").forEach((el) => {
    el.addEventListener("change", () => updateResourceField(el.dataset.id, "level", el.value));
  });
  container.querySelectorAll(".rm-active-toggle").forEach((el) => {
    el.addEventListener("change", () => updateResourceField(el.dataset.id, "active", el.checked));
  });
  container.querySelectorAll(".rm-remove-btn").forEach((el) => {
    el.addEventListener("click", () => deleteResource(el.dataset.id, el.dataset.name));
  });
}

initResourceManagementPage();

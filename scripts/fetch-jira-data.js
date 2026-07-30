// scripts/fetch-jira-data.js
//
// Pulls issues from every Jira project the authenticated account can see,
// and writes a compact summary to data/data.json for the static dashboard.
//
// Required environment variables (set as GitHub Actions secrets):
//   JIRA_DOMAIN     e.g. "multivista.atlassian.net"
//   JIRA_EMAIL      the Atlassian account email tied to the API token
//   JIRA_API_TOKEN  the API token generated at id.atlassian.com

const fs = require("fs");
const path = require("path");

const DOMAIN = process.env.JIRA_DOMAIN;
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;

if (!DOMAIN || !EMAIL || !TOKEN) {
  console.error(
    "Missing one of JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN environment variables."
  );
  process.exit(1);
}

const BASE_URL = `https://${DOMAIN}/rest/api/3`;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

async function jiraGet(urlPath) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira request failed (${res.status}): ${urlPath}\n${body}`);
  }
  return res.json();
}

// Fetch every project visible to this account.
async function getProjects() {
  const projects = [];
  let startAt = 0;
  const maxResults = 50;
  while (true) {
    const page = await jiraGet(
      `/project/search?startAt=${startAt}&maxResults=${maxResults}`
    );
    projects.push(...page.values);
    if (page.isLast || projects.length >= page.total) break;
    startAt += maxResults;
  }
  return projects;
}

// Fetch all issues for a project (key fields only, paginated).
// Uses the current /search/jql endpoint. Pagination is token-based
// (nextPageToken), not offset-based -- the old startAt/search endpoint
// was fully removed by Atlassian.
async function getIssuesForProject(projectKey) {
  const issues = [];
  const maxResults = 100;
  const fields = ["summary", "status", "assignee", "priority", "updated", "issuetype"];
  let nextPageToken = undefined;

  while (true) {
    const payload = {
      jql: `project = "${projectKey}" ORDER BY updated DESC`,
      maxResults,
      fields,
    };
    if (nextPageToken) payload.nextPageToken = nextPageToken;

    const body = await jiraPost("/search/jql", payload);

    for (const issue of body.issues) {
      issues.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status ? issue.fields.status.name : "Unknown",
        statusCategory: issue.fields.status
          ? issue.fields.status.statusCategory.name
          : "Unknown",
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : null,
        priority: issue.fields.priority ? issue.fields.priority.name : null,
        type: issue.fields.issuetype ? issue.fields.issuetype.name : null,
        updated: issue.fields.updated,
      });
    }

    nextPageToken = body.nextPageToken;
    if (!nextPageToken || issues.length >= 2000) break;
  }
  return issues;
}

async function jiraPost(urlPath, payload) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira request failed (${res.status}): ${urlPath}\n${body}`);
  }
  return res.json();
}

function summarizeByStatusCategory(issues) {
  const summary = { "To Do": 0, "In Progress": 0, Done: 0 };
  for (const issue of issues) {
    if (summary[issue.statusCategory] !== undefined) {
      summary[issue.statusCategory] += 1;
    }
  }
  return summary;
}

async function main() {
  console.log(`Fetching projects from ${DOMAIN} ...`);
  const projects = await getProjects();
  console.log(`Found ${projects.length} project(s).`);

  const result = {
    generatedAt: new Date().toISOString(),
    domain: DOMAIN,
    projects: [],
  };

  for (const project of projects) {
    console.log(`  -> ${project.key} (${project.name})`);
    let issues = [];
    try {
      issues = await getIssuesForProject(project.key);
    } catch (err) {
      console.error(`     Failed to fetch issues for ${project.key}: ${err.message}`);
      continue;
    }

    result.projects.push({
      key: project.key,
      name: project.name,
      totalIssues: issues.length,
      statusSummary: summarizeByStatusCategory(issues),
      issues,
    });
  }

  const outPath = path.join(__dirname, "..", "data", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

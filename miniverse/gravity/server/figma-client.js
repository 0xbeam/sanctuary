import Bottleneck from 'bottleneck';

const BASE = 'https://api.figma.com/v1';

// Rate limiter: max 30 requests per minute (conservative for most plans)
const limiter = new Bottleneck({
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 2,
  minTime: 200,
});

let token = null;

export function setToken(pat) {
  token = pat;
}

async function request(path) {
  if (!token) throw new Error('Figma PAT not configured');

  const res = await limiter.schedule(() =>
    fetch(`${BASE}${path}`, {
      headers: { 'X-Figma-Token': token },
    })
  );

  if (res.status === 429) {
    const retry = parseInt(res.headers.get('retry-after') || '60', 10);
    console.warn(`[figma] Rate limited. Retrying in ${retry}s...`);
    await new Promise(r => setTimeout(r, retry * 1000));
    return request(path);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Figma API ${res.status}: ${path} — ${text.slice(0, 200)}`);
  }

  return res.json();
}

// Team projects
export async function getTeamProjects(teamId) {
  const data = await request(`/teams/${teamId}/projects`);
  return data.projects || [];
}

// Project files
export async function getProjectFiles(projectId) {
  const data = await request(`/projects/${projectId}/files`);
  return data.files || [];
}

// File versions (paginated)
export async function getFileVersions(fileKey, maxPages = 4) {
  const versions = [];
  let url = `/files/${fileKey}/versions`;

  for (let page = 0; page < maxPages; page++) {
    const data = await request(url);
    if (data.versions) versions.push(...data.versions);

    if (data.pagination?.next_page) {
      // Extract path from full URL
      const nextUrl = new URL(data.pagination.next_page);
      url = nextUrl.pathname + nextUrl.search;
    } else {
      break;
    }
  }

  return versions;
}

// File comments
export async function getFileComments(fileKey) {
  const data = await request(`/files/${fileKey}/comments`);
  return data.comments || [];
}

// Team components
export async function getTeamComponents(teamId, maxPages = 4) {
  const components = [];
  let cursor = '';

  for (let page = 0; page < maxPages; page++) {
    const qs = cursor ? `?after=${cursor}` : '';
    const data = await request(`/teams/${teamId}/components${qs}`);

    if (data.meta?.components) components.push(...data.meta.components);

    if (data.meta?.cursor?.after) {
      cursor = data.meta.cursor.after;
    } else {
      break;
    }
  }

  return components;
}

// Test connection
export async function testConnection(teamId) {
  try {
    const projects = await getTeamProjects(teamId);
    return { ok: true, projectCount: projects.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

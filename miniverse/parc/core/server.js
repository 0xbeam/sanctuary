import { createServer } from "http";
import { analyzeRepo } from "./analyzers/repo.js";
import { readFileSync, existsSync, watchFile } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════
// LIVE SERVER — Serves architecture dashboard with auto-refresh
// ═══════════════════════════════════════════════════════════════════

export async function startServer(repoPath, port) {
  let analysis = await analyzeRepo(repoPath);
  let lastScan = Date.now();

  console.log(`  Scanning complete. Starting server...\n`);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // API: raw analysis data
    if (url.pathname === "/api/analysis") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(analysis));
      return;
    }

    // API: rescan
    if (url.pathname === "/api/rescan") {
      console.log(`  Rescanning repo...`);
      analysis = await analyzeRepo(repoPath);
      lastScan = Date.now();
      console.log(`  Done. ${analysis.summary.totalFiles} files.`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, scannedAt: lastScan }));
      return;
    }

    // Serve dashboard
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(buildDashboardHTML(analysis, port));
  });

  server.listen(port, () => {
    console.log(`  Dashboard: http://localhost:${port}`);
    console.log(`  API:       http://localhost:${port}/api/analysis`);
    console.log(`  Rescan:    http://localhost:${port}/api/rescan`);
    console.log(`\n  Press Ctrl+C to stop.\n`);
  });
}

function buildDashboardHTML(analysis, port) {
  const a = analysis;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${a.name} — parc live</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #111114; color: #F6F5F2; }
.page { max-width: 1400px; margin: 0 auto; padding: 32px 40px; }
h1 { font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 700; }
.subtitle { font-family: 'DM Mono', monospace; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; color: #888; margin-bottom: 32px; }
.live-dot { display: inline-block; width: 6px; height: 6px; background: #2A7A5B; border-radius: 50%; animation: pulse 2s infinite; margin-right: 6px; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.stats { display: flex; gap: 24px; margin-bottom: 32px; }
.stat-card { background: #1C1C1F; border: 1px solid #2A2A2D; border-radius: 8px; padding: 16px 20px; min-width: 120px; }
.stat-num { font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; font-weight: 700; color: #3DA87A; }
.stat-label { font-family: 'DM Mono', monospace; font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.1em; color: #666; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 32px; }
.card { background: #1C1C1F; border: 1px solid #2A2A2D; border-radius: 8px; padding: 20px; position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--bar, #2A2A2D); }
.card.green::before { --bar: #2A7A5B; }
.card.amber::before { --bar: #B8860B; }
.card.blue::before { --bar: #2980B9; }
.card-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.14em; color: #666; margin-bottom: 6px; }
.card-title { font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; }
.items { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { font-family: 'DM Mono', monospace; font-size: 0.6rem; background: #262624; border: 1px solid #333; border-radius: 4px; padding: 2px 7px; color: #888; }
.tag.g { background: #1A3D2E; border-color: #2A7A5B44; color: #3DA87A; }
.tag.a { background: #2D2416; border-color: #B8860B44; color: #D4A017; }
.rescan-btn { position: fixed; bottom: 24px; right: 24px; background: #2A7A5B; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-family: 'DM Mono', monospace; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: background 200ms; }
.rescan-btn:hover { background: #3DA87A; }
.agent-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #222; }
.agent-row:last-child { border-bottom: none; }
.agent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.agent-dot.reasoning { background: #B8860B; }
.agent-dot.extraction { background: #2980B9; }
.agent-dot.unknown { background: #666; }
.agent-name { font-size: 0.78rem; }
.agent-tier { font-family: 'DM Mono', monospace; font-size: 0.58rem; color: #666; }
</style>
</head>
<body>
<div class="page">
  <h1><span class="live-dot"></span>${a.name}</h1>
  <p class="subtitle">parc live dashboard &mdash; ${a.git.branch || "local"} &mdash; ${a.summary.framework}</p>

  <div class="stats">
    <div class="stat-card"><div class="stat-num">${a.summary.totalFiles}</div><div class="stat-label">Files</div></div>
    <div class="stat-card"><div class="stat-num">${a.routes.length}</div><div class="stat-label">Routes</div></div>
    <div class="stat-card"><div class="stat-num">${a.api.length}</div><div class="stat-label">API Endpoints</div></div>
    <div class="stat-card"><div class="stat-num">${a.agents.length}</div><div class="stat-label">Agents</div></div>
    <div class="stat-card"><div class="stat-num">${a.components.length}</div><div class="stat-label">Components</div></div>
    <div class="stat-card"><div class="stat-num">${a.database.tables.length}</div><div class="stat-label">Tables</div></div>
  </div>

  <div class="grid">
    ${a.routes.length ? `
    <div class="card green">
      <div class="card-label">Routes</div>
      <div class="card-title">${a.routes.length} Pages</div>
      <div class="items">${a.routes.slice(0, 20).map(r => `<span class="tag g">${r.path}</span>`).join("")}${a.routes.length > 20 ? `<span class="tag">+${a.routes.length - 20}</span>` : ""}</div>
    </div>` : ""}

    ${a.api.length ? `
    <div class="card amber">
      <div class="card-label">API Endpoints</div>
      <div class="card-title">${a.api.length} Endpoints</div>
      <div class="items">${a.api.slice(0, 15).map(e => `<span class="tag a">${e.methods.join(",")} ${e.path}</span>`).join("")}${a.api.length > 15 ? `<span class="tag">+${a.api.length - 15}</span>` : ""}</div>
    </div>` : ""}

    ${a.agents.length ? `
    <div class="card amber">
      <div class="card-label">AI Agents</div>
      <div class="card-title">${a.agents.length} Agents</div>
      ${a.agents.map(agent => `
        <div class="agent-row">
          <div class="agent-dot ${agent.tier}"></div>
          <span class="agent-name">${agent.name}</span>
          <span class="agent-tier">${agent.tier}</span>
        </div>
      `).join("")}
    </div>` : ""}

    ${a.database.tables.length ? `
    <div class="card blue">
      <div class="card-label">Database</div>
      <div class="card-title">${a.database.tables.length} Tables</div>
      <div class="items">${a.database.tables.map(t => `<span class="tag">${t.name}</span>`).join("")}</div>
    </div>` : ""}
  </div>
</div>

<button class="rescan-btn" onclick="rescan()">Rescan</button>

<script>
async function rescan() {
  const btn = document.querySelector('.rescan-btn');
  btn.textContent = 'Scanning...';
  await fetch('/api/rescan');
  window.location.reload();
}
</script>
</body>
</html>`;
}

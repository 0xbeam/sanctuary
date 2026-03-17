import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, extname, basename, dirname } from "path";
import { execSync } from "child_process";

// ═══════════════════════════════════════════════════════════════════
// REPO ANALYZER — Scans any git repo and extracts architecture data
// ═══════════════════════════════════════════════════════════════════

const IGNORE_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", ".turbo",
  ".vercel", "coverage", "__pycache__", ".cache", ".output",
  "vendor", "target", ".svelte-kit",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb",
  ".java", ".kt", ".swift", ".vue", ".svelte", ".astro",
]);

const CONFIG_FILES = [
  "package.json", "tsconfig.json", "next.config.ts", "next.config.js",
  "vite.config.ts", "vite.config.js", "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.mjs", "turbo.json", "Cargo.toml", "go.mod", "pyproject.toml",
  "docker-compose.yml", "Dockerfile",
];

export async function analyzeRepo(repoPath) {
  const files = collectFiles(repoPath, repoPath);
  const gitInfo = getGitInfo(repoPath);
  const configs = detectConfigs(repoPath);
  const framework = detectFramework(repoPath, configs);
  const routes = detectRoutes(repoPath, files, framework);
  const api = detectAPIEndpoints(repoPath, files, framework);
  const agents = detectAgents(repoPath, files);
  const components = detectComponents(repoPath, files);
  const database = detectDatabase(repoPath, files);
  const packages = detectPackages(repoPath);
  const summary = buildSummary(files, routes, api, agents, components, framework);

  return {
    name: basename(repoPath),
    path: repoPath,
    git: gitInfo,
    framework,
    configs,
    routes,
    api,
    agents,
    components,
    database,
    packages,
    summary,
    files: files.map(f => ({ path: f.relativePath, ext: f.ext, size: f.size })),
  };
}

// ─── Incremental Diff Analysis ───────────────────────────────────

export async function analyzeRepoDiff(repoPath, baseRef = "main") {
  // Get list of changed files between baseRef and HEAD
  let changedPaths;
  try {
    const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    changedPaths = output ? output.split("\n") : [];
  } catch {
    // Fallback: if the ref doesn't exist, return full analysis
    return analyzeRepo(repoPath);
  }

  if (changedPaths.length === 0) {
    return { name: basename(repoPath), path: repoPath, changed: [], summary: { changedFiles: 0 } };
  }

  // Build file objects only for changed files that exist and are relevant
  const files = [];
  for (const rel of changedPaths) {
    const fullPath = join(repoPath, rel);
    const ext = extname(rel);
    if (!CODE_EXTENSIONS.has(ext) && !CONFIG_FILES.includes(basename(rel))) continue;
    try {
      const stat = statSync(fullPath);
      files.push({
        path: fullPath,
        relativePath: rel,
        name: basename(rel),
        ext,
        size: stat.size,
      });
    } catch {
      // File was deleted in diff — skip
    }
  }

  const configs = detectConfigs(repoPath);
  const framework = detectFramework(repoPath, configs);
  const routes = detectRoutes(repoPath, files, framework);
  const api = detectAPIEndpoints(repoPath, files, framework);
  const agents = detectAgents(repoPath, files);
  const components = detectComponents(repoPath, files);
  const database = detectDatabase(repoPath, files);

  return {
    name: basename(repoPath),
    path: repoPath,
    baseRef,
    changed: changedPaths,
    framework,
    routes,
    api,
    agents,
    components,
    database,
    files: files.map(f => ({ path: f.relativePath, ext: f.ext, size: f.size })),
    summary: {
      changedFiles: changedPaths.length,
      analyzedFiles: files.length,
      framework: framework.name,
    },
  };
}

// ─── File Collection ─────────────────────────────────────────────

function collectFiles(dir, root, depth = 0) {
  if (depth > 8) return [];
  const results = [];

  let entries;
  try { entries = readdirSync(dir); } catch { return results; }

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".env.example") continue;
    if (IGNORE_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, root, depth + 1));
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (CODE_EXTENSIONS.has(ext) || CONFIG_FILES.includes(entry)) {
        results.push({
          path: fullPath,
          relativePath: relative(root, fullPath),
          name: entry,
          ext,
          size: stat.size,
        });
      }
    }
  }

  return results;
}

// ─── Git Info ────────────────────────────────────────────────────

function getGitInfo(repoPath) {
  try {
    const run = (cmd) => execSync(cmd, { cwd: repoPath, encoding: "utf8" }).trim();
    return {
      branch: run("git rev-parse --abbrev-ref HEAD"),
      lastCommit: run("git log -1 --pretty=%s"),
      lastAuthor: run("git log -1 --pretty=%an"),
      commitCount: parseInt(run("git rev-list --count HEAD")),
      remoteUrl: safeExec(() => run("git remote get-url origin")),
    };
  } catch {
    return { branch: null, lastCommit: null, lastAuthor: null, commitCount: 0, remoteUrl: null };
  }
}

function safeExec(fn) {
  try { return fn(); } catch { return null; }
}

// ─── Config Detection ────────────────────────────────────────────

function detectConfigs(repoPath) {
  const found = [];
  for (const name of CONFIG_FILES) {
    // Check root
    if (existsSync(join(repoPath, name))) {
      found.push({ name, path: name });
    }
    // Check common nested locations
    for (const nested of ["apps/dashboard", "apps/web", "apps/api", "src"]) {
      const nestedPath = join(repoPath, nested, name);
      if (existsSync(nestedPath)) {
        found.push({ name, path: join(nested, name) });
      }
    }
  }
  return found;
}

// ─── Framework Detection ─────────────────────────────────────────

function detectFramework(repoPath, configs) {
  const result = { name: "unknown", version: null, runtime: "node", monorepo: false, features: [] };

  // Check for monorepo
  const rootPkg = readJsonSafe(join(repoPath, "package.json"));
  const turboJson = existsSync(join(repoPath, "turbo.json"));
  if (rootPkg?.workspaces || turboJson) {
    result.monorepo = true;
    result.features.push("monorepo");
  }
  if (turboJson) result.features.push("turborepo");

  // Detect primary framework
  const allPkgs = [rootPkg, ...findNestedPackageJsons(repoPath)].filter(Boolean);
  for (const pkg of allPkgs) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next"]) { result.name = "nextjs"; result.version = deps["next"]; break; }
    if (deps["nuxt"]) { result.name = "nuxt"; result.version = deps["nuxt"]; break; }
    if (deps["@sveltejs/kit"]) { result.name = "sveltekit"; break; }
    if (deps["astro"]) { result.name = "astro"; break; }
    if (deps["vite"] && deps["react"]) { result.name = "vite-react"; break; }
    if (deps["vite"] && deps["vue"]) { result.name = "vite-vue"; break; }
    if (deps["hono"]) { result.name = "hono"; break; }
    if (deps["express"]) { result.name = "express"; break; }
    if (deps["fastify"]) { result.name = "fastify"; break; }
  }

  // Python framework detection
  if (result.name === "unknown") {
    const reqTxt = readFileSafe(join(repoPath, "requirements.txt"));
    const pyproject = readFileSafe(join(repoPath, "pyproject.toml"));
    const pyDeps = reqTxt + "\n" + pyproject;
    if (/fastapi/i.test(pyDeps)) { result.name = "fastapi"; result.runtime = "python"; }
    else if (/flask/i.test(pyDeps)) { result.name = "flask"; result.runtime = "python"; }
    else if (/django/i.test(pyDeps)) { result.name = "django"; result.runtime = "python"; }
  }

  // Detect features
  for (const pkg of allPkgs) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["tailwindcss"]) result.features.push("tailwind");
    if (deps["@supabase/supabase-js"] || deps["@supabase/ssr"]) result.features.push("supabase");
    if (deps["prisma"] || deps["@prisma/client"]) result.features.push("prisma");
    if (deps["drizzle-orm"]) result.features.push("drizzle");
    if (deps["@ai-sdk/anthropic"] || deps["anthropic"]) result.features.push("anthropic");
    if (deps["openai"]) result.features.push("openai");
    if (deps["@radix-ui/react-dialog"]) result.features.push("radix-ui");
    if (deps["zod"]) result.features.push("zod");
    if (deps["@trpc/server"] || deps["@trpc/client"]) result.features.push("trpc");
    if (deps["graphql"] || deps["apollo-server"] || deps["@apollo/server"] || deps["graphql-yoga"]) result.features.push("graphql");
    if (deps["ws"] || deps["socket.io"] || deps["socket.io-client"]) result.features.push("websocket");
  }

  // Docker detection
  if (existsSync(join(repoPath, "Dockerfile")) || existsSync(join(repoPath, "docker-compose.yml")) || existsSync(join(repoPath, "docker-compose.yaml"))) {
    result.features.push("docker");
  }

  // Kubernetes detection
  const k8sDirs = ["k8s", "kubernetes", "manifests", "deploy", ".k8s"];
  for (const d of k8sDirs) {
    if (existsSync(join(repoPath, d))) { result.features.push("kubernetes"); break; }
  }

  // Detect runtime
  if (existsSync(join(repoPath, "go.mod"))) result.runtime = "go";
  if (existsSync(join(repoPath, "Cargo.toml"))) result.runtime = "rust";
  if (existsSync(join(repoPath, "pyproject.toml"))) result.runtime = "python";

  // Deduplicate features
  result.features = [...new Set(result.features)];

  return result;
}

function findNestedPackageJsons(repoPath) {
  const results = [];
  const dirs = ["apps", "packages", "src"];
  for (const d of dirs) {
    const base = join(repoPath, d);
    if (!existsSync(base)) continue;
    try {
      for (const sub of readdirSync(base)) {
        const pkg = readJsonSafe(join(base, sub, "package.json"));
        if (pkg) results.push(pkg);
      }
    } catch { /* skip */ }
  }
  return results;
}

// ─── Route Detection ─────────────────────────────────────────────

function detectRoutes(repoPath, files, framework) {
  const routes = [];

  if (framework.name === "nextjs") {
    // App Router
    const appFiles = files.filter(f =>
      f.relativePath.includes("/app/") &&
      (f.name === "page.tsx" || f.name === "page.jsx" || f.name === "page.js") &&
      !f.relativePath.includes("/api/")
    );

    for (const f of appFiles) {
      const routePath = extractNextRoute(f.relativePath);
      const isStatic = !routePath.includes("[");
      routes.push({
        path: routePath,
        file: f.relativePath,
        type: isStatic ? "static" : "dynamic",
        framework: "nextjs-app",
      });
    }

    // Pages Router
    const pagesFiles = files.filter(f =>
      f.relativePath.includes("/pages/") &&
      !f.relativePath.includes("/api/") &&
      !f.name.startsWith("_") &&
      (f.ext === ".tsx" || f.ext === ".jsx" || f.ext === ".js")
    );

    for (const f of pagesFiles) {
      routes.push({
        path: "/" + f.name.replace(/\.(tsx|jsx|js)$/, "").replace(/index$/, ""),
        file: f.relativePath,
        type: f.name.includes("[") ? "dynamic" : "static",
        framework: "nextjs-pages",
      });
    }
  }

  // SvelteKit
  if (framework.name === "sveltekit") {
    const sveltePages = files.filter(f => f.name === "+page.svelte");
    for (const f of sveltePages) {
      routes.push({
        path: extractSvelteRoute(f.relativePath),
        file: f.relativePath,
        type: f.relativePath.includes("[") ? "dynamic" : "static",
        framework: "sveltekit",
      });
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

function extractNextRoute(filePath) {
  // apps/dashboard/src/app/founder/dashboard/page.tsx → /founder/dashboard
  // Handle monorepo structures — find last occurrence of /app/ in path
  const appIdx = filePath.lastIndexOf("/app/");
  if (appIdx === -1) return "/";
  const afterApp = filePath.slice(appIdx + "/app/".length);
  const routePart = afterApp.replace(/\/?(page)\.(tsx|jsx|js)$/, "");
  if (!routePart) return "/";
  return "/" + routePart.replace(/\/\(.*?\)\//g, "/").replace(/\(.*?\)\/?/, "");
}

function extractSvelteRoute(filePath) {
  // /src/routes/users/[id]/+page.svelte → /users/[id]
  const match = filePath.match(/\/routes\/(.+?)\/\+page\.svelte$/);
  if (!match) return "/";
  return "/" + match[1];
}

// ─── API Endpoint Detection ──────────────────────────────────────

function detectAPIEndpoints(repoPath, files, framework) {
  const endpoints = [];

  if (framework.name === "nextjs") {
    const apiFiles = files.filter(f =>
      f.relativePath.includes("/api/") &&
      (f.name === "route.ts" || f.name === "route.js")
    );

    for (const f of apiFiles) {
      const routePath = extractNextRoute(f.relativePath.replace("/api/", "/app/api/").replace("route.ts", "page.tsx").replace("route.js", "page.js"));
      const apiPath = "/api" + routePath;
      const content = readFileSafe(f.path);
      const methods = detectHTTPMethods(content);
      const hasAuth = content.includes("requirePartnerAuth") || content.includes("requireAuth") || content.includes("getSession") || content.includes("auth(");

      endpoints.push({
        path: apiPath.replace("//", "/").replace(/\/$/, "") || "/api",
        file: f.relativePath,
        methods,
        auth: hasAuth,
      });
    }
  }

  // Express routes
  const expressFiles = files.filter(f => {
    const content = readFileSafe(f.path);
    return content.includes("app.get(") || content.includes("app.post(") || content.includes("router.get(");
  });

  for (const f of expressFiles) {
    const content = readFileSafe(f.path);
    const routeMatches = content.matchAll(/(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g);
    for (const match of routeMatches) {
      endpoints.push({
        path: match[3],
        file: f.relativePath,
        methods: [match[2].toUpperCase()],
        auth: content.includes("requireAuth") || content.includes("auth"),
      });
    }
  }

  return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

function detectHTTPMethods(content) {
  const methods = [];
  if (/export\s+(async\s+)?function\s+GET/m.test(content)) methods.push("GET");
  if (/export\s+(async\s+)?function\s+POST/m.test(content)) methods.push("POST");
  if (/export\s+(async\s+)?function\s+PUT/m.test(content)) methods.push("PUT");
  if (/export\s+(async\s+)?function\s+PATCH/m.test(content)) methods.push("PATCH");
  if (/export\s+(async\s+)?function\s+DELETE/m.test(content)) methods.push("DELETE");
  if (methods.length === 0 && content.includes("NextResponse")) methods.push("GET");
  return methods;
}

// ─── Agent Detection ─────────────────────────────────────────────

function detectAgents(repoPath, files) {
  const agents = [];

  // Look for agent files by name pattern — only actual code files
  const AGENT_CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py"]);
  const agentFiles = files.filter(f =>
    AGENT_CODE_EXTS.has(f.ext) && (
      f.name.includes("agent") ||
      f.relativePath.includes("/agents/") ||
      f.relativePath.includes("/ai/")
    )
  );

  for (const f of agentFiles) {
    const content = readFileSafe(f.path);

    // Detect model tier
    let tier = "unknown";
    if (content.includes("extraction") || content.includes("haiku")) tier = "extraction";
    else if (content.includes("reasoning") || content.includes("sonnet") || content.includes("claude")) tier = "reasoning";
    else if (content.includes("opus")) tier = "reasoning-deep";

    // Detect what it does
    let description = "";
    const classMatch = content.match(/class\s+(\w+)/);
    const descMatch = content.match(/description['":\s]+['"]([^'"]+)['"]/i);
    if (descMatch) description = descMatch[1];

    // Detect tools used
    const tools = [];
    if (content.includes("tavily") || content.includes("TavilyClient")) tools.push("tavily");
    if (content.includes("generateObject")) tools.push("structured-output");
    if (content.includes("generateText")) tools.push("text-generation");
    if (content.includes("supabase") || content.includes("createDb")) tools.push("database");

    const name = basename(f.name, f.ext)
      .replace(/-/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    agents.push({
      name,
      file: f.relativePath,
      tier,
      description,
      tools,
      className: classMatch?.[1] || null,
    });
  }

  return agents;
}

// ─── Component Detection ─────────────────────────────────────────

function detectComponents(repoPath, files) {
  const components = [];

  const componentFiles = files.filter(f =>
    (f.relativePath.includes("/components/") || f.relativePath.includes("/ui/")) &&
    (f.ext === ".tsx" || f.ext === ".jsx" || f.ext === ".svelte" || f.ext === ".vue")
  );

  for (const f of componentFiles) {
    const isUI = f.relativePath.includes("/ui/");
    components.push({
      name: basename(f.name, f.ext),
      file: f.relativePath,
      type: isUI ? "ui" : "feature",
    });
  }

  return components;
}

// ─── Database Detection ──────────────────────────────────────────

function detectDatabase(repoPath, files) {
  const tables = [];
  const migrations = [];

  // Supabase/SQL migrations
  const sqlFiles = files.filter(f => f.ext === ".sql" || f.relativePath.includes("migration"));

  // Check for Prisma schema
  const prismaFile = files.find(f => f.name === "schema.prisma");
  if (prismaFile) {
    const content = readFileSafe(prismaFile.path);
    const models = content.matchAll(/model\s+(\w+)\s*\{/g);
    for (const m of models) {
      tables.push({ name: m[1], source: "prisma" });
    }
  }

  // Check for SQL CREATE TABLE
  for (const f of files.filter(f => f.ext === ".sql")) {
    const content = readFileSafe(f.path);
    const creates = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gi);
    for (const m of creates) {
      if (!tables.find(t => t.name === m[1])) {
        tables.push({ name: m[1], source: "sql" });
      }
    }
    if (f.relativePath.includes("migration")) {
      migrations.push({ file: f.relativePath, name: basename(f.name, f.ext) });
    }
  }

  return { tables, migrations };
}

// ─── Package Detection ───────────────────────────────────────────

function detectPackages(repoPath) {
  const pkgs = [];
  const rootPkg = readJsonSafe(join(repoPath, "package.json"));

  if (rootPkg) {
    pkgs.push({
      name: rootPkg.name || basename(repoPath),
      path: ".",
      dependencies: Object.keys(rootPkg.dependencies || {}),
      devDependencies: Object.keys(rootPkg.devDependencies || {}),
    });
  }

  // Check workspace packages
  for (const dir of ["apps", "packages"]) {
    const base = join(repoPath, dir);
    if (!existsSync(base)) continue;
    try {
      for (const sub of readdirSync(base)) {
        const pkg = readJsonSafe(join(base, sub, "package.json"));
        if (pkg) {
          pkgs.push({
            name: pkg.name || sub,
            path: `${dir}/${sub}`,
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
          });
        }
      }
    } catch { /* skip */ }
  }

  return pkgs;
}

// ─── Summary Builder ─────────────────────────────────────────────

function buildSummary(files, routes, api, agents, components, framework) {
  const extCounts = {};
  let totalLOC = 0;
  for (const f of files) {
    extCounts[f.ext] = (extCounts[f.ext] || 0) + 1;
    if (CODE_EXTENSIONS.has(f.ext)) {
      try {
        const content = readFileSync(f.path, "utf8");
        totalLOC += content.split("\n").length;
      } catch { /* skip unreadable */ }
    }
  }

  const languages = [];
  if (extCounts[".ts"] || extCounts[".tsx"]) languages.push("TypeScript");
  if (extCounts[".js"] || extCounts[".jsx"]) languages.push("JavaScript");
  if (extCounts[".py"]) languages.push("Python");
  if (extCounts[".go"]) languages.push("Go");
  if (extCounts[".rs"]) languages.push("Rust");
  if (extCounts[".rb"]) languages.push("Ruby");
  if (extCounts[".java"] || extCounts[".kt"]) languages.push("JVM");
  if (extCounts[".swift"]) languages.push("Swift");
  if (extCounts[".vue"]) languages.push("Vue");
  if (extCounts[".svelte"]) languages.push("Svelte");

  return {
    totalFiles: files.length,
    totalLOC,
    languages,
    framework: framework.name,
    features: framework.features,
    extensionCounts: extCounts,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function readFileSafe(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

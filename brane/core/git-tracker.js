import { execSync } from "child_process";

/**
 * Execute a git command in the given working directory.
 * @param {string} cmd - Git command to run
 * @param {string} cwd - Working directory
 * @returns {string} Trimmed stdout
 */
function git(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 5000 }).trim();
}

/**
 * Get current branch info for a repository.
 * @param {string} cwd - Repository path
 * @returns {{ branch: string, dirty: boolean, uncommittedFiles: string[], aheadBehind: { ahead: number, behind: number } }}
 */
export function getBranchInfo(cwd) {
  try {
    const branch = git("git rev-parse --abbrev-ref HEAD", cwd);

    const porcelain = git("git status --porcelain", cwd);
    const uncommittedFiles = porcelain
      ? porcelain.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];
    const dirty = uncommittedFiles.length > 0;

    let aheadBehind = { ahead: 0, behind: 0 };
    try {
      const ab = git("git rev-list --left-right --count @{u}...HEAD", cwd);
      const [behind, ahead] = ab.split(/\s+/).map(Number);
      aheadBehind = { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      // No upstream tracking branch
    }

    return { branch, dirty, uncommittedFiles, aheadBehind };
  } catch (err) {
    return {
      branch: "unknown",
      dirty: false,
      uncommittedFiles: [],
      aheadBehind: { ahead: 0, behind: 0 },
    };
  }
}

/**
 * Get recent commits from a repository.
 * @param {string} cwd - Repository path
 * @param {number} [n=10] - Number of commits to return
 * @returns {{ sha: string, message: string }[]}
 */
export function getRecentCommits(cwd, n = 10) {
  try {
    const output = git(`git log --oneline -${n}`, cwd);
    if (!output) return [];

    return output.split("\n").map((line) => {
      const spaceIdx = line.indexOf(" ");
      return {
        sha: line.slice(0, spaceIdx),
        message: line.slice(spaceIdx + 1),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Switch to an existing branch. Refuses if working tree is dirty.
 * @param {string} cwd - Repository path
 * @param {string} branch - Branch name to switch to
 * @returns {{ ok: boolean, error?: string }}
 */
export function switchBranch(cwd, branch) {
  try {
    const { dirty } = getBranchInfo(cwd);
    if (dirty) {
      return { ok: false, error: "Working tree is dirty. Commit or stash changes first." };
    }

    git(`git checkout ${branch}`, cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Create a new branch, optionally from a base.
 * @param {string} cwd - Repository path
 * @param {string} name - New branch name
 * @param {string} [from] - Optional base branch/commit
 * @returns {{ ok: boolean, error?: string }}
 */
export function createBranch(cwd, name, from) {
  try {
    const cmd = from
      ? `git checkout -b ${name} ${from}`
      : `git checkout -b ${name}`;
    git(cmd, cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List all local branches.
 * @param {string} cwd - Repository path
 * @returns {string[]} Array of branch names
 */
export function listBranches(cwd) {
  try {
    const output = git("git branch --list", cwd);
    if (!output) return [];

    return output
      .split("\n")
      .map((line) => line.replace(/^\*?\s+/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get a diff stat summary between two refs.
 * @param {string} cwd - Repository path
 * @param {string} base - Base ref (branch, sha)
 * @param {string} head - Head ref
 * @returns {string} Diff stat output
 */
export function diffSummary(cwd, base, head) {
  try {
    return git(`git diff --stat ${base}..${head}`, cwd);
  } catch (err) {
    return err.message;
  }
}

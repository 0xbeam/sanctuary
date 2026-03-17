# 🏔️ Sanctuary

The Sanctuary Parc venture studio game — one monorepo, all the plays.

## What's inside

### `miniverse/proposal-builder`
Client-facing proposal engine. Scoped quotes, deal rooms, the works.

### `miniverse/andromeda`
Personal CRM for tracking people, intros, and relationship context across deals.

### `miniverse/design-plus`
Design builds, experiments, and Figma plugin work. The creative lab.

### `miniverse/gravity`
Gravity engine — the connective tissue between projects.

### `miniverse/parc`
Core Parc workspace and shared tooling.

### `brane/`
Full-stack app runtime — Vite + Express, deployed on Vercel.

### `bangalore/`
Bangalore-focused projects and experiments (including attnc-preview).

### `dashboard/`
Shared notes and docs for the Sanctuary dashboard.

### `data/`
Debug assets, data utilities, and research-heavy work.

## Branches

| Branch | Maps to |
|---|---|
| `main` | Repo structure, docs, multi-project changes |
| `project/proposal-builder` | `miniverse/proposal-builder` |
| `project/andromeda` | `miniverse/andromeda` |
| `project/design-plus` | `miniverse/design-plus` |
| `project/bangalore` | `bangalore` |
| `project/data` | `data` |

## Workflow

```bash
git workon proposal-builder   # switch context
git context                    # sanity check branch vs. path
```

Pre-commit hooks catch branch/path mismatches before they happen.

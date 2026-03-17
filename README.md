# Sanctuary Parc OS

**The venture studio operating system. Dashboard, orchestration, and project management across the full Sanctuary Parc portfolio.**

[![Monorepo](https://img.shields.io/badge/monorepo-turborepo-EF4444?style=flat-square)](https://turbo.build)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Prisma](https://img.shields.io/badge/prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)

---

One home base for every active project in the studio. Clean folders, predictable branch names, and git hooks that prevent cross-project accidents.

## What's inside

```
miniverse/                # Core product projects
  proposal-builder/       # Proposal generation tool
  andromeda/              # Personal CRM workspace
  design-plus/            # Design builds, Figma plugins, experiments
  atlas/                  # Full-stack app (backend + bot + dashboard + desktop)
  gravity/                # API + data services

bangalore/                # Bangalore-focused projects & experiments
data/                     # Debug assets, data utilities, research
dashboard/                # Notes for the separate dashboard fork
scripts/                  # git-workon, git-context, project-map helpers
```

### Atlas (the engine)

The `miniverse/atlas` monorepo is the main technical stack:

| App | What it does |
|-----|-------------|
| `backend` | Node/Express API with Prisma ORM, AI embeddings, calendar scheduler, action items, chat, drafts, meetings, routines, search |
| `bot` | Conversational bot interface |
| `dashboard` | Web dashboard UI |
| `desktop` | Desktop client |

## Branch conventions

| Branch | Scope |
|--------|-------|
| `main` | Shared structure, docs, scripts, multi-project changes |
| `project/proposal-builder` | `miniverse/proposal-builder` |
| `project/andromeda` | `miniverse/andromeda` |
| `project/design-plus` | `miniverse/design-plus` |
| `project/bangalore` | `bangalore/` |
| `project/data` | `data/` |
| `project/dashboard-fork` | `dashboard/` |

## Daily workflow

```bash
git workon proposal-builder   # switch to the right branch + folder
# ... do your work ...
git context                   # sanity-check branch vs. path
git commit                    # pre-commit hook blocks mismatches
```

The custom git scripts live in `scripts/` and enforce the branch/path mapping automatically.

## Git identity

This repo uses:

- `user.name = 0xbeam`
- `user.email = p@spacekayak.xyz`

## Remotes

| Remote | Points to |
|--------|-----------|
| `origin` | Sanctuary Parc master repo |
| `dashboard-fork` | Separate dashboard fork repo |

`dashboard/` is intentionally documentation-only inside this monorepo. The actual dashboard lives in its own fork repo.

#!/bin/sh

project_for_path() {
  case "$1" in
    miniverse/proposal-builder|miniverse/proposal-builder/*)
      echo "proposal-builder"
      ;;
    miniverse/andromeda|miniverse/andromeda/*)
      echo "andromeda"
      ;;
    miniverse/design-plus|miniverse/design-plus/*)
      echo "design-plus"
      ;;
    miniverse/atlas|miniverse/atlas/*)
      echo "atlas"
      ;;
    bangalore|bangalore/*)
      echo "bangalore"
      ;;
    data|data/*)
      echo "data"
      ;;
    dashboard|dashboard/*)
      echo "dashboard-fork"
      ;;
    README.md|.gitignore|.githooks/*|scripts/*)
      echo "meta"
      ;;
    *)
      echo "shared"
      ;;
  esac
}

branch_for_project() {
  case "$1" in
    proposal-builder)
      echo "project/proposal-builder"
      ;;
    andromeda)
      echo "project/andromeda"
      ;;
    design-plus)
      echo "project/design-plus"
      ;;
    atlas)
      echo "project/atlas"
      ;;
    bangalore)
      echo "project/bangalore"
      ;;
    data)
      echo "project/data"
      ;;
    dashboard-fork)
      echo "project/dashboard-fork"
      ;;
    meta)
      echo "main"
      ;;
    *)
      return 1
      ;;
  esac
}

path_for_project() {
  case "$1" in
    proposal-builder)
      echo "miniverse/proposal-builder"
      ;;
    andromeda)
      echo "miniverse/andromeda"
      ;;
    design-plus)
      echo "miniverse/design-plus"
      ;;
    atlas)
      echo "miniverse/atlas"
      ;;
    bangalore)
      echo "bangalore"
      ;;
    data)
      echo "data"
      ;;
    dashboard-fork)
      echo "dashboard"
      ;;
    meta)
      echo "."
      ;;
    *)
      return 1
      ;;
  esac
}

list_known_projects() {
  printf '%s\n' \
    "proposal-builder" \
    "andromeda" \
    "design-plus" \
    "atlas" \
    "bangalore" \
    "data" \
    "dashboard-fork"
}

branch_matches_project() {
  branch="$1"
  project="$2"

  if [ "$project" = "meta" ]; then
    case "$branch" in
      main|meta/*|ops/*)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  fi

  preferred_branch="$(branch_for_project "$project" 2>/dev/null || true)"
  case "$branch" in
    "$preferred_branch"|"$preferred_branch"/*|*"${project}"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

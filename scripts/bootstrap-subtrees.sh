#!/usr/bin/env bash
#
# bootstrap-subtrees.sh — pull the two source apps into this monorepo WITH history.
#
# `git subtree` grafts each source repo's full commit history under a subdirectory,
# so `git log --follow` on any file keeps working and authorship/provenance survive.
# (A source repo can be a LOCAL PATH — you do not need to push anything anywhere.)
#
# Usage:
#   1) Run this from the ROOT of the new complex-analysis-suite repo (after `git init`).
#   2) Set CD_SRC / QD_SRC below (or export them in your shell before running).
#   3) Confirm the DEFAULT BRANCH of each source repo (main vs master).
#
#   CD_SRC=~/code/ComplexDynamicsJS QD_SRC=~/code/QuadratureDomains \
#     bash scripts/bootstrap-subtrees.sh
#
set -euo pipefail

# --- configure these -------------------------------------------------------------
CD_SRC="${CD_SRC:-<path-or-URL to ComplexDynamicsJS>}"   # e.g. ~/code/ComplexDynamicsJS
QD_SRC="${QD_SRC:-<path-or-URL to QuadratureDomains>}"   # e.g. ~/code/QuadratureDomains
CD_BRANCH="${CD_BRANCH:-main}"                            # ⚠ confirm: main or master?
QD_BRANCH="${QD_BRANCH:-main}"                            # ⚠ confirm: main or master?
# ---------------------------------------------------------------------------------

if [[ "$CD_SRC" == "<"* || "$QD_SRC" == "<"* ]]; then
  echo "ERROR: set CD_SRC and QD_SRC (edit this file or export them)." >&2
  exit 1
fi

# Must be run at the repo root, inside a git repo, with a clean tree and >=1 commit
# (git subtree requires an existing HEAD; make an initial commit first if needed).
if [[ ! -d .git ]]; then
  echo "ERROR: run from the repo root (no .git here). Did you 'git init'?" >&2
  exit 1
fi
if ! git rev-parse HEAD >/dev/null 2>&1; then
  echo "No commits yet — creating an initial commit so subtree has a HEAD."
  git add -A && git commit -m "chore: initialize complex-analysis-suite workspace" || true
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty. Commit or stash before running subtree." >&2
  exit 1
fi

echo "==> Adding Complex Dynamics  ($CD_SRC @ $CD_BRANCH)  ->  apps/complex-dynamics"
git remote add cd-src "$CD_SRC" 2>/dev/null || git remote set-url cd-src "$CD_SRC"
git fetch cd-src "$CD_BRANCH"
git subtree add --prefix=apps/complex-dynamics cd-src "$CD_BRANCH"

echo "==> Adding Quadrature Domains ($QD_SRC @ $QD_BRANCH)  ->  apps/quadrature-domains"
git remote add qd-src "$QD_SRC" 2>/dev/null || git remote set-url qd-src "$QD_SRC"
git fetch qd-src "$QD_BRANCH"
git subtree add --prefix=apps/quadrature-domains qd-src "$QD_BRANCH"

echo
echo "==> Done. Verify history is present:"
echo "    git log --oneline -- apps/complex-dynamics   | tail"
echo "    git log --oneline -- apps/quadrature-domains | tail"
echo
echo "Later, to pull upstream changes from a source repo (if you keep developing it there):"
echo "    git subtree pull --prefix=apps/complex-dynamics   cd-src $CD_BRANCH"
echo "    git subtree pull --prefix=apps/quadrature-domains qd-src $QD_BRANCH"

#!/usr/bin/env bash
# sync-to-repo.sh — Option C 同步脚本（在暂存目录执行；需要 danger-full-access 审批）
# 用法: scripts/sync-to-repo.sh "<commit message>"
# 把暂存目录全量镜像到正式仓库（rsync --delete），汇报差异，然后 git add/commit。
set -euo pipefail

STAGING="$(cd "$(dirname "$0")/.." && pwd)"
REPO="/Users/maque/Suzume_Files/Project/dsh-profile-manager"
MSG="${1:-sync: $(date '+%Y-%m-%d %H:%M')}"

[ -d "$REPO/.git" ] || { echo "repo missing: $REPO" >&2; exit 1; }

echo "== diff (staging -> repo) =="
diff -rq "$STAGING" "$REPO" \
  --exclude=.git --exclude=node_modules --exclude='*.tsbuildinfo' --exclude=.DS_Store \
  || true

echo "== rsync --delete =="
rsync -a --delete \
  --exclude=.git --exclude=node_modules --exclude='*.tsbuildinfo' --exclude=.DS_Store \
  "$STAGING"/ "$REPO"/

cd "$REPO"
git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  git commit -m "$MSG"
fi
git log --oneline -3

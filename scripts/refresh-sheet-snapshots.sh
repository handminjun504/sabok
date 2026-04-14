#!/usr/bin/env bash
# 참고 스프레드시트가 「링크가 있는 사용자 → 보기」일 때 탭별 CSV를 docs/sheet-snapshots/ 에 덮어씀.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/sheet-snapshots"
ID="1P2sHgx6z4MOjYZPSyE8qHrcsD_OUfaDeUfYUJMECQ4w"
mkdir -p "$OUT"
GIDS=(0 1123805955 1301218006 232333075 257364557 282193831 352060410 645153880 659543130 680592227 798565535)
for g in "${GIDS[@]}"; do
  echo "fetch gid=$g"
  curl -sSL "https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=$g" -o "$OUT/gid-${g}.csv"
done
echo "done → $OUT (see docs/sheet-snapshots/README.md)"

#!/usr/bin/env bash
# Runs the Seldon (Wren) CLI in a Linux container: there is no native Windows build.
# Reads SELDON_API_KEY from the environment or .env.local; the repo is mounted at /w.
#   scripts/seldon.sh validate
#   scripts/seldon.sh run --wait
#   scripts/seldon.sh report
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${SELDON_API_KEY:-$(grep -E '^SELDON_API_KEY=' .env.local 2>/dev/null | cut -d= -f2- || true)}"
if [ -z "$KEY" ]; then
  echo "Set SELDON_API_KEY or add it to .env.local" >&2
  exit 1
fi

REPO="$(pwd -W 2>/dev/null || pwd)"
MSYS_NO_PATHCONV=1 docker run --rm -t \
  -e SELDON_API_KEY="$KEY" \
  -v seldon-cli-cache:/usr/local/lib/node_modules \
  -v "$REPO:/w" -w /w \
  node:20-bookworm-slim sh -c '
    [ -x /usr/local/lib/node_modules/@seldonqa/cli/bin/seldon ] ||
      npm install -g --no-audit --no-fund @seldonqa/cli@0.14.2 >/dev/null 2>&1
    ln -sf /usr/local/lib/node_modules/@seldonqa/cli/bin/seldon /usr/local/bin/seldon
    exec seldon "$@"' seldon "$@"

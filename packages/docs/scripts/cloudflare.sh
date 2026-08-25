#!/usr/bin/env bash

set -euo pipefail

cloudflare_action="${1:-build}"

case "$cloudflare_action" in
  build) cloudflare_task="docs:build" ;;
  deploy) cloudflare_task="docs:cloudflare-deploy" ;;
  preview) cloudflare_task="docs:cloudflare-preview" ;;
  *)
    echo "Unknown Cloudflare action: $cloudflare_action" >&2
    exit 64
    ;;
esac

if (( $# > 0 )); then
  shift
fi

proto_root="${PROTO_HOME:-${HOME}/.proto}"
cloudflare_tmp_dir="/tmp"
export PROTO_HOME="$proto_root"
export TMPDIR="$cloudflare_tmp_dir"
export PATH="$PROTO_HOME/bin:$PROTO_HOME/shims:$PATH"

if ! command -v proto >/dev/null 2>&1; then
  curl --fail --location --silent --show-error \
    https://moonrepo.dev/install/proto.sh \
    | bash -s -- 0.55.2 --no-modify-profile --no-modify-path --yes
fi

proto install --yes
moon run --force "$cloudflare_task" "$@"

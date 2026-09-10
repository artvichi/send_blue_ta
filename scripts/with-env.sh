#!/bin/sh
# Load the root .env WITHOUT clobbering variables already present in the
# environment, then exec the command.
#
# The previous `set -a; . ../../.env` did the opposite: it overwrote whatever
# the caller had exported, so `GATEWAY_DRIVER=applescript npm run gateway:real`
# silently ran the mock driver. An explicit value should always win over a file
# of defaults.
ENV_FILE="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/.env"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | \#*) continue ;; esac
    key=${line%%=*}
    [ "$key" = "$line" ] && continue
    eval "existing=\${$key+set}"
    [ "$existing" = set ] || export "$key=${line#*=}"
  done < "$ENV_FILE"
fi

exec "$@"

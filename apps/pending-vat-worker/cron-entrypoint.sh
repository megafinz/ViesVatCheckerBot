#!/bin/sh
set -eu

schedule="${PENDING_VAT_WORKER_CRON:-0 * * * *}"
env_file="/app/cron.env"

printenv | awk -F= '
  /^[A-Za-z_][A-Za-z0-9_]*=/ {
    name=$1
    value=substr($0, length(name) + 2)
    gsub(/\047/, "'\''\\'\'''\''", value)
    print "export " name "='\''" value "'\''"
  }
' > "$env_file"

cat > /etc/crontabs/root <<EOF
$schedule . $env_file && cd /app && bun ./index.js >> /proc/1/fd/1 2>&1
EOF

exec busybox crond -f -L /dev/stdout

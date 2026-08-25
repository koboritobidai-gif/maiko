#!/usr/bin/env bash
# Fetch all configured uysot endpoints into data/<name>.json
# Usage: set env in .env (see .env.example), then: bash scripts/fetch.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

: "${UYSOT_API_BASE:?set UYSOT_API_BASE (see .env.example)}"
: "${UYSOT_BEARER_TOKEN:?set UYSOT_BEARER_TOKEN (see .env.example)}"
export UYSOT_ORIGIN="${UYSOT_ORIGIN:-https://app.uysot.uz}"

mkdir -p data
fail=0

# node resolves each endpoint to: name \t method \t full-URL  (no empty fields)
while IFS=$'\t' read -r name method target; do
  [ -z "${name:-}" ] && continue
  out="data/${name}.json"
  code=$(curl -sS -o "$out" -w "%{http_code}" --max-time 30 \
    -X "$method" \
    -H "authorization: Bearer $UYSOT_BEARER_TOKEN" \
    -H "accept: application/json, text/plain, */*" \
    -H "language-symbol: en" \
    -H "origin: $UYSOT_ORIGIN" \
    -H "referer: $UYSOT_ORIGIN/" \
    "$target" || echo "000")
  size=$(wc -c < "$out" 2>/dev/null || echo 0)
  echo "[$code] ${name}  (${size} bytes)  <- $target"
  case "$code" in 2*) ;; *) fail=1;; esac
done < <(node -e '
  const fs=require("fs");
  const base=process.env.UYSOT_API_BASE.replace(/\/$/,"");
  const c=JSON.parse(fs.readFileSync("config/endpoints.json","utf8"));
  for (const e of c.endpoints){
    if (e.status==="todo" || !(e.path||e.url)) continue;
    const url = e.url ? e.url : base + (e.path.startsWith("/")?e.path:"/"+e.path);
    process.stdout.write([e.name, e.method||"GET", url].join("\t")+"\n");
  }
')

echo "Done. JSON saved under ./data/"
exit $fail

#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://megydapp-clean.vercel.app}"
# Test için bilinen bir mint gir (Neon’dan kopyalayabilirsin):
MINT="${MINT:-AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3}"
SECRET="${CRON_SECRET:-}"

pass=0; fail=0

check() {
  local name="$1" url="$2" expect="$3" method="${4:-GET}" header="${5:-}" data="${6:-}"
  local tmp="$(mktemp)"
  # curl argümanlarını array ile kur (quoting sorunu yaşamayalım)
  local args=(-sS -o "$tmp" -w "%{http_code}" -X "$method")
  [[ -n "$header" ]] && args+=(-H "$header")
  [[ -n "$data"   ]] && args+=(-H "content-type: application/json" --data "$data")

  local code
  code=$(curl "${args[@]}" "$url" || true)

  if [[ "$code" =~ $expect ]]; then
    echo "✅ $name  ($code)  $url"
    pass=$((pass+1))
  else
    echo "❌ $name  ($code)  $url"
    echo "---- body ----"; cat "$tmp"; echo
    fail=$((fail+1))
  fi
  rm -f "$tmp"
}

echo "== Public endpoints =="
check "status (with mint)"   "$BASE/api/status?mint=$MINT&v=$(date +%s)" "200"
check "metrics (with mint)"  "$BASE/api/diagnostics/metrics?mint=$MINT"  "200|204"
# price proxy: genelde POST bekler; 200/204/404 hepsi kabul
check "price proxy (POST)"   "$BASE/api/proxy/price"                     "200|204|404" "POST" "" "{\"mint\":\"$MINT\"}"

echo "== Admin pages (render) =="
check "admin/login page"     "$BASE/admin/login"                         "200"
check "admin index (redir)"  "$BASE/admin"                                "200|302|307"

echo "== Admin API (unauth; 401/400 normal) =="
check "whoami"               "$BASE/api/admin/whoami"                    "401|200"
check "is-allowed"           "$BASE/api/admin/is-allowed"                "400|401|200"
check "tokens"               "$BASE/api/admin/tokens"                    "401|403|400|500"
check "export.csv"           "$BASE/api/admin/tokens/export.csv"         "200|401|405"
check "settings"             "$BASE/api/admin/settings"                  "200|401"
check "snapshot"             "$BASE/api/admin/snapshot"                  "200|401"

echo "== Cron endpoint (POST secret şart) =="
if [ -n "$SECRET" ]; then
  check "reclassify (POST)"  "$BASE/api/admin/reclassify?v=$(date +%s)"  "200" "POST" "X-CRON-SECRET: $SECRET"
else
  echo "⚠ CRON_SECRET export etmediğin için cron POST atlanıyor."
fi

echo "== Summary =="
echo "Passed: $pass  Failed: $fail"
test "$fail" -eq 0 || exit 1

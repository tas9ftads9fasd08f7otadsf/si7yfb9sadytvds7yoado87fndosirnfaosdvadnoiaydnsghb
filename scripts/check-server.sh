#!/usr/bin/env bash
# Whether the site's FTPS server takes a deploy, layer by layer; any FAIL exits 1.
# Reads FTPS_HOST, FTPS_USER, FTPS_PASSWORD, FTPS_DIR, FTPS_PORT, FTPS_CA_FILE, SITE_URL.
# Needs lftp, openssl and curl on the PATH.
set -uo pipefail

: "${FTPS_HOST:?FTPS_HOST is not set}" "${FTPS_USER:?FTPS_USER is not set}" "${FTPS_PASSWORD:?FTPS_PASSWORD is not set}"
host="$FTPS_HOST"
port="${FTPS_PORT:-21}"
dir="${FTPS_DIR:-/}"
failed=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ok() { echo "ok    $1"; }
warn() { echo "warn  $1"; [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning::$1"; return 0; }
fail() { echo "FAIL  $1"; [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error::$1"; failed=1; }
skip() { echo "skip  $1"; }

is_ip=0
[[ "$host" =~ ^[0-9.]+$ || "$host" == *:* ]] && is_ip=1

if [ "$is_ip" = 1 ]; then
  ok "name: FTPS_HOST is an address, nothing to look up"
elif addresses="$(getent ahosts "$host" | awk '{print $1}' | sort -u | paste -sd' ')" && [ -n "$addresses" ]; then
  ok "name: FTPS_HOST resolves to $addresses"
else
  fail "name: FTPS_HOST does not resolve; check the secret for a typo"
  exit 1
fi

if timeout 10 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
  ok "port: $port answers"
else
  fail "port: nothing answers on $port within 10 s; check FTPS_PORT, or the host's firewall"
  exit 1
fi

trust=()
[ -n "${FTPS_CA_FILE:-}" ] && trust=(-CAfile "$FTPS_CA_FILE")
sni=()
[ "$is_ip" = 0 ] && sni=(-servername "$host")
openssl s_client -starttls ftp -connect "$host:$port" "${sni[@]}" "${trust[@]}" -showcerts \
  </dev/null >"$work/tls.txt" 2>&1
if ! openssl x509 -in "$work/tls.txt" -out "$work/cert.pem" 2>/dev/null; then
  fail "certificate: the server sent none after AUTH TLS; it may not offer explicit FTPS on $port"
  exit 1
fi

names="$(openssl x509 -in "$work/cert.pem" -noout -ext subjectAltName 2>/dev/null | tail -n +2 \
  | tr ',' '\n' | sed 's/^ *//; s/^DNS://; s/^IP Address://' | paste -sd' ')"
[ -n "$names" ] || names="$(openssl x509 -in "$work/cert.pem" -noout -subject -nameopt multiline \
  | sed -n 's/^ *commonName *= *//p')"
check=(-checkhost "$host")
[ "$is_ip" = 1 ] && check=(-checkip "$host")
cert_ok=1
if openssl x509 -in "$work/cert.pem" -noout "${check[@]}" | grep -q "does match"; then
  ok "certificate: issued for FTPS_HOST ($names)"
else
  fail "certificate: issued for $names, not for FTPS_HOST; set FTPS_HOST to one of those names"
  cert_ok=0
fi

verdict="$(sed -n 's/^ *Verify return code: //p' "$work/tls.txt" | tail -1)"
if [ "${verdict%% *}" = "0" ]; then
  ok "certificate: signed by a trusted authority"
else
  fail "certificate: not trusted (${verdict:-no verdict}); the host must serve its full chain"
  cert_ok=0
fi

until="$(openssl x509 -in "$work/cert.pem" -noout -enddate | cut -d= -f2)"
if ! openssl x509 -in "$work/cert.pem" -noout -checkend 0 >/dev/null; then
  fail "certificate: expired on $until"
  cert_ok=0
elif ! openssl x509 -in "$work/cert.pem" -noout -checkend $((14 * 86400)) >/dev/null; then
  warn "certificate: expires within 14 days, on $until"
else
  ok "certificate: valid until $until"
fi

probe=".riki-connection-check"
if [ "$cert_ok" = 0 ]; then
  skip "login: the deploy verifies the certificate, so it cannot log in until that is fixed"
else
  ca=""
  [ -n "${FTPS_CA_FILE:-}" ] && ca="set ssl:ca-file \"$FTPS_CA_FILE\";"
  echo "$(date -u +%FT%TZ)" >"$work/$probe"
  # The deploy's own settings, so a pass here means the deploy connects the same way.
  if LFTP_PASSWORD="$FTPS_PASSWORD" lftp -c "
      set cmd:fail-exit true;
      set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; $ca
      set net:max-retries 1; set net:timeout 20;
      open --env-password -u \"$FTPS_USER\" -p $port \"$host\";
      cd \"$dir\";
      lcd \"$work\";
      put $probe;
      rm $probe
    " >"$work/lftp.txt" 2>&1; then
    ok "login: FTPS_USER logs in, and writes and removes a file in $dir"
  else
    reason="$(grep -v '^\s*$' "$work/lftp.txt" | tail -1)"
    reason="${reason//"$FTPS_PASSWORD"/***}"
    fail "login: ${reason:-lftp failed}; check FTPS_USER, FTPS_PASSWORD and that $dir exists"
  fi
fi

if [ -z "${SITE_URL:-}" ]; then
  skip "site: SITE_URL is not set"
elif body="$(curl -fsS --max-time 20 "${SITE_URL%/}/site.json" 2>"$work/curl.txt")"; then
  version="$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' <<<"$body")"
  commit="$(sed -n 's/.*"commit" *: *"\([^"]*\)".*/\1/p' <<<"$body")"
  if [ -n "$version" ]; then
    ok "site: ${SITE_URL%/} serves $version ($commit)"
  else
    fail "site: ${SITE_URL%/}/site.json is not the site's; is SITE_URL the site's address?"
  fi
else
  fail "site: ${SITE_URL%/}/site.json: $(tail -1 "$work/curl.txt")"
fi

exit "$failed"

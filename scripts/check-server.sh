#!/usr/bin/env bash
# Whether the site's FTPS server takes a deploy, layer by layer; any FAIL exits 1.
# Reads FTPS_HOST, FTPS_USER, FTPS_PASSWORD, FTPS_DIR, FTPS_PORT, FTPS_CA_FILE, FTPS_CERT_NAME, SITE_URL.
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

# shellcheck source=scripts/ftps-certificate.sh
source "$(dirname "$0")/ftps-certificate.sh"

if ftps_is_address "$host"; then
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

if ! ftps_fetch_certificate "$host" "$port" "$work"; then
  fail "certificate: the server sent none after AUTH TLS; it may not offer explicit FTPS on $port"
  exit 1
fi

names="$(ftps_certificate_names "$work/cert.pem")"
cert_ok=1
if ftps_issued_for_host "$work/cert.pem" "$host"; then
  ok "certificate: issued for FTPS_HOST ($names)"
elif ftps_issued_for_cert_name "$work/cert.pem"; then
  ok "certificate: issued for FTPS_CERT_NAME ($names)"
else
  fail "certificate: issued for $names, not for FTPS_HOST or FTPS_CERT_NAME; set one to one of those names"
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
  # lftp knows only FTPS_HOST; the name was checked above, as the deploy checks it.
  [ -n "${FTPS_CERT_NAME:-}" ] && ca="$ca set ssl:check-hostname false;"
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
    # lftp logs in at its first command, so a refused login shows up as cd's failure.
    if [[ "$reason" == *"Login failed"* || "$reason" =~ (^|[^0-9])530([^0-9]|$) ]]; then
      fail "login: the server refused FTPS_USER and FTPS_PASSWORD (${reason#*: }); set both as the host's admin shows them"
    elif [[ "$reason" == cd:* ]]; then
      ok "login: FTPS_USER logs in"
      fail "folder: $dir cannot be opened (${reason#cd: }); FTPS_DIR is read from where FTPS_USER lands"
    elif [ -n "$reason" ]; then
      ok "login: FTPS_USER logs in, and opens $dir"
      fail "write: ${reason}; FTPS_USER may not write in $dir"
    else
      fail "login: lftp failed without a reason"
    fi
  fi
fi

site="${SITE_URL%/}"
if [ -z "$site" ]; then
  skip "site: SITE_URL is not set"
elif [[ "$site" != http://* && "$site" != https://* ]]; then
  fail "site: SITE_URL ($site) has no scheme; set it to https://$site"
elif answer="$(curl -sS -L --max-time 20 -o "$work/site.json" -w '%{http_code} %{url_effective} %{content_type}' \
    "$site/site.json" 2>"$work/curl.txt")"; then
  read -r status landed type <<<"$answer"
  version="$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' "$work/site.json")"
  commit="$(sed -n 's/.*"commit" *: *"\([^"]*\)".*/\1/p' "$work/site.json")"
  moved=""
  [ "$landed" != "$site/site.json" ] && moved=", redirected to $landed"
  if [ "${status:0:1}" != 2 ]; then
    fail "site: $site/site.json answers $status$moved; no release is deployed there, or SITE_URL is not the site"
  elif [ -n "$version" ]; then
    ok "site: $site serves $version ($commit)"
  else
    fail "site: $site/site.json answers $status ${type:-without a type}$moved, not the site's site.json; is SITE_URL the site's address?"
  fi
else
  fail "site: $site/site.json: $(tail -1 "$work/curl.txt")"
fi

exit "$failed"

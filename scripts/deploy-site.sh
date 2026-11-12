#!/usr/bin/env bash
# A release's web-site.zip onto the PHP server over FTPS; the server's config.php is never touched.
# Reads FTPS_HOST, FTPS_USER, FTPS_PASSWORD, FTPS_DIR, FTPS_PORT and FTPS_CA_FILE (README).
set -euo pipefail

zip="${1:?usage: deploy-site.sh web-site.zip}"
: "${FTPS_HOST:?FTPS_HOST is not set}" "${FTPS_USER:?FTPS_USER is not set}" "${FTPS_PASSWORD:?FTPS_PASSWORD is not set}"
dir="${FTPS_DIR:-/}"
port="${FTPS_PORT:-21}"

if [ -f "$zip.sha256" ]; then
  (cd "$(dirname "$zip")" && sha256sum --check --status "$(basename "$zip").sha256") \
    || { echo "web-site.zip does not match its .sha256" >&2; exit 1; }
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
unzip -q "$zip" -d "$work/site"
for each in index.php Site.php site.json out/index.html; do
  [ -f "$work/site/$each" ] || { echo "web-site.zip has no $each" >&2; exit 1; }
done
if [ -e "$work/site/config.php" ]; then
  echo "web-site.zip carries a config.php; the server's own must not be replaced" >&2
  exit 1
fi

trust=""
if [ -n "${FTPS_CA_FILE:-}" ]; then trust="set ssl:ca-file \"$FTPS_CA_FILE\";"; fi

# New assets first, then the page that names them, then what no page names any more.
# Every file is sent: a page of the same size, older than the server's copy, is still new.
LFTP_PASSWORD="$FTPS_PASSWORD" lftp -c "
  set cmd:fail-exit true;
  set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; $trust
  set net:max-retries 3; set net:timeout 30; set net:reconnect-interval-base 5;
  open --env-password -u \"$FTPS_USER\" -p $port \"$FTPS_HOST\";
  mkdir -p -f \"$dir\"; cd \"$dir\";
  lcd \"$work/site\";
  mirror --reverse --transfer-all --no-perms --parallel=4 out out;
  put Site.php config.example.php;
  put index.php;
  put site.json;
  mirror --reverse --delete --no-perms out out;
  get -O \"$work\" site.json -o deployed.json
"

wanted="$(node -p "require('$work/site/site.json').commit")"
landed="$(node -p "require('$work/deployed.json').commit")"
[ "$wanted" = "$landed" ] || { echo "the server holds $landed, not $wanted" >&2; exit 1; }
echo "deployed $(node -p "require('$work/site/site.json').version") ($wanted) to $FTPS_HOST$dir"

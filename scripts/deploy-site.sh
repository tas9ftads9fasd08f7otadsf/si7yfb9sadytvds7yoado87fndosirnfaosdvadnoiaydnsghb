#!/usr/bin/env bash
# A release's web-site.zip onto the PHP server over FTPS, with the config.php this run writes.
# Reads FTPS_HOST, FTPS_USER, FTPS_PASSWORD, FTPS_DIR, FTPS_PORT, FTPS_CA_FILE, FTPS_CERT_NAME,
# ICLOUD_API_TOKEN, ICLOUD_CONTAINER and REGIONS_CATALOG (README).
# Needs lftp, openssl, unzip, node and php on the PATH.
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

# Values go in through the environment and out through var_export, never through source text.
RIKI_CONFIG_OUT="$work/config.php" php <<'PHP'
<?php
$fail = static function (string $why): never { fwrite(STDERR, $why . "\n"); exit(1); };
$token = trim((string) getenv('ICLOUD_API_TOKEN'));
if ($token === '') {
    $fail('ICLOUD_API_TOKEN is empty: set it as a variable or secret on the site environment');
}
$container = trim((string) getenv('ICLOUD_CONTAINER')) ?: 'iCloud.com.rikimaps.rikimaps.maps';
if (!preg_match('/^iCloud\.[A-Za-z0-9._-]+\z/', $container)) {
    $fail('ICLOUD_CONTAINER is not a CloudKit container identifier (iCloud.com.example.app)');
}
// 112 Region packages come through the site's server from the catalog this names; left out, the site offers none.
$regions = trim((string) getenv('REGIONS_CATALOG'));
if ($regions !== '' && !preg_match('~^https://[^/?#\s]+(/[^?#\s]*)?\z~', $regions)) {
    $fail('REGIONS_CATALOG must be an https:// URL without query or fragment, such as https://example.com/maps.json');
}
$config = ['container' => $container, 'apiToken' => $token, 'environment' => 'production'];
if ($regions !== '') {
    $config['regionsCatalog'] = $regions;
}
file_put_contents((string) getenv('RIKI_CONFIG_OUT'), "<?php\n\nreturn " . var_export($config, true) . ";\n");
PHP
unzip -q "$zip" -d "$work/site"
for each in index.php Site.php Regions.php .htaccess site.json out/index.html; do
  [ -f "$work/site/$each" ] || { echo "web-site.zip has no $each" >&2; exit 1; }
done
if [ -e "$work/site/config.php" ]; then
  echo "web-site.zip carries a config.php; the deploy writes it from the repository's settings" >&2
  exit 1
fi

# A site without the core cannot read a map; only a test address may go without (RIKI_ALLOW_NO_CORE=1).
if [ ! -f "$work/site/out/riki-core.wasm" ] && [ "${RIKI_ALLOW_NO_CORE:-}" != "1" ]; then
  echo "web-site.zip has no out/riki-core.wasm: the site cannot read maps without it. Pin rikiCore.ref in package.json" >&2
  echo "and release again, or deploy to a test address with RIKI_ALLOW_NO_CORE=1" >&2
  exit 1
fi

# 110 Its labels and icons come from the site's own glyphs and sprite; without them every map is unlabelled.
if { [ ! -d "$work/site/out/glyphs" ] || [ ! -f "$work/site/out/sprites/temaki-sprite.json" ]; } && [ "${RIKI_ALLOW_NO_CORE:-}" != "1" ]; then
  echo "web-site.zip has no out/glyphs or out/sprites: maps would have no labels or icons. Pin rikiCore.ref in package.json" >&2
  echo "and release again, or deploy to a test address with RIKI_ALLOW_NO_CORE=1" >&2
  exit 1
fi

trust=""
if [ -n "${FTPS_CA_FILE:-}" ]; then trust="set ssl:ca-file \"$FTPS_CA_FILE\";"; fi

# shellcheck source=scripts/ftps-certificate.sh
source "$(dirname "$0")/ftps-certificate.sh"
# lftp can check a certificate only against FTPS_HOST, so FTPS_CERT_NAME is checked here.
if [ -n "${FTPS_CERT_NAME:-}" ]; then
  ftps_fetch_certificate "$FTPS_HOST" "$port" "$work" \
    || { echo "the server sent no certificate after AUTH TLS" >&2; exit 1; }
  if ! ftps_issued_for_host "$work/cert.pem" "$FTPS_HOST" && ! ftps_issued_for_cert_name "$work/cert.pem"; then
    echo "the certificate is issued for $(ftps_certificate_names "$work/cert.pem"), not for FTPS_HOST or FTPS_CERT_NAME" >&2
    exit 1
  fi
  trust="$trust set ssl:check-hostname false;"
fi

# Assets, server code, config.php (sent as .new, renamed), index.php, site.json, then deletions:
# the new entry point goes last, and a failed config upload leaves the old one serving.
# Every file is sent: a page of the same size, older than the server's copy, is still new.
LFTP_PASSWORD="$FTPS_PASSWORD" lftp -c "
  set cmd:fail-exit true;
  set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; $trust
  set net:max-retries 3; set net:timeout 30; set net:reconnect-interval-base 5;
  open --env-password -u \"$FTPS_USER\" -p $port \"$FTPS_HOST\";
  mkdir -p -f \"$dir\"; cd \"$dir\";
  lcd \"$work/site\";
  mirror --reverse --transfer-all --no-perms --parallel=4 out out;
  put Site.php;
  put Regions.php;
  put config.example.php;
  put .htaccess;
  put \"$work/config.php\" -o config.php.new;
  mv config.php.new config.php;
  put index.php;
  put site.json;
  mirror --reverse --delete --no-perms out out;
  get -O \"$work\" site.json -o deployed.json;
  get -O \"$work\" config.php -o deployed-config.php
"
cmp -s "$work/config.php" "$work/deployed-config.php" || { echo "config.php on the server is not the one written" >&2; exit 1; }

wanted="$(node -p "require('$work/site/site.json').commit")"
landed="$(node -p "require('$work/deployed.json').commit")"
[ "$wanted" = "$landed" ] || { echo "the server holds $landed, not $wanted" >&2; exit 1; }
echo "deployed $(node -p "require('$work/site/site.json').version") ($wanted) to $FTPS_HOST$dir"

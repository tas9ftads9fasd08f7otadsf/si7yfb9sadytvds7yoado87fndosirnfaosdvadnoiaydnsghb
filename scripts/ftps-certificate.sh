# The certificate an FTPS server shows, and whether the deploy accepts it; sourced, not run.

# Writes the server's certificate to <dir>/cert.pem and openssl's report to <dir>/tls.txt.
ftps_fetch_certificate() {
  local host="$1" port="$2" dir="$3" trust=() sni=()
  [ -n "${FTPS_CA_FILE:-}" ] && trust=(-CAfile "$FTPS_CA_FILE")
  ftps_is_address "$host" || sni=(-servername "$host")
  openssl s_client -starttls ftp -connect "$host:$port" "${sni[@]}" "${trust[@]}" -showcerts \
    </dev/null >"$dir/tls.txt" 2>&1
  openssl x509 -in "$dir/tls.txt" -out "$dir/cert.pem" 2>/dev/null
}

ftps_is_address() { [[ "$1" =~ ^[0-9.]+$ || "$1" == *:* ]]; }

# The names a certificate holds, space-separated.
ftps_certificate_names() {
  local names
  names="$(openssl x509 -in "$1" -noout -ext subjectAltName 2>/dev/null | tail -n +2 \
    | tr ',' '\n' | sed 's/^ *//; s/^DNS://; s/^IP Address://' | paste -sd' ')"
  [ -n "$names" ] || names="$(openssl x509 -in "$1" -noout -subject -nameopt multiline \
    | sed -n 's/^ *commonName *= *//p')"
  echo "$names"
}

ftps_issued_for_host() {
  local check=(-checkhost "$2")
  ftps_is_address "$2" && check=(-checkip "$2")
  openssl x509 -in "$1" -noout "${check[@]}" | grep -q "does match"
}

# 121 Shared hosting shows one certificate for all its sites, never naming FTPS_HOST.
ftps_issued_for_cert_name() {
  [ -n "${FTPS_CERT_NAME:-}" ] || return 1
  local names
  read -ra names <<<"$(ftps_certificate_names "$1")"
  printf '%s\n' "${names[@]}" | grep -qxF -- "$FTPS_CERT_NAME"
}

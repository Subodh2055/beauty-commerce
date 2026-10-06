#!/bin/sh
# First Let's Encrypt certificate for a fresh server (renewals are automatic:
# the `certbot` service in docker-compose.prod.yml).
#
#   DOMAINS="example.com www.example.com n8n.example.com" EMAIL=ops@example.com \
#     sh scripts/init-letsencrypt.sh
#
# nginx can't start without a certificate, and certbot needs nginx to answer
# the HTTP challenge, so: write a temporary self-signed certificate, start
# nginx, ask Let's Encrypt for the real one, reload nginx.
# STAGING=1 uses Let's Encrypt staging (no rate limits) for a dry run.
set -eu

DOMAINS="${DOMAINS:?set DOMAINS, e.g. \"example.com www.example.com\"}"
EMAIL="${EMAIL:?set EMAIL for expiry notices}"
PRIMARY="$(echo "$DOMAINS" | cut -d' ' -f1)"
COMPOSE="docker compose -f docker-compose.prod.yml"
LIVE="/etc/letsencrypt/live/$PRIMARY"

echo "### temporary certificate for $PRIMARY"
# certbot's image always has Python's `cryptography` (certbot depends on it).
$COMPOSE run --rm -e LIVE="$LIVE" --entrypoint python certbot -c '
import datetime, os
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

d = os.environ["LIVE"]
os.makedirs(d, exist_ok=True)
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
now = datetime.datetime.now(datetime.timezone.utc)
cert = (
    x509.CertificateBuilder().subject_name(name).issuer_name(name)
    .public_key(key.public_key()).serial_number(x509.random_serial_number())
    .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=1))
    .sign(key, hashes.SHA256())
)
with open(d + "/privkey.pem", "wb") as f:
    f.write(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
with open(d + "/fullchain.pem", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
'

echo "### starting nginx"
$COMPOSE up -d nginx

echo "### requesting the real certificate"
$COMPOSE run --rm --entrypoint sh certbot -c "rm -rf $LIVE /etc/letsencrypt/archive/$PRIMARY /etc/letsencrypt/renewal/$PRIMARY.conf"
ARGS=""
for d in $DOMAINS; do ARGS="$ARGS -d $d"; done
# shellcheck disable=SC2086 # ARGS is a word list on purpose
$COMPOSE run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  $ARGS --email "$EMAIL" --agree-tos --no-eff-email --rsa-key-size 4096 \
  ${STAGING:+--staging}

echo "### reloading nginx"
$COMPOSE exec nginx nginx -s reload

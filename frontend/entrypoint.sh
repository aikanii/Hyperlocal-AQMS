#!/bin/sh

# Ensure DOMAIN is always defined so nginx config templates work correctly
DOMAIN=${DOMAIN:-localhost}

# Ensure certs directory exists
mkdir -p /etc/nginx/certs

# Logic to use Let's Encrypt certs if they exist, otherwise fallback to self-signed
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "Found Let's Encrypt certificates for $DOMAIN. Linking..."
    ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/nginx/certs/localhost.crt
    ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/nginx/certs/localhost.key
elif [ ! -f /etc/nginx/certs/localhost.crt ]; then
    echo "No production certificates found. Generating self-signed cert with SANs..."

    # Write a temporary openssl config that includes Subject Alternative Names
    # Chrome 58+ requires SANs; a CN-only cert triggers NET::ERR_CERT_COMMON_NAME_INVALID
    cat > /tmp/openssl-san.cnf <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C=PH
ST=Lanao del Norte
L=Iligan City
O=HY-AQMS
CN=localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
EOF

    openssl req -x509 -nodes -days 730 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/localhost.key \
        -out    /etc/nginx/certs/localhost.crt \
        -config /tmp/openssl-san.cnf

    rm -f /tmp/openssl-san.cnf
    echo "Self-signed cert with SANs generated."
fi

# Substitute DOMAIN env var into Nginx config template
sed "s/\${DOMAIN}/$DOMAIN/g" < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting Nginx with DOMAIN=$DOMAIN..."
exec nginx -g "daemon off;"

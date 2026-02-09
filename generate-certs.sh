#!/bin/bash
mkdir -p nginx/certs
if [ ! -f nginx/certs/server.key ]; then
    echo "🔐 Generando certificados auto-firmados para HTTPS..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/certs/server.key \
        -out nginx/certs/server.crt \
        -subj "/C=EC/ST=Guayas/L=Guayaquil/O=AlgorandCert/CN=myself"
    echo "✅ Certificados creados en ./nginx/certs/"
else
    echo "✅ Certificados SSL ya existen."
fi

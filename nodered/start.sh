#!/bin/sh
set -e

echo "------------------------------------------------"
echo "!!! INITIALIZING CUSTOM NODE-RED !!!"
echo "------------------------------------------------"

# 0. Load Vault-injected environment variables, if available
if [ -f /vault/secrets/config.env ]; then
    echo ">> Loading secrets from Vault..."
    . /vault/secrets/config.env
else
    echo ">> Vault secrets file not found at /vault/secrets/config.env"
    echo ">> Continuing without Vault-injected secrets..."
fi

# 1. Enforce Settings (Crucial for Auth/Secrets)
echo ">> Applying settings.js..."
cp /usr/src/node-red/seed_config/settings.js /data/settings.js

# 2. Seed Flows if missing
if [ ! -f /data/flows.json ]; then
    echo ">> Seeding flows.json..."
    cp /usr/src/node-red/seed_config/flows.json /data/flows.json
else
    echo ">> flows.json already exists, keeping existing file."
fi

# 3. Seed Creds if missing
if [ ! -f /data/flows_cred.json ]; then
    echo ">> Seeding flows_cred.json..."
    cp /usr/src/node-red/seed_config/flows_cred.json /data/flows_cred.json
else
    echo ">> flows_cred.json already exists, keeping existing file."
fi

echo ">> Starting Node-RED..."
exec npm start -- --userDir /data
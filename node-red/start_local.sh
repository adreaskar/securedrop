#!/bin/sh
echo "------------------------------------------------"
echo "!!! INITIALIZING CUSTOM NODE-RED !!!"
echo "------------------------------------------------"

# 1. Enforce Settings
cp /usr/src/node-red/seed_config/settings.js /data/settings.js

# 2. Seed Flows if missing
if [ ! -f /data/flows.json ]; then
    echo ">> Seeding flows.json..."
    cp /usr/src/node-red/seed_config/flows.json /data/flows.json
fi

# 3. Seed Creds if missing
if [ ! -f /data/flows_cred.json ]; then
    echo ">> Seeding flows_cred.json..."
    cp /usr/src/node-red/seed_config/flows_cred.json /data/flows_cred.json
fi

echo ">> Starting Node-RED..."
exec npm start -- --userDir /data
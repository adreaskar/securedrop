FROM nodered/node-red:4.1.2

USER root

# Upgrade system packages to get security patches (openssl CVE-2026-31789)
RUN apk update && apk upgrade --no-cache \
    && rm -f /data/flows.json

USER node-red

# Install npm packages & create seed directory
RUN npm install \
    clamscan@2.4.0 \
    node-red-node-aws@0.4.0 \
    @stormpass/node-red-contrib-amqp@1.4.1 \
    @reggae_ulli/node-red-contrib-minio-all-fix@0.0.4 \
    && mkdir -p /usr/src/node-red/seed_config

# Copy configs
COPY --chown=node-red:node-red settings.js /usr/src/node-red/seed_config/settings.js
COPY --chown=node-red:node-red flows.json /usr/src/node-red/seed_config/flows.json
COPY --chown=node-red:node-red flows_cred.json /usr/src/node-red/seed_config/flows_cred.json

# Copy startup script
COPY --chown=node-red:node-red --chmod=755 start.sh /usr/src/node-red/start.sh

ENTRYPOINT ["/usr/src/node-red/start.sh"]
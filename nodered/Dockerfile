FROM nodered/node-red:4.1.2

# Switch to root to perform cleanup
USER root

# Remove the default flow file so Docker doesn't copy it to the volume.
RUN rm -f /data/flows.json

# Switch to node-red user for security
USER node-red

# 1. Install clamscan npm package
RUN npm install clamscan

# 2. Install External Nodes
# We run npm install in the default workdir (/usr/src/node-red).
# Node-RED will automatically load nodes found here.
RUN npm install \
    node-red-node-aws \
    @stormpass/node-red-contrib-amqp \
    @reggae_ulli/node-red-contrib-minio-all-fix

# 3. Create a seed directory to hold our configs
RUN mkdir -p /usr/src/node-red/seed_config

# 4. Copy configs to the seed directory
# (Do NOT copy directly to /data, or volumes will hide them)
COPY --chown=node-red:node-red settings.js /usr/src/node-red/seed_config/settings.js
COPY --chown=node-red:node-red flows.json /usr/src/node-red/seed_config/flows.json
COPY --chown=node-red:node-red flows_cred.json /usr/src/node-red/seed_config/flows_cred.json

# 5. Copy the startup script
COPY --chown=node-red:node-red start.sh /usr/src/node-red/start.sh
RUN chmod +x /usr/src/node-red/start.sh

# 6. Run script
ENTRYPOINT ["/usr/src/node-red/start.sh"]
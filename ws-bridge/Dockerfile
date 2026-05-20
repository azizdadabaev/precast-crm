# Self-hosted WebSocket bridge for the Blender feature.
# See ../HANDOFF.md → "Blender Bridge" for the protocol.

FROM node:20-alpine

WORKDIR /app

RUN addgroup --system --gid 1001 bridge \
 && adduser  --system --uid 1001 --ingroup bridge bridge \
 && apk add --no-cache su-exec

# Install deps first (small dep tree — ws + pg) so the layer is cached.
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund --prefer-offline

COPY --chown=bridge:bridge server.js ./
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8766/status || exit 1

EXPOSE 8765 8766

# Entrypoint runs as root to chown /data/drawings, then drops to bridge.
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]

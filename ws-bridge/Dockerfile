# Self-hosted WebSocket bridge for the Blender feature.
# See ../HANDOFF.md → "Blender Bridge" for the protocol.

FROM node:20-alpine

WORKDIR /app

# Install deps first (small dep tree — ws + pg) so the layer is cached.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

EXPOSE 8765 8766

CMD ["node", "server.js"]

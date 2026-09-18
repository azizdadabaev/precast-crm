# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# patches/ must be present before install — the postinstall (patch-package)
# applies our vendored @vercel/og fix during `npm ci`.
COPY patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# The 2 GB VPS this deploys to gives V8 a default old-space below what `next build`
# now needs: the build died with "Ineffective mark-compacts near heap limit" once the
# app grew past roughly its current size. 3 GB is backed by the box swap rather than
# RAM, so the build is slower but finishes.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# chromium + fonts: the AI agent screenshots the quote card with a headless
# browser (puppeteer-core). font-noto covers the card's Cyrillic labels.
RUN apk add --no-cache libc6-compat openssl \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the full node_modules from the builder so prisma + tsx (used by db:seed)
# work at runtime. This makes the image larger (~600MB) than a pure standalone
# build (~200MB), but it lets `prisma db push` and `npm run db:seed` work
# without juggling individual transitive deps. Acceptable for this app size.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Source + tsconfig are needed by `npm run db:seed` — seed.ts imports from
# `src/` via the `@/` path alias, so tsx needs both the files and the alias map.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads /app/.next

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

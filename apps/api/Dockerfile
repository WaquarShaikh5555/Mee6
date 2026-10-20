# Production image for the Shaikh's API.
#
#   docker build -t shaikhs-api .
#   docker run --rm -p 8082:8080 -e DATABASE_URL=postgres://... shaikhs-api
#
# Built remotely by Azure Container Registry in the deployment runbook, so the
# machine running the deployment does not need Docker installed.

# ----------------------------------------------------------- dependencies ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------------ build ---
FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------- runtime ---
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# dumb-init reaps zombies and forwards SIGTERM, so the server's graceful
# shutdown actually runs when the platform stops the container.
RUN apt-get update \
 && apt-get install --no-install-recommends -y dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Distroless-style: run as the unprivileged user that ships with the image.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

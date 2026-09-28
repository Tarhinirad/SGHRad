# Works on Railway, Fly.io, a VPS, etc. Mount a volume at /data to keep the database.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_FILE=/data/sghrad.db
COPY --from=build /app /app
RUN mkdir -p /data
VOLUME /data
EXPOSE 3001
CMD ["npx", "tsx", "server/src/index.ts"]

# Runs anywhere that takes a container: Fly.io, Railway, Koyeb, a VPS.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./

# --omit=optional skips better-sqlite3, so no compiler is needed in the image;
# the app falls back to Node's own built-in SQLite.
RUN npm ci --omit=dev --omit=optional

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV VAE_DATA_DIR=/data

EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server.js"]

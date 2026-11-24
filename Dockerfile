FROM node:24-bookworm-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY app app
COPY src src
COPY server server
COPY shared shared
COPY migrations migrations
COPY scripts scripts
COPY dev-tools dev-tools
COPY index.html vite.config.ts tsconfig.json ./
COPY wrangler.jsonc ./
RUN npm run build && mkdir -p /app/.wrangler /app/node_modules/.mf /app/node_modules/.vite /app/node_modules/.vite-temp \
 && chown -R node:node /app/server /app/build /app/.wrangler /app/node_modules/.mf /app/node_modules/.vite /app/node_modules/.vite-temp \
 && chown node:node /app

USER node
EXPOSE 8788
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8788"]

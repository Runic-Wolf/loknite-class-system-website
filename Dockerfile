FROM node:24-bookworm-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY app app
COPY server server
COPY migrations migrations
COPY scripts scripts
COPY wrangler.jsonc ./
RUN npm run build && mkdir -p /app/.wrangler /app/node_modules/.mf \
 && chown -R node:node /app/.wrangler /app/node_modules/.mf

USER node
EXPOSE 8788
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8788"]

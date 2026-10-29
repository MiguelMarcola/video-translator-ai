FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @video-translate/contracts build \
  && pnpm --filter @video-translate/storage build \
  && pnpm --filter @video-translate/database build \
  && pnpm --filter @video-translate/api build
CMD ["node", "apps/api/dist/main.js"]

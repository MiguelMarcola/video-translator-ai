FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY . .
RUN python3 -m venv workers/media-python/.venv \
  && workers/media-python/.venv/bin/pip install --no-cache-dir -r workers/media-python/requirements.txt \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @video-translate/contracts build \
  && pnpm --filter @video-translate/storage build \
  && pnpm --filter @video-translate/database build \
  && pnpm --filter @video-translate/worker build
ENV PYTHON_BIN=/app/workers/media-python/.venv/bin/python
ENV FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ENV FONT_FAMILY="DejaVu Sans"
CMD ["node", "apps/worker/dist/main.js"]

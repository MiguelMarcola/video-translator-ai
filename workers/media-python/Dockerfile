FROM python:3.12-slim-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/media-worker
COPY workers/media-python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/media-python /opt/media-worker
ENV PYTHONPATH=/opt/media-worker
ENV FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ENV FONT_FAMILY="DejaVu Sans"
ENTRYPOINT ["python", "-m", "media_worker"]

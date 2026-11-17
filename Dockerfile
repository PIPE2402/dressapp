FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/yt-dlp && /opt/yt-dlp/bin/pip install --no-cache-dir 'yt-dlp[default,curl-cffi]'
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY server.mjs ./
COPY public ./public
RUN mkdir downloads && chown -R node:node /app
ENV HOST=0.0.0.0 PORT=3847 YTDLP_PATH=/opt/yt-dlp/bin/yt-dlp FFMPEG_PATH=/usr/bin/ffmpeg
USER node
EXPOSE 3847
CMD ["node", "server.mjs"]

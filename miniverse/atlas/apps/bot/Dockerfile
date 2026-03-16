FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install audio/video tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    pulseaudio \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY apps/bot/ apps/bot/

RUN npm install --workspace=apps/bot
RUN npx playwright install chromium

CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1920x1080x24", \
     "bash", "-c", "pulseaudio --start --exit-idle-time=-1 && node apps/bot/src/bot/index.js"]

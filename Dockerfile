FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip libgomp1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ml/requirements.txt ./ml/requirements.txt
RUN python3 -m venv /opt/partcast-venv \
  && /opt/partcast-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/partcast-venv/bin/pip install --no-cache-dir -r ./ml/requirements.txt

COPY apps/server/package.json apps/server/package-lock.json ./apps/server/
RUN cd ./apps/server && npm ci --omit=dev

COPY apps/server ./apps/server
COPY ml ./ml

ENV NODE_ENV=production
ENV PORT=10000
ENV PYTHON_BIN=/opt/partcast-venv/bin/python
ENV ML_SCRIPT_PATH=/app/ml/train_forecast.py

WORKDIR /app/apps/server
EXPOSE 10000
CMD ["npm", "start"]

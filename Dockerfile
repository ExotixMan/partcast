FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ml/requirements.txt /app/ml/requirements.txt
RUN python3 -m venv /opt/partcast-venv \
    && /opt/partcast-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/partcast-venv/bin/pip install --no-cache-dir -r /app/ml/requirements.txt

COPY apps/server/package.json /app/server/package.json
RUN cd /app/server && npm install --omit=dev

COPY apps/server /app/server
COPY ml /app/ml

WORKDIR /app/server
ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/partcast-venv/bin/python
ENV ML_SCRIPT_PATH=/app/ml/train_forecast.py
EXPOSE 10000
CMD ["npm", "start"]

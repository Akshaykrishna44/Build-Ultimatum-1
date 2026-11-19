# Build the React app, then run the engine API which also serves it.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/engine
COPY engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine/ .
COPY --from=web /web/dist /app/web/dist
ENV ULTIMATUM_WEB_DIST=/app/web/dist ULTIMATUM_DB=/data/ultimatum.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "ultimatum.api:app", "--host", "0.0.0.0", "--port", "8000"]

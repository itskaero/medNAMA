FROM python:3.11-slim
ARG REPO_URL=https://github.com/mhhassaan/medNAMA.git
ARG REPO_REF=main
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/models/huggingface TRANSFORMERS_CACHE=/models/huggingface
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git build-essential curl ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" /src
RUN pip install --upgrade pip && pip install -r /src/backend/requirements.txt
COPY docker/backend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && cp -a /src/backend/. /app/backend/ && mkdir -p /models/huggingface /tmp
WORKDIR /app/backend
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]

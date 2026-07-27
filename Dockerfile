FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV KAIOS_GATEWAY_HOST=0.0.0.0
ENV KAIOS_GATEWAY_PORT=8787
ENV KAIOS_RUNTIME_MODE=fixture
ENV KAIOS_ENVIRONMENT=production
ENV KAIOS_LOG_LEVEL=INFO
ENV KAIOS_SHUTDOWN_TIMEOUT_SECONDS=10
ENV KAIOS_DATABASE_PATH=/app/data/kaios.db

WORKDIR /app

RUN groupadd --system --gid 10001 kaios \
    && useradd \
        --system \
        --uid 10001 \
        --gid kaios \
        --home-dir /app \
        --shell /usr/sbin/nologin \
        kaios

COPY requirements.txt pyproject.toml ./

RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

COPY --chown=kaios:kaios . .

RUN python -m py_compile \
        app/api/contracts.py \
        app/api/gateway.py \
        app/api/service.py \
        app/api/wsgi.py \
        scripts/run_gateway.py \
        deploy/healthcheck.py \
        deploy/smoke_test.py

USER kaios

EXPOSE 8787

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD ["python", "deploy/healthcheck.py"]

CMD ["python", "scripts/run_gateway.py"]
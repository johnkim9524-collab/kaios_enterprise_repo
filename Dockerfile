FROM python:3.11.16-slim-bookworm@sha256:2e32f7d302adc1c37428355c1e646897c0c53f4fd60b6a551245fb90ee129f91 AS runtime

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

COPY requirements-runtime.lock.txt pyproject.toml ./

RUN python -m pip install \
        --disable-pip-version-check \
        --require-hashes \
        --only-binary=:all: \
        -r requirements-runtime.lock.txt

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

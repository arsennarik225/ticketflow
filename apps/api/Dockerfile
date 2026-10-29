# BiletFlow API. Built from the repository root (see docker-compose.yml) so the image can
# include docs/api/openapi.yaml, which the API serves at /docs.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CONTRACT_PATH=/app/openapi.yaml

# DejaVu fonts print Kazakh and Russian names on PDF tickets.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app ./app
COPY apps/api/db ./db
COPY docs/api/openapi.yaml ./openapi.yaml

EXPOSE 8000
CMD ["sh", "-c", "python -m app.initdb && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM runtime AS development
COPY apps/api/requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY apps/api/tests ./tests
COPY apps/api/pyproject.toml ./

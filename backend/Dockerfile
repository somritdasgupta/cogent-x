FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip uv

COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

COPY . .

RUN mkdir -p /app/config

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
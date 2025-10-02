FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for audio processing and WhisperX
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Verify ffmpeg is installed
RUN ffmpeg -version

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create config directory for runtime configuration
RUN mkdir -p /app/config

# Expose port (Render uses PORT env variable)
EXPOSE 8000

# Use PORT environment variable if available, otherwise default to 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
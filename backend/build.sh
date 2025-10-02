#!/usr/bin/env bash
# Render build script for backend
set -o errexit

echo "🔧 Installing system dependencies..."
# Update package list
apt-get update -qq

# Install ffmpeg and audio processing libraries
apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    sox \
    libsox-fmt-all

# Clean up apt cache to reduce image size
rm -rf /var/lib/apt/lists/*

echo "✓ System dependencies installed"

echo "📦 Installing Python dependencies..."
pip install --upgrade pip setuptools wheel
pip install --no-cache-dir -r requirements.txt

echo "✓ Python dependencies installed"

# Verify ffmpeg is available
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg is available: $(ffmpeg -version | head -n 1)"
else
    echo "❌ ERROR: ffmpeg not found!"
    exit 1
fi

echo "🎉 Build complete!"

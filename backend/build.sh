#!/bin/bash

# Render build script for cogent-x backend
# This script installs system dependencies required for voice features

echo "Installing system dependencies..."

# Update package list
apt-get update

# Install ffmpeg (required for WhisperX audio transcription)
echo "Installing ffmpeg for audio processing..."
apt-get install -y ffmpeg

# Verify ffmpeg installation
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg successfully installed"
    ffmpeg -version | head -n 1
else
    echo "✗ ERROR: ffmpeg installation failed!"
    exit 1
fi

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✓ Build complete!"

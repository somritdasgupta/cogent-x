@echo off
REM cogent-x Smart Unified Startup Script for Windows
REM Double-click this file to start everything!

title cogent-x RAG System - Smart Start

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Run the smart startup script
python run.py

REM Pause on error
if errorlevel 1 (
    echo.
    echo ERROR: Startup failed. Check the error messages above.
    echo.
    pause
)

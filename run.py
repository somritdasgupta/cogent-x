#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cogent-x RAG System Launcher
Smart Setup & Unified Process Manager

Developed by Somrit Dasgupta

Features:
  - Automatic dependency detection and installation
  - Port conflict resolution
  - Synchronized backend & frontend startup
  - Beautiful structured logs with color coding
  - Graceful shutdown handling

Usage:
  python run.py
"""

import subprocess
import sys
import os
import time
import threading
import platform
from datetime import datetime
from pathlib import Path
from typing import List, Optional


IS_WINDOWS = platform.system() == "Windows"


class Colors:
    """ANSI color codes for terminal output"""

    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    MAGENTA = '\033[35m'

    BOLD = '\033[1m'
    DIM = '\033[2m'
    UNDERLINE = '\033[4m'
    ENDC = '\033[0m'

    BG_GREEN = '\033[42m'
    BG_BLUE = '\033[44m'
    BG_RED = '\033[41m'
    BG_YELLOW = '\033[43m'

    @staticmethod
    def enable_windows_colors():
        """Enable ANSI colors on Windows 10+"""
        if IS_WINDOWS:
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            except Exception:
                Colors._disable_all()

    @staticmethod
    def _disable_all():
        """Disable all color codes"""
        for attr in dir(Colors):
            if not attr.startswith('_') and attr.isupper():
                setattr(Colors, attr, '')


Colors.enable_windows_colors()


class Logger:
    """Enhanced logging system with structured output"""

    SERVICE_COLORS = {
        "SETUP": Colors.MAGENTA,
        "BACKEND": Colors.BLUE,
        "FRONTEND": Colors.CYAN,
        "SYSTEM": Colors.YELLOW,
    }

    LEVEL_STYLES = {
        "INFO": (Colors.ENDC, "i"),
        "SUCCESS": (Colors.GREEN, "+"),
        "WARN": (Colors.YELLOW, "!"),
        "ERROR": (Colors.RED, "x"),
        "DEBUG": (Colors.DIM, "*"),
    }

    @staticmethod
    def log(service: str, message: str, level: str = "INFO"):
        """
        Print a beautifully formatted log message

        Args:
            service: Service name (SETUP, BACKEND, FRONTEND, SYSTEM)
            message: Log message content
            level: Log level (INFO, SUCCESS, WARN, ERROR, DEBUG)
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        service_color = Logger.SERVICE_COLORS.get(service, Colors.YELLOW)
        level_color, level_icon = Logger.LEVEL_STYLES.get(
            level, (Colors.ENDC, "*"))

        output = (
            f"{Colors.DIM}[{timestamp}]{Colors.ENDC} "
            f"{service_color}{Colors.BOLD}[{service:8}]{Colors.ENDC} "
            f"{level_color}{level_icon} {message}{Colors.ENDC}"
        )

        print(output)

    @staticmethod
    def section(title: str):
        """Print a section header"""
        print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 79}{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.CYAN}  {title}{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 79}{Colors.ENDC}\n")

    @staticmethod
    def banner():
        """Print the application banner"""
        banner_text = f"""
{Colors.CYAN}{Colors.BOLD}
===============================================================================
                                                                           
                                cogent-x                        
                   Private Document Intelligence Platform                  
                                                                           
                       Developed by Somrit Dasgupta                        
                                                                           
===============================================================================
{Colors.ENDC}
{Colors.GREEN}Starting smart initialization...{Colors.ENDC}
"""
        print(banner_text)

    @staticmethod
    def success_message():
        """Print success message with URLs"""
        print(f"\n{Colors.GREEN}{Colors.BOLD}{'=' * 79}{Colors.ENDC}")
        print(
            f"{Colors.GREEN}{Colors.BOLD}  All Services Running Successfully{Colors.ENDC}")
        print(f"{Colors.GREEN}{Colors.BOLD}{'=' * 79}{Colors.ENDC}\n")

        print(f"{Colors.CYAN}{Colors.BOLD}Access Points:{Colors.ENDC}\n")
        print(
            f"   {Colors.BOLD}Frontend App:{Colors.ENDC}    {Colors.UNDERLINE}http://localhost:8080{Colors.ENDC}")
        print(
            f"   {Colors.BOLD}Backend API:{Colors.ENDC}     {Colors.UNDERLINE}http://localhost:8000{Colors.ENDC}")
        print(f"   {Colors.BOLD}API Documentation:{Colors.ENDC} {Colors.UNDERLINE}http://localhost:8000/api/docs{Colors.ENDC}")

        print(f"\n{Colors.CYAN}{Colors.BOLD}Available Features:{Colors.ENDC}\n")
        print(f"   - Voice Transcription (WhisperX - Local & Private)")
        print(f"   - Text-to-Speech (Natural Voice Synthesis)")
        print(f"   - Document Ingestion (PDF, DOCX, TXT)")
        print(f"   - RAG-Powered Q&A with Source Citations")
        print(f"   - Vector Search with FAISS")

        print(f"\n{Colors.YELLOW}{Colors.BOLD}Tips:{Colors.ENDC}")
        print(f"   - Use voice input for hands-free queries")
        print(f"   - Check source citations for answer verification")
        print(f"   - Configure LLM providers in settings")

        print(f"\n{Colors.DIM}Press {Colors.BOLD}Ctrl+C{Colors.ENDC}{Colors.DIM} to stop all services{Colors.ENDC}\n")


def run_command(cmd: str, cwd: Optional[str] = None, show_output: bool = False) -> bool:
    """Execute a shell command"""
    try:
        if show_output:
            result = subprocess.run(cmd, cwd=cwd, shell=True, check=False)
        else:
            result = subprocess.run(
                cmd, cwd=cwd, shell=True,
                capture_output=True, text=True, check=False
            )
        return result.returncode == 0
    except Exception as e:
        Logger.log("SYSTEM", f"Command execution failed: {e}", "ERROR")
        return False


def check_command_exists(command: str) -> bool:
    """Check if a command exists in PATH"""
    try:
        result = subprocess.run(
            f"{'where' if IS_WINDOWS else 'which'} {command}",
            capture_output=True, shell=True, timeout=3
        )
        return result.returncode == 0
    except Exception:
        return False


def check_python_package(package: str) -> bool:
    """Check if a Python package is installed"""
    try:
        __import__(package)
        return True
    except ImportError:
        return False


def kill_process_on_port(port: int) -> bool:
    """Kill any process using the specified port"""
    try:
        if IS_WINDOWS:
            result = subprocess.run(
                f'netstat -ano | findstr :{port}',
                capture_output=True, text=True, shell=True
            )

            if result.returncode == 0 and result.stdout.strip():
                pids = set()
                for line in result.stdout.strip().split('\n'):
                    parts = line.split()
                    if len(parts) >= 5 and parts[-1].isdigit():
                        pids.add(parts[-1])

                for pid in pids:
                    try:
                        subprocess.run(
                            f'taskkill /F /PID {pid}',
                            capture_output=True, shell=True, timeout=5
                        )
                        Logger.log(
                            "SYSTEM", f"Cleared port {port} (PID: {pid})", "SUCCESS")
                    except Exception:
                        pass
                return True
        else:
            result = subprocess.run(
                f"lsof -ti:{port}",
                capture_output=True, text=True, shell=True
            )

            if result.returncode == 0 and result.stdout.strip():
                for pid in result.stdout.strip().split('\n'):
                    try:
                        subprocess.run(
                            f"kill -9 {pid}",
                            capture_output=True, shell=True, timeout=5
                        )
                        Logger.log(
                            "SYSTEM", f"Cleared port {port} (PID: {pid})", "SUCCESS")
                    except Exception:
                        pass
                return True

        return False

    except Exception as e:
        Logger.log("SYSTEM", f"Port check error: {e}", "WARN")
        return False


def check_and_clear_ports() -> bool:
    """Check and clear required ports (8000 and 8080)"""
    ports_to_check = [8000, 8080]
    cleared_any = False

    for port in ports_to_check:
        if kill_process_on_port(port):
            cleared_any = True
            time.sleep(0.5)

    if not cleared_any:
        Logger.log("SETUP", "Ports 8000 & 8080 available", "SUCCESS")

    return True


def check_python_version() -> bool:
    """Verify Python version meets requirements"""
    major, minor = sys.version_info.major, sys.version_info.minor

    if (major, minor) < (3, 8):
        Logger.log(
            "SETUP", f"Python 3.8+ required (found {major}.{minor})", "ERROR")
        return False

    Logger.log(
        "SETUP", f"Python {major}.{minor}.{sys.version_info.micro} detected", "SUCCESS")
    return True


def install_backend_dependencies() -> bool:
    """Install Python backend dependencies"""
    Logger.log("SETUP", "Checking backend dependencies...", "INFO")

    requirements_file = Path("backend/requirements.txt")
    if not requirements_file.exists():
        Logger.log("SETUP", "requirements.txt not found in backend/", "ERROR")
        return False

    key_packages = ["fastapi", "uvicorn", "sqlalchemy"]
    missing = [pkg for pkg in key_packages if not check_python_package(pkg)]

    if missing:
        Logger.log(
            "SETUP", "Installing backend dependencies (may take a few minutes)...", "INFO")

        if run_command(f"{sys.executable} -m pip install -r requirements.txt", cwd="backend"):
            Logger.log(
                "SETUP", "Backend dependencies installed successfully", "SUCCESS")
            return True
        else:
            Logger.log(
                "SETUP", "Failed to install backend dependencies", "ERROR")
            return False
    else:
        Logger.log("SETUP", "All backend dependencies satisfied", "SUCCESS")
        return True


def install_frontend_dependencies() -> bool:
    """Install Node.js frontend dependencies"""
    Logger.log("SETUP", "Checking frontend dependencies...", "INFO")

    node_modules = Path("node_modules")

    if not node_modules.exists():
        Logger.log(
            "SETUP", "Installing frontend dependencies (may take a few minutes)...", "INFO")

        if check_command_exists("bun"):
            if run_command("bun install"):
                Logger.log(
                    "SETUP", "Frontend dependencies installed successfully", "SUCCESS")
                return True
        else:
            if run_command("npm install"):
                Logger.log(
                    "SETUP", "Frontend dependencies installed successfully", "SUCCESS")
                return True

        Logger.log("SETUP", "Failed to install frontend dependencies", "ERROR")
        return False
    else:
        Logger.log("SETUP", "All frontend dependencies satisfied", "SUCCESS")
        return True


def check_ffmpeg() -> bool:
    """Check and provide guidance for ffmpeg installation"""
    Logger.log("SETUP", "Checking ffmpeg (required for voice features)...", "INFO")

    if check_command_exists("ffmpeg"):
        Logger.log("SETUP", "ffmpeg is available", "SUCCESS")
        return True

    Logger.log("SETUP", "ffmpeg not found", "WARN")

    system = platform.system()

    if system == "Windows":
        Logger.log("SETUP", "Install ffmpeg using:", "INFO")
        Logger.log("SETUP", "  -> winget install ffmpeg", "INFO")
        Logger.log("SETUP", "  -> choco install ffmpeg", "INFO")
    elif system == "Linux":
        Logger.log("SETUP", "Install ffmpeg using:", "INFO")
        Logger.log("SETUP", "  -> sudo apt-get install ffmpeg", "INFO")
    elif system == "Darwin":
        Logger.log("SETUP", "Install ffmpeg using:", "INFO")
        Logger.log("SETUP", "  -> brew install ffmpeg", "INFO")

    Logger.log(
        "SETUP", "Voice features will be unavailable without ffmpeg", "WARN")
    return False


def check_optional_enhancements():
    """Check for optional performance enhancements"""
    Logger.log("SETUP", "Checking optional enhancements...", "INFO")

    if check_command_exists("nvidia-smi"):
        Logger.log(
            "SETUP", "CUDA detected - GPU acceleration available", "SUCCESS")
    else:
        Logger.log(
            "SETUP", "CUDA not found - using CPU mode (still fast!)", "DEBUG")


def stream_process_output(process, service_name: str):
    """Stream and format process output in real-time"""
    for line in iter(process.stdout.readline, b''):
        if not line:
            break

        text = line.decode('utf-8', errors='ignore').strip()
        if not text:
            continue

        level = "INFO"
        if any(keyword in text.upper() for keyword in ["ERROR", "FAIL", "EXCEPTION"]):
            level = "ERROR"
        elif any(keyword in text.upper() for keyword in ["WARN", "WARNING"]):
            level = "WARN"
        elif any(keyword in text.upper() for keyword in ["SUCCESS", "READY", "STARTED"]):
            level = "SUCCESS"

        Logger.log(service_name, text, level)


def start_backend_server():
    """Start the FastAPI backend server"""
    Logger.log("BACKEND", "Starting FastAPI server on port 8000...", "INFO")

    try:
        backend_dir = Path("backend")
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--reload", "--host", "0.0.0.0", "--port", "8000",
             "--log-level", "warning"],  # Reduce access log spam
            cwd=backend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1
        )

        thread = threading.Thread(
            target=stream_process_output,
            args=(process, "BACKEND"),
            daemon=True
        )
        thread.start()

        Logger.log("BACKEND", "Server process started successfully", "SUCCESS")
        return process

    except Exception as e:
        Logger.log("BACKEND", f"Failed to start server: {e}", "ERROR")
        return None


def start_frontend_server():
    """Start the Vite frontend dev server"""
    Logger.log("FRONTEND", "Starting Vite dev server on port 8080...", "INFO")

    try:
        if check_command_exists("bun"):
            cmd = "bun run dev"
            Logger.log("FRONTEND", "Using Bun dev server", "SUCCESS")
        else:
            cmd = "npm run dev"
            Logger.log("FRONTEND", "Using npm dev server", "INFO")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            shell=True
        )

        thread = threading.Thread(
            target=stream_process_output,
            args=(process, "FRONTEND"),
            daemon=True
        )
        thread.start()

        Logger.log("FRONTEND", "Server process started successfully", "SUCCESS")
        return process

    except Exception as e:
        Logger.log("FRONTEND", f"Failed to start server: {e}", "ERROR")
        return None


def main():
    """Main application entry point"""
    try:
        Logger.banner()

        Logger.section("PHASE 1: System Validation")

        if not check_python_version():
            sys.exit(1)

        Logger.section("PHASE 2: Dependency Management")

        if not install_backend_dependencies():
            Logger.log(
                "SETUP", "Backend setup failed - cannot continue", "ERROR")
            sys.exit(1)

        if not install_frontend_dependencies():
            Logger.log(
                "SETUP", "Frontend setup failed - cannot continue", "ERROR")
            sys.exit(1)

        Logger.section("PHASE 3: Optional Features Check")

        check_ffmpeg()
        check_optional_enhancements()

        Logger.section("PHASE 4: Port Configuration")

        if not check_and_clear_ports():
            Logger.log(
                "SETUP", "Port configuration failed - cannot continue", "ERROR")
            sys.exit(1)

        Logger.section("PHASE 5: Starting Services")

        backend_process = start_backend_server()
        if not backend_process:
            Logger.log("SETUP", "Backend startup failed", "ERROR")
            sys.exit(1)

        time.sleep(2)

        frontend_process = start_frontend_server()
        if not frontend_process:
            Logger.log("SETUP", "Frontend startup failed", "ERROR")
            backend_process.terminate()
            sys.exit(1)

        time.sleep(3)

        Logger.success_message()

        try:
            while True:
                if backend_process.poll() is not None:
                    Logger.log(
                        "BACKEND", "Process exited unexpectedly", "ERROR")
                    break

                if frontend_process.poll() is not None:
                    Logger.log(
                        "FRONTEND", "Process exited unexpectedly", "ERROR")
                    break

                time.sleep(1)

        except KeyboardInterrupt:
            print(f"\n\n{Colors.YELLOW}{Colors.BOLD}{'=' * 79}{Colors.ENDC}")
            print(
                f"{Colors.YELLOW}{Colors.BOLD}  Initiating Shutdown...{Colors.ENDC}")
            print(f"{Colors.YELLOW}{Colors.BOLD}{'=' * 79}{Colors.ENDC}\n")

            Logger.log("SYSTEM", "Stopping backend server...", "INFO")
            backend_process.terminate()

            Logger.log("SYSTEM", "Stopping frontend server...", "INFO")
            frontend_process.terminate()

            backend_process.wait(timeout=5)
            frontend_process.wait(timeout=5)

            Logger.log("SYSTEM", "All services stopped cleanly", "SUCCESS")

            print(f"\n{Colors.GREEN}{Colors.BOLD}{'=' * 79}{Colors.ENDC}")
            print(
                f"{Colors.GREEN}{Colors.BOLD}Goodbye👋{Colors.ENDC}")
            print(f"{Colors.GREEN}{Colors.BOLD}{'=' * 79}{Colors.ENDC}\n")

    except Exception as e:
        Logger.log("SYSTEM", f"Unexpected error: {e}", "ERROR")
        import traceback
        Logger.log("SYSTEM", f"Traceback: {traceback.format_exc()}", "DEBUG")
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
cogent-x Smart Unified Startup Script
=============================================
Automatically handles:
- First-time setup (installs dependencies)
- Backend & frontend startup
- Beautiful synchronized logs
- Automatic dependency checks

Just run: python run.py
"""

import subprocess
import sys
import os
import time
import threading
import platform
from datetime import datetime
from pathlib import Path

# Detect Windows
IS_WINDOWS = platform.system() == "Windows"

# ANSI color codes


class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

    @staticmethod
    def disable():
        """Disable colors on Windows if not supported"""
        if IS_WINDOWS:
            try:
                # Try to enable ANSI colors on Windows 10+
                import ctypes
                kernel32 = ctypes.windll.kernel32
                kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            except:
                # Fallback: disable colors
                Colors.HEADER = ''
                Colors.BLUE = ''
                Colors.CYAN = ''
                Colors.GREEN = ''
                Colors.YELLOW = ''
                Colors.RED = ''
                Colors.ENDC = ''
                Colors.BOLD = ''
                Colors.UNDERLINE = ''


# Try to enable colors on Windows
Colors.disable()


def print_banner():
    """Print beautiful startup banner"""
    banner = f"""
{Colors.CYAN}{Colors.BOLD}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                    🚀 cogent-x RAG                        ║
║              Private RAG System - Smart Start             ║
║               Developed by Somrit Dasgupta                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
{Colors.ENDC}
{Colors.GREEN}Smart startup - Auto-installing dependencies...{Colors.ENDC}
"""
    print(banner)


def log_message(service, message, level="INFO"):
    """Print a formatted log message"""
    timestamp = datetime.now().strftime("%H:%M:%S")

    # Color based on service
    if service == "BACKEND":
        service_color = Colors.BLUE
    elif service == "FRONTEND":
        service_color = Colors.CYAN
    elif service == "SETUP":
        service_color = Colors.YELLOW
    else:
        service_color = Colors.YELLOW

    # Color based on level
    if level == "ERROR":
        level_color = Colors.RED
    elif level == "SUCCESS":
        level_color = Colors.GREEN
    elif level == "WARN":
        level_color = Colors.YELLOW
    else:
        level_color = Colors.ENDC

    print(
        f"{Colors.BOLD}[{timestamp}]{Colors.ENDC} {service_color}[{service}]{Colors.ENDC} {level_color}{message}{Colors.ENDC}")


def run_command(cmd, cwd=None, shell=True, show_output=True):
    """Run a command and optionally show output"""
    try:
        if show_output:
            result = subprocess.run(cmd, cwd=cwd, shell=shell, check=False)
            return result.returncode == 0
        else:
            result = subprocess.run(cmd, cwd=cwd, shell=shell,
                                    capture_output=True, text=True, check=False)
            return result.returncode == 0
    except Exception as e:
        log_message("SETUP", f"Command failed: {e}", "ERROR")
        return False


def check_command(cmd):
    """Check if a command is available"""
    try:
        check_cmd = "where" if IS_WINDOWS else "which"
        cmd_name = cmd.split()[0]
        result = subprocess.run(
            f"{check_cmd} {cmd_name}",
            capture_output=True,
            shell=True,
            timeout=5,
            text=True
        )
        return result.returncode == 0
    except:
        return False


def check_python_package(package):
    """Check if a Python package is installed"""
    try:
        __import__(package)
        return True
    except ImportError:
        return False


def kill_process_on_port(port):
    """Kill any process using the specified port"""
    try:
        if IS_WINDOWS:
            # Find process using the port
            result = subprocess.run(
                f'netstat -ano | findstr :{port}',
                capture_output=True,
                text=True,
                shell=True
            )

            if result.returncode == 0 and result.stdout.strip():
                # Extract PIDs from netstat output
                lines = result.stdout.strip().split('\n')
                pids = set()
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 5:
                        pid = parts[-1]
                        if pid.isdigit():
                            pids.add(pid)

                # Kill each process
                for pid in pids:
                    try:
                        subprocess.run(
                            f'taskkill //F //PID {pid}',
                            capture_output=True,
                            shell=True,
                            timeout=5
                        )
                        log_message(
                            "SETUP", f"✓ Cleared port {port} (PID: {pid})", "SUCCESS")
                    except:
                        pass
                return True
        else:
            # Unix-like systems (Linux, macOS)
            result = subprocess.run(
                f"lsof -ti:{port}",
                capture_output=True,
                text=True,
                shell=True
            )

            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    try:
                        subprocess.run(
                            f"kill -9 {pid}",
                            capture_output=True,
                            shell=True,
                            timeout=5
                        )
                        log_message(
                            "SETUP", f"✓ Cleared port {port} (PID: {pid})", "SUCCESS")
                    except:
                        pass
                return True
        return False
    except Exception as e:
        log_message("SETUP", f"Error checking port {port}: {e}", "WARN")
        return False


def check_and_clear_ports():
    """Check and clear ports 8000 and 8080 if they're in use"""
    log_message("SETUP", "Checking ports 8000 and 8080...", "INFO")

    ports_cleared = False

    # Check and clear port 8000 (backend)
    if kill_process_on_port(8000):
        ports_cleared = True
        time.sleep(0.5)  # Give OS time to release the port

    # Check and clear port 8080 (frontend)
    if kill_process_on_port(8080):
        ports_cleared = True
        time.sleep(0.5)  # Give OS time to release the port

    if not ports_cleared:
        log_message("SETUP", "✓ Ports are available", "SUCCESS")

    return True


def install_backend_dependencies():
    """Install backend Python dependencies"""
    log_message("SETUP", "Checking backend dependencies...", "INFO")

    requirements_file = Path("backend/requirements.txt")
    if not requirements_file.exists():
        log_message("SETUP", "requirements.txt not found!", "ERROR")
        return False

    # Check if key packages are installed
    key_packages = ["fastapi", "uvicorn", "whisperx"]
    missing = [pkg for pkg in key_packages if not check_python_package(pkg)]

    if missing:
        log_message("SETUP", f"Missing packages: {', '.join(missing)}", "WARN")
        log_message(
            "SETUP", "Installing backend dependencies (this may take a few minutes)...", "INFO")

        if run_command(f"{sys.executable} -m pip install -r requirements.txt", cwd="backend"):
            log_message("SETUP", "✓ Backend dependencies installed", "SUCCESS")
            return True
        else:
            log_message(
                "SETUP", "Failed to install backend dependencies", "ERROR")
            return False
    else:
        log_message("SETUP", "✓ Backend dependencies satisfied", "SUCCESS")
        return True


def install_frontend_dependencies():
    """Install frontend dependencies"""
    log_message("SETUP", "Checking frontend dependencies...", "INFO")

    node_modules = Path("node_modules")

    if not node_modules.exists():
        log_message(
            "SETUP", "Installing frontend dependencies (this may take a few minutes)...", "INFO")

        # Check if bun is available (faster)
        if check_command("bun"):
            log_message("SETUP", "Using Bun (fast mode)", "SUCCESS")
            if run_command("bun install"):
                log_message(
                    "SETUP", "✓ Frontend dependencies installed", "SUCCESS")
                return True
        else:
            log_message("SETUP", "Using npm", "INFO")
            if run_command("npm install"):
                log_message(
                    "SETUP", "✓ Frontend dependencies installed", "SUCCESS")
                return True

        log_message("SETUP", "Failed to install frontend dependencies", "ERROR")
        return False
    else:
        log_message("SETUP", "✓ Frontend dependencies satisfied", "SUCCESS")
        return True


def check_optional_tools():
    """Check for optional tools and provide installation hints"""
    log_message("SETUP", "Checking optional enhancements...", "INFO")

    hints = []

    # Check for CUDA (GPU acceleration)
    if not check_command("nvidia-smi"):
        hints.append("🎮 CUDA: Optional GPU acceleration for WhisperX")
        hints.append(
            "   WhisperX will use CPU mode (still fast with tiny model!)")

    if hints:
        log_message("SETUP", "Optional enhancements available:", "WARN")
        for hint in hints:
            print(f"  {hint}")
    else:
        log_message("SETUP", "✓ All optional tools present", "SUCCESS")


def check_and_install_ffmpeg():
    """Check if ffmpeg is installed, install if missing"""
    log_message(
        "SETUP", "Checking ffmpeg (required for voice features)...", "INFO")

    # Check if ffmpeg is available
    if check_command("ffmpeg"):
        log_message("SETUP", "✓ ffmpeg is available", "SUCCESS")
        return True

    log_message("SETUP", "ffmpeg not found - attempting to install...", "WARN")

    system = platform.system()

    if system == "Windows":
        # Try winget first (Windows 10/11)
        if check_command("winget"):
            log_message("SETUP", "Installing ffmpeg via winget...", "INFO")
            if run_command("winget install --id=Gyan.FFmpeg -e --silent", shell=True):
                log_message(
                    "SETUP", "✓ ffmpeg installed successfully", "SUCCESS")
                log_message(
                    "SETUP", "⚠️  Please restart your terminal for PATH changes to take effect", "WARN")
                log_message(
                    "SETUP", "   (The server will auto-detect ffmpeg on next run)", "INFO")
                return True

        # Try chocolatey as fallback
        if check_command("choco"):
            log_message("SETUP", "Installing ffmpeg via chocolatey...", "INFO")
            if run_command("choco install ffmpeg -y", shell=True):
                log_message(
                    "SETUP", "✓ ffmpeg installed successfully", "SUCCESS")
                return True

        log_message(
            "SETUP", "❌ Could not install ffmpeg automatically", "ERROR")
        log_message("SETUP", "Please install manually:", "WARN")
        log_message("SETUP", "  Option 1: winget install ffmpeg", "INFO")
        log_message("SETUP", "  Option 2: choco install ffmpeg", "INFO")
        log_message(
            "SETUP", "  Option 3: Download from https://ffmpeg.org/download.html", "INFO")
        return False

    elif system == "Linux":
        # Try apt (Debian/Ubuntu)
        if check_command("apt-get"):
            log_message("SETUP", "Installing ffmpeg via apt...", "INFO")
            if run_command("sudo apt-get update && sudo apt-get install -y ffmpeg", shell=True):
                log_message(
                    "SETUP", "✓ ffmpeg installed successfully", "SUCCESS")
                return True

        # Try yum (RedHat/CentOS)
        if check_command("yum"):
            log_message("SETUP", "Installing ffmpeg via yum...", "INFO")
            if run_command("sudo yum install -y ffmpeg", shell=True):
                log_message(
                    "SETUP", "✓ ffmpeg installed successfully", "SUCCESS")
                return True

        log_message(
            "SETUP", "❌ Could not install ffmpeg automatically", "ERROR")
        log_message(
            "SETUP", "Please install manually: sudo apt-get install ffmpeg", "INFO")
        return False

    elif system == "Darwin":  # macOS
        if check_command("brew"):
            log_message("SETUP", "Installing ffmpeg via Homebrew...", "INFO")
            if run_command("brew install ffmpeg", shell=True):
                log_message(
                    "SETUP", "✓ ffmpeg installed successfully", "SUCCESS")
                return True

        log_message(
            "SETUP", "❌ Could not install ffmpeg automatically", "ERROR")
        log_message(
            "SETUP", "Please install Homebrew first: https://brew.sh", "INFO")
        log_message("SETUP", "Then run: brew install ffmpeg", "INFO")
        return False

    return False


def stream_output(process, service_name, prefix_filter=None):
    """Stream output from a process with pretty formatting"""
    for line in iter(process.stdout.readline, b''):
        if line:
            text = line.decode('utf-8', errors='ignore').strip()
            if text:
                # Skip empty lines or irrelevant logs
                if prefix_filter and not any(text.startswith(p) for p in prefix_filter):
                    continue

                # Determine log level
                level = "INFO"
                if "ERROR" in text.upper() or "FAIL" in text.upper():
                    level = "ERROR"
                elif "WARN" in text.upper():
                    level = "WARN"
                elif "✓" in text or "SUCCESS" in text.upper() or "READY" in text.upper():
                    level = "SUCCESS"

                log_message(service_name, text, level)


def start_backend():
    """Start the backend server"""
    log_message("BACKEND", "Starting FastAPI server on port 8000...", "INFO")

    try:
        backend_dir = Path("backend")
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--reload", "--host", "0.0.0.0", "--port", "8000"],
            cwd=backend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1
        )

        # Stream output in a separate thread
        thread = threading.Thread(target=stream_output, args=(
            process, "BACKEND", ["INFO:", "ERROR:", "WARNING:"]))
        thread.daemon = True
        thread.start()

        return process
    except Exception as e:
        log_message("BACKEND", f"Failed to start: {e}", "ERROR")
        return None


def start_frontend():
    """Start the frontend dev server"""
    log_message("FRONTEND", "Starting Vite dev server on port 8080...", "INFO")

    try:
        # Check if bun is available
        use_bun = check_command("bun")

        if use_bun:
            cmd = "bun run dev"
            log_message("FRONTEND", "Using Bun (fast mode)", "SUCCESS")
        else:
            cmd = "npm run dev"
            log_message("FRONTEND", "Using npm", "INFO")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            shell=True
        )

        # Stream output in a separate thread
        thread = threading.Thread(target=stream_output, args=(
            process, "FRONTEND", ["VITE", "➜", "ready"]))
        thread.daemon = True
        thread.start()

        return process
    except Exception as e:
        log_message("FRONTEND", f"Failed to start: {e}", "ERROR")
        return None


def print_urls():
    """Print access URLs"""
    print(
        f"\n{Colors.GREEN}{Colors.BOLD}🎉 All services started successfully!{Colors.ENDC}\n")
    print(f"{Colors.CYAN}Access your application:{Colors.ENDC}")
    print(f"  {Colors.BOLD}Frontend:{Colors.ENDC}  http://localhost:8080")
    print(f"  {Colors.BOLD}Backend:{Colors.ENDC}   http://localhost:8000")
    print(f"  {Colors.BOLD}API Docs:{Colors.ENDC}  http://localhost:8000/api/docs")
    print(f"\n{Colors.YELLOW}💡 Features:{Colors.ENDC}")
    print(f"  • Voice transcription (WhisperX - local, free)")
    print(f"  • Text-to-speech (Human-like voices)")
    print(f"  • Document ingestion & RAG queries")
    print(f"  • Source chunk highlighting")
    print(f"\n{Colors.YELLOW}Press Ctrl+C to stop all services{Colors.ENDC}\n")


def main():
    """Main startup function"""
    try:
        # Print banner
        print_banner()

        # Check Python version
        if sys.version_info < (3, 8):
            log_message("SETUP", "Python 3.8+ required", "ERROR")
            sys.exit(1)

        log_message(
            "SETUP", f"✓ Python {sys.version_info.major}.{sys.version_info.minor}", "SUCCESS")

        # Check and install dependencies
        print()
        if not install_backend_dependencies():
            sys.exit(1)

        if not install_frontend_dependencies():
            sys.exit(1)

        # Check and install ffmpeg (required for voice features)
        print()
        check_and_install_ffmpeg()

        # Check optional tools
        print()
        check_optional_tools()

        # Check and clear ports before starting services
        print()
        if not check_and_clear_ports():
            log_message("SETUP", "Failed to clear ports", "ERROR")
            sys.exit(1)

        print()  # Empty line for spacing

        # Start backend
        backend_process = start_backend()
        if not backend_process:
            log_message("SETUP", "Failed to start backend", "ERROR")
            sys.exit(1)

        # Wait a bit for backend to start
        time.sleep(2)

        # Start frontend
        frontend_process = start_frontend()
        if not frontend_process:
            log_message("SETUP", "Failed to start frontend", "ERROR")
            backend_process.terminate()
            sys.exit(1)

        # Wait for frontend to be ready
        time.sleep(3)

        # Print URLs
        print_urls()

        # Keep running until interrupted
        try:
            while True:
                # Check if processes are still running
                if backend_process.poll() is not None:
                    log_message(
                        "BACKEND", "Process exited unexpectedly", "ERROR")
                    break
                if frontend_process.poll() is not None:
                    log_message(
                        "FRONTEND", "Process exited unexpectedly", "ERROR")
                    break
                time.sleep(1)
        except KeyboardInterrupt:
            print(f"\n\n{Colors.YELLOW}Shutting down gracefully...{Colors.ENDC}")
            log_message("SETUP", "Stopping backend...", "INFO")
            backend_process.terminate()
            log_message("SETUP", "Stopping frontend...", "INFO")
            frontend_process.terminate()

            # Wait for processes to terminate
            backend_process.wait(timeout=5)
            frontend_process.wait(timeout=5)

            log_message("SETUP", "✓ All services stopped", "SUCCESS")
            print(f"\n{Colors.GREEN}Goodbye! 👋{Colors.ENDC}\n")

    except Exception as e:
        log_message("SETUP", f"Unexpected error: {e}", "ERROR")
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""AISCAN Combined startup script."""

import os
import sys
import subprocess
import time
from pathlib import Path

def setup_backend(project_root):
    backend_dir = project_root / "backend"
    
    if not backend_dir.exists():
        print(f"Backend directory not found: {backend_dir}")
        sys.exit(1)
    
    # Disable OpenAI Agents tracing to reduce network overhead
    os.environ["OPENAI_AGENTS_DISABLE_TRACING"] = "1"
    
    # Ensure ChEMBL MCP server is built
    chembl_server_dir = backend_dir / "mcp-servers" / "chembl-mcp-server"
    chembl_build_idx = chembl_server_dir / "build" / "index.js"
    
    if chembl_server_dir.exists():
        if not (chembl_server_dir / "node_modules").exists():
            print(f"\nInstalling dependencies for ChEMBL MCP server in {chembl_server_dir}...")
            subprocess.run(["npm", "install"], cwd=chembl_server_dir, check=True)
            print("ChEMBL MCP server dependencies installed.\n")

        if not chembl_build_idx.exists():
            print(f"\nBuilding ChEMBL MCP server in {chembl_server_dir}...")
            subprocess.run(["npm", "run", "build"], cwd=chembl_server_dir, check=True)
            print("ChEMBL MCP server built successfully.\n")

    return backend_dir

def setup_frontend(project_root):
    frontend_dir = project_root / "frontend"
    
    if not frontend_dir.exists():
        print(f"Frontend directory not found: {frontend_dir}")
        sys.exit(1)
    
    # Check if package.json exists
    package_json = frontend_dir / "package.json"
    if not package_json.exists():
        print(f"   package.json not found: {package_json}")
        sys.exit(1)
    
    node_modules = frontend_dir / "node_modules"
    if not node_modules.exists():
        print(f"   node_modules not found, running npm install in {frontend_dir}...")
        try:
            subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
            print(f"   npm install completed successfully")
        except subprocess.CalledProcessError as e:
            print(f"Failed to run npm install: {e}")
            sys.exit(1)
            
    return frontend_dir

def main():
    project_root = Path(__file__).parent.absolute()
    
    print(f"{'='*50}")
    print(f" Starting AISCAN System")
    print(f" Project Root: {project_root}")
    print(f"{'='*50}\n")

    # Setup phases
    backend_dir = setup_backend(project_root)
    frontend_dir = setup_frontend(project_root)

    processes = []
    
    try:
        # Start Backend
        print("Starting Backend Server...")
        backend_env = os.environ.copy()
        
        backend_cmd = [
            sys.executable, "-m", "uvicorn", 
            "backend.src.app:app", 
            "--reload", 
            "--host", "0.0.0.0", 
            "--port", "8000"
        ]
        
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=project_root,
            env=backend_env
        )
        processes.append(backend_proc)
        print(f"Backend started (PID: {backend_proc.pid}) at http://localhost:8000")

        # Start Frontend
        print("Starting Frontend Server...")
        frontend_cmd = ["npm", "run", "dev"]
        
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=frontend_dir
        )
        processes.append(frontend_proc)
        print(f"Frontend started (PID: {frontend_proc.pid})")

        print(f"\n{'='*50}")
        print(f" AISCAN is running")
        print(f" Backend: http://localhost:8000")
        print(f" Frontend: http://localhost:5173")
        print(f" Press Ctrl+C to stop all servers")
        print(f"{'='*50}\n")

        # Monitor processes
        while True:
            time.sleep(1)
            for p in processes:
                if p.poll() is not None:
                    print(f"\nProcess {p.pid} exited unexpectedly with code {p.returncode}")
                    raise KeyboardInterrupt # Trigger cleanup

    except KeyboardInterrupt:
        print("\nStopping AISCAN servers...")
    finally:
        for p in processes:
            if p.poll() is None:
                print(f"Terminating process {p.pid}...")
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    print(f"Killing process {p.pid}...")
                    p.kill()
        print("All servers stopped.")

if __name__ == "__main__":
    main()

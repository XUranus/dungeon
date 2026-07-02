#!/usr/bin/env python3
"""Deploy dungeon-lord to VPS via paramiko (CentOS/RHEL)"""

import paramiko
import os
import sys
import time

VPS_HOST = "108.181.196.185"
VPS_PORT = 10065
VPS_USER = "root"
VPS_PASS = "Wxx@19981228as"
REMOTE_DIR = "/opt/dungeon-lord"
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPOSE_PORT = 6666

# Skip directories during upload
SKIP_DIRS = {'node_modules', '__pycache__', '.git', '.venv', '3rd', 'docs', '.docusaurus', 'build', 'dist'}
SKIP_FILES = {'.pyc', '.pyo', '.db-journal', '.db-wal'}

def ssh_exec(ssh, cmd, print_output=True):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    exit_code = stdout.channel.recv_exit_status()
    if print_output and out.strip():
        print(out.strip())
    if err.strip() and exit_code != 0:
        print(f"  [stderr] {err.strip()}", file=sys.stderr)
    return out, err, exit_code

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload directory"""
    try:
        sftp.stat(remote_path)
    except IOError:
        try:
            sftp.mkdir(remote_path)
        except IOError:
            pass
    for item in os.listdir(local_path):
        if item in SKIP_DIRS:
            continue
        if any(item.endswith(ext) for ext in SKIP_FILES):
            continue
        local_item = os.path.join(local_path, item)
        remote_item = f"{remote_path}/{item}"
        if os.path.isdir(local_item):
            upload_dir(sftp, local_item, remote_item)
        else:
            try:
                print(f"  {remote_item}")
                sftp.put(local_item, remote_item)
            except FileNotFoundError:
                print(f"  [skip] {local_item} (transient file)")
            except Exception as e:
                print(f"  [error] {local_item}: {e}")

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {VPS_HOST}:{VPS_PORT}...")
    ssh.connect(VPS_HOST, port=VPS_PORT, username=VPS_USER, password=VPS_PASS)
    print("Connected!\n")

    # Step 1: Check environment
    print("=== Step 1: Checking environment ===")
    ssh_exec(ssh, "uname -a")
    ssh_exec(ssh, "cat /etc/os-release 2>/dev/null | head -3")
    ssh_exec(ssh, "python3 --version 2>&1 || echo 'Python3 not found'")
    ssh_exec(ssh, "node --version 2>&1 || echo 'Node not found'")
    ssh_exec(ssh, "nginx -v 2>&1 || echo 'Nginx not found'")
    ssh_exec(ssh, "which dnf yum apt-get 2>/dev/null || echo 'No package manager found'")

    # Determine package manager
    out, _, _ = ssh_exec(ssh, "which dnf 2>/dev/null", print_output=False)
    pkg_mgr = "dnf" if "dnf" in out else "yum"

    # Step 2: Install dependencies
    print(f"\n=== Step 2: Installing dependencies (using {pkg_mgr}) ===")
    ssh_exec(ssh, f"{pkg_mgr} install -y epel-release 2>&1 | tail -3")
    ssh_exec(ssh, f"{pkg_mgr} install -y nginx python3-pip python3-devel gcc 2>&1 | tail -5")

    # Install Node.js 20 via nodesource
    out, _, _ = ssh_exec(ssh, "node --version 2>&1", print_output=False)
    if "v20" not in out and "v22" not in out:
        print("Installing Node.js 20...")
        ssh_exec(ssh, "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -5")
        ssh_exec(ssh, f"{pkg_mgr} install -y nodejs 2>&1 | tail -5")
    ssh_exec(ssh, "node --version && npm --version")

    # Step 3: Upload project
    print(f"\n=== Step 3: Uploading project to {REMOTE_DIR} ===")
    ssh_exec(ssh, f"mkdir -p {REMOTE_DIR}/data/chroma {REMOTE_DIR}/backend")

    sftp = ssh.open_sftp()
    upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)
    sftp.close()
    print("Upload complete!")

    # Step 4: Setup backend
    print("\n=== Step 4: Setting up backend ===")
    ssh_exec(ssh, f"cd {REMOTE_DIR}/backend && python3 -m venv .venv")
    out, err, code = ssh_exec(ssh, f"cd {REMOTE_DIR}/backend && . .venv/bin/activate && pip install -e . 2>&1 | tail -10")
    if code != 0:
        print("  Retrying with --no-build-isolation...")
        ssh_exec(ssh, f"cd {REMOTE_DIR}/backend && . .venv/bin/activate && pip install -e . --no-build-isolation 2>&1 | tail -10")

    # Step 5: Build frontend
    print("\n=== Step 5: Building frontend ===")
    ssh_exec(ssh, f"cd {REMOTE_DIR}/frontend && npm install --legacy-peer-deps 2>&1 | tail -5")
    out, err, code = ssh_exec(ssh, f"cd {REMOTE_DIR}/frontend && npm run build 2>&1 | tail -15")

    # Step 6: Create systemd service
    print("\n=== Step 6: Creating systemd service ===")
    service = f"""[Unit]
Description=Dungeon Lord Backend
After=network.target

[Service]
Type=exec
User=root
WorkingDirectory={REMOTE_DIR}
Environment="PATH={REMOTE_DIR}/backend/.venv/bin"
ExecStart={REMOTE_DIR}/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    ssh_exec(ssh, f"cat > /etc/systemd/system/dungeon-lord.service << 'EOF'\n{service}EOF")
    ssh_exec(ssh, "systemctl daemon-reload")
    ssh_exec(ssh, "systemctl enable dungeon-lord")
    ssh_exec(ssh, "systemctl restart dungeon-lord")
    time.sleep(3)
    ssh_exec(ssh, "systemctl status dungeon-lord --no-pager 2>&1 | head -15")

    # Step 7: Configure Nginx
    print(f"\n=== Step 7: Configuring Nginx on port {EXPOSE_PORT} ===")
    nginx = f"""server {{
    listen {EXPOSE_PORT};
    server_name _;

    root {REMOTE_DIR}/frontend/dist;
    index index.html;

    location /api/ {{
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_http_version 1.1;
        chunked_transfer_encoding on;
    }}

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {{
        expires 7d;
        add_header Cache-Control "public, immutable";
    }}
}}
"""
    ssh_exec(ssh, f"cat > /etc/nginx/conf.d/dungeon-lord.conf << 'EOF'\n{nginx}EOF")
    # Remove default if exists
    ssh_exec(ssh, "rm -f /etc/nginx/conf.d/default.conf")
    ssh_exec(ssh, "nginx -t 2>&1")
    ssh_exec(ssh, "systemctl restart nginx")
    ssh_exec(ssh, "systemctl enable nginx")

    # Step 8: Firewall
    print("\n=== Step 8: Opening firewall ===")
    ssh_exec(ssh, f"firewall-cmd --permanent --add-port={EXPOSE_PORT}/tcp 2>&1 || echo 'firewall-cmd not available'")
    ssh_exec(ssh, "firewall-cmd --reload 2>&1 || true")
    # Also try iptables directly
    ssh_exec(ssh, f"iptables -I INPUT -p tcp --dport {EXPOSE_PORT} -j ACCEPT 2>&1 || true")

    # Step 9: Verify
    print("\n=== Step 9: Verifying deployment ===")
    time.sleep(2)
    ssh_exec(ssh, "systemctl is-active dungeon-lord")
    ssh_exec(ssh, "systemctl is-active nginx")
    ssh_exec(ssh, "curl -s http://localhost:8000/api/health 2>&1")
    ssh_exec(ssh, f"curl -s -o /dev/null -w 'HTTP {{http_code}}' http://localhost:{EXPOSE_PORT}/ 2>&1")

    ssh.close()

    print(f"\n{'='*50}")
    print(f"  Deployment complete!")
    print(f"  URL: http://{VPS_HOST}:{EXPOSE_PORT}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()

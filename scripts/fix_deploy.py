#!/usr/bin/env python3
"""Fix VPS deployment: Python version, nginx, systemd"""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('108.181.196.185', port=10065, username='root', password='Wxx@19981228as')

def run(cmd, timeout=300):
    print(f'>>> {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip()[-600:])
    if err.strip() and rc != 0:
        print(f'  ERR: {err.strip()[-300:]}')
    return rc

# Step 1: Find Python 3.11
print('=== Finding Python 3.11 ===')
run('ls /usr/bin/python3* 2>/dev/null')
run('which python3.11 2>/dev/null || echo not-found')
run('find /usr -name "python3.11" -type f 2>/dev/null | head -3')

# Step 2: Kill docker on port 8000
print('\n=== Freeing port 8000 ===')
run('docker ps 2>&1 | head -10')
run('docker stop $(docker ps -q) 2>&1 || true')
time.sleep(2)
run('ss -tlnp | grep 8000 || echo "port 8000 free"')

# Step 3: Recreate venv with Python 3.11
print('\n=== Recreating venv ===')
run('rm -rf /opt/dungeon-lord/backend/.venv')
run('python3.11 -m venv /opt/dungeon-lord/backend/.venv 2>&1 || python3 -m venv /opt/dungeon-lord/backend/.venv 2>&1')
run('/opt/dungeon-lord/backend/.venv/bin/python --version')
run('/opt/dungeon-lord/backend/.venv/bin/pip install --upgrade pip 2>&1 | tail -3')

# Step 4: Install backend deps
print('\n=== Installing backend deps ===')
run('cd /opt/dungeon-lord/backend && /opt/dungeon-lord/backend/.venv/bin/pip install -e . 2>&1 | tail -15', timeout=600)

# Step 5: Fix nginx config
print('\n=== Fixing nginx config ===')
nginx_conf = (
    'server {\n'
    '    listen 6666;\n'
    '    server_name _;\n'
    '\n'
    '    root /opt/dungeon-lord/frontend/dist;\n'
    '    index index.html;\n'
    '\n'
    '    location /api/ {\n'
    '        proxy_pass http://127.0.0.1:8000;\n'
    '        proxy_set_header Host $host;\n'
    '        proxy_set_header X-Real-IP $remote_addr;\n'
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
    '        proxy_set_header X-Forwarded-Proto $scheme;\n'
    '        proxy_buffering off;\n'
    '        proxy_cache off;\n'
    '        proxy_read_timeout 300s;\n'
    '        proxy_http_version 1.1;\n'
    '        chunked_transfer_encoding on;\n'
    '    }\n'
    '\n'
    '    location / {\n'
    '        try_files $uri $uri/ /index.html;\n'
    '    }\n'
    '\n'
    '    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {\n'
    '        expires 7d;\n'
    '        add_header Cache-Control "public, immutable";\n'
    '    }\n'
    '}\n'
)
sftp = ssh.open_sftp()
with sftp.open('/etc/nginx/conf.d/dungeon-lord.conf', 'w') as f:
    f.write(nginx_conf)
sftp.close()
print('Config written')

# Verify the config content
run('head -5 /etc/nginx/conf.d/dungeon-lord.conf')
run('grep "proxy_set_header Host" /etc/nginx/conf.d/dungeon-lord.conf')
run('nginx -t 2>&1')
run('systemctl restart nginx 2>&1')
run('systemctl status nginx --no-pager 2>&1 | head -5')

# Step 6: Fix systemd service
print('\n=== Fixing systemd service ===')
service_conf = (
    '[Unit]\n'
    'Description=Dungeon Lord Backend\n'
    'After=network.target\n'
    '\n'
    '[Service]\n'
    'Type=exec\n'
    'User=root\n'
    'WorkingDirectory=/opt/dungeon-lord\n'
    'Environment=PATH=/opt/dungeon-lord/backend/.venv/bin\n'
    'ExecStart=/opt/dungeon-lord/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000\n'
    'Restart=always\n'
    'RestartSec=5\n'
    '\n'
    '[Install]\n'
    'WantedBy=multi-user.target\n'
)
sftp = ssh.open_sftp()
with sftp.open('/etc/systemd/system/dungeon-lord.service', 'w') as f:
    f.write(service_conf)
sftp.close()
print('Service file written')

run('systemctl daemon-reload')
run('systemctl restart dungeon-lord')
time.sleep(5)
run('systemctl status dungeon-lord --no-pager 2>&1 | head -15')

# Step 7: Verify
print('\n=== Final verification ===')
run('curl -s http://localhost:8000/api/health 2>&1')
run('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:6666/ 2>&1')
run('curl -s http://localhost:6666/api/health 2>&1')

ssh.close()
print('\nAll done!')

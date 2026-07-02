#!/usr/bin/env python3
"""Deploy dungeon-lord to VPS via Docker Compose (paramiko SSH/SFTP)

Usage:
    python scripts/deploy.py           # 全量部署
    python scripts/deploy.py --data    # 仅同步数据（快速）
"""

import paramiko
import os
import sys
import time
import argparse

VPS_HOST = "108.181.196.185"
VPS_PORT = 10065
VPS_USER = "root"
VPS_PASS = "Wxx@19981228as"
REMOTE_DIR = "/opt/dungeon-lord"
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPOSE_PORT = 6666

# 上传时跳过的目录/文件
SKIP_DIRS = {
    'node_modules', '__pycache__', '.git', '.venv', '3rd',
    'docs', '.docusaurus', 'build', 'dist',
}
SKIP_FILES_EXT = {'.pyc', '.pyo', '.db-journal', '.db-wal'}


def ssh_exec(ssh, cmd, print_output=True, timeout=300):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    exit_code = stdout.channel.recv_exit_status()
    if print_output and out.strip():
        print(out.strip())
    if err.strip() and exit_code != 0:
        print(f"  [stderr] {err.strip()}", file=sys.stderr)
    return out, err, exit_code


def upload_dir(sftp, local_path, remote_path, skip_dirs=None, progress_cb=None):
    """递归上传目录"""
    skip = skip_dirs or SKIP_DIRS
    try:
        sftp.stat(remote_path)
    except IOError:
        try:
            sftp.mkdir(remote_path)
        except IOError:
            pass

    for item in os.listdir(local_path):
        if item in skip:
            continue
        if any(item.endswith(ext) for ext in SKIP_FILES_EXT):
            continue
        local_item = os.path.join(local_path, item)
        remote_item = f"{remote_path}/{item}"
        if os.path.isdir(local_item):
            upload_dir(sftp, local_item, remote_item, skip_dirs=skip, progress_cb=progress_cb)
        else:
            try:
                size = os.path.getsize(local_item)
                print(f"  ↑ {remote_item} ({size // 1024}KB)")
                sftp.put(local_item, remote_item)
                if progress_cb:
                    progress_cb(size)
            except FileNotFoundError:
                pass
            except Exception as e:
                print(f"  [error] {local_item}: {e}")


def install_docker(ssh, pkg_mgr):
    """安装 Docker + Docker Compose 插件"""
    out, _, _ = ssh_exec(ssh, "docker --version 2>&1", print_output=False)
    if "Docker version" in out:
        print("  Docker 已安装")
    else:
        print("  安装 Docker...")
        if pkg_mgr == "apt-get":
            ssh_exec(ssh, "apt-get update -qq && apt-get install -y -qq ca-certificates curl gnupg 2>&1 | tail -3")
            ssh_exec(ssh, "install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>&1")
            ssh_exec(ssh, 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list')
            ssh_exec(ssh, "apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>&1 | tail -5")
        else:
            ssh_exec(ssh, f"{pkg_mgr} install -y yum-utils 2>&1 | tail -3")
            ssh_exec(ssh, "yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>&1 | tail -3")
            ssh_exec(ssh, f"{pkg_mgr} install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>&1 | tail -5")

    ssh_exec(ssh, "systemctl enable docker && systemctl start docker")
    ssh_exec(ssh, "docker --version && docker compose version")


def detect_pkg_mgr(ssh):
    """检测包管理器"""
    out, _, _ = ssh_exec(ssh, "which apt-get 2>/dev/null", print_output=False)
    if "apt-get" in out:
        return "apt-get"
    out, _, _ = ssh_exec(ssh, "which dnf 2>/dev/null", print_output=False)
    return "dnf" if "dnf" in out else "yum"


def sync_data_only(ssh, sftp):
    """仅同步本地 data/ 到远端（快速更新）"""
    remote_data = f"{REMOTE_DIR}/data"
    local_data = os.path.join(LOCAL_DIR, "data")

    if not os.path.exists(local_data):
        print("本地 data/ 目录不存在，跳过")
        return

    print(f"同步 data/ → {remote_data}/")
    # data 目录不跳过任何子目录
    uploaded = [0]
    def cb(size):
        uploaded[0] += size

    upload_dir(sftp, local_data, remote_data, skip_dirs=set(), progress_cb=cb)
    print(f"数据同步完成: {uploaded[0] // (1024*1024)}MB")


def full_deploy(ssh, sftp, pkg_mgr):
    """全量部署"""
    # Step 1: Install Docker
    print("\n=== Step 1: 安装 Docker ===")
    install_docker(ssh, pkg_mgr)

    # Step 2: Upload project + data
    print(f"\n=== Step 2: 上传项目 → {REMOTE_DIR} ===")
    ssh_exec(ssh, f"mkdir -p {REMOTE_DIR}/data/chroma {REMOTE_DIR}/data/images")

    # 备份远端 config.json（如果存在）
    out, _, _ = ssh_exec(ssh, f"cat {REMOTE_DIR}/backend/config.json 2>/dev/null", print_output=False)
    remote_config = out.strip() if out.strip() else None

    uploaded = [0]
    def cb(size):
        uploaded[0] += size
    upload_dir(sftp, LOCAL_DIR, REMOTE_DIR, progress_cb=cb)
    print(f"上传完成: {uploaded[0] // (1024*1024)}MB")

    # 恢复远端 config.json（如果之前有，且本地也有则保留本地的）
    if remote_config:
        print("  检测到远端 config.json，保留远端配置")
        ssh_exec(ssh, f"cat > {REMOTE_DIR}/backend/config.json << 'HEREDOC'\n{remote_config}\nHEREDOC")

    # Step 3: 写入 .env
    print(f"\n=== Step 3: 写入 .env (FRONTEND_PORT={EXPOSE_PORT}) ===")
    ssh_exec(ssh, f"echo 'FRONTEND_PORT={EXPOSE_PORT}' > {REMOTE_DIR}/.env")

    # Step 4: 停旧容器 + 清理缓存 + 启动
    print("\n=== Step 4: Docker Compose 启动 ===")
    ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose down 2>&1 || true")
    ssh_exec(ssh, "docker system prune -f 2>&1 | tail -3")
    out, err, code = ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose up -d --build 2>&1", timeout=600)
    if code != 0:
        print("  构建失败，查看日志:")
        ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose logs --tail=30 2>&1")
        return False

    # Step 5: 等待健康检查
    print("\n=== Step 5: 等待服务就绪 ===")
    for i in range(30):
        time.sleep(5)
        out, _, code = ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose ps --format '{{{{.Health}}}}' 2>/dev/null", print_output=False)
        healthy = "healthy" in out.lower()
        print(f"  [{i+1}/30] {'✓ 就绪' if healthy else '等待中...'}")
        if healthy:
            break
    else:
        print("  ⚠ 超时，检查容器状态:")
        ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose ps 2>&1")
        ssh_exec(ssh, f"cd {REMOTE_DIR} && docker compose logs --tail=20 2>&1")

    # Step 6: Firewall
    print("\n=== Step 6: 开放防火墙 ===")
    ssh_exec(ssh, f"firewall-cmd --permanent --add-port={EXPOSE_PORT}/tcp 2>&1 || true")
    ssh_exec(ssh, "firewall-cmd --reload 2>&1 || true")
    ssh_exec(ssh, f"iptables -I INPUT -p tcp --dport {EXPOSE_PORT} -j ACCEPT 2>&1 || true")

    return True


def main():
    parser = argparse.ArgumentParser(description="Deploy dungeon-lord to VPS")
    parser.add_argument("--data", action="store_true", help="仅同步数据（不重新构建）")
    args = parser.parse_args()

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"连接 {VPS_HOST}:{VPS_PORT}...")
    ssh.connect(VPS_HOST, port=VPS_PORT, username=VPS_USER, password=VPS_PASS)
    print("已连接\n")

    # 环境检测
    print("=== 环境检测 ===")
    ssh_exec(ssh, "uname -a")
    pkg_mgr = detect_pkg_mgr(ssh)
    print(f"  包管理器: {pkg_mgr}")

    sftp = ssh.open_sftp()

    if args.data:
        sync_data_only(ssh, sftp)
    else:
        success = full_deploy(ssh, sftp, pkg_mgr)

    sftp.close()
    ssh.close()

    if args.data:
        # 重启后端以加载新数据
        print("\n重启后端容器...")
        ssh2 = paramiko.SSHClient()
        ssh2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh2.connect(VPS_HOST, port=VPS_PORT, username=VPS_USER, password=VPS_PASS)
        ssh_exec(ssh2, f"cd {REMOTE_DIR} && docker compose restart backend 2>&1")
        time.sleep(5)
        ssh_exec(ssh2, f"curl -s http://localhost:{EXPOSE_PORT}/api/mcp/health 2>&1")
        ssh2.close()

    print(f"\n{'='*50}")
    print(f"  部署完成!")
    print(f"  URL: http://{VPS_HOST}:{EXPOSE_PORT}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()

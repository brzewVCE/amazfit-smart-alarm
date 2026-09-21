#!/usr/bin/env python3
"""
Gadgetbridge QR Installer for Amazfit Smart Alarm
Extracts individual .zpk and direct .zip packages from .zab and serves them over LAN.
"""

import argparse
import glob
import http.server
import os
import shutil
import socket
import subprocess
import sys
import urllib.parse
import zipfile
from datetime import datetime

PORT_DEFAULT = 8080

def get_lan_ip(override_ip=None):
    """
    Detects the primary physical LAN/Wi-Fi IP address.
    Ignores VPN (tun, tap, wg, tailscale) and container (docker, br-, veth) interfaces.
    """
    if override_ip:
        return override_ip

    # 1. Inspect Linux network interfaces via `ip -br -4 addr`
    try:
        out = subprocess.check_output(["ip", "-br", "-4", "addr"], stderr=subprocess.DEVNULL).decode("utf-8")
        candidates = []
        ignored_prefixes = ("lo", "docker", "tun", "tap", "veth", "br-", "tailscale", "wg", "virbr", "ppp")

        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 3:
                iface, state, ip_cidr = parts[0], parts[1], parts[2]
                if state.upper() == "UP" and not any(iface.startswith(p) for p in ignored_prefixes):
                    ip = ip_cidr.split("/")[0]
                    candidates.append((iface, ip))

        if candidates:
            # Prioritize Wi-Fi interfaces (wl*), then Ethernet (en*, eth*), then others
            candidates.sort(key=lambda c: (
                0 if c[0].startswith("wl") else (1 if c[0].startswith(("en", "eth")) else 2)
            ))
            return candidates[0][1]
    except Exception:
        pass

    # 2. Fallback probe towards common home router IP
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    for probe_ip in ("192.168.0.1", "192.168.1.1", "10.0.0.1"):
        try:
            s.connect((probe_ip, 1))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
        except Exception:
            continue
        finally:
            s.close()
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.close()

    return "127.0.0.1"

def print_qr(url):
    """Prints a QR code in the terminal using qrencode."""
    try:
        result = subprocess.run(
            ['qrencode', '-t', 'UTF8', '-m', '2', url],
            capture_output=True,
            text=True,
            check=True
        )
        print(result.stdout)
    except Exception:
        print(f"\n[!] Unable to display QR code automatically.")
        print(f"    Open this URL on your phone: {url}\n")

def unpack_packages(dist_dir):
    """
    Extracts individual .zpk and direct .zip packages from the newest .zab bundle.
    Gadgetbridge cannot install .zab multi-bundles; it requires individual .zpk or direct app zips.
    """
    zab_files = glob.glob(os.path.join(dist_dir, "*.zab"))
    if not zab_files:
        return {}

    zab_files.sort(key=os.path.getmtime, reverse=True)
    latest_zab = zab_files[0]
    packages = {}

    with zipfile.ZipFile(latest_zab, "r") as z:
        manifest = {}
        if "manifest.json" in z.namelist():
            try:
                import json
                manifest = json.loads(z.read("manifest.json").decode("utf-8"))
            except Exception:
                manifest = {}

        # Map zpk file name -> screenType
        zpk_types = {}
        for item in manifest.get("zpks", []):
            fname = item.get("name")
            plats = item.get("platforms", [{}])
            stype = plats[0].get("screenType", "").lower()
            res = plats[0].get("screenResolution", "")
            if fname and stype:
                zpk_types[fname] = (stype, res)

        # Prioritize 390x450 for Amazfit Active 2 Square
        def sort_key(name):
            stype, res = zpk_types.get(name, ("", ""))
            if res == "390x450":
                return 0
            if res == "466x466":
                return 1
            return 2

        sorted_names = sorted([n for n in z.namelist() if n.endswith(".zpk")], key=sort_key)
        for name in sorted_names:
            content = z.read(name)
            stype, res = zpk_types.get(name, ("", ""))
            is_square_390 = stype == "square" and res == "390x450"
            is_square_432 = stype == "square" and res == "432x514"
            is_round = stype == "round" or res == "466x466"

            if is_square_390 and "square" not in packages:
                zpk_name = "Smart_Alarm-Active2_Square.zpk"
                direct_name = "Smart_Alarm-Active2_Square-direct.zip"
                target_key = "square"
            elif is_round and "round" not in packages:
                zpk_name = "Smart_Alarm-Active2_Round.zpk"
                direct_name = "Smart_Alarm-Active2_Round-direct.zip"
                target_key = "round"
            elif is_square_432 and "bip" not in packages:
                zpk_name = "Smart_Alarm-BipMax_Square.zpk"
                direct_name = "Smart_Alarm-BipMax_Square-direct.zip"
                target_key = "bip"
            elif (stype == "square" or "rome" in name) and "square" not in packages:
                zpk_name = "Smart_Alarm-Active2_Square.zpk"
                direct_name = "Smart_Alarm-Active2_Square-direct.zip"
                target_key = "square"
            else:
                continue

            zpk_path = os.path.join(dist_dir, zpk_name)
            with open(zpk_path, "wb") as f:
                f.write(content)

            # Extract the inner device.zip as direct zip (contains app.json in root)
            direct_path = os.path.join(dist_dir, direct_name)
            try:
                with zipfile.ZipFile(zpk_path, "r") as zpk_inner:
                    if "device.zip" in zpk_inner.namelist():
                        with open(direct_path, "wb") as f_dir:
                            f_dir.write(zpk_inner.read("device.zip"))
            except Exception:
                pass

            packages[target_key] = {
                "zpk_name": zpk_name,
                "zpk_path": zpk_path,
                "zpk_size_kb": f"{os.path.getsize(zpk_path) / 1024.0:.1f}",
                "direct_name": direct_name,
                "direct_path": direct_path,
                "direct_size_kb": f"{os.path.getsize(direct_path) / 1024.0:.1f}" if os.path.exists(direct_path) else "0.0",
            }

    return packages

def render_html_template(template_path, context):
    """Loads and renders the HTML template with given context variables."""
    with open(template_path, "r", encoding="utf-8") as f:
        html = f.read()
    for key, val in context.items():
        html = html.replace(f"{{{{ {key} }}}}", str(val))
    return html.encode("utf-8")

def create_handler(packages, template_path):
    # Route mapping: path -> (filepath, download_filename, content_type)
    DOWNLOAD_ROUTES = {}

    if "square" in packages:
        sq = packages["square"]
        DOWNLOAD_ROUTES["/download/square-zpk"] = (sq["zpk_path"], sq["zpk_name"], "application/octet-stream")
        DOWNLOAD_ROUTES["/download/square-zip"] = (sq["direct_path"], sq["direct_name"], "application/zip")

    if "round" in packages:
        rd = packages["round"]
        DOWNLOAD_ROUTES["/download/round-zpk"] = (rd["zpk_path"], rd["zpk_name"], "application/octet-stream")
        DOWNLOAD_ROUTES["/download/round-zip"] = (rd["direct_path"], rd["direct_name"], "application/zip")

    if "bip" in packages:
        bp = packages["bip"]
        DOWNLOAD_ROUTES["/download/bip-zpk"] = (bp["zpk_path"], bp["zpk_name"], "application/octet-stream")
        DOWNLOAD_ROUTES["/download/bip-zip"] = (bp["direct_path"], bp["direct_name"], "application/zip")

    context = {
        "square_zpk_name": packages.get("square", {}).get("zpk_name", "Smart_Alarm-Active2_Square.zpk"),
        "square_zpk_size": packages.get("square", {}).get("zpk_size_kb", "15.0"),
        "square_direct_name": packages.get("square", {}).get("direct_name", "Smart_Alarm-Active2_Square-direct.zip"),
        "square_direct_size": packages.get("square", {}).get("direct_size_kb", "15.0"),
        "round_zpk_name": packages.get("round", {}).get("zpk_name", "Smart_Alarm-Active2_Round.zpk"),
        "round_zpk_size": packages.get("round", {}).get("zpk_size_kb", "15.0"),
        "round_direct_name": packages.get("round", {}).get("direct_name", "Smart_Alarm-Active2_Round-direct.zip"),
        "round_direct_size": packages.get("round", {}).get("direct_size_kb", "15.0"),
        "bip_zpk_name": packages.get("bip", {}).get("zpk_name", "Smart_Alarm-BipMax_Square.zpk"),
        "bip_zpk_size": packages.get("bip", {}).get("zpk_size_kb", "15.0"),
        "bip_direct_name": packages.get("bip", {}).get("direct_name", "Smart_Alarm-BipMax_Square-direct.zip"),
        "bip_direct_size": packages.get("bip", {}).get("direct_size_kb", "15.0"),
    }
    html_content = render_html_template(template_path, context)

    class InstallerHTTPHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]} - {args[1]}\n")

        def send_headers(self, status, content_type, length, attachment=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            if attachment:
                self.send_header("Content-Disposition", f'attachment; filename="{attachment}"')
            self.end_headers()

        def handle_request(self, send_body=True):
            path = urllib.parse.urlparse(self.path).path

            if path in ("/", "/index.html"):
                self.send_headers(200, "text/html; charset=utf-8", len(html_content))
                if send_body:
                    self.wfile.write(html_content)
                return

            if path in DOWNLOAD_ROUTES:
                fpath, dl_name, content_type = DOWNLOAD_ROUTES[path]
                if not os.path.exists(fpath):
                    self.send_error(404, "File not found on disk")
                    return
                fsize = os.path.getsize(fpath)
                self.send_headers(200, content_type, fsize, attachment=dl_name)
                if send_body:
                    self.stream_file(fpath, dl_name, fsize)
                return

            self.send_error(404, "Not Found")

        def stream_file(self, filepath, download_name, file_bytes):
            try:
                with open(filepath, "rb") as f:
                    shutil.copyfileobj(f, self.wfile)
                print(f" [✔] Phone downloaded file: {download_name} ({file_bytes} bytes)")
            except Exception as e:
                sys.stderr.write(f"[!] Error streaming file: {e}\n")

        def do_HEAD(self):
            self.handle_request(send_body=False)

        def do_GET(self):
            self.handle_request(send_body=True)

    return InstallerHTTPHandler

def main():
    parser = argparse.ArgumentParser(description="Gadgetbridge QR Installer for Amazfit Smart Alarm")
    parser.add_argument("--ip", help="Override LAN IP address (default: auto-detected Wi-Fi/Ethernet IP)")
    parser.add_argument("--port", "-p", type=int, default=PORT_DEFAULT, help=f"Port to listen on (default: {PORT_DEFAULT})")
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dist_dir = os.path.join(repo_root, "dist")
    template_path = os.path.join(os.path.dirname(__file__), "templates", "installer.html")

    packages = unpack_packages(dist_dir)
    if not packages:
        print("\n[!] ERROR: No build artifacts found in dist/!")
        print("    Build the app first with: npm run build (or zeus build)")
        sys.exit(1)

    lan_ip = get_lan_ip(args.ip)
    port = args.port

    server = None
    for p in range(port, port + 10):
        try:
            handler_class = create_handler(packages, template_path)
            server = http.server.HTTPServer(("", p), handler_class)
            port = p
            break
        except OSError:
            continue

    if not server:
        print(f"[!] Could not bind to any port in range {PORT_DEFAULT}-{PORT_DEFAULT+9}")
        sys.exit(1)

    url = f"http://{lan_ip}:{port}"

    print("=" * 64)
    print("⌚ SMART ALARM - GADGETBRIDGE INSTALLER")
    print("=" * 64)
    for target_key, pkg in packages.items():
        print(f"📦 [{target_key.upper()}]: {pkg['zpk_name']} ({pkg['zpk_size_kb']} KB)")
    print(f"🌐 URL:     {url}")
    print("📲 Scan this QR code with your phone camera (ensure you are on the same Wi-Fi network):")
    print("-" * 64)

    print_qr(url)

    print("-" * 64)
    print(f"Waiting for incoming connections on port {port}... (Press Ctrl+C to stop)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[i] Installer server stopped.")
        server.server_close()

if __name__ == "__main__":
    main()

# AionUi WebUI Mode - Startup Guide

AionUi supports WebUI mode, allowing you to access the application through a web browser. This guide covers how to start WebUI mode on all supported platforms.

## Table of Contents

- [What is WebUI Mode?](#what-is-webui-mode)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Remote Access](#remote-access)
- [Troubleshooting](#troubleshooting)

---

## What is WebUI Mode?

WebUI mode starts AionUi with an embedded web server, allowing you to:

- Access the application through any modern web browser
- Use AionUi from remote devices on the same network (with `--remote` flag)
- Run the application headless on servers

Default access URL: `http://localhost:3000` (port may vary, check the application output)

---

## Windows

### Method 1: Command Line (Recommended)

Open **Command Prompt** or **PowerShell** and run:

```cmd
# Using full path
"C:\Program Files\AionUi\AionUi.exe" --webui

# Or if AionUi is in your PATH
AionUi.exe --webui
```

### Method 2: Create a Desktop Shortcut

1. Right-click on desktop → **New** → **Shortcut**
2. Enter target location:
   ```
   "C:\Program Files\AionUi\AionUi.exe" --webui
   ```
3. Name it **AionUi WebUI**
4. Click **Finish**
5. Double-click the shortcut to launch

### Method 3: Create a Batch File

Create `start-aionui-webui.bat`:

```batch
@echo off
"C:\Program Files\AionUi\AionUi.exe" --webui
pause
```

Double-click the batch file to start WebUI mode.

---

## macOS

### Method 1: Terminal Command (Recommended)

Open **Terminal** and run:

```bash
# Using full path
/Applications/AionUi.app/Contents/MacOS/AionUi --webui

# Or using open command
open -a AionUi --args --webui
```

### Method 2: Create Shell Script

Create `start-aionui-webui.sh`:

```bash
#!/bin/bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui
```

Make it executable and run:

```bash
chmod +x start-aionui-webui.sh
./start-aionui-webui.sh
```

### Method 3: Create Automator Application

1. Open **Automator**
2. Choose **Application**
3. Add **Run Shell Script** action
4. Enter:
   ```bash
   /Applications/AionUi.app/Contents/MacOS/AionUi --webui
   ```
5. Save as **AionUi WebUI.app**
6. Double-click to launch

### Method 4: Add to Dock

1. Create an Automator app (Method 3)
2. Drag **AionUi WebUI.app** to your Dock
3. Click the Dock icon to start WebUI mode anytime

---

## Linux

### Method 1: Command Line (Recommended)

#### For .deb Installation

```bash
# Using system path
aionui --webui

# Or using full path
/opt/AionUi/aionui --webui
```

#### For AppImage

```bash
# Make AppImage executable (first time only)
chmod +x AionUi-*.AppImage

# Run with --webui flag
./AionUi-*.AppImage --webui
```

### Method 2: Create Desktop Entry

Create `~/.local/share/applications/aionui-webui.desktop`:

```ini
[Desktop Entry]
Name=AionUi WebUI
Comment=Start AionUi in WebUI mode
Exec=/opt/AionUi/aionui --webui
Icon=aionui
Terminal=false
Type=Application
Categories=Utility;Office;
```

Make it executable:

```bash
chmod +x ~/.local/share/applications/aionui-webui.desktop
```

The launcher will appear in your application menu.

### Method 3: Create Shell Script

Create `~/bin/start-aionui-webui.sh`:

```bash
#!/bin/bash
/opt/AionUi/aionui --webui
```

Make it executable:

```bash
chmod +x ~/bin/start-aionui-webui.sh
```

Run it:

```bash
start-aionui-webui.sh
```

### Method 4: Systemd Service (Background)

Create `/etc/systemd/system/aionui-webui.service`:

```ini
[Unit]
Description=AionUi WebUI Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/opt/AionUi/aionui --webui --remote
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable aionui-webui.service
sudo systemctl start aionui-webui.service

# Check status
sudo systemctl status aionui-webui.service
```

---

## Remote Access

To allow access from other devices on your network, use the `--remote` flag:

### Windows

```cmd
AionUi.exe --webui --remote
```

### macOS

```bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote
```

### Linux

```bash
aionui --webui --remote
```

**Security Note**: Remote mode allows network access. Use only on trusted networks. Consider setting up authentication and firewall rules for production use.

### Finding Your Local IP Address

**Windows:**

```cmd
ipconfig
```

Look for "IPv4 Address" under your active network adapter.

**macOS/Linux:**

```bash
ifconfig
# or
ip addr show
```

Look for `inet` address (e.g., `192.168.1.100`).

Access from other devices: `http://YOUR_IP_ADDRESS:3000`

---

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, the application will automatically try the next available port. Check the console output for the actual port number.

### Cannot Access from Browser

1. **Check if the application started successfully**
   - Look for "Server started on port XXXX" message in the console

2. **Try a different browser**
   - Chrome, Firefox, Safari, or Edge

3. **Clear browser cache**
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (macOS)

### Firewall Blocking Access

**Windows:**

```cmd
# Allow through Windows Firewall
netsh advfirewall firewall add rule name="AionUi WebUI" dir=in action=allow protocol=TCP localport=3000
```

**Linux (UFW):**

```bash
sudo ufw allow 3000/tcp
```

**macOS:**
Go to **System Preferences** → **Security & Privacy** → **Firewall** → **Firewall Options** → Add AionUi

### Application Not Found

**Find application location:**

**Windows:**

```cmd
where AionUi.exe
```

**macOS:**

```bash
mdfind -name "AionUi.app"
```

**Linux:**

```bash
which aionui
# or
find /opt -name "aionui" 2>/dev/null
```

### View Logs

**Windows (PowerShell):**

```powershell
& "C:\Program Files\AionUi\AionUi.exe" --webui 2>&1 | Tee-Object -FilePath aionui.log
```

**macOS/Linux:**

```bash
/path/to/aionui --webui 2>&1 | tee aionui.log
```

---

## Environment Variables

You can customize WebUI behavior with environment variables:

```bash
# Set custom port (if supported)
export AIONUI_PORT=8080

# Set custom host
export AIONUI_HOST=0.0.0.0

# Then start the application
aionui --webui
```

---

## Command Line Options Summary

| Option             | Description                 |
| ------------------ | --------------------------- |
| `--webui`          | Start in WebUI mode         |
| `--remote`         | Allow remote network access |
| `--webui --remote` | Combine both flags          |

---

## Additional Resources

- [Main README](./readme.md)
- [中文说明](./readme_ch.md)
- [日本語ドキュメント](./readme_jp.md)
- [GitHub Issues](https://github.com/iOfficeAI/AionUi/issues)

---

## Support

If you encounter any issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Search [existing issues](https://github.com/iOfficeAI/AionUi/issues)
3. Create a [new issue](https://github.com/iOfficeAI/AionUi/issues/new) with:
   - Your OS and version
   - AionUi version
   - Steps to reproduce
   - Error messages or logs

---

**Happy using AionUi in WebUI mode!** 🚀

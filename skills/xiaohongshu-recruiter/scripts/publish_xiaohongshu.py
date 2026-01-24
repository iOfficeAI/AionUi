import sys
import os
import time
import subprocess
import socket
from playwright.sync_api import sync_playwright

# Ensure logs flush immediately
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

def log(msg: str) -> None:
    print(msg, flush=True)


def find_free_port():
    """Find a free port for Chrome debugging."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def is_port_in_use(port):
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def launch_standalone_chrome(profile_dir, debug_port):
    """Launch Chrome as a standalone process that won't close when script exits."""
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ]

    chrome_path = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_path = path
            break

    if not chrome_path:
        return None

    # Launch Chrome with remote debugging enabled
    # Using start_new_session=True makes Chrome independent of this script
    # --disable-features=ChromeWhatsNewUI prevents some popups
    # --no-service-autorun prevents service workers from keeping Chrome alive
    cmd = [
        chrome_path,
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=ChromeWhatsNewUI",
        "--disable-background-networking",
        "about:blank"
    ]

    try:
        # start_new_session=True on Unix creates a new process group
        # This prevents Chrome from being killed when the parent script exits
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        log(f"ℹ️ Chrome 进程已启动，PID: {process.pid}")
        # Wait for Chrome to start and listen on the debug port
        for i in range(30):
            if is_port_in_use(debug_port):
                log(f"ℹ️ Chrome 已就绪，调试端口 {debug_port} 已开放")
                return debug_port
            time.sleep(0.5)
        log("⚠️ Chrome 启动超时，调试端口未开放")
    except Exception as e:
        log(f"⚠️ 启动独立 Chrome 失败: {e}")
    return None


def publish(title, content, images):
    """
    Automates the Xiaohongshu publishing process.
    """
    log("🚀 小红书发布脚本已启动")
    log("操作指南：")
    log("1) 观察浏览器窗口：已打开小红书创作者中心。")
    log("2) 如果出现登录页，请扫码登录。")
    log("3) 登录完成后脚本会自动上传图片并填写标题/正文。")
    log('4) 请在浏览器中检查内容，确认无误后点击"发布"。')
    log("5) 浏览器将保持打开，脚本退出后也不会关闭。")
    log(f"标题: {title}")
    log(f"图片: {images}")

    # Determine profile directory - use a unique directory to avoid conflicts with user's Chrome
    env_profile = os.environ.get("XHS_PROFILE_DIR")
    default_xhs_profile = os.path.join(os.path.expanduser("~"), ".aionui", "xiaohongshu-chrome-profile")
    profile_dir = env_profile or default_xhs_profile
    os.makedirs(profile_dir, exist_ok=True)
    log(f"ℹ️ 使用浏览器 profile: {profile_dir}")

    # Find a port for Chrome debugging
    debug_port = 9222
    existing_chrome = is_port_in_use(debug_port)

    if existing_chrome:
        log(f"ℹ️ 端口 {debug_port} 已被占用，尝试连接已有 Chrome 实例...")
    else:
        log("ℹ️ 启动独立 Chrome 进程（脚本退出后浏览器将保持打开）...")
        launched_port = launch_standalone_chrome(profile_dir, debug_port)
        if not launched_port:
            # Fallback: find another port
            debug_port = find_free_port()
            log(f"ℹ️ 尝试使用备用端口 {debug_port}...")
            launched_port = launch_standalone_chrome(profile_dir, debug_port)
        if launched_port:
            debug_port = launched_port
        else:
            log("⚠️ 无法启动独立 Chrome，将使用 Playwright 托管模式（脚本退出时浏览器可能关闭）")
            debug_port = None

    with sync_playwright() as p:
        if debug_port and is_port_in_use(debug_port):
            # Connect to standalone Chrome via CDP
            log(f"ℹ️ 通过 CDP 连接到 Chrome (端口 {debug_port})...")
            browser = p.chromium.connect_over_cdp(f"http://localhost:{debug_port}")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.new_page()
        else:
            # Fallback to Playwright-managed browser
            log("ℹ️ 使用 Playwright 托管模式启动浏览器...")
            context = p.chromium.launch_persistent_context(profile_dir, headless=False)
            page = context.new_page()

        try:
            # 1. Navigate to Publish Page
            log("🌐 正在打开小红书创作者中心...")
            page.goto("https://creator.xiaohongshu.com/publish/publish", wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                log("⚠️ networkidle 等待超时，继续执行...")
            try:
                log(f"ℹ️ 当前页面标题: {page.title()}")
            except Exception:
                log("⚠️ 读取页面标题失败，继续执行...")

            # 2. Check login status - wait if on login page
            start = time.time()
            while "/login" in page.url:
                elapsed = int(time.time() - start)
                if elapsed == 0 or elapsed % 5 == 0:
                    log("⚠️ 当前为未登录态，请在打开的窗口完成登录，脚本会自动继续。")
                if elapsed > 120:
                    log("❌ 登录等待超时（2分钟），请手动操作。")
                    break
                time.sleep(2)

            # Also check for login prompts on publish page
            try:
                if page.locator("text=扫码登录").count() > 0:
                    log("⚠️ 检测到登录弹窗，请扫码登录...")
                    # Wait for login to complete (URL change or popup disappear)
                    for _ in range(60):
                        if page.locator("text=扫码登录").count() == 0:
                            log("✅ 登录成功！")
                            break
                        time.sleep(2)
            except Exception:
                pass

            page.wait_for_timeout(1000)

            # 3. Switch to Image Tab - use direct URL navigation for reliability
            log("🔄 [步骤 2] 正在切换到图文发布模式...")
            current_url = page.url
            if "target=video" in current_url or "上传视频" in page.content():
                # Navigate directly to image upload mode via URL
                page.goto("https://creator.xiaohongshu.com/publish/publish?from=tab_switch", wait_until="domcontentloaded")
                page.wait_for_timeout(2000)

            # Also try clicking the tab as backup
            try:
                # Use get_by_text with exact=False to find "上传图文" in the tab area
                tabs = page.locator("text=上传图文")
                if tabs.count() >= 2:
                    # The second occurrence is usually the clickable tab
                    tabs.nth(1).click()
                    page.wait_for_timeout(1000)
                elif tabs.count() == 1:
                    tabs.first.click()
                    page.wait_for_timeout(1000)
            except Exception as e:
                log(f"⚠️ 点击图文标签失败: {e}")

            # Verify we're on image upload page
            if page.locator("text=上传图片，或写文字生成图片").count() > 0:
                log("✅ 已切换到图文发布模式")
            else:
                log("⚠️ 可能未成功切换，继续尝试...")

            # 4. Upload Images BEFORE waiting for form (form appears after upload)
            log("📤 [步骤 3] 正在上传图片...")
            upload_success = False
            try:
                # Wait for file input to be present
                page.wait_for_selector("input[type='file']", timeout=5000)

                # Set input files directly - this works even for hidden inputs
                upload_input = page.locator("input[type='file']").first
                upload_input.set_input_files(images)
                log(f"✅ 已选择 {len(images)} 张图片")
                upload_success = True

                # Wait for upload to process - look for the image count indicator
                log("⏳ 等待图片上传完成...")
                for i in range(20):
                    # Check for "(N/18)" pattern which indicates upload progress
                    if page.locator("text=/\\(\\d+\\/18\\)/").count() > 0:
                        log("✅ 图片上传成功")
                        break
                    # Also check for title input which appears after upload
                    if page.locator("input[placeholder*='标题']").count() > 0:
                        log("✅ 检测到发布表单已加载")
                        break
                    time.sleep(0.5)
                else:
                    log("⚠️ 等待上传确认超时，继续执行...")
            except Exception as e:
                log(f"❌ 图片上传失败：{e}")
                log("👉 请手动上传图片后继续")

            # 5. NOW wait for form to appear (after image upload)
            log("⏳ [步骤 4] 正在等待发布表单加载...")

            # Wait for title input to appear (max 30 seconds)
            title_input = None
            for i in range(15):
                # Try multiple selectors
                for sel in [
                    "input[placeholder*='填写标题']",
                    "input[placeholder*='标题']",
                ]:
                    loc = page.locator(sel)
                    if loc.count() > 0 and loc.first.is_visible():
                        title_input = loc.first
                        break
                if title_input:
                    log("✅ 发布表单已加载")
                    break
                if i % 5 == 0:
                    log(f"⏳ 等待表单加载... ({i*2}s)")
                time.sleep(2)

            if not title_input:
                log("⚠️ 未找到标题输入框，尝试查找可编辑区域...")
                # Try contenteditable as fallback
                editables = page.locator("div[contenteditable='true']")
                if editables.count() > 0:
                    title_input = editables.first
                else:
                    raise RuntimeError("无法找到任何可输入区域")

            # 6. Fill Content
            log("✍️ [步骤 5] 正在填写标题与正文...")

            # Title (Limit 20 chars)
            if len(title) > 20:
                log(f"⚠️ 标题过长（{len(title)} 字），已截断到 20 字。")
                title = title[:20]

            try:
                title_input.click()
                title_input.fill(title)
                log(f"✅ 已填写标题: {title}")

                # Wait a moment for content area to be ready
                page.wait_for_timeout(500)

                # Content input - find the multiline textbox (content area)
                # Based on observation: it's a textbox that appears after the title
                content_selectors = [
                    "div[contenteditable='true'] p",  # Rich text editor paragraph
                    ".ql-editor",  # Quill editor
                    "div[contenteditable='true']",
                ]

                content_input = None
                for sel in content_selectors:
                    loc = page.locator(sel)
                    if loc.count() > 0:
                        # Get the last one (content is usually after title)
                        content_input = loc.last
                        if content_input.is_visible():
                            break

                if content_input:
                    content_input.click()
                    content_input.fill(content)
                    log("✅ 已填写正文内容")
                else:
                    log("⚠️ 未找到正文输入框")

            except Exception as e:
                log(f"❌ 填写文本失败：{e}")

            log("✨ [步骤 4] 草稿已生成，正在自动发布...")
            try:
                publish_btn = page.get_by_role("button", name="发布")
                publish_btn.wait_for(timeout=10000)
                publish_btn.click()
                log("✅ 已自动点击发布按钮，请在页面确认发布成功。")
            except Exception as e:
                log(f"⚠️ 自动点击发布失败：{e}")
                log("👉 请手动点击“发布”完成发布。")
        except Exception as e:
            print(f"❌ 脚本执行中断：{e}")
            print("👉 浏览器将保持打开，方便你手动完成发布。")
        finally:
            # In CDP mode, browser runs independently - script can exit safely
            if debug_port and is_port_in_use(debug_port):
                log("✅ 脚本已结束。浏览器作为独立进程运行，不会随脚本关闭。")
                log("ℹ️ 请在浏览器中完成操作后手动关闭浏览器窗口。")
            else:
                # Playwright-managed mode - keep script alive to prevent browser close
                log("✅ 脚本已结束，浏览器将保持打开，请手动关闭浏览器窗口。")
                log("ℹ️ 脚本将持续运行输出心跳，不会主动关闭浏览器。")
                try:
                    while True:
                        time.sleep(30)
                        log("⏳ 仍在等待中...（按 Ctrl+C 结束脚本）")
                except KeyboardInterrupt:
                    log("收到退出指令，脚本结束。")

if __name__ == "__main__":
    # Usage: python publish_xiaohongshu.py <title> <content_file_path> <img1> <img2> ...
    if len(sys.argv) < 4:
        print("用法: python publish_xiaohongshu.py <title> <content_file> <img1> [img2 ...]")
        sys.exit(1)

    title_arg = sys.argv[1]
    content_file = sys.argv[2]
    image_args = sys.argv[3:]
    
    # Read content from file
    if os.path.exists(content_file):
        with open(content_file, 'r', encoding='utf-8') as f:
            content_arg = f.read()
    else:
        # Fallback if user passed raw text (not recommended for long text)
        content_arg = content_file

    publish(title_arg, content_arg, image_args)

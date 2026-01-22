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

        # 2. Login Check
        # Do not block on login URL; proceed to form detection directly.

        # Ensure publish form is ready after login/redirect
            log("⏳ [步骤 3] 正在等待发布表单加载...")
            start = time.time()
            title_selectors = [
                "input[placeholder*='填写标题']",
                "input[placeholder*='标题']",
                "textarea[placeholder*='标题']",
                "textarea[placeholder*='填写']",
                "div[contenteditable='true']",
            ]
            def try_open_image_post_tab():
                # Try a set of common entry points for image/text posts
                candidates = [
                    "text=发布图文",
                    "text=图文发布",
                    "text=上传图文",
                    "text=图文",
                    "text=笔记",
                    "text=发布",
                ]
                for sel in candidates:
                    try:
                        loc = page.locator(sel).first
                        if loc.count() > 0 and loc.is_visible():
                            loc.click()
                            time.sleep(1)
                            return True
                    except Exception:
                        continue
                return False

            def click_text_anywhere(texts):
                # Try clicking text in main page and all frames
                for t in texts:
                    try:
                        loc = page.get_by_text(t).first
                        if loc.count() > 0 and loc.is_visible():
                            loc.click()
                            time.sleep(1)
                            return True
                    except Exception:
                        pass
                for frame in page.frames:
                    for t in texts:
                        try:
                            loc = frame.get_by_text(t).first
                            if loc.count() > 0 and loc.is_visible():
                                loc.click()
                                time.sleep(1)
                                return True
                        except Exception:
                            pass
                return False

            def fallback_fill_any_editable():
                # Last resort: type into the largest visible contenteditable area
                try:
                    editables = page.locator("div[contenteditable='true']")
                    if editables.count() > 0:
                        editable = editables.first
                        editable.click()
                        editable.fill(content)
                        return True
                except Exception:
                    pass
                return False
            def find_in_page_or_frames():
                # Try main page first, then iframes
                for sel in title_selectors:
                    if page.locator(sel).count() > 0:
                        return page, sel
                for frame in page.frames:
                    for sel in title_selectors:
                        if frame.locator(sel).count() > 0:
                            return frame, sel
                return None, None

            def login_prompt_visible() -> bool:
                try:
                    return page.locator("text=登录").count() > 0 or page.locator("text=扫码").count() > 0
                except Exception:
                    return False

            # Do not block on login prompt; continue to try opening publish form
            ctx, sel = find_in_page_or_frames()
            if ctx is None and login_prompt_visible():
                log("⚠️ 检测到登录提示，但继续尝试打开发布表单。")
            reloaded = False
            login_notice_shown = False
            while True:
                ctx, sel = find_in_page_or_frames()
                if ctx and sel:
                    break
                elapsed = int(time.time() - start)
                log(f"⏳ 仍在等待表单加载... 已等待 {elapsed}s, 当前页面: {page.url}")
                if "/login" in page.url:
                    if not login_notice_shown:
                        login_notice_shown = True
                        log("⚠️ 当前为未登录态（401），请在打开的窗口完成登录，脚本会自动继续。")
                    time.sleep(2)
                    continue
                if elapsed % 5 == 0:
                    try_open_image_post_tab()
                # If login wall is shown even on publish URL, hint and keep waiting
                try:
                    if page.locator("text=登录").count() > 0 or page.locator("text=扫码").count() > 0:
                        log("⚠️  检测到登录提示，请先完成登录。")
                except Exception:
                    pass
                if elapsed % 10 == 0:
                    try:
                        page.screenshot(path=f"xhs_wait_{elapsed}s.png", full_page=True)
                        with open(f"xhs_wait_{elapsed}s.html", "w", encoding="utf-8") as f:
                            f.write(page.content())
                        log(f"📸 已保存截图与页面源码: xhs_wait_{elapsed}s.png / .html")
                    except Exception:
                        pass
                if elapsed > 30 and not reloaded:
                    reloaded = True
                    log("🔄 页面加载超时，尝试刷新发布页...")
                    page.goto("https://creator.xiaohongshu.com/publish/publish")
                    try:
                        page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        pass
                if elapsed > 15 and elapsed % 10 == 5:
                    log("🔍 尝试从创作首页进入发布入口...")
                    page.goto("https://creator.xiaohongshu.com/", wait_until="domcontentloaded")
                    try:
                        page.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass
                    click_text_anywhere(["发布", "创作", "发布图文", "图文发布", "新建笔记", "发笔记"])
                    time.sleep(1)
                if elapsed > 45:
                    log("⚠️ 长时间未找到表单，尝试兜底直接填充可编辑区域...")
                    if fallback_fill_any_editable():
                        log("✅ 已在可编辑区域填充正文，继续发布流程...")
                        break
                time.sleep(2)
            page.wait_for_timeout(1000)

        # 3. Switch to Image Tab
            log("🔄 [步骤 3] 正在切换到图文发布...")
            try:
                # Wait for the tab to appear
                # Use a robust selector or text match
                tab = page.locator("div, span").filter(has_text="上传图文").last()
                tab.wait_for(timeout=5000)
                tab.click()
                time.sleep(1) # Visual pause
            except Exception as e:
                log(f"⚠️  切换图文发布失败（可能已在该页面）：{e}")

        # 4. Upload Images
            log("📤 [步骤 3] 正在上传图片...")
            try:
                # Handle the file chooser
                # We look for the file input. Usually hidden.
                # We trigger it by clicking the upload area if needed, 
                # or just setting input files if the input is present in DOM.
                
                # Strategy A: Set input files directly if input exists
                upload_input = page.locator("input[type='file']")
                if upload_input.count() > 0:
                    upload_input.set_input_files(images)
                else:
                    # Strategy B: Click button and handle chooser
                    with page.expect_file_chooser() as fc_info:
                        page.get_by_text("上传图片").first.click()
                    file_chooser = fc_info.value
                    file_chooser.set_files(images)
                
                # Wait for upload to process (simple wait)
                page.wait_for_timeout(8000)
            except Exception as e:
                log(f"❌ 图片上传失败：{e}")
                # Continue anyway to allow manual fix
            
        # 5. Fill Content
            log("✍️  [步骤 3] 正在填写标题与正文...")

            # Title (Limit 20 chars)
            if len(title) > 20:
                log(f"⚠️  标题过长（{len(title)} 字），已截断到 20 字。")
                title = title[:20]

            try:
                # Title input (try multiple selectors)
                ctx, sel = find_in_page_or_frames()
                title_input = ctx.locator(sel).first if ctx and sel else None
                if title_input is None:
                    raise RuntimeError("找不到标题输入框")
                title_input.click()
                title_input.fill(title)

                # Content input (Textarea)
                # Find the content editable div or textarea
                # Xiaohongshu often uses a contenteditable div
                content_input = ctx.locator(".c-input_textarea, #post-content, .ql-editor, div[contenteditable='true']").first
                content_input.wait_for(timeout=10000)
                content_input.click()
                content_input.fill(content)

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

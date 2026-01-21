import sys
import os
import time
from playwright.sync_api import sync_playwright

def publish(title, content, images):
    """
    Automates the Xiaohongshu publishing process.
    """
    print("🚀 小红书发布脚本已启动")
    print("操作指南：")
    print("1) 观察浏览器窗口：已打开小红书创作者中心。")
    print("2) 如果出现登录页，请扫码登录。")
    print("3) 登录完成后脚本会自动上传图片并填写标题/正文。")
    print("4) 请在浏览器中检查内容，确认无误后点击“发布”。")
    print(f"标题: {title}")
    print(f"图片: {images}")

    with sync_playwright() as p:
        # Launch non-headless so user can see and intervene (Login/Captcha)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate to Publish Page
        print("🌐 正在打开小红书创作者中心...")
        page.goto("https://creator.xiaohongshu.com/publish/publish")

        # 2. Login Check
        # If redirected to login, wait for user to log in manually
        if "login" in page.url:
            print("⏳ [步骤 2] 等待登录：请在浏览器窗口扫码登录。")
            print("   脚本会自动检测登录完成后继续；如检测不到，请回到终端按 Enter 继续。")
            try:
                page.wait_for_url("**/publish/publish", timeout=120000)
            except Exception:
                input("登录完成后回到终端，按 Enter 继续...")
                page.goto("https://creator.xiaohongshu.com/publish/publish")
            print("✅ [步骤 3] 已检测到登录完成，继续执行自动填充...")

        # Ensure publish form is ready after login/redirect
        print("⏳ [步骤 3] 正在等待发布表单加载...")
        page.wait_for_selector("input[placeholder*='填写标题']", timeout=60000)
        page.wait_for_timeout(1000)

        # 3. Switch to Image Tab
        print("🔄 [步骤 3] 正在切换到图文发布...")
        try:
            # Wait for the tab to appear
            # Use a robust selector or text match
            tab = page.locator("div, span").filter(has_text="上传图文").last()
            tab.wait_for(timeout=5000)
            tab.click()
            time.sleep(1) # Visual pause
        except Exception as e:
            print(f"⚠️  切换图文发布失败（可能已在该页面）：{e}")

        # 4. Upload Images
        print("📤 [步骤 3] 正在上传图片...")
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
            print(f"❌ 图片上传失败：{e}")
            # Continue anyway to allow manual fix
            
        # 5. Fill Content
        print("✍️  [步骤 3] 正在填写标题与正文...")
        
        # Title (Limit 20 chars)
        if len(title) > 20:
            print(f"⚠️  标题过长（{len(title)} 字），已截断到 20 字。")
            title = title[:20]
            
        try:
            # Title input usually has placeholder "填写标题..."
            title_input = page.locator("input[placeholder*='填写标题']")
            title_input.click()
            title_input.fill(title)
            
            # Content input (Textarea)
            # Find the content editable div or textarea
            # Xiaohongshu often uses a contenteditable div
            content_input = page.locator(".c-input_textarea, #post-content, .ql-editor").first
            content_input.wait_for(timeout=10000)
            content_input.click()
            content_input.fill(content)
            
        except Exception as e:
             print(f"❌ 填写文本失败：{e}")

        print("✨ [步骤 4] 草稿已生成！")
        print("👉 请在浏览器中检查内容，确认无误后点击“发布”。")
        
        # Keep browser open for user review
        try:
            page.wait_for_timeout(300000) # Wait 5 mins or until user closes
        except:
            pass
            
        browser.close()

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

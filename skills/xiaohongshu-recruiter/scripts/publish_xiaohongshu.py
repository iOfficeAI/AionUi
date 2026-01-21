import sys
import os
import time
from playwright.sync_api import sync_playwright

def publish(title, content, images):
    """
    Automates the Xiaohongshu publishing process.
    """
    print(f"🚀 Starting Xiaohongshu Publisher")
    print(f"Title: {title}")
    print(f"Images: {images}")

    with sync_playwright() as p:
        # Launch non-headless so user can see and intervene (Login/Captcha)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate to Publish Page
        print("🌐 Navigating to Creator Center...")
        page.goto("https://creator.xiaohongshu.com/publish/publish")

        # 2. Login Check
        # If redirected to login, wait for user to log in manually
        if "login" in page.url:
            print("⚠️  Login required! Please scan the QR code in the browser window.")
            print("   (Waiting for navigation to publish page...)")
            # Wait indefinitely until we are back on the publish page
            page.wait_for_url("**/publish/publish", timeout=0)
            print("✅ Login detected!")

        # 3. Switch to Image Tab
        print("🔄 Switching to Image/Text Tab...")
        try:
            # Wait for the tab to appear
            # Use a robust selector or text match
            tab = page.locator("div, span").filter(has_text="上传图文").last()
            tab.wait_for(timeout=5000)
            tab.click()
            time.sleep(1) # Visual pause
        except Exception as e:
            print(f"⚠️  Warning switching tabs (might already be on tab): {e}")

        # 4. Upload Images
        print("📤 Uploading images...")
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
            page.wait_for_timeout(5000) 
        except Exception as e:
            print(f"❌ Error uploading images: {e}")
            # Continue anyway to allow manual fix
            
        # 5. Fill Content
        print("✍️  Filling content...")
        
        # Title (Limit 20 chars)
        if len(title) > 20:
            print(f"⚠️  Title too long ({len(title)} chars), truncating to 20.")
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
            content_input.click()
            content_input.fill(content)
            
        except Exception as e:
             print(f"❌ Error filling text: {e}")

        print("✨ Draft prepared!")
        print("👉 Please review the browser window. Click '发布' (Publish) when ready.")
        
        # Keep browser open for user review
        try:
            page.wait_for_timeout(300000) # Wait 5 mins or until user closes
        except:
            pass
            
        browser.close()

if __name__ == "__main__":
    # Usage: python publish_xiaohongshu.py <title> <content_file_path> <img1> <img2> ...
    if len(sys.argv) < 4:
        print("Usage: python publish_xiaohongshu.py <title> <content_file> <img1> [img2 ...]")
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

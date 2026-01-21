import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8").strip()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/publish_x.py <post_content.txt> [cover.png] [jd_details.png]")
        sys.exit(1)

    content_path = sys.argv[1]
    cover_path = sys.argv[2] if len(sys.argv) > 2 else None
    details_path = sys.argv[3] if len(sys.argv) > 3 else None

    content = read_text(content_path)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        page.goto("https://x.com/home", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        # If not logged in, X will redirect to login or show a login wall.
        if "login" in page.url or "i/flow/login" in page.url:
            print("Please log in to X in the opened browser, then return here.")
            input("Press Enter after login...")
            page.goto("https://x.com/home", wait_until="domcontentloaded")
            page.wait_for_timeout(2000)

        # Focus composer
        composer = page.locator("div[role='textbox'][data-testid='tweetTextarea_0']")
        if not composer.is_visible():
            # Try clicking the compose button if needed
            compose_btn = page.locator("a[data-testid='SideNav_NewTweet_Button'], div[data-testid='SideNav_NewTweet_Button']")
            if compose_btn.is_visible():
                compose_btn.click()
            page.wait_for_timeout(1000)

        composer = page.locator("div[role='textbox'][data-testid='tweetTextarea_0']")
        composer.wait_for(timeout=10000)
        composer.click()
        composer.fill(content)

        # Upload images if provided
        if cover_path or details_path:
            files = [p for p in [cover_path, details_path] if p]
            file_input = page.locator("input[type='file'][data-testid='fileInput']")
            file_input.set_input_files(files)
            page.wait_for_timeout(3000)

        # Click Post
        post_btn = page.locator("div[data-testid='tweetButtonInline']")
        post_btn.wait_for(timeout=10000)
        post_btn.click()

        # Wait a bit to ensure posting
        page.wait_for_timeout(3000)
        print("Post submitted. Please verify on X.")
        time.sleep(5)

        context.close()
        browser.close()


if __name__ == "__main__":
    main()

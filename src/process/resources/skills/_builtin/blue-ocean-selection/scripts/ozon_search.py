#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ozon前台搜索 (Playwright)
========================

参考: eduard256/ozon-mcp-server
通过Playwright浏览器自动化绕过Ozon antibot，搜索产品和获取详情。

功能:
- search(): 搜索Ozon产品(支持排序/价格筛选)
- get_product_details(): 获取产品详情
- get_categories(): 获取类目列表

依赖:
    pip install playwright
    playwright install chromium

用法:
    python scripts/ozon_search.py --query "игрушки" --limit 5
    python scripts/ozon_search.py --product-id 123456789
    python scripts/ozon_search.py --categories
"""

import argparse
import json
import logging
import re
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# 排序选项映射
SORT_MAP = {
    "popular": "score",
    "price": "price",
    "price_desc": "price_desc",
    "new": "new",
    "rating": "rating",
    "discount": "discount",
}


class OzonSearchClient:
    """Ozon公开搜索客户端 (Playwright)"""

    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None

    def _create_browser(self):
        """创建浏览器实例"""
        self._close()
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise ImportError("Playwright未安装: pip install playwright && playwright install chromium")

        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        self.context = self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="ru-RU",
        )
        self.page = self.context.new_page()
        return self.page

    def _close(self):
        if self.browser:
            try:
                self.browser.close()
            except Exception:
                pass
            try:
                self._pw.stop()
            except Exception:
                pass
        self.browser = None
        self.context = None
        self.page = None

    def _load_page(self, url: str, wait_time: int = 10000):
        """加载页面并等待"""
        page = self._create_browser()
        logger.info(f"Loading: {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(wait_time)
        title = page.title()
        logger.info(f"Page title: {title}")

        # 检测antibot
        if "Antibot" in title or "ограничен" in title:
            logger.warning("Ozon antibot检测，可能被封")
        return page, title

    def search(self, query: str, sort: str = "popular",
               price_min: int = None, price_max: int = None,
               limit: int = 20) -> List[dict]:
        """搜索Ozon产品"""
        # 构建搜索URL
        url = f"https://www.ozon.ru/search/?text={query}&from_global=true"
        if sort in SORT_MAP:
            url += f"&sorting={SORT_MAP[sort]}"
        if price_min or price_max:
            pmin = price_min or 0
            pmax = price_max or 9999999
            url += f"&currency_price={pmin}.000%3B{pmax}.000"

        try:
            page, title = self._load_page(url, 8000)

            if "Antibot" in title or "ограничен" in title:
                self._close()
                return []

            # 滚动加载更多
            if limit > 20:
                scroll_count = min(limit // 20, 5)
                for _ in range(scroll_count):
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(2000)
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(1000)

            # 提取产品数据
            products = page.evaluate("""(maxResults) => {
                const items = [];
                const seen = new Set();
                const links = document.querySelectorAll('a[href*="/product/"]');

                for (const link of links) {
                    if (items.length >= maxResults) break;
                    try {
                        const href = link.getAttribute('href');
                        if (!href || !href.includes('/product/')) continue;

                        const idMatch = href.match(/-(\\d+)(?:\\?|\\/|$)/);
                        const id = idMatch ? idMatch[1] : null;
                        if (!id || seen.has(id)) continue;
                        seen.add(id);

                        const fullUrl = href.startsWith('http')
                            ? href.split('?')[0]
                            : 'https://www.ozon.ru' + href.split('?')[0];

                        let container = link.closest('[data-index]');
                        if (!container) container = link.closest('[class*="tile"]');
                        if (!container) container = link.closest('[class*="product"]');
                        if (!container) {
                            let el = link.parentElement;
                            for (let i = 0; i < 5 && el; i++) {
                                if (el.innerText && el.innerText.includes('₽')) {
                                    container = el;
                                    break;
                                }
                                el = el.parentElement;
                            }
                        }
                        if (!container) continue;

                        const text = container.innerText || '';
                        const lines = text.split('\\n').map(l => l.trim()).filter(l => l);

                        // 价格提取
                        let price = null;
                        for (const line of lines) {
                            if (line.includes('₽')) {
                                const match = line.match(/(\\d[\\d\\s]*)₽/);
                                if (match) {
                                    price = parseInt(match[1].replace(/\\s/g, ''));
                                    if (price > 0 && price < 100000000) break;
                                }
                            }
                        }
                        if (!price) continue;

                        // 折扣
                        let discount = null;
                        const discountMatch = text.match(/-(\\d+)%/);
                        if (discountMatch) discount = parseInt(discountMatch[1]);

                        // 评分
                        let rating = null;
                        let reviewsCount = null;
                        const ratingMatch = text.match(/(\\d[,\\.]\\d)/);
                        if (ratingMatch) rating = parseFloat(ratingMatch[1].replace(',', '.'));
                        const reviewsMatch = text.match(/(\\d+)\\s*отзыв/i);
                        if (reviewsMatch) reviewsCount = parseInt(reviewsMatch[1]);

                        // 名称
                        let name = '';
                        for (const line of lines) {
                            if (line.includes('₽')) continue;
                            if (line.match(/^-?\\d+%$/)) continue;
                            if (line.match(/^\\d+\\s*(отзыв|товар|шт)/i)) continue;
                            if (line.match(/^(доставка|завтра|послезавтра)/i)) continue;
                            if (line.match(/^(в корзину|купить)/i)) continue;
                            if (line.length < 10 || line.length > 300) continue;
                            name = line;
                            break;
                        }
                        if (!name) {
                            name = link.getAttribute('title') || '';
                            if (!name) {
                                const img = container.querySelector('img');
                                name = img ? img.getAttribute('alt') || '' : '';
                            }
                        }

                        // 图片
                        const img = container.querySelector('img');
                        const image = img ? img.src : null;

                        items.push({
                            id, url: fullUrl, name, price, discount, image, rating, reviewsCount
                        });
                    } catch (e) { /* skip */ }
                }
                return items;
            }""", limit)

            logger.info(f"找到 {len(products)} 个产品")
            self._close()
            return products

        except Exception as e:
            logger.error(f"Ozon搜索失败: {e}")
            self._close()
            raise

    def get_product_details(self, product_id_or_url: str) -> Optional[dict]:
        """获取Ozon产品详情"""
        url = product_id_or_url
        if not url.startswith("http"):
            url = f"https://www.ozon.ru/product/{product_id_or_url}/"

        try:
            # 先加载首页建立session
            self._load_page("https://www.ozon.ru/", 8000)
            # 再导航到产品页
            self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
            self.page.wait_for_timeout(12000)

            title = self.page.title()
            if "Antibot" in title or "ограничен" in title:
                self._close()
                return None

            product = self.page.evaluate("""() => {
                const result = {
                    title: null, price: null, oldPrice: null, discount: null,
                    rating: null, reviewsCount: null, images: [],
                    characteristics: [], description: null, seller: null, inStock: true
                };

                const h1 = document.querySelector('h1');
                result.title = h1 ? h1.innerText.trim() : null;

                const priceWidget = document.querySelector('[data-widget="webPrice"]');
                if (priceWidget) {
                    const priceText = priceWidget.innerText;
                    const priceMatch = priceText.match(/(\\d[\\d\\s]*)₽/);
                    if (priceMatch) result.price = parseInt(priceMatch[1].replace(/\\s/g, ''));
                    const discountMatch = priceText.match(/-(\\d+)%/);
                    if (discountMatch) result.discount = parseInt(discountMatch[1]);
                }

                const reviewWidget = document.querySelector('[data-widget="webReviewSummary"]');
                if (reviewWidget) {
                    const reviewText = reviewWidget.innerText;
                    const ratingMatch = reviewText.match(/(\\d[,\\.]\\d)/);
                    if (ratingMatch) result.rating = parseFloat(ratingMatch[1].replace(',', '.'));
                    const reviewsMatch = reviewText.match(/(\\d+)\\s*(отзыв|review)/i);
                    if (reviewsMatch) result.reviewsCount = parseInt(reviewsMatch[1]);
                }

                const imgs = document.querySelectorAll('img[src*="ozone"]');
                for (const img of imgs) {
                    if (result.images.length >= 10) break;
                    if (img.src && !result.images.includes(img.src)) result.images.push(img.src);
                }

                const descWidget = document.querySelector('[data-widget="webDescription"]');
                if (descWidget) result.description = descWidget.innerText.trim().substring(0, 2000);

                const sellerWidget = document.querySelector('[data-widget="webCurrentSeller"]');
                if (sellerWidget) result.seller = sellerWidget.innerText.split('\\n')[0].trim();

                const pageText = document.body.innerText.toLowerCase();
                if (pageText.includes('нет в наличии') || pageText.includes('товар закончился')) {
                    result.inStock = false;
                }

                return result;
            }""")

            # 提取产品ID
            current_url = self.page.url
            id_match = re.search(r"-(\d+)", current_url)
            if id_match:
                product["id"] = id_match.group(1)
            product["url"] = current_url

            self._close()
            return product

        except Exception as e:
            logger.error(f"获取Ozon产品详情失败: {e}")
            self._close()
            return None

    def get_categories(self) -> List[dict]:
        """获取Ozon类目列表"""
        try:
            page, _ = self._load_page("https://www.ozon.ru/", 10000)
            categories = page.evaluate("""() => {
                const result = [];
                const seen = new Set();
                const links = document.querySelectorAll('a[href*="/category/"]');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    const name = link.innerText.trim();
                    if (href && name && name.length > 1 && name.length < 100 && !seen.has(href)) {
                        seen.add(href);
                        result.push({
                            name,
                            url: href.startsWith('http') ? href : 'https://www.ozon.ru' + href
                        });
                    }
                }
                return result;
            }""")
            self._close()
            return categories
        except Exception as e:
            logger.error(f"获取Ozon类目失败: {e}")
            self._close()
            return []


def main():
    parser = argparse.ArgumentParser(description="Ozon前台搜索(Playwright)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--query", help="搜索关键词")
    group.add_argument("--product-id", help="产品ID或URL")
    group.add_argument("--categories", action="store_true", help="获取类目列表")

    parser.add_argument("--sort", default="popular",
                        choices=["popular", "price", "price_desc", "new", "rating", "discount"],
                        help="排序方式")
    parser.add_argument("--price-min", type=int, default=None, help="最低价格(RUB)")
    parser.add_argument("--price-max", type=int, default=None, help="最高价格(RUB)")
    parser.add_argument("--limit", type=int, default=10, help="最大结果数")

    args = parser.parse_args()
    client = OzonSearchClient()

    try:
        if args.query:
            results = client.search(args.query, sort=args.sort,
                                    price_min=args.price_min, price_max=args.price_max,
                                    limit=args.limit)
            print(json.dumps({"status": "success", "count": len(results), "products": results},
                             ensure_ascii=False, indent=2))
        elif args.product_id:
            details = client.get_product_details(args.product_id)
            print(json.dumps({"status": "success", "product": details},
                             ensure_ascii=False, indent=2))
        elif args.categories:
            cats = client.get_categories()
            print(json.dumps({"status": "success", "count": len(cats), "categories": cats},
                             ensure_ascii=False, indent=2))
    finally:
        client._close()


if __name__ == "__main__":
    main()

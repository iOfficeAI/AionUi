#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1688以图搜款 - 移植自 Zhui-CN/1688_image_search_crawler
================================================

支持三种模式: URL/文件/Base64图片 → 1688同款搜索
返回丰富的产品数据: 阶梯价/评分/店铺标签/旺旺等

依赖:
    pip install httpx httpx[http2]

用法:
    python scripts/image_search_1688.py --url https://img.alicdn.com/img/xxx.jpg
    python scripts/image_search_1688.py --file ./product.jpg
    python scripts/image_search_1688.py --b64 <base64_string>
"""

import argparse
import base64
import json
import logging
import os
import re
import time
from hashlib import md5
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ── 1688 API常量 ────────────────────────────────────────────
JSV = "2.7.2"
API_VERSION = "1.0"
API_KEY = "12574478"
APP_NAME = "searchImageUpload"
APP_KEY = "pvvljh1grxcmaay2vgpe9nb68gg9ueg2"
UPLOAD_API_PATH = "mtop.1688.imageService.putImage"
TOKEN_API_PATH = "mtop.ovs.traffic.landing.seotaglist.queryHotSearchWord"
API_HOST = "https://h5api.m.1688.com"

DATA_REG = re.compile(
    r"window\.data\.offerresultData\s?=\s?successDataCheck\((.*?})\);",
    re.S | re.I,
)

# 店铺标签配置
TAG_CONFIG = {
    "memberTagIds": {
        "isShiliDangKou": "3910593",
        "isSuperFactory": "3938689",
    },
    "tagIds": {
        "isPinZhiBaoZhang": "3951041",
        "deliveryHours48": "286402",
        "deliveryHours24": "286466",
        "superNewProduct": "277762",
        "isImallExpert": "3981057",
    },
}

TAG_INFO_MAP = {
    "a": {
        "title": "\u6e90\u5934\u5de5\u5382\u3001\u5e73\u53f0\u4f18\u9009\u3001\u95ea\u7535\u53d1\u8d27",
        "img": "https://img.alicdn.com/imgextra/i3/O1CN01LcOfhW1QrmfmYQ66J_!!6000000002030-2-tps-112-112.png",
    },
    "b": {
        "title": "\u963f\u91cc\u5df4\u5df4\u5efa\u8bae\u60a8\u4f18\u5148\u9009\u62e9\u8bda\u4fe1\u901a\u4f1a\u5458",
        "img": "https://img.alicdn.com/tfs/TB1xPJdjXT7gK0jSZFpXXaTkpXa-112-112.png",
    },
    "c": {
        "title": "\u5b9e\u529b\u5546\u5bb6\uff1a\u66f4\u54c1\u8d28\u3001\u66f4\u53ef\u9760\u3001\u66f4\u8d34\u5fc3",
        "img": "https://img.alicdn.com/tfs/TB1ObNfjlv0gK0jSZKbXXbK2FXa-112-112.png",
    },
    "d": {
        "title": "\u5de5\u4e1a\u54c1\u724c\uff1a\u54c1\u724c\u6b63\u54c1\uff0c\u54c1\u8d28\u670d\u52a1",
        "img": "",
    },
}


def _parse_scores_num(score) -> float:
    try:
        tmp = round(float(score or 0), 1)
        return max(tmp, 0.0)
    except (ValueError, TypeError):
        return 0.0


def _get_shop_tag_info(offer: dict) -> dict:
    tag_info = {"title": "", "img": ""}
    try:
        offer_tag_data = offer.get("marketOfferTag") or {}
        for k, v in TAG_CONFIG.items():
            if not offer.get("feMapping"):
                offer["feMapping"] = {}
            ary = offer_tag_data.get(k)
            tag_result = {}
            if v and ary:
                for i in v:
                    tag_result[i] = True if v[i] in ary else False
            offer["feMapping"][k] = tag_result
    except Exception as exc:
        logger.error(f"tag\u6570\u636e\u683c\u5f0f\u5f02\u5e38: {exc}")
        return tag_info

    m = (offer.get("offerSource") or {}).get("fromShili")
    f = (offer.get("tradeService") or {}).get("tpMember")
    g = (offer.get("brand") or {}).get("industrialGoods")
    w = ((offer.get("feMapping") or {}).get("memberTagIds") or {}).get("isSuperFactory")
    if w:
        tag_info.update(TAG_INFO_MAP["a"])
    elif g:
        tag_info.update(TAG_INFO_MAP["d"] if f else TAG_INFO_MAP["d"])
    elif m:
        tag_info.update(TAG_INFO_MAP["c"])
    elif f:
        tag_info.update(TAG_INFO_MAP["b"])
    return tag_info


def _get_custom_cookies() -> dict:
    """从环境变量获取1688自定义cookie"""
    cookie_str = os.environ.get("COZE_1688_cookies_7634436791660773376", "")
    if not cookie_str:
        return {}
    cookies = {}
    for item in cookie_str.split(";"):
        item = item.strip()
        if "=" in item:
            k, v = item.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


class ImgSearch1688:
    """1688以图搜款引擎

    用法:
        # URL搜索
        results = ImgSearch1688.search_by_url("https://img.alicdn.com/xxx.jpg")

        # 文件搜索
        results = ImgSearch1688.search_by_file("/path/to/product.jpg")

        # Base64搜索
        results = ImgSearch1688.search_by_b64(base64_str)

        # 迭代器模式(支持翻页)
        searcher = ImgSearch1688(b64img, max_page=3)
        for page_results in searcher:
            process(page_results)
    """

    @staticmethod
    def search_by_url(url: str, max_page: int = 1, max_size: int = None,
                      api_mode: bool = False, proxies: dict = None) -> List[dict]:
        """通过URL搜索1688同款"""
        proxy_url = None
        if proxies:
            proxy_url = proxies.get("https://") or proxies.get("http://") or proxies.get("http://")
        with httpx.Client(verify=False, http2=True, proxy=proxy_url, timeout=30) as client:
            resp = client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            b64img = base64.b64encode(resp.content).decode()
        searcher = ImgSearch1688(b64img, api=api_mode, max_page=max_page,
                                 max_size=max_size, proxies=proxies)
        all_items = []
        for page_items in searcher:
            all_items.extend(page_items)
        return all_items

    @staticmethod
    def search_by_file(path: str, max_page: int = 1, max_size: int = None,
                       api_mode: bool = False, proxies: dict = None) -> List[dict]:
        """通过文件搜索1688同款"""
        assert os.path.exists(path), f"file not found: {path}"
        with open(path, "rb") as f:
            content = f.read()
        b64img = base64.b64encode(content).decode()
        searcher = ImgSearch1688(b64img, api=api_mode, max_page=max_page,
                                 max_size=max_size, proxies=proxies)
        all_items = []
        for page_items in searcher:
            all_items.extend(page_items)
        return all_items

    @staticmethod
    def search_by_b64(b64str: str, max_page: int = 1, max_size: int = None,
                      api_mode: bool = False, proxies: dict = None) -> List[dict]:
        """通过Base64搜索1688同款"""
        searcher = ImgSearch1688(b64str, api=api_mode, max_page=max_page,
                                 max_size=max_size, proxies=proxies)
        all_items = []
        for page_items in searcher:
            all_items.extend(page_items)
        return all_items

    def __init__(self, b64img: str, api: bool = False,
                 max_page: int = 1, max_size: int = None,
                 proxies: dict = None):
        self.api = api
        self.max_size = max_size
        self.max_page = (max_page if max_page else 1) if not max_size else None
        if not api:
            self.max_page = 1
        self.offset = 0
        self.page = 1
        self.upload_success = False
        self.upload_data_str = json.dumps(
            {"imageBase64": b64img, "appName": APP_NAME, "appKey": APP_KEY},
            separators=(",", ":"),
        )
        self.img_id = None
        self.req_id = None
        self.session_id = None
        self.token = ""
        self.proxies = proxies
        # httpx 0.28+ uses 'proxy' (single URL string) instead of 'proxies' dict
        proxy_url = None
        if proxies:
            proxy_url = proxies.get("https://") or proxies.get("http://") or proxies.get("http://")
        self.client = httpx.Client(
            verify=False, http2=True, timeout=30, proxy=proxy_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )

        # 注入自定义cookie
        custom_cookies = _get_custom_cookies()
        if custom_cookies:
            for name, value in custom_cookies.items():
                self.client.cookies.set(name, value, ".1688.com")
                self.client.cookies.set(name, value, ".m.1688.com")
            logger.info(f"ImgSearch1688: 注入 {len(custom_cookies)} 个自定义cookie")

        self._set_cookie_cna()
        self._set_token()
        self._upload_img()

    def __str__(self):
        return f"page:{self.page}, max_page:{self.max_page}, max_size:{self.max_size}"

    def __iter__(self):
        return self

    def __next__(self):
        if (self.max_size and self.offset >= self.max_size) or \
           (self.max_page and self.page > self.max_page):
            self.page -= 1
            self.client.close()
            raise StopIteration

        logger.info(f"正在爬取: img_id:{self.img_id} {self}")

        if self.api:
            offer_list = self._request_api_offer_list()
        else:
            offer_list = self._request_web_offer_list()

        if not offer_list:
            logger.warning(f"无结果集: img_id:{self.img_id} {self}")

        item_ls = self._parse_offer_list(offer_list)
        self.page += 1
        return item_ls

    def _set_cookie_cna(self):
        timestamp = str(int(time.time() * 1000))
        url = f"https://log.mmstat.com/eg.js?t={timestamp}"
        try:
            resp = self.client.get(url, headers={"referer": "https://www.1688.com/"})
            cna_cookie = None
            # Access httpx cookie jar properly
            try:
                for cookie in resp.cookies.jar:
                    if cookie.name == "cna":
                        cna_cookie = cookie.value
                        break
            except Exception:
                for name, value in resp.cookies.items():
                    if name == "cna":
                        cna_cookie = value
                        break
            if cna_cookie:
                # Clear any existing cna to avoid duplicates
                try:
                    cookies_to_remove = []
                    for cookie in self.client.cookies.jar:
                        if cookie.name == "cna":
                            cookies_to_remove.append(cookie)
                    for cookie in cookies_to_remove:
                        self.client.cookies.jar.clear(cookie.domain, cookie.path, cookie.name)
                except Exception:
                    pass
                self.client.cookies.set("cna", cna_cookie, ".1688.com")
                logger.info(f"设置cna cookie: {cna_cookie[:20]}...")
        except Exception as e:
            logger.warning(f"获取cna cookie失败: {e}")

    def _set_token(self):
        url = f"{API_HOST}/h5/{TOKEN_API_PATH.lower()}/{API_VERSION}/"
        headers = {"origin": "https://www.1688.com", "referer": "https://www.1688.com/"}
        params = {
            "jsv": JSV, "appKey": API_KEY,
            "t": str(int(time.time() * 1000)),
            "api": TOKEN_API_PATH, "v": API_VERSION,
            "type": "jsonp", "dataType": "jsonp",
            "callback": "mtopjsonp1",
            "preventFallback": True,
            "data": "{}",
        }
        try:
            self.client.get(url, headers=headers, params=params)
            tk = None
            # httpx cookies: iterate and find _m_h5_tk
            try:
                cookie_jar = self.client.cookies
                for cookie in cookie_jar.jar:
                    if cookie.name == "_m_h5_tk":
                        tk = cookie.value.split("_")[0]
                        break
            except Exception:
                # Fallback: dict-style access
                for name, value in self.client.cookies.items():
                    if name == "_m_h5_tk":
                        tk = value.split("_")[0]
                        break
            if tk:
                self.token = tk
                logger.info(f"获取token成功: {tk[:20]}...")
            else:
                # 降级: 使用自定义cookie中的token
                custom_cookies = _get_custom_cookies()
                if "_m_h5_tk" in custom_cookies:
                    self.token = custom_cookies["_m_h5_tk"].split("_")[0]
                    logger.info(f"使用自定义cookie token: {self.token[:20]}...")
        except Exception as e:
            logger.warning(f"获取token失败: {e}")

    def _upload_img(self):
        logger.info("正在上传图片到1688...")
        url = f"{API_HOST}/h5/{UPLOAD_API_PATH.lower()}/{API_VERSION}/"
        headers = {"origin": "https://www.1688.com", "referer": "https://www.1688.com/"}
        timestamp = str(int(time.time() * 1000))
        data = {"data": self.upload_data_str}
        s = self.token + "&" + timestamp + "&" + API_KEY + "&" + self.upload_data_str
        sign = md5(s.encode()).hexdigest()
        params = {
            "jsv": JSV, "appKey": API_KEY,
            "t": timestamp, "sign": sign,
            "api": UPLOAD_API_PATH,
            "ignoreLogin": "true", "prefix": "h5api",
            "v": API_VERSION, "ecode": "0",
            "dataType": "jsonp", "jsonpIncPrefix": "search1688",
            "timeout": "20000", "type": "originaljson",
        }
        resp = self.client.post(url, headers=headers, params=params, data=data)
        try:
            resp_json = resp.json()
        except Exception:
            logger.error(f"上传图片响应解析失败: {resp.text[:300]}")
            self.client.close()
            raise Exception("上传图片响应解析失败")

        img_data = (resp_json.get("data") or {})
        if not img_data.get("imageId"):
            logger.error(f"上传图片失败: {resp_json}")
            self.client.close()
            raise Exception(f"上传图片失败: {resp_json.get('ret', [''])[0] if resp_json.get('ret') else 'unknown'}")

        self.img_id = img_data["imageId"]
        self.req_id = img_data.get("requestId")
        self.session_id = img_data.get("sessionId")
        logger.info(f"上传图片成功: img_id={self.img_id}")

    def _request_api_offer_list(self) -> list:
        url = "https://search.1688.com/service/imageSearchOfferResultViewService"
        headers = {"origin": "https://s.1688.com", "referer": "https://s.1688.com/"}
        params = {
            "tab": "imageSearch",
            "imageAddress": "",
            "imageId": self.img_id,
            "imageIdList": self.img_id,
            "beginPage": self.page,
            "pageSize": "40",
            "pageName": "image",
            "sessionId": self.session_id or "",
        }
        try:
            resp = self.client.get(url, headers=headers, params=params)
            json_data = resp.json()
            data = (json_data.get("data") or {}).get("data") or {}
            page_count = data.get("pageCount")
            if page_count is not None and self.max_page and self.max_page > page_count:
                self.max_page = page_count
            return data.get("offerList") or []
        except Exception as e:
            logger.error(f"API搜索请求失败: {e}")
            return []

    def _request_web_offer_list(self) -> list:
        url = "https://s.1688.com/youyuan/index.htm"
        headers = {"referer": "https://www.1688.com/"}
        params = {
            "tab": "imageSearch",
            "imageAddress": "",
            "spm": "a260k.dacugeneral.searchbox.input",
            "imageId": self.img_id,
            "imageIdList": self.img_id,
        }
        try:
            resp = self.client.get(url, headers=headers, params=params)
            reg = DATA_REG.search(resp.text)
            if reg:
                json_data = json.loads(reg.group(1))
                return (json_data.get("data") or {}).get("offerList") or []
            return []
        except Exception as e:
            logger.error(f"Web搜索请求失败: {e}")
            return []

    def _parse_offer_list(self, offer_list: list) -> List[dict]:
        item_ls = []
        for offer in offer_list:
            try:
                item = self._parse_single_offer(offer)
                if item:
                    item_ls.append(item)
            except Exception as e:
                logger.warning(f"解析offer失败: {e}")
        return item_ls

    def _parse_single_offer(self, offer: dict) -> Optional[dict]:
        self.offset += 1
        company = offer.get("company") or {}
        information = offer.get("information") or {}
        trade_service = offer.get("tradeService") or {}
        trade_quantity = offer.get("tradeQuantity") or {}
        offer_price = (offer.get("tradePrice") or {}).get("offerPrice") or {}
        position_labels = (offer.get("commonPositionLabels") or {}).get("offerMiddle") or []

        # 解析价格
        price_str = (offer_price.get("priceInfo") or {}).get("price") or ""
        if not price_str:
            original_price_info = offer_price.get("originalValue") or {}
            integer = original_price_info.get("integer") or 0
            decimals = original_price_info.get("decimals") or 0
            price_str = f"{integer}.{decimals}"
        try:
            price = float(price_str)
        except (ValueError, TypeError):
            price = 0.0

        # 解析阶梯价
        quantity_prices = []
        for q in offer_price.get("quantityPrices") or []:
            price_info_q = q.get("value") or {}
            int_p = price_info_q.get("integer") or 0
            dec_p = price_info_q.get("decimals") or 0
            quantity_prices.append({
                "quantity": q.get("quantity", ""),
                "price": float(f"{int_p}.{dec_p}") if dec_p else float(int_p),
            })

        # 解析复购率
        repurchase_rate = str(information.get("rePurchaseRate") or "")
        if repurchase_rate and "%" not in repurchase_rate:
            try:
                rate = round(float(repurchase_rate) * 100, 2)
                repurchase_rate = f"{rate}%" if rate else ""
            except ValueError:
                repurchase_rate = ""

        # 解析评分
        scores = {
            "composite": _parse_scores_num(trade_service.get("compositeNewScore")),
            "consultation": _parse_scores_num(trade_service.get("consultationScore")),
            "goods": _parse_scores_num(trade_service.get("goodsScore")),
            "logistics": _parse_scores_num(trade_service.get("logisticsScore")),
            "return": _parse_scores_num(trade_service.get("returnScore")),
            "dispute": _parse_scores_num(trade_service.get("disputeScore")),
        }

        # 解析店铺标签
        shop_tag = _get_shop_tag_info(offer)
        shop_tag["year"] = trade_service.get("tpYear")

        item = {
            "source": "1688_image_search",
            "offer_id": str(offer.get("id", "")),
            "title": information.get("subject", ""),
            "price": price,
            "product_url": f"https://detail.1688.com/offer/{offer.get('id', '')}.html",
            "image_url": (offer.get("image") or {}).get("imgUrl", ""),
            "category_id": information.get("categoryId"),
            "province": company.get("province", ""),
            "city": company.get("city", ""),
            "company_name": company.get("name", ""),
            "shop_url": company.get("url", ""),
            "brand": (offer.get("brand") or {}).get("name", ""),
            "quantity_begin": trade_quantity.get("quantityBegin", 1),
            "quantity_begin_unit": trade_quantity.get("unit", ""),
            "gmv_price": (trade_quantity.get("gmvValue") or {}).get("integer"),
            "quantity_prices": quantity_prices,
            "repurchase_rate": repurchase_rate,
            "scores": scores,
            "shop_tag": shop_tag,
            "ali_talk_name": (offer.get("aliTalk") or {}).get("loginId") or "",
            "position_labels": [lbl.get("text", "") for lbl in position_labels if lbl.get("text")],
            "sale_quantity": 0,
        }
        return item


# ── 命令行入口 ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="1688以图搜款")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="图片URL")
    group.add_argument("--file", help="图片文件路径")
    group.add_argument("--b64", help="Base64编码图片")
    parser.add_argument("--max-page", type=int, default=1, help="最大页数")
    parser.add_argument("--max-size", type=int, default=None, help="最大结果数")
    parser.add_argument("--api", action="store_true", help="使用API模式(翻页需开启)")
    parser.add_argument("--proxy", default=None, help="代理地址 e.g. http://127.0.0.1:7890")

    args = parser.parse_args()
    proxies = {"https://": args.proxy, "http://": args.proxy} if args.proxy else None

    if args.url:
        results = ImgSearch1688.search_by_url(
            args.url, max_page=args.max_page, max_size=args.max_size,
            api_mode=args.api, proxies=proxies)
    elif args.file:
        results = ImgSearch1688.search_by_file(
            args.file, max_page=args.max_page, max_size=args.max_size,
            api_mode=args.api, proxies=proxies)
    else:
        results = ImgSearch1688.search_by_b64(
            args.b64, max_page=args.max_page, max_size=args.max_size,
            api_mode=args.api, proxies=proxies)

    print(json.dumps({
        "status": "success",
        "count": len(results),
        "products": results[:20],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

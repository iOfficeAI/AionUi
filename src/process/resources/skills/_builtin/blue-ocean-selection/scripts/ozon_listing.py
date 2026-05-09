#!/usr/bin/env python3
"""
Ozon 商品上架脚本 v4.0
使用正确的 Ozon API 端点：
- /v3/product/import 创建产品（images直接支持URL字符串列表）

关键改进（v4.0）：
1. 集成OzonAttributeFiller全量属性自动填充器
2. 自动填充全部47个属性（包括18个字典类型+29个文本类型）
3. 字典值自动匹配Ozon官方字典
4. 提升商品质量得分
5. 兼容原有必填属性填充逻辑
"""

import argparse
import json
import os
import sys

           
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import time
import re
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed

from policy_constants import ATTRIBUTE_QUALITY_THRESHOLD

try:
    from http_client import requests
except ImportError:
    print("错误: 请先安装 requests 库")
    print("运行: pip install requests")
    sys.exit(1)


from config import get_config as _get_ozon_config


def _get_runtime_config():
    return _get_ozon_config()


def _default_ozon_api_url() -> str:
    return _get_runtime_config().ozon_api_url

IMGBB_API_URL = os.environ.get("IMGBB_API_URL", "https://api.imgbb.com/1/upload")
IMGBB_API_KEY = os.environ.get("IMGBB_API_KEY", "")

                             
from attribute_mapper import UniversalAttributeFiller
      
OzonAttributeFiller = UniversalAttributeFiller

        
DEFAULT_DESCRIPTION_CATEGORY_ID = 200001542           
DEFAULT_TYPE_ID = 970996037


@dataclass
class OzonConfig:
    """Ozon API配置"""
    client_id: str
    api_key: str
    api_url: str = ""

    def __post_init__(self):
        if not self.api_url:
            self.api_url = _default_ozon_api_url()
    
    def get_headers(self) -> Dict[str, str]:
        return {
            "Client-Id": self.client_id,
            "Api-Key": self.api_key,
            "Content-Type": "application/json"
        }


class COSUploader:
    """腾讯云COS图片上传器（v3.0优先使用）"""
    
    def __init__(self, secret_id=None, secret_key=None, bucket=None, region=None):
        runtime_cfg = _get_runtime_config()
        self.secret_id = secret_id or runtime_cfg.cos_secret_id
        self.secret_key = secret_key or runtime_cfg.cos_secret_key
        self.bucket = bucket or runtime_cfg.cos_bucket
        self.region = region or runtime_cfg.cos_region
        self._client = None
    
    @property
    def client(self):
        if self._client is None:
            try:
                from qcloud_cos import CosConfig, CosS3Client
                config = CosConfig(Region=self.region, SecretId=self.secret_id, SecretKey=self.secret_key)
                self._client = CosS3Client(config)
            except ImportError:
                raise OzonListingError("COS_SDK_MISSING", "请安装COS SDK: pip install qcloud_cos")
        return self._client
    
    def upload_file(self, local_path: str, key_prefix: str = "ozon-products") -> str:
        """
        上传本地文件到COS，返回公开URL
        
        Args:
            local_path: 本地文件路径
            key_prefix: COS存储路径前缀
            
        Returns:
            图片公开URL
        """
        import time
        import uuid
        
        if not os.path.exists(local_path):
            raise OzonListingError("FILE_NOT_FOUND", f"文件不存在: {local_path}")
        
        ext = os.path.splitext(local_path)[1] or '.jpg'
        key = f"{key_prefix}/{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
        
        try:
            self.client.upload_file(
                Bucket=self.bucket,
                Key=key,
                LocalFilePath=local_path
            )
            return f"https://{self.bucket}.cos.{self.region}.myqcloud.com/{key}"
        except Exception as e:
            raise OzonListingError("COS_UPLOAD_ERROR", f"COS上传失败: {e}")
    
    def upload_base64(self, base64_data: str, key_prefix: str = "ozon-products") -> str:
        """
        上传base64编码的图片到COS，返回公开URL
        
        Args:
            base64_data: base64编码的图片数据
            key_prefix: COS存储路径前缀
            
        Returns:
            图片公开URL
        """
        import base64
        import tempfile
        
        try:
            img_data = base64.b64decode(base64_data)
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                f.write(img_data)
                temp_path = f.name
            try:
                return self.upload_file(temp_path, key_prefix)
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
        except Exception as e:
            raise OzonListingError("COS_UPLOAD_ERROR", f"base64上传失败: {e}")
    
    def batch_upload(self, local_paths: List[str], key_prefix: str = "ozon-products") -> Dict[str, str]:
        """
        批量上传本地文件到COS
        
        Args:
            local_paths: 本地文件路径列表
            key_prefix: COS存储路径前缀
            
        Returns:
            {本地路径: 公开URL} 映射
        """
        results = {}
        for path in local_paths:
            try:
                url = self.upload_file(path, key_prefix)
                results[path] = url
                print(f"  ✅ {path} -> {url}")
            except OzonListingError as e:
                print(f"  ❌ {path}: {e.message}")
                results[path] = ""
        return results


class ImgBBUploader:
    """ImgBB图片上传器 - 上传本地图片获取公开URL"""
    
    def __init__(self, api_key: str = IMGBB_API_KEY):
        self.api_key = api_key
        self.api_url = IMGBB_API_URL
    
    def upload_file(self, image_path: str, name: str = "") -> str:
        """
        上传本地图片文件到ImgBB
        
        Args:
            image_path: 本地图片路径
            name: 可选的图片名称
            
        Returns:
            图片公开URL
        """
        if not os.path.exists(image_path):
            raise OzonListingError("FILE_NOT_FOUND", f"图片文件不存在: {image_path}")
        
        with open(image_path, "rb") as f:
            files = {"image": f}
            data = {"key": self.api_key}
            if name:
                data["name"] = name
            
            try:
                response = requests.post(self.api_url, files=files, data=data, timeout=30)
                response.raise_for_status()
                result = response.json()
                
                if result.get("success"):
                    return result["data"]["url"]
                else:
                    raise OzonListingError("IMGBB_ERROR", f"上传失败: {result}")
                    
            except requests.exceptions.RequestException as e:
                raise OzonListingError("IMGBB_ERROR", f"上传请求失败: {e}")
    
    def upload_base64(self, base64_data: str, name: str = "") -> str:
        """
        上传base64编码的图片
        
        Args:
            base64_data: base64编码的图片数据
            name: 可选的图片名称
            
        Returns:
            图片公开URL
        """
        data = {
            "key": self.api_key,
            "image": base64_data
        }
        if name:
            data["name"] = name
        
        try:
            response = requests.post(self.api_url, data=data, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            if result.get("success"):
                return result["data"]["url"]
            else:
                raise OzonListingError("IMGBB_ERROR", f"上传失败: {result}")
                
        except requests.exceptions.RequestException as e:
            raise OzonListingError("IMGBB_ERROR", f"上传请求失败: {e}")
    
    def batch_upload(self, image_paths: List[str]) -> Dict[str, str]:
        """
        批量上传图片
        
        Args:
            image_paths: 图片路径列表
            
        Returns:
            {本地路径: 公开URL} 映射
        """
        results = {}
        for path in image_paths:
            try:
                url = self.upload_file(path)
                results[path] = url
                print(f"  ✅ {path} -> {url}")
            except OzonListingError as e:
                print(f"  ❌ {path}: {e.message}")
                results[path] = ""
        
        return results


@dataclass
class ProductImage:
    """产品图片"""
    offer_id: str
    images: List[str]           
    uploaded_ids: Dict[str, str] = field(default_factory=dict)                  


class OzonListingError(Exception):
    """Ozon上架错误"""
    def __init__(self, code: str, message: str, details: Any = None):
        self.code = code
        self.message = message
        self.details = details
        super().__init__(f"[{code}] {message}")


class OzonAPIClient:
    """Ozon API客户端"""
    
    def __init__(self, config: OzonConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(config.get_headers())
    
    def _request(self, method: str, endpoint: str, data: Dict = None, timeout: int = 60) -> Dict:
        """发送API请求"""
        url = f"{self.config.api_url}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, json=data or {}, timeout=timeout)
            else:
                response = self.session.request(method, url, json=data, timeout=timeout)
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            raise OzonListingError("API_TIMEOUT", f"请求超时: {endpoint}")
        except requests.exceptions.RequestException as e:
            raise OzonListingError("API_ERROR", str(e), {"endpoint": endpoint, "status_code": e.response.status_code if e.response else None})
    
    def get_description_categories(self, language: str = "ZH_HANS") -> Dict:
        """获取类目树 /v1/description-category/tree"""
        return self._request("POST", "/v1/description-category/tree", {
            "language": language or "DEFAULT"
        })
    
    def get_category_attributes(self, description_category_id: int, type_id: int) -> Dict:
        """获取类目属性 /v1/description-category/attribute
        
        Args:
            description_category_id: 描述类目ID（来自类目树的description_category_id）
            type_id: 产品类型ID（来自类目树的type_id，叶子节点才有）
            
        Returns:
            类目属性列表
            
        Raises:
            OzonListingError: 当类目ID无效时
        """
        if not description_category_id or description_category_id <= 0:
            raise OzonListingError("INVALID_CATEGORY_ID", f"无效的description_category_id: {description_category_id}")
        if not type_id or int(type_id) <= 0:
            raise OzonListingError("INVALID_TYPE_ID", f"无效的type_id: {type_id}")
        
        return self._request("POST", "/v1/description-category/attribute", {
            "description_category_id": description_category_id,
            "type_id": type_id,
            "language": "ZH_HANS"
        })
    
    def import_product_images(self, items: List[Dict]) -> Dict:
        """
        上传产品图片 /v1/product/pictures/import
        
        适用场景: 为已有产品添加新图片
        
        请求格式:
        {
            "items": [
                {
                    "offer_id": "SKU-001",  # offer_id或product_id二选一
                    "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]
                }
            ]
        }
        
        返回格式:
        {
            "items": [
                {
                    "offer_id": "SKU-001",
                    "images": [
                        {"url": "https://example.com/img1.jpg", "status": "uploaded", "file_id": "img_xxx"}
                    ]
                }
            ]
        }
        """
        return self._request("POST", "/v1/product/pictures/import", {"items": items})
    
    def update_product_images_by_file_ids(self, product_id: int, images: List[Dict]) -> Dict:
        """
        更新已有产品的图片 /v2/product/pictures/update
        
        适用场景: 替换/重排已有产品的全部图片
        
        关键区别:
        - /v1/product/pictures/import: 仅用于添加图片到没有图片的产品
        - /v2/product/pictures/update: 用于替换/更新已有产品的图片(必须传file_id)
        
        流程:
        1. 先用 /v1/product/pictures/import 上传图片URL获取file_id
        2. 再用本接口将file_id绑定到产品
        
        Args:
            product_id: Ozon产品ID
            images: 图片列表, 每项含file_id和is_primary
                [{"file_id": 12345, "is_primary": True}, {"file_id": 12346}]
        
        Returns:
            更新结果
        """
        return self._request("POST", "/v2/product/pictures/update", {
            "items": [{"product_id": product_id, "images": images}]
        })
    
    def update_product_images_by_urls(self, product_id: int, image_urls: List[str]) -> Dict:
        """
        通过URL更新已有产品图片的完整流程
        
        流程:
        1. /v1/product/pictures/import 上传URL获取file_id
        2. /v2/product/pictures/update 用file_id替换产品图片
        
        Args:
            product_id: Ozon产品ID
            image_urls: 图片公开URL列表(第一张为主图)
        
        Returns:
            更新结果
        """
                                             
        import_result = self.import_product_images([{
            "product_id": product_id,
            "images": image_urls
        }])
        
                                      
        file_ids = []
        import_items = import_result.get("items", [])
        if import_items:
            for img in import_items[0].get("images", []):
                fid = img.get("file_id")
                if fid:
                    file_ids.append(fid)
        
        if not file_ids:
            raise OzonListingError("IMAGE_IMPORT_FAILED", 
                f"图片导入未返回file_id, result: {json.dumps(import_result, ensure_ascii=False)[:500]}")
        
                                                     
        images_payload = []
        for i, fid in enumerate(file_ids):
            images_payload.append({
                "file_id": fid,
                "is_primary": i == 0
            })

        return self.update_product_images_by_file_ids(product_id, images_payload)
    
    def create_products(self, items: List[Dict]) -> Dict:
        """
        创建/更新产品 /v3/product/import
        
        一次最多100个商品
        必填字段: name, offer_id, description_category_id, type_id, price, currency_code, 
                 images, attributes, width/height/depth, weight
        
        请求格式:
        {
            "items": [
                {
                    "name": "产品名称",
                    "offer_id": "SKU-001",
                    "description_category_id": 17028900,
                    "type_id": 1,
                    "price": 2990,
                    "currency_code": "RUB",
                    "images": [
                        {"file_id": "img_xxx", "is_primary": True}
                    ],
                    "attributes": [
                        {"id": 85, "values": [{"dictionary_value_id": 200000001}]}
                    ],
                    "width": 100,
                    "height": 100,
                    "depth": 50,
                    "weight": 50,
                    "barcode": "4601234567890"
                }
            ]
        }
        """
        if len(items) > 100:
            raise OzonListingError("BATCH_TOO_LARGE", "一次最多100个商品")
        
        return self._request("POST", "/v3/product/import", {"items": items})
    
    def get_import_info(self, task_id: str) -> Dict:
        """查询导入任务状态 /v1/product/import/info"""
        return self._request("POST", "/v1/product/import/info", {"task_id": task_id})
    
    def import_by_sku(self, items: List[Dict]) -> Dict:
        """
        通过SKU复制商品(跟卖) /v1/product/import-by-sku
        
        一次最多1000个商品
        必填字段: sku, name, offer_id, price, currency_code
        
        请求格式:
        {
            "items": [
                {
                    "sku": 298789742,
                    "name": "商品名称",
                    "offer_id": "pc-20260502-001",
                    "price": "2300",
                    "old_price": "2590",
                    "currency_code": "RUB",
                    "vat": "0.1"
                }
            ]
        }
        """
        if len(items) > 1000:
            raise OzonListingError("BATCH_TOO_LARGE", "一次最多1000个商品")
        
        return self._request("POST", "/v1/product/import-by-sku", {"items": items})
    
    def update_product_images(self, product_id: int, images: List[str],
                               images360: List[str] = None,
                               color_image: str = "") -> Dict:
        """
        上传/更新商品图片 /v1/product/pictures/import
        
        每次调用必须传递所有应出现在商品详情页的图片
        最多30张图片，数组中第一幅为主图
        
        Args:
            product_id: Ozon系统中的商品标识符
            images: 图片URL列表(最多30个)
            images360: 360度图片URL列表(可选)
            color_image: 营销颜色图片URL(可选)
        """
        if len(images) > 30:
            raise OzonListingError("IMAGES_TOO_MANY", "每件商品最多30张图片")
        
        payload = {
            "product_id": product_id,
            "images": images,
        }
        if images360:
            payload["images360"] = images360
        if color_image:
            payload["color_image"] = color_image
        
        return self._request("POST", "/v1/product/pictures/import", payload)
    
    def update_prices(self, prices: List[Dict]) -> Dict:
        """
        更新商品价格 /v1/product/import/prices
        
        每个商品每小时最多更新10次
        一次最多1000个
        
        Args:
            prices: 价格列表 [{"offer_id": "...", "price": "...", "old_price": "...", ...}]
        """
        if len(prices) > 1000:
            raise OzonListingError("BATCH_TOO_LARGE", "一次最多1000个价格更新")
        
        return self._request("POST", "/v1/product/import/prices", {"prices": prices})


class OzonListingService:
    """Ozon上架服务（v4.0）"""
    
    def __init__(self, config: OzonConfig, cos_uploader: COSUploader = None):
        self.client = OzonAPIClient(config)
        self.category_cache: Dict[int, List[Dict]] = {}
        self.dictionary_cache: Dict[int, List[Dict]] = {}
                            
        self.cos_uploader = cos_uploader or COSUploader()
        self.imgbb_uploader = ImgBBUploader()
                        
        self.use_full_attributes = True
        self.description_category_id = DEFAULT_DESCRIPTION_CATEGORY_ID
        self.type_id = DEFAULT_TYPE_ID
                               
        self._universal_filler_cache: Dict[str, UniversalAttributeFiller] = {}

    @staticmethod
    def _normalize_attr_value(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    def _compute_model_group_value(self, product: Dict, offer_id: str) -> str:
        for candidate in [
            product.get("group_key"),
            product.get("model_group_name"),
            product.get("model"),
            product.get("sku_model"),
            product.get("model_name"),
        ]:
            normalized = self._normalize_attr_value(candidate)
            if normalized:
                return normalized[:120]
        return offer_id

    def _ensure_attr_9048(self, attributes: List[Dict], value: str) -> List[Dict]:
        normalized = self._normalize_attr_value(value)
        result = [dict(attr) for attr in (attributes or [])]
        has_9048 = False
        for attr in result:
            if attr.get("id") == 9048:
                attr["values"] = [{"value": normalized}]
                has_9048 = True
                break
        if not has_9048:
            result.append({
                "complex_id": 0,
                "id": 9048,
                "values": [{"value": normalized}],
            })
        return result
    
    def get_category_tree(self, language: str = "ZH_HANS") -> List[Dict]:
        """获取完整类目树"""
        result = self.client.get_description_categories(language=language)
        return result.get("result", result.get("categories", []))
    
    def get_category_attributes(self, description_category_id: int, type_id: int) -> List[Dict]:
        """获取类目属性（带缓存）
        
        Args:
            description_category_id: 描述类目ID
            type_id: 产品类型ID（叶子节点才有）
            
        Returns:
            类目属性列表
            
        Raises:
            OzonListingError: 当类目ID无效时
        """
        if not description_category_id or description_category_id <= 0:
            raise OzonListingError("INVALID_CATEGORY_ID", f"无效的description_category_id: {description_category_id}")
        if not type_id or int(type_id) <= 0:
            raise OzonListingError("INVALID_TYPE_ID", f"无效的type_id: {type_id}")
        
        cache_key = f"{description_category_id}_{type_id}"
        if cache_key in self.category_cache:
            return self.category_cache[cache_key]
        
        attrs = self.client.get_category_attributes(description_category_id, type_id)
        result = attrs.get("result", attrs if isinstance(attrs, list) else [])
        self.category_cache[cache_key] = result
        return result
    
    def get_dictionary_values(self, dictionary_id: int) -> List[Dict]:
        """获取字典类型的预定义值"""
        if dictionary_id in self.dictionary_cache:
            return self.dictionary_cache[dictionary_id]
        
                              
        return []
    
    def upload_local_images_to_imgbb(self, image_paths: List[str]) -> Dict[str, str]:
        """
        将本地图片上传到ImgBB获取公开URL
        
        Args:
            image_paths: 本地图片路径列表
            
        Returns:
            {本地路径: ImgBB URL} 映射
        """
        print(f"上传 {len(image_paths)} 张本地图片到ImgBB...")
        return self.imgbb_uploader.batch_upload(image_paths)
    
    def is_local_path(self, path: str) -> bool:
        """判断是否为本地文件路径"""
        if path.startswith("http://") or path.startswith("https://"):
            return False
        return True

    def _download_image(self, url: str, timeout: int = 30) -> str:
        """下载远程图片到临时文件，返回本地路径。所有远程URL必须走COS，禁止直传"""
        import tempfile
        try:
            resp = requests.get(url, timeout=timeout)
            resp.raise_for_status()
            suffix = ".jpg"
            ct = resp.headers.get("content-type", "")
            if "png" in ct:
                suffix = ".png"
            elif "webp" in ct:
                suffix = ".webp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(resp.content)
            tmp.close()
            return tmp.name
        except Exception as e:
            print(f"  ✗ 下载远程图片失败 {url[:80]}: {e}")
            return ""
    
    def process_image_urls(self, images: List[str]) -> tuple:
        """
        处理图片列表，分离本地路径和网络URL
        
        Args:
            images: 图片路径列表（本地或URL混合）
            
        Returns:
            (本地路径列表, 网络URL列表, 映射信息)
        """
        local_paths = []
        remote_urls = []
        
        for img in images:
            if self.is_local_path(img):
                local_paths.append(img)
            else:
                remote_urls.append(img)
        
        return local_paths, remote_urls
    
    def upload_product_images(self, products: List[ProductImage]) -> Dict[str, List[str]]:
        """
        批量上传产品图片（v6.0：所有图片必须走COS公网）
        本地路径直接上传COS；远程URL先下载再上传COS，禁止直传任何远程URL
        
        Args:
            products: 产品图片列表
        
        Returns:
            {offer_id: [cos_url1, cos_url2, ...]} 映射 - 仅COS公网URL
        """
        import tempfile, os as _os
        
                                           
        all_local_paths = []
        remote_to_local = {}                     
        
        for p in products:
            for img in p.images:
                if self.is_local_path(img):
                    all_local_paths.append(img)
                else:
                                          
                    if img not in remote_to_local:
                        local_path = self._download_image(img)
                        if local_path:
                            remote_to_local[img] = local_path
                            all_local_paths.append(local_path)
                        else:
                            print(f"  ✗ 远程图片下载失败，跳过: {img[:80]}")
        
                              
        local_to_url = {}
        if all_local_paths:
            print(f"上传 {len(all_local_paths)} 张图片到COS...")
            try:
                local_to_url = self.cos_uploader.batch_upload(all_local_paths)
            except OzonListingError as e:
                print(f"  ✗ COS上传失败({e.message})，回退到ImgBB...")
                local_to_url = self.upload_local_images_to_imgbb(all_local_paths)
        
                                            
        image_urls: Dict[str, List[str]] = {}
        failed_images = []
        
        for p in products:
            url_list = []
            for img in p.images:
                           
                local_key = remote_to_local.get(img, img) if not self.is_local_path(img) else img
                cos_url = local_to_url.get(local_key, "")
                if cos_url:
                    url_list.append(cos_url)
                else:
                    failed_images.append(img[:80])
            
            image_urls[p.offer_id] = url_list
            if url_list:
                print(f"  ✅ {p.offer_id}: {len(url_list)} 张COS图片")
            else:
                print(f"  ✗ {p.offer_id}: 图片全部上传失败")
        
        if failed_images:
            print(f"  ⚠️ {len(failed_images)} 张图片上传COS失败，Ozon将无法访问")
        
                          
        for local_path in remote_to_local.values():
            try:
                _os.unlink(local_path)
            except Exception:
                pass
        
        return image_urls
    
    def _get_universal_filler(self, description_category_id: int, type_id: int) -> UniversalAttributeFiller:
        """
        获取或创建通用属性填充器（带缓存）
        
        Args:
            description_category_id: 描述类目ID
            type_id: 产品类型ID
        
        Returns:
            UniversalAttributeFiller实例
        """
        cache_key = f"{description_category_id}_{type_id}"
        
        if cache_key not in self._universal_filler_cache:
            try:
                self._universal_filler_cache[cache_key] = UniversalAttributeFiller(
                    description_category_id=description_category_id,
                    type_id=type_id,
                    ozon_client_id=self.client.config.client_id,
                    ozon_api_key=self.client.config.api_key
                )
                print(f"✅ 通用属性填充器已创建 (类目: {description_category_id}, 类型: {type_id})")
            except Exception as e:
                print(f"❌ 通用属性填充器创建失败: {e}")
                raise
        
        return self._universal_filler_cache[cache_key]
    
    def create_product_listings(
        self,
        products: List[Dict],
        image_urls: Dict[str, List[str]] = None,
        use_full_attributes: bool = True,
        use_universal_filler: bool = True
    ) -> Dict:
        """
        创建产品列表（v5.0：支持通用属性填充器）
        
        Args:
            products: 产品信息列表
            image_urls: 图片URL映射 {offer_id: [url1, url2, ...]}
            use_full_attributes: 是否使用全量属性填充（默认True）
            use_universal_filler: 是否使用通用属性填充器（支持任意类目，默认True）
        
        Returns:
            任务结果
        """
        prepared = self.prepare_product_items(
            products,
            image_urls=image_urls,
            use_universal_filler=use_universal_filler,
        )
        all_items = prepared["items"]
        precheck_summary = prepared["precheck"]

                        
        results = []
        for i in range(0, len(all_items), 100):
            batch = all_items[i:i+100]
            print(f"创建产品批次 {i//100 + 1} ({len(batch)} 个产品)...")
            
            result = self.client.create_products(batch)
                                                           
            result_data = result.get("result", result)
            task_id = result_data.get("task_id", "")
            
                                  
            if not task_id:
                error_msg = result_data.get("message", result.get("message", "未知错误"))
                print(f"  ✗ 创建失败: {error_msg}")
                results.append({
                    "task_id": "",
                    "status": "failed",
                    "error": error_msg,
                    "products_count": len(batch)
                })
                continue
            
                              
            import_status = self._poll_import_status(task_id)
            
            results.append({
                "task_id": task_id,
                "status": import_status.get("status", "unknown"),
                "products_count": len(batch),
                "failed_items": import_status.get("failed_items", []),
                "detail": import_status.get("detail", "")
            })
            
            if import_status.get("status") == "success":
                print(f"  ✅ 任务 {task_id}: 全部成功 ({len(batch)} 个产品)")
            elif import_status.get("status") == "partial":
                failed_count = len(import_status.get("failed_items", []))
                print(f"  ⚠️ 任务 {task_id}: 部分成功，{failed_count} 个失败")
                for fi in import_status.get("failed_items", [])[:3]:
                    print(f"      - {fi.get('offer_id', '?')}: {fi.get('errors', [])}")
            else:
                print(f"  ✗ 任务 {task_id}: {import_status.get('detail', '导入失败')}")
        
        return {"tasks": results, "precheck": precheck_summary}

    def prepare_product_items(
        self,
        products: List[Dict],
        image_urls: Dict[str, List[str]] = None,
        use_universal_filler: bool = True,
    ) -> Dict:
        """提交前构建产品 items，并返回本地属性完整性预检结果。"""
                           
        products_by_category: Dict[str, List[Dict]] = {}
        
        for product in products:
            desc_cat_id = product.get("description_category_id", self.description_category_id)
            t_id = product.get("type_id", self.type_id)
            key = f"{desc_cat_id}_{t_id}"
            
            if key not in products_by_category:
                products_by_category[key] = []
            products_by_category[key].append(product)
        
                 
        all_items = []
        precheck_summary = {
            "total_products": len(products),
            "local_ready": True,
            "missing_required_attributes": [],
            "products_with_missing_required": [],
            "attribute_quality_threshold": ATTRIBUTE_QUALITY_THRESHOLD,
            "attribute_quality_pass": True,
            "attribute_coverage_score": 100,
            "attribute_coverage_ratio": 1.0,
            "products_below_quality_threshold": [],
        }
        
        for cat_key, cat_products in products_by_category.items():
            desc_cat_id, t_id = cat_key.split("_")
            desc_cat_id = int(desc_cat_id)
            t_id = int(t_id)
            
            print(f"\n处理类目 {desc_cat_id} (类型: {t_id}), 产品数: {len(cat_products)}")
            
                              
            attribute_filler = None
            if self.use_full_attributes and use_universal_filler:
                try:
                    attribute_filler = self._get_universal_filler(desc_cat_id, t_id)
                    print(f"✅ 通用属性填充器已初始化 (类目: {desc_cat_id})")
                except Exception as e:
                    print(f"⚠️ 通用属性填充器初始化失败: {e}")
                    attribute_filler = None
            
                   
            for product in cat_products:
                offer_id = product.get("offer_id")
                
                                         
                product_images = image_urls.get(offer_id, []) if image_urls else product.get("images", [])
                                 
                if product_images and isinstance(product_images, list):
                                                
                    if isinstance(product_images[0], dict):
                        product_images = [img.get("url", "") for img in product_images]
                
                                                    
                attributes = []
                skipped_required_attrs = []
                filler_description = ""
                
                if self.use_full_attributes and attribute_filler:
                    try:
                        fill_result = attribute_filler.fill_attributes(product)
                        completeness_score = 100
                        completeness_ratio = 1.0
                        quality_gate_pass = True
                        if isinstance(fill_result, dict):
                            attributes = fill_result.get("attributes", [])
                            skipped_required_attrs = fill_result.get("skipped_required", [])
                            filler_description = fill_result.get("description", "")
                            completeness_score = int(fill_result.get("completeness_score", 100) or 0)
                            completeness_ratio = float(fill_result.get("completeness_ratio", 1.0) or 0.0)
                            quality_gate_pass = bool(fill_result.get("quality_gate_pass", not skipped_required_attrs))
                        else:
                            attributes = fill_result
                        print(f"  ✅ {offer_id}: 填充 {len(attributes)} 个属性")
                        precheck_summary["attribute_coverage_score"] = min(precheck_summary["attribute_coverage_score"], completeness_score)
                        precheck_summary["attribute_coverage_ratio"] = min(precheck_summary["attribute_coverage_ratio"], completeness_ratio)
                        if skipped_required_attrs:
                            print(f"  ⚠️ {offer_id}: {len(skipped_required_attrs)} 个必填属性无法匹配字典值")
                            precheck_summary["local_ready"] = False
                            precheck_summary["products_with_missing_required"].append({
                                "offer_id": offer_id,
                                "skipped_required": skipped_required_attrs,
                            })
                            for attr_name in skipped_required_attrs:
                                if attr_name not in precheck_summary["missing_required_attributes"]:
                                    precheck_summary["missing_required_attributes"].append(attr_name)
                        if not quality_gate_pass:
                            precheck_summary["local_ready"] = False
                            precheck_summary["attribute_quality_pass"] = False
                            precheck_summary["products_below_quality_threshold"].append({
                                "offer_id": offer_id,
                                "completeness_score": completeness_score,
                                "completeness_ratio": completeness_ratio,
                            })
                    except Exception as e:
                        print(f"  ✗ {offer_id}: 属性填充失败: {e}")
                        attributes = self._process_product_attributes(product.get("attributes", []))
                else:
                    attributes = self._process_product_attributes(product.get("attributes", []))
                
                                     
                dims = product.get("dimensions", [100, 100, 50])
                if isinstance(dims, (list, tuple)) and len(dims) >= 3:
                    width = float(dims[0])
                    height = float(dims[1])
                    depth = float(dims[2])
                else:
                    width, height, depth = 100.0, 100.0, 50.0

                                     
                weight = product.get("weight", 100)
                try:
                    weight = float(weight)
                except (ValueError, TypeError):
                    weight = 100.0

                                  
                price = product.get("price", "0")
                if isinstance(price, (int, float)):
                    price = str(price)

                                     
                                                
                description = filler_description or product.get("description", "")
                if not description:
                    description = self._generate_description(product, attributes)
                
                item = {
                    "name": product.get("name"),
                    "offer_id": offer_id,
                    "description_category_id": product.get("description_category_id", desc_cat_id),
                    "type_id": product.get("type_id", t_id),
                    "price": price,
                    "old_price": product.get("old_price", ""),
                    "currency_code": product.get("currency_code", "CNY"),
                    "vat": product.get("vat", "0"),
                    "images": product_images,
                    "attributes": attributes,
                    "description": description,
                    "width": width,
                    "height": height,
                    "depth": depth,
                    "weight": weight,
                    "weight_unit": product.get("weight_unit", "g"),
                    "dimension_unit": product.get("dimension_unit", "mm"),
                    "barcode": product.get("barcode", ""),
                }
                if product_images:
                    item["primary_image"] = product_images[0]
                
                                                    
                                                                                             
                sizes = product.get("sizes", [])
                attr_9048_value = self._compute_model_group_value(product, offer_id)
                
                if sizes and len(sizes) > 1:
                    for size_val in sizes:
                        variant_item = dict(item)
                                                     
                        variant_offer_id = f"{offer_id}-{size_val}"
                        variant_item["offer_id"] = variant_offer_id
                        
                        variant_attrs = self._ensure_attr_9048(attributes, attr_9048_value)
                        
                                                                                                    
                        size_attr_id = product.get("size_attribute_id", 4193)
                        for a in variant_attrs:
                            if a.get("id") == size_attr_id:
                                a["values"] = [{"dictionary_value_id": 0, "value": size_val}]
                                break
                        
                        variant_item["attributes"] = variant_attrs
                        all_items.append(variant_item)
                    
                    print(f"  ✅ {offer_id}: Multi-SKU → {len(sizes)} variants (9048={attr_9048_value})")
                else:
                    item["attributes"] = self._ensure_attr_9048(attributes, attr_9048_value)
                    all_items.append(item)
        return {"items": all_items, "precheck": precheck_summary}
    
    def _generate_description(self, product: Dict, attributes: List[Dict]) -> str:
        """根据产品信息和属性生成Ozon富文本描述，提升内容评级"""
        name = product.get("name", "")
        
                    
        attr_map = {}
        for a in attributes:
            aid = a.get("id")
            vals = a.get("values", [])
            if vals:
                v = vals[0]
                if v.get("dictionary_value_id"):
                    attr_map[aid] = v["dictionary_value_id"]
                elif v.get("value"):
                    attr_map[aid] = v["value"]
        
                 
        parts = [f"<h2>{name}</h2>"]
        parts.append(f"<p>Высококачественный товар для повседневного использования.</p>")
        
                
        feature_lines = []
        for a in attributes:
            vals = a.get("values", [])
            if vals:
                v = vals[0]
                val_str = v.get("value", "") or v.get("dictionary_value_id", "")
                if val_str:
                    feature_lines.append(f"<li>{val_str}</li>")
        
        if feature_lines:
            parts.append("<h3>Характеристики:</h3><ul>" + "".join(feature_lines) + "</ul>")
        
              
        parts.append("<p>Закажите сейчас с быстрой доставкой!</p>")
        
        return "".join(parts)

    def _poll_import_status(self, task_id: str, max_wait: int = 60) -> Dict:
        """轮询Ozon导入任务状态，返回实际结果"""
        import time
        start = time.time()
        while time.time() - start < max_wait:
            try:
                info = self.client.get_import_info(task_id)
            except Exception as e:
                return {"status": "error", "detail": f"查询任务状态失败: {e}"}
            
            items = info.get("result", {}).get("items", [])
            if not items:
                       
                time.sleep(3)
                continue
            
                       
            failed_items = []
            all_done = True
            for item in items:
                status = item.get("status", "")
                if status == "imported":
                    continue
                elif status == "failed":
                    errors = [e.get("message", "") for e in item.get("errors", [])]
                    failed_items.append({
                        "offer_id": item.get("offer_id", ""),
                        "product_id": item.get("product_id", ""),
                        "errors": errors
                    })
                else:
                    all_done = False
            
            if all_done or failed_items:
                if not failed_items:
                    return {"status": "success"}
                elif len(failed_items) < len(items):
                    return {"status": "partial", "failed_items": failed_items}
                else:
                    return {"status": "failed", "failed_items": failed_items,
                            "detail": "; ".join(failed_items[0].get("errors", ["全部失败"])[:3])}
            
            time.sleep(3)
        
        return {"status": "timeout", "detail": f"等待超过{max_wait}秒，任务仍在处理中"}
    
    def _process_product_attributes(self, attributes: List[Dict]) -> List[Dict]:
        """
        处理产品属性（兼容原有逻辑）
        
        Args:
            attributes: 属性列表
        
        Returns:
            处理后的属性列表
        """
        result = []
        for attr in attributes:
            attr_id = attr.get("id")
            values = attr.get("values", [])
            
                                          
            if attr.get("type") == "dictionary" and values:
                result.append({
                    "id": attr_id,
                    "values": [{"dictionary_value_id": v.get("dictionary_value_id", v)} for v in values]
                })
            else:
                result.append(attr)
        
        return result
    
    def check_listing_status(self, task_ids: List[str]) -> Dict:
        """检查上架状态"""
        statuses = []
        
        for task_id in task_ids:
            result = self.client.get_import_info(task_id)
            statuses.append({
                "task_id": task_id,
                "status": result
            })
        
        return {"statuses": statuses}


def load_products_from_file(file_path: str) -> List[Dict]:
    """从JSON文件加载产品数据"""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    if isinstance(data, list):
        return data
    elif isinstance(data, dict):
        return [data]
    else:
        raise ValueError(f"不支持的数据格式: {type(data)}")


def save_result(result: Dict, output_path: str):
    """保存结果到文件"""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Ozon商品上架 v5.0")
    parser.add_argument("--file", "-f", help="商品JSON文件路径")
    parser.add_argument("--mode", "-m", choices=["all", "upload-images", "create-products", "status"],
                        default="all", help="执行模式")
    parser.add_argument("--task-id", "-t", help="任务ID（查询状态用）")
    parser.add_argument("--output", "-o", help="输出文件路径")
    parser.add_argument("--category-id", "-c", type=int, default=DEFAULT_DESCRIPTION_CATEGORY_ID, 
                        help=f"描述类目ID (默认: {DEFAULT_DESCRIPTION_CATEGORY_ID})")
    parser.add_argument("--type-id", type=int, default=DEFAULT_TYPE_ID,
                        help=f"产品类型ID (默认: {DEFAULT_TYPE_ID})")
    parser.add_argument("--batch-size", "-b", type=int, default=10, help="每批处理数量")
    parser.add_argument("--no-full-attrs", action="store_true", 
                        help="禁用全量属性填充（仅填充必填属性）")
    parser.add_argument("--no-universal", action="store_true",
                        help="禁用通用属性填充器（使用旧版OzonAttributeFiller）")
    
    args = parser.parse_args()
    
           
    runtime_cfg = _get_runtime_config()
    config = OzonConfig(
        client_id=runtime_cfg.ozon_client_id,
        api_key=runtime_cfg.ozon_api_key,
        api_url=runtime_cfg.ozon_api_url,
    )
    
    service = OzonListingService(config)
    
                       
    if args.category_id:
        service.description_category_id = args.category_id
    if args.type_id:
        service.type_id = args.type_id
    service.use_full_attributes = not args.no_full_attrs
    use_universal = not args.no_universal
    
    print(f"=" * 60)
    print(f"Ozon商品上架 v5.0")
    print(f"=" * 60)
    print(f"描述类目ID: {service.description_category_id}")
    print(f"产品类型ID: {service.type_id}")
    print(f"全量属性填充: {'开启' if service.use_full_attributes else '关闭'}")
    print(f"通用属性填充器: {'开启' if use_universal else '关闭'}")
    print(f"=" * 60)
    
          
    if args.mode == "upload-images":
                 
        if not args.file:
            print("错误: upload-images 模式需要 --file 参数")
            sys.exit(1)
        
        products = load_products_from_file(args.file)
        
                  
        product_images = []
        for p in products:
            images = p.get("images", [])
            if images:
                product_images.append(ProductImage(
                    offer_id=p.get("offer_id", p.get("sku", "")),
                    images=images
                ))
        
        image_urls = service.upload_product_images(product_images)
        
        result = {"image_urls": image_urls}
        if args.output:
            save_result(result, args.output)
    
    elif args.mode == "create-products":
                          
        if not args.file:
            print("错误: create-products 模式需要 --file 参数")
            sys.exit(1)
        
        data = load_products_from_file(args.file)
        products = data.get("products", [])
        image_urls = data.get("image_urls", data.get("image_mapping", {}))
        
        result = service.create_product_listings(products, image_urls, use_universal=use_universal)
        
        if args.output:
            save_result(result, args.output)
    
    elif args.mode == "status":
                
        if not args.task_id:
            print("错误: status 模式需要 --task-id 参数")
            sys.exit(1)
        
        result = service.check_listing_status([args.task_id])
        
        if args.output:
            save_result(result, args.output)
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    
    else:
                          
        if not args.file:
            print("错误: 需要提供 --file 参数指定商品数据文件")
            sys.exit(1)
        
        products_data = load_products_from_file(args.file)
        products = products_data if isinstance(products_data, list) else [products_data]
        
        print(f"=" * 60)
        print(f"开始处理 {len(products)} 个产品")
        print(f"=" * 60)
        
                          
        print("\n[Step 1] 准备上传图片...")
        product_images = []
        for p in products:
            images = p.get("images", [])
            if images:
                product_images.append(ProductImage(
                    offer_id=p.get("offer_id", p.get("sku", "")),
                    images=images
                ))
        
                          
        print("\n[Step 2] 上传图片到腾讯云COS...")
        image_urls = service.upload_product_images(product_images)
        
                      
        print("\n[Step 3] 创建产品...")
        result = service.create_product_listings(products, image_urls, use_universal=use_universal)
        
            
        print("\n" + "=" * 60)
        print("汇总")
        print("=" * 60)
        for task in result.get("tasks", []):
            print(f"✅ Task ID: {task['task_id']} | 产品数: {task['products_count']}")
        
        if args.output:
            full_result = {
                "products_count": len(products),
                "image_urls": image_urls,
                "tasks": result.get("tasks", [])
            }
            save_result(full_result, args.output)


if __name__ == "__main__":
    main()

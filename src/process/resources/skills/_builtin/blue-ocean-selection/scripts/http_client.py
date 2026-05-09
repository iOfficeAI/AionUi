"""
HTTP请求兼容层
- Coze运行环境: 使用coze_workload_identity（自动处理出站代理和凭证注入）
- 开发/测试环境: 回退到标准requests库
"""
import os

try:
    from coze_workload_identity import requests as _coze_requests
    # 检查运行环境是否已配置出站代理
    if os.environ.get('COZE_OUTBOUND_AUTH_PROXY'):
        requests = _coze_requests
    else:
        import requests as _std_requests
        requests = _std_requests
except ImportError:
    import requests as _std_requests
    requests = _std_requests

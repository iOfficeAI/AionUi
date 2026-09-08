import type en from './en';
const messages: Record<keyof typeof en, string> = {
  pageTitle: 'AionUi API',
  title: 'AionUi 客户端接口参考 · {{target}}',
  perspective: '静态扫描；客户端类型预期，不代表服务端完整契约。',
  evidence: '客户端调用证据；服务端状态码、原始响应包装及权限未验证。',
  query: '客户端表达式中出现；类型与必填性未验证。',
  body: '客户端构造的请求体类型；服务端约束未验证。',
  response: '客户端解包后的预期类型：{{type}}。不代表服务端原始响应契约。',
  inventoryTitle: '客户端接口扫描',
  scope:
    '范围：{{scope}}；源码文件：{{files}}；候选调用记录：{{candidates}}（已解析：{{resolved}}，部分解析：{{partial}}，未知：{{unknown}}）；归并接口：{{endpoints}}。',
  httpHeader: '| 服务 | 方法 | 路径／表达式 | Query | 请求体 | 客户端响应类型 | 状态／原因 | 来源 |',
  websocketTitle: 'WebSocket 事件清单',
  websocketHeader: '| 方向 | 事件／表达式 | 连接 | 载荷 Schema | 状态／原因 | 来源 |',
};
export default messages;

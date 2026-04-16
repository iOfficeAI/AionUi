# Team Model Switching — 目标文档

## 背景

AionUi 的 Team mode 当前只能选择 agent 类型，无法选择或指定模型。需要补齐模型选择能力。

## 需求

1. agent 推荐团队阵容时，同时推荐模型类型
2. agent 视角中需要有每种支持 team 的 agent 的模型列表枚举
3. 用户可以查看和切换 team 成员的模型

## 验收标准

- 推荐阵容接口/逻辑包含模型推荐
- agent 定义中包含可用模型枚举
- 模型选择在 UI 上可操作
- 现有功能无回归

# 多语言支持 (i18n)

本项目使用 i18next 和 react-i18next 实现多语言支持。

## 支持的语言

- 中文 (zh-CN) - 默认语言
- 英文 (en-US)

## 文件结构

```
src/renderer/i18n/
├── index.ts              # i18next 配置文件
├── locales/
│   ├── zh-CN.json        # 中文语言包
│   └── en-US.json        # 英文语言包
└── README.md             # 说明文档
```

## 使用方法

### 在组件中使用翻译

```tsx
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('common.description')}</p>
    </div>
  );
};
```

### 切换语言

```tsx
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div>
      <button onClick={() => changeLanguage('zh-CN')}>中文</button>
      <button onClick={() => changeLanguage('en-US')}>English</button>
    </div>
  );
};
```

## 添加新的翻译

1. 在 `src/renderer/i18n/locales/zh-CN.json` 中添加中文翻译
2. 在 `src/renderer/i18n/locales/en-US.json` 中添加对应的英文翻译
3. 在组件中使用 `t('key')` 来获取翻译

### 翻译键的命名规范

- 使用点号分隔的层级结构
- 使用小写字母和下划线
- 按功能模块分组

例如：

```json
{
  "common": {
    "send": "发送",
    "cancel": "取消"
  },
  "conversation": {
    "welcome": {
      "title": "今天有什么安排？"
    }
  }
}
```

## 语言切换器

项目在顶部导航栏中集成了语言切换器，用户可以随时切换界面语言。语言选择会保存在 localStorage 中，下次访问时会自动应用上次选择的语言。

## 注意事项

1. 所有用户可见的文本都应该使用翻译函数
2. 翻译键应该具有描述性，便于维护
3. 新增翻译时，确保中英文都有对应的翻译
4. 避免在代码中硬编码文本内容

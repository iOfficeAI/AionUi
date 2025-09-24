# 应用内自动更新数据模型

**阶段 1 输出**: 实体定义和关系  
**日期**: 2025-01-22  
**来源**: [应用内自动更新规格](./spec.md)

## 核心实体

### 版本信息 (Version Info)
表示应用程序版本相关信息的核心实体。

**属性**:
- `current`: 当前安装的版本号 (semver格式)
- `latest`: 服务器上的最新版本号
- `minimum`: 支持的最低版本号
- `releaseDate`: 最新版本发布日期
- `releaseNotes`: 版本更新日志
- `downloadUrl`: 更新包下载地址
- `fileSize`: 更新包文件大小
- `checksum`: 文件校验和 (SHA256)
- `signature`: 数字签名信息
- `isForced`: 是否为强制更新
- `isSecurityUpdate`: 是否为安全更新

**关系**:
- 被多个 `更新会话` 引用
- 与一个 `更新配置` 关联

**验证规则**:
- `current` 和 `latest` 必须符合 semver 格式
- `checksum` 必须是64位十六进制字符串
- `fileSize` 必须为正整数
- `downloadUrl` 必须是有效的HTTPS URL

### 更新包 (Update Package)
表示具体的更新文件和相关元数据。

**属性**:
- `id`: 唯一包标识符 (UUID)
- `version`: 目标版本号
- `platform`: 目标平台 (`win32` | `darwin` | `linux`)
- `arch`: 目标架构 (`x64` | `arm64` | `ia32`)
- `type`: 包类型 (`full` | `delta` | `patch`)
- `files`: 包含的文件列表
- `baseVersion`: 增量更新的基础版本
- `downloadUrl`: 下载地址
- `fileSize`: 文件大小（字节）
- `checksum`: SHA256 校验和
- `signature`: 数字签名
- `compressionType`: 压缩类型 (`gzip` | `brotli` | `none`)
- `createdAt`: 包创建时间
- `expiresAt`: 包过期时间

**关系**:
- 属于一个 `版本信息`
- 被多个 `更新会话` 使用

**验证规则**:
- `platform` 和 `arch` 组合必须有效
- `type` 为 `delta` 时必须有 `baseVersion`
- `checksum` 和 `signature` 不能为空
- `expiresAt` 必须晚于 `createdAt`

### 更新会话 (Update Session)
跟踪单次更新操作的运行时实体。

**属性**:
- `id`: 唯一会话标识符 (UUID)
- `fromVersion`: 起始版本
- `toVersion`: 目标版本
- `status`: 更新状态 (`checking` | `downloading` | `installing` | `completed` | `failed` | `cancelled`)
- `progress`: 进度百分比 (0-100)
- `bytesDownloaded`: 已下载字节数
- `totalBytes`: 总字节数
- `downloadSpeed`: 下载速度 (bytes/second)
- `estimatedTimeRemaining`: 预计剩余时间 (秒)
- `currentStep`: 当前步骤描述
- `errorMessage`: 错误信息
- `errorCode`: 错误代码
- `startedAt`: 开始时间
- `completedAt`: 完成时间
- `userInitiated`: 是否用户主动发起
- `backgroundDownload`: 是否后台下载

**关系**:
- 引用一个 `版本信息`
- 引用一个 `更新包`
- 关联一个 `更新配置`

**验证规则**:
- `progress` 必须在 0-100 之间
- `bytesDownloaded` 不能超过 `totalBytes`
- `downloadSpeed` 必须为非负数
- 状态转换必须遵循定义的生命周期

**状态转换**:
```
checking → downloading → installing → completed
checking → failed (检查失败时)
downloading → failed (下载失败时)
downloading → cancelled (用户取消时)
installing → failed (安装失败时)
failed → checking (重试时)
```

### 更新配置 (Update Configuration)
用户定义的更新偏好设置。

**属性**:
- `id`: 配置标识符
- `autoCheck`: 是否自动检查更新
- `checkInterval`: 检查间隔 (小时)
- `downloadInBackground`: 是否后台下载
- `autoInstall`: 是否自动安装
- `notificationLevel`: 通知级别 (`all` | `important` | `silent`)
- `allowPrerelease`: 是否允许预发布版本
- `downloadOnlyOnWifi`: 是否仅在WiFi下载载 (移动设备)
- `maxDownloadSpeed`: 最大下载速度限制 (KB/s, 0为无限制)
- `installTime`: 首选安装时间 (`immediate` | `idle` | `shutdown`)
- `backupBeforeUpdate`: 是否更新前备份
- `skipVersion`: 跳过的版本号
- `lastCheckTime`: 上次检查时间
- `userId`: 关联的用户ID

**关系**:
- 被多个 `更新会话` 引用
- 关联 `更新历史` 记录

**验证规则**:
- `checkInterval` 必须在 1-168 小时之间
- `maxDownloadSpeed` 必须为非负数
- `notificationLevel` 必须是预定义值之一
- `skipVersion` 必须符合 semver 格式（如果设置）

### 更新历史 (Update History)
记录历史更新操作的审计实体。

**属性**:
- `id`: 历史记录ID (UUID)
- `fromVersion`: 更新前版本
- `toVersion`: 更新后版本
- `updateType`: 更新类型 (`major` | `minor` | `patch` | `hotfix`)
- `status`: 最终状态 (`success` | `failed` | `rollback`)
- `startTime`: 开始时间
- `endTime`: 结束时间
- `duration`: 耗时 (毫秒)
- `filesChanged`: 变更文件数量
- `downloadSize`: 下载大小
- `errorDetails`: 错误详情 (如果失败)
- `rollbackReason`: 回滚原因 (如果回滚)
- `platform`: 更新时的平台
- `userAgent`: 用户代理信息
- `ipAddress`: 客户端IP地址
- `buildId`: 构建标识符

**关系**:
- 引用原始 `更新会话`
- 关联 `更新配置`

**验证规则**:
- `endTime` 必须晚于 `startTime`
- `duration` 必须匹配时间差
- `downloadSize` 必须为非负数
- `status` 为 `failed` 时必须有 `errorDetails`

## 数据关系

### 主要关系
```
版本信息 (1) ←→ (多个) 更新包
版本信息 (1) ←→ (多个) 更新会话
更新包 (1) ←→ (多个) 更新会话
更新配置 (1) ←→ (多个) 更新会话
更新会话 (1) ←→ (1) 更新历史
更新配置 (1) ←→ (多个) 更新历史
```

### 跨实体查询
```sql
-- 获取用户的最新更新检查信息
SELECT vi.latest, vi.releaseDate, uc.lastCheckTime
FROM version_info vi, update_configuration uc
WHERE uc.userId = ? 
ORDER BY uc.lastCheckTime DESC
LIMIT 1

-- 获取正在进行的更新会话
SELECT us.* FROM update_sessions us
WHERE us.status IN ('checking', 'downloading', 'installing')
AND us.userId = ?

-- 获取更新成功率统计
SELECT 
  COUNT(*) as totalAttempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulUpdates,
  AVG(duration) as averageDuration
FROM update_history 
WHERE userId = ? 
AND startTime > (NOW() - INTERVAL 90 DAY)

-- 获取平台更新分布
SELECT 
  platform,
  COUNT(*) as updateCount,
  AVG(downloadSize) as avgDownloadSize
FROM update_history
WHERE status = 'success'
GROUP BY platform
ORDER BY updateCount DESC
```

## 业务规则

### 版本兼容性
- 主版本升级可能需要用户确认
- 跨多个主版本的更新应强制完整包下载
- 预发布版本只对开启相应选项的用户可见

### 下载策略
- 增量更新优先，回退到完整包
- 网络条件差时自动降级到较小的包
- 支持断点续传和多线程下载

### 安装时机
- 空闲时安装：检测用户无操作5分钟后
- 关闭时安装：应用关闭时提示安装
- 立即安装：安全更新强制立即安装

### 回滚机制
- 自动备份关键文件和配置
- 启动失败时自动回滚到上一版本
- 用户可手动触发回滚（7天内）
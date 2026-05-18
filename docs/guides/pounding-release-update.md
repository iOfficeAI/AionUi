# POUNDING 发布与自动更新链路

本文档描述当前桌面端 **POUNDING** 的发布、下载与自动更新链路，以及后续切换到自有国内更新源时需要满足的条件。

## 当前默认更新线路

当前仓库已默认切换到：

- GitHub 仓库：`halojerry/AionUi-2.0.2-dev-a3881e2`
- 桌面发布源：GitHub Releases
- 应用产品名：`POUNDING`

代码侧当前有两条更新路径：

1. **手动更新检查 / 下载**
   - 读取 GitHub Releases 版本信息
   - 下载地址默认拼接到当前仓库的 Releases 下载路径
2. **electron-updater 自动更新**
   - 默认读取打包后的 `app-update.yml`
   - 可通过运行时环境变量改为自有 generic feed

## 已支持的运行时环境变量

### 1. `AIONUI_GITHUB_REPO`

覆盖默认仓库，格式：

```bash
AIONUI_GITHUB_REPO=halojerry/AionUi-2.0.2-dev-a3881e2
```

用途：

- 手动更新检查时覆盖 GitHub Releases API 的目标仓库
- 自动更新时，如果未配置 generic feed，可作为 GitHub provider 的运行时覆盖

### 2. `AIONUI_UPDATE_BASE_URL`

覆盖“手动下载更新包”的基础下载地址：

```bash
AIONUI_UPDATE_BASE_URL=https://download.example.com/releases/download
```

代码会把更新包 URL 组装成：

```text
${AIONUI_UPDATE_BASE_URL}/${version}/${assetName}
```

例如：

```text
https://download.example.com/releases/download/2.0.3/POUNDING-2.0.3-win-x64.exe
```

适合：

- 国内 CDN
- COS / OSS 静态托管
- 自建下载域名

### 3. `AIONUI_AUTO_UPDATE_URL`

覆盖 `electron-updater` 的自动更新源，要求是 **generic feed 根目录**：

```bash
AIONUI_AUTO_UPDATE_URL=https://download.example.com/releases/latest
```

该目录下必须能访问：

- `latest.yml`
- `latest-win-arm64.yml`
- `latest-mac.yml`
- `latest-arm64-mac.yml`
- `latest-linux.yml`
- `latest-linux-arm64.yml`
- 对应安装包
- 建议同时带上 `.blockmap`

## 推荐的 POUNDING 正式线路

推荐拆成两层：

### 层 1：GitHub Releases

作用：

- 作为事实上的“源站发布记录”
- 保存正式 Release、安装包、更新元数据
- 便于开源同步与审计

### 层 2：国内分发源

作用：

- 让国内用户更稳定下载
- 提供自动更新所需的 generic feed

推荐域名示例：

- `https://download.api.mxou.cn/releases/download/<version>/...`
- `https://download.api.mxou.cn/releases/latest/latest.yml`

建议做法：

1. GitHub Release 产出所有资产
2. CI 将 Release 资产镜像到国内对象存储 / CDN（推荐腾讯云 COS）
3. 桌面客户端在生产环境设置：

```bash
AIONUI_UPDATE_BASE_URL=https://download.api.mxou.cn/releases/download
AIONUI_AUTO_UPDATE_URL=https://download.api.mxou.cn/releases/latest
```

## GitHub Actions 现状

### `build-and-release.yml`

负责：

- 构建多平台桌面包
- 归拢 `latest*.yml`
- 创建 GitHub Release

Release 中已上传：

- 安装包
- `latest*.yml`
- web-cli tarball 与校验文件
- `install-web.sh`

### `release-distribute.yml`

负责：

- 在 Release 发布后，把资产镜像到外部分发存储

当前要求同步的文件类型包括：

- `*.exe`
- `*.msi`
- `*.dmg`
- `*.deb`
- `*.zip`
- `*.yml`
- `*.blockmap`
- `*.tar.gz`
- `*.sha256`
- `install-web.sh`

> 若你的国内更新源要承载 `electron-updater`，`latest*.yml` 必须与对应安装包一起发布。

## 目录建议

建议外部分发目标同时保留两套目录：

### 1. 版本目录

```text
releases/2.0.3/POUNDING-2.0.3-win-x64.exe
releases/2.0.3/POUNDING-2.0.3-mac-arm64.dmg
...
```

### 2. latest 目录

```text
releases/latest/latest.yml
releases/latest/latest-mac.yml
releases/latest/latest-arm64-mac.yml
releases/latest/latest-linux.yml
releases/latest/latest-linux-arm64.yml
releases/latest/latest-win-arm64.yml
```

其中：

- **手动下载** 更适合使用版本目录
- **自动更新** 更适合使用 latest 目录

## 国内发布建议

如果未来只保留你自己的发布线，建议使用：

- GitHub Release：归档与对外公开版本记录
- COS / OSS / R2：国内分发
- CDN / 自有域名：稳定下载入口

优先级建议：

1. 先保证 GitHub Release 可完整发布
2. 再保证 `release-distribute.yml` 能完整镜像
3. 最后在正式构建环境注入：
   - `AIONUI_UPDATE_BASE_URL`
   - `AIONUI_AUTO_UPDATE_URL`

## 上线前检查清单

发布前至少确认：

- GitHub Release 中存在 `latest*.yml`
- 国内镜像中存在 `latest*.yml`
- 元数据里的安装包文件名与实际文件一致
- Windows / macOS / Linux 的目标安装包均已镜像
- `AIONUI_AUTO_UPDATE_URL` 指向的目录可公网访问
- `AIONUI_UPDATE_BASE_URL` 指向的版本目录可公网访问

## 备注

当前仓库代码层已经完成：

- 默认更新仓库切到 `halojerry/AionUi-2.0.2-dev-a3881e2`
- 手动下载地址支持自定义
- 自动更新源支持切换到 generic feed

后续若要真正形成完整的 **POUNDING 国内自动更新链路**，核心不再是客户端代码，而是：

- 发布资产镜像
- 对象存储 / CDN 布局
- 环境变量注入

## 腾讯云 COS 推荐落地

如果你使用腾讯云 COS，推荐：

- 存储桶：如 `yss-1256275613`
- 地域：如 `ap-guangzhou`
- 静态访问根：`https://download.api.mxou.cn`

建议最终对外地址：

```text
https://download.api.mxou.cn/releases/download/<version>/...
https://download.api.mxou.cn/releases/latest/latest.yml
```

### 为什么不推荐 `https://api.mxou.cn/download`

不推荐把 API 服务和更新下载复用到同一个主域名路径下，例如：

```text
https://api.mxou.cn/download
```

原因：

- API 与静态大文件下载职责不同
- 后续缓存策略不同
- 自动更新元数据通常需要更明确的缓存控制
- Nginx / 宝塔反代规则更容易互相影响

更推荐单独子域名：

- `download.api.mxou.cn`
- `update.api.mxou.cn`

### COS 路径说明

COS 不需要你手工创建目录。以下路径会在 CI 上传时自动形成：

```text
releases/download/<version>/
releases/latest/
```

### 当前仓库的 COS 分发约定

`release-distribute.yml` 当前已按腾讯云 COS 的 S3 兼容接口写入：

- `releases/download/<version>/`
- `releases/latest/`

需要的 GitHub 仓库配置为：

#### Secrets

- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`

#### Variables

- `TENCENT_COS_BUCKET`
- `TENCENT_COS_REGION`
- `POUNDING_UPDATE_PUBLIC_BASE`（可选，建议填 `https://download.api.mxou.cn`）

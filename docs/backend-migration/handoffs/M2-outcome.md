# M2 aionrs 清理 - 交付摘要

## 已交付
- 删除 `scripts/prepareAionrs.js`
- 删除 `scripts/build-with-builder.js` 中 `prepareAionrs` 的 `require` 与调用
- 删除 `packages/desktop/electron-builder.yml` 里的 `bundled-aionrs` `extraResources`
- 删除 `.gitignore` 与 `.github/workflows/_build-reusable.yml` 中的 aionrs 分发残留
- 删除本地 `resources/bundled-aionrs/`

## 与计划的偏离
- 额外改了 `scripts/prepareAionuiBackend.js` 注释里的 `prepareAionrs.js` 字样
  原因：requirements 的全仓 grep 验收会命中这条纯注释残留
  影响：无运行时影响，仅保证验收 grep 归零
- `asar`/`find` 验证使用 `out/mac-arm64/...`
  原因：M1 已把 builder 输出目录稳定到 `out/`
  影响：与 requirements 的 `dist/mac-arm64/...` 等价

## 给下一个里程碑的提醒
- `resources/bundled-aionui-backend` 仍会在打包时提示缺失；这是 M4 相关，不在 M2 scope
- 本机 `build-mac:arm64` 仍卡在 codesign 证书歧义；这是环境 blocker，不是 M2 代码 blocker

## 验证证据
- 分支 / HEAD

```text
branch: feat/m1-monorepo-skeleton
HEAD: de0c7b87da
baseline sync: 本次按主会话要求在共享工作树执行，未单独 merge / push
```

- `rg -n "bundled-aionrs|prepareAionrs|AIONRS_VERSION" . --glob '!node_modules/**' --glob '!.git/**' --glob '!docs/**' --glob '!out/**' --glob '!dist/**' --glob '!resources/**'`

```text
<no output>
```

- `ls resources/bundled-aionrs 2>&1 || true`

```text
ls: resources/bundled-aionrs: No such file or directory
```

- `bunx tsc --noEmit`

```text
<no output>
```

- `bunx vitest run tests/unit/mcpAsarUnpack.test.ts tests/integration/pet-renderer-build.test.ts`

```text
RUN  v4.1.0 /Users/zhoukai/Documents/github/AionUi
Test Files  2 passed (2)
Tests  3 passed (3)
Duration  457ms
```

- `bun run build-mac:arm64`

```text
• loaded configuration  file=/Users/zhoukai/Documents/github/AionUi/packages/desktop/electron-builder.yml
• packaging       platform=darwin arch=arm64 electron=37.10.3 appOutDir=out/mac-arm64
• file source doesn't exist  from=/Users/zhoukai/Documents/github/AionUi/resources/bundled-aionui-backend
• signing         file=out/mac-arm64/AionUi.app platform=darwin type=distribution identityName=Apple Development: 凯 周 (FF2YR75839)
⨯ Command failed: codesign --sign Apple Development: 凯 周 (FF2YR75839) ...
Apple Development: 凯 周 (FF2YR75839): ambiguous (matches ... in /Users/zhoukai/Library/Keychains/login.keychain-db)
```

- `COUNT=$(bunx @electron/asar list out/mac-arm64/AionUi.app/Contents/Resources/app.asar | grep -c 'bundled-aionrs' || true); printf '%s\n' "${COUNT:-0}"`

```text
0
```

- `find out/mac-arm64/AionUi.app/Contents/Resources -name 'bundled-aionrs' -print`

```text
<no output>
```

## 遗留问题 / 跟进项
- 未执行 requirements 中的 `'aionrs' / 'aion-cli'` 手动业务回归；本次只完成了 M2 要求的二进制分发清理与打包产物验证

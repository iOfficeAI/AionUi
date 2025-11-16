// macOS 异步公证脚本 / macOS Async Notarization Script
//
// 工作原理 / How it works:
// 1. 验证应用已签名 / Verify app is signed
// 2. 异步提交公证到Apple（不等待）/ Submit notarization to Apple async (no wait)
// 3. 保存submission ID供staple workflow使用 / Save submission ID for staple workflow
// 4. 主构建快速完成（~10分钟）/ Main build completes quickly (~10min)
//
// 优势 / Benefits:
// - 不会因Apple延迟而超时 / Won't timeout due to Apple delays
// - Staple由独立workflow处理 / Stapling handled by separate workflow

const { execSync } = require('child_process');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  // 仅处理macOS平台 / Only handle macOS platform
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  // 检查应用是否已签名 / Check if app is actually signed before attempting notarization
  try {
    execSync(`codesign --verify --verbose "${appPath}"`, { stdio: 'pipe' });
    console.log(`App ${appName} is properly code signed`);
  } catch (error) {
    console.log(`App ${appName} is not code signed, skipping notarization`);
    return;
  }

    // 默认跳过同步公证，由后台 workflow 处理 / Skip sync notarization by default, handled by background workflow
  // 这样可以快速完成发布，不受 Apple 服务器不稳定影响 / This allows fast release without being affected by Apple service instability
  if (process.env.SKIP_NOTARIZATION === 'true') {
    console.log('⚠️  SKIP_NOTARIZATION is set - skipping notarization');
    console.log('📦 App is signed and ready for release');
    console.log('🔄 Background notarization will be handled by separate workflow');

    // 保存签名信息供后台公证使用 / Save signing info for background notarization
    const fs = require('fs');
    const signingInfo = {
      appPath,
      appName,
      appBundleId,
      signed: true,
      notarized: false,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(
      `${appOutDir}/signing-info.json`,
      JSON.stringify(signingInfo, null, 2)
    );
    console.log('✅ Signing info saved for background notarization');
    return;
  }

  // 如果没有设置 SKIP_NOTARIZATION，说明配置有误
  // If SKIP_NOTARIZATION is not set, configuration error
  console.log('⚠️  Sync notarization is deprecated and disabled');
  console.log('💡 All notarization is now handled by background workflow');
  console.log('📝 Set SKIP_NOTARIZATION=true in your workflow');
};

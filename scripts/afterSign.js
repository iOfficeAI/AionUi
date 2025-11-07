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

  // 如果缺少Apple ID凭证，跳过公证 / Skip notarization if credentials are not provided
  if (!process.env.appleId || !process.env.appleIdPassword) {
    console.log('Skipping notarization - missing Apple ID credentials');
    return;
  }

  console.log(`Starting async notarization for ${appName} (${appBundleId})...`);

  try {
    // 压缩 .app 为 .zip 以加速上传 / Compress .app to .zip for faster upload
    const fs = require('fs');
    const zipPath = `${appOutDir}/${appName}.zip`;

    console.log(`Compressing ${appPath} to ZIP for faster upload...`);
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

    const appSize = execSync(`du -sh "${appPath}"`, { encoding: 'utf8' }).split('\t')[0];
    const zipSize = execSync(`du -sh "${zipPath}"`, { encoding: 'utf8' }).split('\t')[0];
    console.log(`Original: ${appSize}, Compressed: ${zipSize}`);

    // 异步提交公证（上传 ZIP 比 .app 快 3-5 倍）/ Submit notarization async (uploading ZIP is 3-5x faster than .app)
    console.log(`Uploading ${zipPath} to Apple notarization service...`);
    console.log(`This may take 5-10 minutes depending on network speed...`);

    const submitResult = execSync(
      `xcrun notarytool submit "${zipPath}" ` +
      `--apple-id "${process.env.appleId}" ` +
      `--password "${process.env.appleIdPassword}" ` +
      `--team-id "${process.env.teamId}" ` +
      `--output-format json`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit']  // 显示stderr进度输出 / Show stderr progress output
      }
    );

    // 清理临时 ZIP / Clean up temporary ZIP
    fs.unlinkSync(zipPath);
    console.log(`Temporary ZIP deleted: ${zipPath}`);

    // 解析提交结果 / Parse submission result
    const { id: submissionId, status } = JSON.parse(submitResult);
    console.log(`Notarization submitted successfully`);
    console.log(`Submission ID: ${submissionId}`);
    console.log(`Status: ${status}`);
    console.log(`Note: Stapling will be handled by separate workflow`);

    // 保存submission ID供staple workflow使用 / Save submission ID for staple workflow
    const submissionInfo = {
      submissionId,  // 公证提交ID / Notarization submission ID
      appPath,       // 应用路径 / App path
      appName,       // 应用名称 / App name
      timestamp: new Date().toISOString()  // 提交时间戳 / Submission timestamp
    };
    fs.writeFileSync(
      `${appOutDir}/notarization-submission.json`,
      JSON.stringify(submissionInfo, null, 2)
    );
    console.log(`Submission info saved to notarization-submission.json`);
  } catch (error) {
    // 提交失败时抛出错误，阻止构建继续 / Throw error on submission failure to stop the build
    console.error('Notarization submission failed:', error);
    throw error;
  }
};

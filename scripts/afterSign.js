const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 是否启用公证
const ENABLE_NOTARIZE = process.env.ENABLE_MAC_NOTARIZE === 'true';
// 超时时长（分钟，可通过环境变量覆盖）
const DEFAULT_TIMEOUT_MINUTES = Number(process.env.MAC_NOTARIZE_TIMEOUT_MINUTES || '45');
// 公证模式：async（提交后立即返回）或 wait（同步等待）
const NOTARIZE_MODE = (process.env.MAC_NOTARIZE_MODE || 'async').toLowerCase();

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  // 未启用签名或未要求公证时直接跳过
  if (!ENABLE_NOTARIZE) {
    console.log('Skipping notarization because ENABLE_MAC_NOTARIZE != true');
    return;
  }

  // 先确认应用已签名
  try {
    execSync(`codesign --verify --verbose "${appPath}"`, { stdio: 'pipe' });
    console.log(`App ${appName} is properly code signed`);
  } catch (error) {
    console.warn(`App ${appName} is not code signed, skipping notarization`);
    return;
  }

  const appleId = process.env.appleId || process.env.APPLE_ID;
  const appleIdPassword = process.env.appleIdPassword || process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.teamId || process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('Skipping notarization - missing Apple ID credentials or team ID');
    return;
  }

  console.log(`Starting notarization for ${appName} (${appBundleId}) with mode=${NOTARIZE_MODE}...`);

  let submissionPath;
  let tempDir;
  try {
    // electron-builder 在 afterSign 阶段仅提供 .app，因此默认压缩成临时 zip
    const dmgCandidate = path.join(appOutDir, `${appName}.dmg`);
    if (fs.existsSync(dmgCandidate)) {
      submissionPath = dmgCandidate;
    } else {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-notarize-'));
      submissionPath = path.join(tempDir, `${appName}.zip`);
      console.log(`Creating temporary notarization archive at ${submissionPath}`);
      const zipResult = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', `${appName}.app`, submissionPath], {
        cwd: appOutDir,
        stdio: 'inherit',
      });
      if (zipResult.status !== 0) {
        console.warn('Failed to create zip for notarization, skipping notarization');
        return;
      }
    }

    const args = [
      'notarytool',
      'submit',
      submissionPath,
      '--apple-id',
      appleId,
      '--password',
      appleIdPassword,
      '--team-id',
      teamId,
      '--output-format',
      'json',
    ];

    const timeoutMinutes = Number.isFinite(DEFAULT_TIMEOUT_MINUTES) && DEFAULT_TIMEOUT_MINUTES > 0 ? DEFAULT_TIMEOUT_MINUTES : 45;
    if (NOTARIZE_MODE === 'wait') {
      args.push('--wait');
      if (timeoutMinutes > 0) {
        args.push('--timeout', `${timeoutMinutes}m`);
      }
    } else {
      args.push('--no-wait');
    }

    const spawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    };
    if (NOTARIZE_MODE === 'wait') {
      spawnOptions.timeout = (timeoutMinutes + 5) * 60 * 1000; // 额外留 5 分钟缓冲
    }

    const result = spawnSync('xcrun', args, spawnOptions);

    if (result.error) {
      if (result.error.code === 'ETIMEDOUT') {
        console.warn(`Notarization command timed out after ${timeoutMinutes} minutes.`);
      } else {
        console.warn(`Notarization failed to execute: ${result.error.message}`);
      }
      console.warn('Continuing with signed-only build (not notarized)');
      return;
    }

    if (result.status === 0) {
      try {
        const response = result.stdout ? JSON.parse(result.stdout) : {};
        if (response.id) {
          console.log(`Notarization submission id: ${response.id}`);
        }
        console.log(`Notarization request submitted successfully (mode=${NOTARIZE_MODE}).`);
      } catch (parseError) {
        console.log('Notarization submitted (unable to parse JSON response). Raw output:');
        console.log(result.stdout);
      }
      return;
    }

    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    if (stderr) {
      console.warn(`Notarization stderr: ${stderr}`);
    }
    if (stdout) {
      console.warn(`Notarization stdout: ${stdout}`);
    }
    console.warn('Notarization submission returned a non-zero exit status. Continuing with signed-only build.');
  } catch (error) {
    console.warn(`Unexpected notarization error: ${error.message}`);
    console.warn('Continuing with signed-only build (not notarized)');
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`Failed to clean up temporary notarization files: ${cleanupError.message}`);
      }
    }
  }
};

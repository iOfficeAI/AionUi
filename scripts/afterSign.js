const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function stripWindowsExecutableVersionInfo(appOutDir, packager) {
  const resourceHackerPath = process.env.RESOURCE_HACKER_PATH;
  if (!resourceHackerPath) {
    return;
  }

  const productFilename = packager?.appInfo?.productFilename || 'CSBU WorkMate';
  const executablePath = path.join(appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Windows executable not found for VERSIONINFO removal: ${executablePath}`);
  }
  if (!fs.existsSync(resourceHackerPath)) {
    throw new Error(`Resource Hacker not found: ${resourceHackerPath}`);
  }

  const scriptPath = path.resolve(__dirname, '../resources/windows/support/strip-exe-version-info.ps1');
  const windowsDirectory = process.env.SystemRoot || 'C:\\Windows';
  const powershellPath = path.join(windowsDirectory, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(
    powershellPath,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-TargetPath',
      executablePath,
      '-ResourceHackerPath',
      resourceHackerPath,
    ],
    { stdio: 'inherit', windowsHide: true }
  );

  if (result.error) {
    throw new Error(`Failed to start VERSIONINFO removal: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`VERSIONINFO removal failed with exit code ${result.status}`);
  }
}

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName === 'win32') {
    stripWindowsExecutableVersionInfo(appOutDir, context.packager);
    return;
  }

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Lazy-load notarize because @electron/notarize is ESM-only
  const { notarize } = await import('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  // Check if app is actually signed before attempting notarization
  try {
    execSync(`codesign --verify --verbose "${appPath}"`, { stdio: 'pipe' });
    console.log(`App ${appName} is properly code signed`);
  } catch (error) {
    console.log(`App ${appName} is not code signed, applying ad-hoc signature...`);
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
      console.log(`Ad-hoc signature applied successfully to ${appName}`);
    } catch (adHocError) {
      console.error('Ad-hoc signing failed:', adHocError.message);
    }
    return;
  }

  // Skip notarization if credentials are not provided
  if (!process.env.appleId || !process.env.appleIdPassword) {
    console.log('Skipping notarization - missing Apple ID credentials');
    return;
  }

  console.log(`Starting notarization for ${appName} (${appBundleId})...`);

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId,
      appPath: appPath,
      appleId: process.env.appleId,
      appleIdPassword: process.env.appleIdPassword,
      teamId: process.env.teamId,
    });
    console.log('Notarization completed successfully');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};

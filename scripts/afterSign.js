const { execSync } = require('child_process');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  
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
    console.log(`App ${appName} is not code signed, skipping notarization`);
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
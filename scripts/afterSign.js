const { notarize } = require('@electron/notarize');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization in CI or if credentials are not provided
  if (process.env.CI === 'true' || !process.env.appleId || !process.env.appleIdPassword) {
    console.log('Skipping notarization - missing credentials or in CI environment');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;

  console.log(`Starting notarization for ${appName} (${appBundleId})...`);

  try {
    await notarize({
      appBundleId,
      appPath: `${appOutDir}/${appName}.app`,
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
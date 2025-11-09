// Enhanced macOS notarization helper script
// This script provides better timeout handling and error recovery for Apple notarization
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Submit app for notarization with enhanced timeout handling
 * @param {string} appPath - Path to the .app file to notarize
 * @param {Object} options - Notarization options
 * @returns {Promise<Object>} Notarization result
 */
exports.submitNotarization = async function(appPath, options = {}) {
  const {
    appleId,
    appleIdPassword,
    teamId,
    apiKey,
    apiKeyId,
    apiIssuer,
    timeoutMinutes = 90,
    maxWaitTimeHours = 24, // Apple can take up to 24 hours for first-time apps
    retryAttempts = 3
  } = options;

  let submissionId = null;
  let attempt = 0;

  while (attempt < retryAttempts) {
    try {
      console.log(`\n🚀 Notarization attempt ${attempt + 1}/${retryAttempts}`);
      console.log(`📦 Submitting for notarization: ${appPath}`);

      // Compress app for notarization using ditto (Apple recommended)
      const zipPath = appPath.replace('.app', '.zip');
      console.log(`📦 Compressing app to: ${zipPath}`);
      
      // Remove existing zip if present
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      
      execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });
      
      if (!fs.existsSync(zipPath)) {
        throw new Error(`Failed to create zip file: ${zipPath}`);
      }

      console.log('✅ App compressed successfully');

      // Submit for notarization without waiting (async)
      let submitCommand;
      if (apiKey && apiKeyId && apiIssuer) {
        console.log('🔑 Using API Key authentication');
        // Write API key to temporary file
        const keyPath = path.join('/tmp', `authkey_${Date.now()}.p8`);
        fs.writeFileSync(keyPath, apiKey);
        
        submitCommand = `xcrun notarytool submit "${zipPath}" --key "${keyPath}" --key-id "${apiKeyId}" --issuer "${apiIssuer}" --output-format json`;
      } else {
        console.log('🔑 Using Apple ID authentication');
        submitCommand = `xcrun notarytool submit "${zipPath}" --apple-id "${appleId}" --password "${appleIdPassword}" --team-id "${teamId}" --output-format json`;
      }

      console.log('📤 Submitting to Apple notarization service...');
      const submitResult = execSync(submitCommand, { encoding: 'utf8' });
      const submitJson = JSON.parse(submitResult);
      
      if (!submitJson.id) {
        throw new Error('Failed to get submission ID from notarization service');
      }
      
      submissionId = submitJson.id;
      console.log(`✅ Notarization submitted successfully! ID: ${submissionId}`);
      
      // Now wait for the notarization to complete
      console.log(`⏳ Waiting for notarization to complete...`);
      
      // Wait for completion with exponential backoff
      const status = await waitForNotarization(submissionId, options);
      
      if (status === 'Accepted') {
        console.log('✅ App notarization completed successfully!');
        
        // Clean up zip file
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        
        return { submissionId, status };
      } else {
        throw new Error(`Notarization failed with status: ${status}`);
      }
      
    } catch (error) {
      console.error(`❌ Notarization attempt ${attempt + 1} failed:`, error.message);
      
      attempt++;
      if (attempt < retryAttempts) {
        console.log(`⏳ Waiting 5 minutes before retry...`);
        await sleep(300000); // Wait 5 minutes before retry
      } else {
        throw new Error(`Notarization failed after ${retryAttempts} attempts: ${error.message}`);
      }
    }
  }
};

/**
 * Wait for notarization to complete with smart polling
 */
async function waitForNotarization(submissionId, options) {
  const {
    appleId,
    appleIdPassword,
    teamId,
    apiKey,
    apiKeyId,
    apiIssuer,
    maxWaitTimeHours = 24  // Apple can take up to 24 hours for first-time apps
  } = options;
  
  let pollInterval = 30000;  // Start with 30 second intervals
  const maxPollInterval = 600000;  // Max 10 minute intervals
  const maxWaitTimeMs = maxWaitTimeHours * 60 * 60 * 1000;  // Convert hours to milliseconds
  let totalWaitTime = 0;
  let lastStatus = '';

  console.log(`⏰ Will wait up to ${maxWaitTimeHours} hours for notarization to complete (Apple can take this long for first-time apps)`);

  while (totalWaitTime < maxWaitTimeMs) {
    try {
      // Build info command based on auth method
      let infoCommand;
      if (apiKey && apiKeyId && apiIssuer) {
        const keyPath = path.join('/tmp', `authkey_${Date.now()}.p8`);
        fs.writeFileSync(keyPath, apiKey);
        infoCommand = `xcrun notarytool info "${submissionId}" --key "${keyPath}" --key-id "${apiKeyId}" --issuer "${apiIssuer}" --output-format json`;
      } else {
        infoCommand = `xcrun notarytool info "${submissionId}" --apple-id "${appleId}" --password "${appleIdPassword}" --team-id "${teamId}" --output-format json`;
      }

      const infoResult = execSync(infoCommand, { encoding: 'utf8' });
      const infoJson = JSON.parse(infoResult);
      const status = infoJson.status;

      // Only log if status changed to reduce log spam
      if (status !== lastStatus) {
        console.log(`📊 Status: ${status} (after ${Math.floor(totalWaitTime / 60000)} minutes)`);
        lastStatus = status;
      } else if (totalWaitTime % 600000 === 0) {  // Log every 10 minutes even if no change
        console.log(`📊 Status: ${status} (still processing, total elapsed: ${Math.floor(totalWaitTime / 60000)} minutes)`);
      }

      if (status === 'Accepted') {
        return status;
      } else if (status === 'Invalid' || status === 'Rejected') {
        console.error('❌ Notarization failed, fetching logs...');
        try {
          let logCommand;
          if (apiKey && apiKeyId && apiIssuer) {
            const keyPath = path.join('/tmp', `authkey_${Date.now()}.p8`);
            fs.writeFileSync(keyPath, apiKey);
            logCommand = `xcrun notarytool log "${submissionId}" --key "${keyPath}" --key-id "${apiKeyId}" --issuer "${apiIssuer}"`;
          } else {
            logCommand = `xcrun notarytool log "${submissionId}" --apple-id "${appleId}" --password "${appleIdPassword}" --team-id "${teamId}"`;
          }
          execSync(logCommand, { stdio: 'inherit' });
        } catch (logError) {
          console.error('Failed to fetch notarization logs:', logError.message);
        }
        return status;
      }

      // Exponential backoff: double the interval up to max
      if (pollInterval < maxPollInterval) {
        pollInterval *= 2;
        if (pollInterval > maxPollInterval) {
          pollInterval = maxPollInterval;
        }
      }

    } catch (error) {
      console.warn(`⚠️  Failed to check notarization status (might be temporary network issue):`, error.message);
    }

    // Wait before next poll
    await sleep(pollInterval);
    totalWaitTime += pollInterval;
  }

  throw new Error(`Notarization timed out after ${maxWaitTimeHours} hours. Submission ID: ${submissionId}. This is expected for first-time app submissions which can take up to 24 hours.`);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced afterSign function for electron-builder
exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only handle macOS platform
  if (electronPlatformName !== 'darwin') {
    return;
  }

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

  // Skip notarization during development or if explicitly disabled
  if (process.env.SKIP_NOTARIZATION === 'true') {
    console.log('⚠️  SKIP_NOTARIZATION is set - skipping notarization');
    console.log('📦 App is signed and ready for release');
    console.log('🔄 Background notarization will be handled by separate workflow');

    // Save signing info for background notarization
    const signingInfo = {
      appPath,
      appName,
      appBundleId,
      signed: true,
      notarized: false,
      timestamp: new Date().toISOString(),
      firstTimeNotarization: process.env.FIRST_TIME_NOTARIZATION === 'true'
    };
    const signingInfoPath = `${appOutDir}/signing-info.json`;
    fs.writeFileSync(signingInfoPath, JSON.stringify(signingInfo, null, 2));
    console.log('✅ Signing info saved for background notarization');
    return;
  }

  console.log('ℹ️  This is a synchronous notarization that might take a very long time (up to 24 hours for first-time apps)');
  console.log('💡 For production, use the background notarization workflow instead (set SKIP_NOTARIZATION=true)');
  
  // Get notarization options from environment variables
  const notarizationOptions = {
    appleId: process.env.appleId,
    appleIdPassword: process.env.appleIdPassword,
    teamId: process.env.teamId,
    apiKey: process.env.APPLE_API_KEY ? Buffer.from(process.env.APPLE_API_KEY, 'base64').toString() : null,
    apiKeyId: process.env.APPLE_API_KEY_ID,
    apiIssuer: process.env.APPLE_API_ISSUER,
    maxWaitTimeHours: process.env.FIRST_TIME_NOTARIZATION === 'true' ? 24 : 2  // Extended timeout for first-time apps
  };

  if (!notarizationOptions.apiKey && !(notarizationOptions.appleId && notarizationOptions.appleIdPassword && notarizationOptions.teamId)) {
    console.log('⚠️  Notarization credentials not fully configured, skipping notarization');
    console.log('💡 Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER OR appleId, appleIdPassword, and teamId');
    return;
  }

  try {
    const result = await exports.submitNotarization(appPath, notarizationOptions);
    console.log(`✅ Notarization completed with ID: ${result.submissionId}`);
    
    // Staple the notarization to the app
    console.log('📎 Stapling notarization ticket to app...');
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });
    console.log('✅ Notarization ticket stapled successfully');
    
    // Verify the stapling worked
    console.log('🔍 Verifying stapled notarization...');
    execSync(`xcrun stapler validate "${appPath}"`, { stdio: 'inherit' });
    console.log('✅ App verification successful');
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    console.log('💡 This is expected for first-time apps which may take up to 24 hours');
    console.log('💡 The signed app is still functional but not notarized');
  }
};
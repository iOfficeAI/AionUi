#!/usr/bin/env node
/**
 * Build script that auto-increments buildNumber before running eas build.
 *
 * Usage:
 *   node scripts/build.js --profile development --platform ios --local
 *   node scripts/build.js --profile preview --platform ios --local --auto-submit
 *   node scripts/build.js --profile preview --platform ios --local --direct-submit
 *   node scripts/build.js --profile production --platform ios
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex !== -1 ? args[profileIndex + 1] : null;
const platformIndex = args.indexOf('--platform');
const platform = platformIndex !== -1 ? args[platformIndex + 1] : 'ios';
const isLocal = args.includes('--local');
const autoSubmit = args.includes('--auto-submit');
const directSubmit = args.includes('--direct-submit');

if (!profile) {
  console.error('Error: --profile is required (e.g., --profile preview or --profile production)');
  process.exit(1);
}

// Read current version
const versionPath = path.join(__dirname, '..', 'versions', 'version.json');
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
} catch (error) {
  console.error('Error reading versions/version.json:', error.message);
  process.exit(1);
}

// Increment build number
const oldBuildNumber = versionData.buildNumber;
versionData.buildNumber = oldBuildNumber + 1;

try {
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log(`Bumped buildNumber: ${oldBuildNumber} -> ${versionData.buildNumber}`);
  console.log(`  Version: ${versionData.version}`);
} catch (error) {
  console.error('Error writing versions/version.json:', error.message);
  process.exit(1);
}

// Build eas command args
const outputExt = platform === 'ios' ? '.ipa' : '.apk';
const localOutputPath = path.join(__dirname, '..', `build-${Date.now()}${outputExt}`);
let buildArgs = args.filter((a) => a !== '--auto-submit' && a !== '--direct-submit');

// For local builds with submit, capture output path for later submission
if (isLocal && (autoSubmit || directSubmit)) {
  if (!buildArgs.includes('--output')) {
    buildArgs.push('--output', localOutputPath);
  }
}

// Local builds: add --non-interactive to avoid login prompts
if (isLocal) {
  buildArgs.push('--non-interactive');
}

// Local iOS builds: read Apple password from Keychain
let applePassword;
if (isLocal && platform === 'ios') {
  try {
    applePassword = execSync('security find-generic-password -s "AC_PASSWORD" -w', {
      encoding: 'utf8',
    }).trim();
  } catch {
    console.warn('Warning: Could not read AC_PASSWORD from Keychain');
  }
}

// Build the eas command
const easCommand = `eas build ${buildArgs.join(' ')}`;
console.log(`\nRunning: ${easCommand}\n`);

// Apple-specific env vars (only needed for iOS builds)
const appleEnv =
  platform === 'ios'
    ? {
        EXPO_APPLE_TEAM_ID: process.env.EXPO_APPLE_TEAM_ID || 'M4AG47ZV62',
        EXPO_APPLE_ID: process.env.EXPO_APPLE_ID || 'liangzhewei@gmail.com',
        ...(applePassword ? { EXPO_APPLE_PASSWORD: applePassword } : {}),
      }
    : {};

// Execute eas build
try {
  execSync(easCommand, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `/usr/bin:${process.env.PATH}`,
      ...appleEnv,
    },
  });
} catch (error) {
  // If build fails, revert the version bump
  console.log('\nBuild failed, reverting version bump...');
  versionData.buildNumber = oldBuildNumber;
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log(`  Reverted buildNumber to ${oldBuildNumber}`);
  process.exit(1);
}

// Submit the artifact (iOS local builds with --auto-submit or --direct-submit)
if (platform === 'ios' && isLocal && (autoSubmit || directSubmit)) {
  const outputFile = buildArgs[buildArgs.indexOf('--output') + 1];
  if (!fs.existsSync(outputFile)) {
    console.error(`\nBuild artifact not found at ${outputFile}`);
    process.exit(1);
  }

  if (directSubmit) {
    // Upload directly to App Store Connect via xcrun altool (bypasses EAS)
    const appleId = process.env.APPLE_ID || 'liangzhewei@gmail.com';
    const submitCommand = `xcrun altool --upload-app -f "${outputFile}" -t ${platform} -u "${appleId}" -p "@keychain:AC_PASSWORD"`;
    console.log(`\nUploading directly to TestFlight: xcrun altool --upload-app\n`);
    try {
      execSync(submitCommand, { stdio: 'inherit' });
      console.log('\nSuccessfully uploaded to TestFlight!');
    } catch (error) {
      console.error('\nDirect upload to TestFlight failed');
      console.error(
        '  Make sure your App-Specific Password is saved in Keychain as "AC_PASSWORD".',
      );
      console.error(
        '  To save it: security add-generic-password -a "liangzhewei@gmail.com" -s "AC_PASSWORD" -w "<your-app-specific-password>" -U',
      );
      process.exit(1);
    }
  } else {
    // Upload via EAS submit
    const submitCommand = `eas submit --platform ${platform} --path ${outputFile} --non-interactive`;
    console.log(`\nSubmitting to TestFlight: ${submitCommand}\n`);
    try {
      execSync(submitCommand, {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...appleEnv,
        },
      });
      console.log('\nSuccessfully submitted to TestFlight!');
    } catch (error) {
      console.error('\nSubmit to TestFlight failed');
      process.exit(1);
    }
  }
}

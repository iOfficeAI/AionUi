#!/usr/bin/env node
/**
 * Build script that auto-increments buildNumber before running eas build.
 *
 * Usage:
 *   node scripts/build.js --profile development --platform ios --local
 *   node scripts/build.js --profile preview --platform ios --local --auto-submit
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
let buildArgs = args.filter((a) => a !== '--auto-submit');

// For local builds with submit, capture output path for later submission
if (isLocal && autoSubmit) {
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
        ...(process.env.EXPO_APPLE_TEAM_ID ? { EXPO_APPLE_TEAM_ID: process.env.EXPO_APPLE_TEAM_ID } : {}),
        ...(process.env.EXPO_APPLE_ID ? { EXPO_APPLE_ID: process.env.EXPO_APPLE_ID } : {}),
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

// Submit the artifact (iOS local builds with --auto-submit)
if (platform === 'ios' && isLocal && autoSubmit) {
  const outputFile = buildArgs[buildArgs.indexOf('--output') + 1];
  if (!fs.existsSync(outputFile)) {
    console.error(`\nBuild artifact not found at ${outputFile}`);
    process.exit(1);
  }

  const submitCommand = `eas submit --platform ${platform} --path ${outputFile}`;
  console.log(`\nSubmitting to TestFlight: ${submitCommand}\n`);
  try {
    execSync(submitCommand, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(process.env.EXPO_APPLE_TEAM_ID ? { EXPO_APPLE_TEAM_ID: process.env.EXPO_APPLE_TEAM_ID } : {}),
        ...(process.env.EXPO_APPLE_ID ? { EXPO_APPLE_ID: process.env.EXPO_APPLE_ID } : {}),
      },
    });
    console.log('\nSuccessfully submitted to TestFlight!');
  } catch (error) {
    console.error('\nSubmit to TestFlight failed');
    process.exit(1);
  }
}

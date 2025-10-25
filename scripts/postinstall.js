/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');
const fs = require('fs');

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');
    
    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);
    
    if (isCI) {
      // In CI, rebuild native modules specifically for Electron
      console.log(`CI environment detected, rebuilding native modules for Electron ${electronVersion}`);
      
      const rebuildCmd = `npx electron-rebuild --force --version=${electronVersion} --only "better-sqlite3,bcrypt,node-pty"`;
      execSync(rebuildCmd, { 
        stdio: 'inherit', 
        env: { 
          ...process.env, 
          npm_config_build_from_source: 'true',
          npm_config_runtime: 'electron',
          npm_config_target: electronVersion,
          npm_config_disturl: 'https://electronjs.org/headers'
        } 
      });
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      execSync('npx electron-builder install-app-deps', { 
        stdio: 'inherit',
        env: { 
          ...process.env, 
          npm_config_build_from_source: 'true' 
        } 
      });
    }
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
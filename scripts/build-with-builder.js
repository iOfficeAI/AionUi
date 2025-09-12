#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取构建参数
const args = process.argv.slice(2);
const arch = args[0] === 'auto' ? process.arch : args[0] || process.arch;
const builderArgs = args.slice(1).join(' ');

const packageJsonPath = path.resolve(__dirname, '../package.json');

try {
  // 1. 运行 Forge 打包
  console.log('📦 Running Forge package...');
  execSync('npm run package', { stdio: 'inherit' });

  // 2. 更新 main 字段
  console.log(`🔧 Updating main entry for ${arch}...`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const originalMain = packageJson.main;
  packageJson.main = `.webpack/${arch}/main/index.js`;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // 3. 运行 electron-builder
  console.log(`🚀 Running electron-builder ${builderArgs}...`);
  execSync(`npx electron-builder ${builderArgs}`, { stdio: 'inherit' });

  // 4. 恢复 main 字段
  console.log('🔄 Restoring main entry...');
  packageJson.main = originalMain;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('✅ Build completed successfully!');
} catch (error) {
  // 出错时也要恢复 main 字段
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  } catch (e) {
    console.error('Failed to restore package.json:', e.message);
  }
  
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
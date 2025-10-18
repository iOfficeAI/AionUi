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
  // 1. 确保 main 字段正确用于 Forge
  console.log('🔧 Ensuring main entry is correct for Forge...');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const originalMain = packageJson.main;
  
  // 添加进程退出监听器确保恢复
  const restoreMain = () => {
    try {
      const currentPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      currentPackageJson.main = '.webpack/main';
      fs.writeFileSync(packageJsonPath, JSON.stringify(currentPackageJson, null, 2) + '\n');
      console.log('🔄 Main entry restored on exit');
    } catch (e) {
      console.error('Failed to restore on exit:', e.message);
    }
  };
  
  process.on('SIGINT', restoreMain);
  process.on('SIGTERM', restoreMain);
  process.on('exit', restoreMain);
  
  // 确保 Forge 能找到正确的 main 入口
  if (packageJson.main !== '.webpack/main') {
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('📝 Reset main entry to .webpack/main for Forge');
  }

  // 2. 运行 Forge 打包
  console.log(`📦 Running Forge package for ${arch}...`);
  console.log(`🔍 Setting ELECTRON_BUILDER_ARCH=${arch}`);
  // Pass target architecture to Forge via environment variable
  const forgeEnv = { ...process.env, ELECTRON_BUILDER_ARCH: arch };
  execSync('npm run package', { stdio: 'inherit', env: forgeEnv });

  // 2.5 验证 Forge 输出的架构
  const webpackBaseDir = path.resolve(__dirname, '../.webpack');
  const webpackDirs = fs.readdirSync(webpackBaseDir).filter(d =>
    fs.statSync(path.join(webpackBaseDir, d)).isDirectory()
  );
  console.log(`🔍 Forge generated directories: ${webpackDirs.join(', ')}`);

  // 检测架构目录：通过检查是否包含 main/index.js 来判断是否为有效的 Forge 输出目录
  const archDirs = webpackDirs.filter(d => {
    const mainIndexPath = path.join(webpackBaseDir, d, 'main', 'index.js');
    return fs.existsSync(mainIndexPath);
  });

  console.log(`🔍 Valid Forge build directories (with main/index.js): ${archDirs.length > 0 ? archDirs.join(', ') : 'none'}`);

  // 确定实际生成的架构目录（Forge 实际输出的架构）
  let actualArch = arch; // 默认假设 Forge 生成了目标架构
  if (archDirs.length > 0) {
    // 如果存在多个架构目录，通过检查 main/index.js 的修改时间来确定最新的
    if (archDirs.length > 1) {
      console.log(`🔍 Multiple build directories found, detecting latest by timestamp...`);

      let latestArch = archDirs[0];
      let latestTime = 0;

      for (const archDir of archDirs) {
        const mainIndexPath = path.join(webpackBaseDir, archDir, 'main', 'index.js');
        const stats = fs.statSync(mainIndexPath);
        if (stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestArch = archDir;
        }
      }

      actualArch = latestArch;
      console.log(`✅ Detected latest build: ${actualArch} (modified: ${new Date(latestTime).toISOString()})`);
    } else {
      actualArch = archDirs[0];
    }

    if (actualArch !== arch) {
      console.log(`⚠️  WARNING: Forge generated ${actualArch} but target is ${arch}`);
      console.log(`📝 Will copy/link from ${actualArch} to ${arch} for electron-builder`);
    }
  }

  // 2.6 确保 .webpack/${arch} 目录存在供 electron-builder extraResources 使用
  // Forge 可能输出在 .webpack/${actualArch}/ 但 electron-builder 需要 .webpack/${arch}/
  console.log(`📁 Preparing .webpack/${arch} directory for electron-builder...`);
  const webpackSrcDir = path.resolve(__dirname, '../.webpack');
  const webpackArchDir = path.resolve(__dirname, `../.webpack/${arch}`);

  // 确定源目录：优先使用 Forge 实际生成的架构目录
  const actualArchDir = path.join(webpackSrcDir, actualArch);
  const useArchSpecificSource = fs.existsSync(actualArchDir);

  // 如果目标架构目录不存在，或者需要从不同架构复制，则创建
  if (!fs.existsSync(webpackArchDir) || actualArch !== arch) {
    // 在 Unix 系统使用软链接，Windows 使用目录复制
    if (process.platform === 'win32') {
      // Windows: 复制目录
      const sourceDir = useArchSpecificSource ? actualArchDir : webpackSrcDir;
      execSync(`xcopy "${sourceDir}" "${webpackArchDir}" /E /I /H /Y`, { stdio: 'inherit' });
    } else {
      // Unix: 创建软链接（更快）
      // 源路径：Forge 可能生成 .webpack/${actualArch}/renderer 或 .webpack/renderer
      const rendererSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'renderer')
        : path.join(webpackSrcDir, 'renderer');
      const nativeModulesSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'native_modules')
        : path.join(webpackSrcDir, 'native_modules');

      const rendererDest = path.join(webpackArchDir, 'renderer');
      const nativeModulesDest = path.join(webpackArchDir, 'native_modules');

      fs.mkdirSync(webpackArchDir, { recursive: true });

      if (fs.existsSync(rendererSrc)) {
        // 使用绝对路径创建软链接
        const absRendererSrc = path.resolve(rendererSrc);
        const absRendererDest = path.resolve(rendererDest);
        execSync(`ln -sf "${absRendererSrc}" "${absRendererDest}"`, { stdio: 'inherit' });
        console.log(`✅ Linked renderer: ${absRendererSrc} -> ${absRendererDest}`);
      } else {
        console.warn(`⚠️  Renderer source not found at ${rendererSrc}`);
      }

      if (fs.existsSync(nativeModulesSrc)) {
        const absNativeModulesSrc = path.resolve(nativeModulesSrc);
        const absNativeModulesDest = path.resolve(nativeModulesDest);
        execSync(`ln -sf "${absNativeModulesSrc}" "${absNativeModulesDest}"`, { stdio: 'inherit' });
        console.log(`✅ Linked native_modules: ${absNativeModulesSrc} -> ${absNativeModulesDest}`);
      } else {
        console.warn(`⚠️  Native modules source not found at ${nativeModulesSrc}`);
      }
    }
    console.log(`✅ Created .webpack/${arch} structure from ${actualArch}`);
  }

  // 3. 更新 main 字段用于 electron-builder
  console.log(`🔧 Updating main entry for ${arch}...`);
  const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  updatedPackageJson.main = `.webpack/${arch}/main/index.js`;
  fs.writeFileSync(packageJsonPath, JSON.stringify(updatedPackageJson, null, 2) + '\n');

  // 4. 运行 electron-builder
  // 在非release环境下禁用发布以避免GH_TOKEN错误
  const isRelease = process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/v');
  const publishArg = isRelease ? '' : '--publish=never';
  console.log(`🚀 Running electron-builder ${builderArgs} ${publishArg}...`);
  execSync(`npx electron-builder ${builderArgs} ${publishArg}`, { stdio: 'inherit' });

  // 5. 恢复 main 字段
  console.log('🔄 Restoring main entry...');
  const finalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  finalPackageJson.main = '.webpack/main';  // 确保恢复到正确的默认值
  fs.writeFileSync(packageJsonPath, JSON.stringify(finalPackageJson, null, 2) + '\n');

  console.log('✅ Build completed successfully!');
} catch (error) {
  // 出错时也要恢复 main 字段
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  } catch (e) {
    console.error('Failed to restore package.json:', e.message);
  }
  
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
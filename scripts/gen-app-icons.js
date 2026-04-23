/* eslint-disable */
// Regenerate resources/app.{png,icns,ico} from resources/kaiwu-icon.svg.
// Run after editing the source SVG: `node scripts/gen-app-icons.js`.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const RES_DIR = path.resolve(__dirname, '..', 'resources');
const SRC = path.join(RES_DIR, 'kaiwu-icon.svg');
const TMP_DIR = path.join(RES_DIR, '.icon-build');

const appBuilderBin = () => {
  const platDir = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const archDir =
    process.platform === 'darwin'
      ? `app-builder_${process.arch === 'arm64' ? 'arm64' : 'amd64'}`
      : process.arch;
  const exe = process.platform === 'win32' ? 'app-builder.exe' : 'app-builder';
  return path.resolve(__dirname, '..', 'node_modules', 'app-builder-bin', platDir, archDir, exe);
};

(async () => {
  if (!fs.existsSync(SRC)) throw new Error(`Missing source SVG: ${SRC}`);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const srcPng = path.join(TMP_DIR, 'icon-1024.png');
  await sharp(fs.readFileSync(SRC), { density: 768 }).resize(1024, 1024).png().toFile(srcPng);
  await sharp(fs.readFileSync(SRC), { density: 768 }).resize(512, 512).png().toFile(path.join(RES_DIR, 'app.png'));

  const ab = appBuilderBin();
  execFileSync(ab, ['icon', '--format', 'icns', '--out', TMP_DIR, '--input', srcPng], { stdio: 'inherit' });
  execFileSync(ab, ['icon', '--format', 'ico', '--out', TMP_DIR, '--input', srcPng], { stdio: 'inherit' });

  fs.copyFileSync(path.join(TMP_DIR, 'icon.icns'), path.join(RES_DIR, 'app.icns'));
  fs.copyFileSync(path.join(TMP_DIR, 'icon.ico'), path.join(RES_DIR, 'app.ico'));
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Regenerated resources/app.{png,icns,ico} from resources/kaiwu-icon.svg');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OLD_BRAND_PATTERN = /AionUi|AionUI|Aion UI|\bAion(?: Assistant|助手| CLI|Core|Hub)?\b/;
const FORBIDDEN_PROMOTION_PATTERN =
  /aff=aionui|packyapi\.com\/register|contributor[- ]bonus|Kimi contributor campaign|star-history\.com/i;

const listFiles = (root, relativePath, extensions) => {
  const absolutePath = join(root, relativePath);
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) return listFiles(root, child, extensions);
    return !extensions || extensions.has(extname(entry.name)) ? [child] : [];
  });
};

const collectStringValues = (value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStringValues);
  return [];
};

export const containsOldBrandInValue = (value) =>
  collectStringValues(value).some((item) => OLD_BRAND_PATTERN.test(item));

export const containsForbiddenPromotion = (value) => FORBIDDEN_PROMOTION_PATTERN.test(value);

export function auditBranding(root = DEFAULT_ROOT) {
  const violations = [];
  const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
  const packageJson = JSON.parse(read('package.json'));
  const builderConfig = read('packages/desktop/electron-builder.yml');

  if (packageJson.name !== 'csbu-workmate') violations.push('package.json name must be csbu-workmate');
  if (packageJson.productName !== 'CSBU WorkMate') violations.push('package.json productName must be CSBU WorkMate');
  if (!packageJson.dependencies?.['@csbu-workmate/web-host']) {
    violations.push('workspace packages must use the @csbu-workmate scope');
  }
  if (!builderConfig.includes('appId: com.csbu.workmate')) violations.push('desktop appId must be com.csbu.workmate');
  if (!builderConfig.includes('productName: CSBU WorkMate'))
    violations.push('desktop productName must be CSBU WorkMate');
  if (!builderConfig.includes('csbu-workmate')) violations.push('desktop protocol must use csbu-workmate');
  if (builderConfig.includes('publish:')) violations.push('public electron-builder publishing must remain disabled');

  const localeFiles = [
    ...listFiles(root, 'packages/desktop/src/renderer/services/i18n/locales', new Set(['.json'])),
    ...listFiles(root, 'mobile/src/i18n/locales', new Set(['.json'])),
  ];
  for (const file of localeFiles) {
    if (containsOldBrandInValue(JSON.parse(read(file)))) violations.push(`${file}: old brand in locale value`);
  }

  const identityFiles = [
    'packages/desktop/src/renderer/index.html',
    'public/manifest.webmanifest',
    'mobile/app.config.ts',
    'mobile/package.json',
    'packages/desktop/src/renderer/components/layout/Titlebar/index.tsx',
    'packages/desktop/src/renderer/components/layout/Layout.tsx',
    'packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx',
    'packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts',
    'packages/desktop/src/renderer/hooks/system/notification/useDesktopTurnNotification.ts',
    'packages/desktop/src/process/utils/tray.ts',
  ];
  for (const file of identityFiles) {
    const hasOldBrand = read(file)
      .split(/\r?\n/)
      .filter((line) => !line.includes('Copyright'))
      .some((line) => OLD_BRAND_PATTERN.test(line));
    if (hasOldBrand) violations.push(`${file}: old brand on application identity surface`);
  }

  const promotionFiles = [
    ...listFiles(root, '.github', new Set(['.md', '.yml', '.yaml'])),
    ...listFiles(root, 'packages/desktop/src/renderer', new Set(['.ts', '.tsx', '.json'])),
  ];
  for (const file of promotionFiles) {
    if (containsForbiddenPromotion(read(file))) violations.push(`${file}: forbidden promotional content`);
  }

  const quickActions = read('packages/desktop/src/renderer/pages/guid/components/QuickActionButtons.tsx');
  if (quickActions.includes('quickActionStar')) violations.push('repository star promotion must remain removed');
  if (existsSync(join(root, '.github/workflows/bump-homebrew.yml')))
    violations.push('public Homebrew workflow must remain removed');
  if (existsSync(join(root, '.github/workflows/release-distribute.yml'))) {
    violations.push('public distribution workflow must remain removed');
  }

  const mainSource = read('packages/desktop/src/index.ts');
  if (!mainSource.includes('const disableAutoUpdater = true;'))
    violations.push('public auto-update must remain disabled');

  const hubPreparation = read('scripts/prepareHubResources.js');
  if (/iOfficeAI\/AionHub/i.test(hubPreparation)) {
    violations.push('extension hub must not download from the former public project');
  }

  const backendPreparation = read('packages/shared-scripts/src/prepare-aioncore.js');
  if (!backendPreparation.includes("const GITHUB_OWNER = 'suoak';")) {
    violations.push('backend artifacts must download from the suoak/AionCore fork');
  }

  const bridgeIndex = read('packages/desktop/src/process/bridge/index.ts');
  if (bridgeIndex.includes('initUpdateBridge();')) violations.push('public update IPC must remain unregistered');

  const applicationMenu = read('packages/desktop/src/process/utils/appMenu.ts');
  if (applicationMenu.includes('Check for Updates')) violations.push('public update menu must remain removed');

  const rendererLayout = read('packages/desktop/src/renderer/components/layout/Layout.tsx');
  if (rendererLayout.includes('<UpdateModal')) violations.push('public update UI must remain unmounted');

  const requiredIcons = [
    'resources/app.png',
    'resources/app.ico',
    'resources/app.icns',
    'packages/desktop/src/renderer/assets/logos/brand/app.png',
    'public/pwa/icon-192.png',
    'public/pwa/icon-512.png',
    'mobile/assets/images/icon.png',
  ];
  for (const file of requiredIcons) {
    if (!existsSync(join(root, file))) violations.push(`${file}: required WorkMate icon is missing`);
  }

  const requiredRenamedFiles = [
    'packages/web-cli/bin/csbu-workmate-web.js',
    'packages/desktop/src/renderer/components/base/WorkMateModal.tsx',
    'packages/desktop/src/renderer/components/base/WorkMateSelect.tsx',
    'packages/desktop/src/renderer/components/base/WorkMateScrollArea.tsx',
  ];
  for (const file of requiredRenamedFiles) {
    if (!existsSync(join(root, file))) violations.push(`${file}: renamed WorkMate module is missing`);
  }

  const obsoleteRenamedFiles = [
    'packages/web-cli/bin/aionui-web.js',
    'packages/desktop/src/renderer/components/base/AionModal.tsx',
    'packages/desktop/src/renderer/components/base/AionSelect.tsx',
    'packages/desktop/src/renderer/components/base/AionScrollArea.tsx',
  ];
  for (const file of obsoleteRenamedFiles) {
    if (existsSync(join(root, file))) violations.push(`${file}: obsolete branded module returned`);
  }

  const removedAssets = [
    'resources/aionui_logo_black_bg.svg',
    'resources/aionui_logo_no_border.png',
    'resources/aionui-banner-1.png',
    'resources/kimi',
    'resources/packycode.png',
  ];
  for (const file of removedAssets) {
    if (existsSync(join(root, file))) violations.push(`${file}: obsolete promotional asset returned`);
  }

  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = auditBranding();
  if (violations.length > 0) {
    console.error('Branding audit failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log('Branding audit passed: CSBU WorkMate identity and promotion policy are intact.');
  }
}

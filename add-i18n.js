const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'packages/desktop/src/renderer/services/i18n/locales');
const langs = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR', 'ru-RU', 'uk-UA'];

const newKeys = {
  expandFlyout: 'Expand diff view',
  expandFlyoutAria: 'Open source control in a larger overlay',
  flyoutTitle: 'Source control',
  flyoutDescription: 'Review, stage, and commit changes with more room for diffs.',
};

for (const lang of langs) {
  const filePath = path.join(localesDir, lang, 'conversation.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.workspace) data.workspace = {};
    if (!data.workspace.changes) data.workspace.changes = {};

    Object.assign(data.workspace.changes, newKeys);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Updated ${lang}/conversation.json`);
  }
}

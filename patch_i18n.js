const fs = require('fs');
const path = require('path');

const localesPath = path.join(__dirname, 'packages/desktop/src/renderer/services/i18n/locales');
const locales = fs.readdirSync(localesPath).filter((d) => fs.statSync(path.join(localesPath, d)).isDirectory());

const newKeys = {
  workspace: {
    changes: {
      remoteChanges: 'Remote Changes',
      diffWithBranch: 'Diff ({{count}}) — {{branch}}',
      diffCount: 'Diff ({{count}})',
      diff: 'Diff',
      noActiveWorkspace: 'No active workspace',
      noActiveWorkspaceDesc: 'Open a conversation with a workspace to see diffs.',
      discardConfirmTitle: 'Discard changes?',
      discardConfirmContent: 'Are you sure you want to discard changes in {{file}}? This action cannot be undone.',
      commitSuccess: 'Successfully committed changes.',
      initSuccess: 'Initialized new Git repository.',
      gitNotInstalled: "Git isn't installed",
      gitNotInstalledDesc: 'Please install Git to enable version control features.',
      noRepo: "This folder isn't a Git repository.",
      noRepoDesc: 'Initialize one to track changes.',
      initHint: 'A default .gitignore will be added.',
      initRepo: 'Initialize Git repository',
      conflicted: 'Conflicted',
      diffTooLarge: 'Diff is too large to render.',
      commitPlaceholder: 'Commit message...',
      commitButton: 'Commit {{count}} staged',
    },
  },
};

const deepMerge = (target, source) => {
  for (const key in source) {
    if (source[key] instanceof Object) {
      Object.assign(source[key], deepMerge(target[key] || {}, source[key]));
    }
  }
  Object.assign(target || {}, source);
  return target;
};

for (const locale of locales) {
  const filePath = path.join(localesPath, locale, 'conversation.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.workspace = data.workspace || {};
    data.workspace.changes = data.workspace.changes || {};
    deepMerge(data.workspace.changes, newKeys.workspace.changes);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

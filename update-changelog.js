const fs = require('fs');
const path = require('path');

const changelogPath = '/Users/matt/chisl-full/CHANGELOG.md';
let content = fs.readFileSync(changelogPath, 'utf8');

const today = new Date().toISOString().split('T')[0];

const newEntry = `## ${today}
### AionUi
- Added a full-screen fly-out modal for the Git diff view to improve the source control review experience
`;

if (content.includes(`## ${today}`)) {
  content = content.replace(`## ${today}\n`, newEntry);
} else {
  // Insert at the first '## '
  const lines = content.split('\n');
  const firstHeaderIndex = lines.findIndex((line) => line.startsWith('## '));
  if (firstHeaderIndex !== -1) {
    lines.splice(firstHeaderIndex, 0, newEntry);
    content = lines.join('\n');
  } else {
    content = newEntry + '\n' + content;
  }
}

fs.writeFileSync(changelogPath, content, 'utf8');
console.log('Changelog updated');

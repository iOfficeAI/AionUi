// Read-only size inventory. Logical ASAR bytes are not compressed installer savings.
const fs = require('node:fs');
const path = require('node:path');
function inventory(archive, resources) {
  const fd = fs.openSync(archive, 'r');
  let header;
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16) throw new Error('Truncated ASAR');
    const length = prefix.readUInt32LE(12);
    if (length > 64 * 1024 * 1024 || length < 2) throw new Error('Invalid ASAR header size');
    const bytes = Buffer.alloc(length);
    if (fs.readSync(fd, bytes, 0, length, 16) !== length) throw new Error('Truncated ASAR header');
    header = JSON.parse(bytes.toString());
  } finally {
    fs.closeSync(fd);
  }
  const packages = {};
  const files = [];
  let packedLogicalBytes = 0,
    unpackedLogicalBytes = 0;
  function visit(node, name = '') {
    for (const [key, value] of Object.entries(node.files || {})) {
      const filename = name ? `${name}/${key}` : key;
      if (value.files) visit(value, filename);
      else if (Number.isSafeInteger(value.size)) {
        files.push({ path: filename, bytes: value.size, unpacked: !!value.unpacked });
        if (value.unpacked) unpackedLogicalBytes += value.size;
        else packedLogicalBytes += value.size;
        const match = filename.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//);
        if (match) packages[match[1]] = (packages[match[1]] || 0) + value.size;
      }
    }
  }
  visit(header);
  const developmentCandidates = files.filter((file) =>
    /(?:\.d\.ts$|\/(?:tests?|__tests__|examples?|docs)\/|\/(?:README|CHANGELOG)(?:\.|$))/i.test(file.path)
  );
  function size(directory) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) return { logicalBytes: 0, allocatedBytes: 0 };
    if (!stat.isDirectory()) return { logicalBytes: stat.size, allocatedBytes: stat.blocks * 512 };
    return fs.readdirSync(directory).reduce(
      (sum, name) => {
        const child = size(path.join(directory, name));
        return {
          logicalBytes: sum.logicalBytes + child.logicalBytes,
          allocatedBytes: sum.allocatedBytes + child.allocatedBytes,
        };
      },
      { logicalBytes: 0, allocatedBytes: 0 }
    );
  }
  return {
    schema: 1,
    archive: path.resolve(archive),
    archiveBytes: fs.statSync(archive).size,
    packedLogicalBytes,
    unpackedLogicalBytes,
    largestFiles: files.toSorted((a, b) => b.bytes - a.bytes).slice(0, 40),
    developmentCandidates: developmentCandidates.toSorted((a, b) => b.bytes - a.bytes).slice(0, 100),
    developmentCandidateLogicalBytes: developmentCandidates.reduce((sum, file) => sum + file.bytes, 0),
    largestPackages: Object.fromEntries(
      Object.entries(packages)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 25)
    ),
    resources: resources
      ? Object.fromEntries(fs.readdirSync(resources).map((name) => [name, size(path.join(resources, name))]))
      : undefined,
    interpretation:
      'Inventory only; runtime safety and compressed installer savings require candidate build acceptance.',
  };
}
if (require.main === module) console.log(JSON.stringify(inventory(process.argv[2], process.argv[3]), null, 2));
module.exports = { inventory };

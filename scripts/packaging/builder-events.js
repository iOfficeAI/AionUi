const fs = require('node:fs');
const starts = new Map();

module.exports = function recordArtifactTiming(event) {
  if (!process.env.BUILD_STAGE_REPORT || !event.file) return;
  if (event.targetPresentableName) {
    starts.set(event.file, {
      time: performance.now(),
      startedAt: new Date().toISOString(),
      target: event.targetPresentableName,
    });
    return;
  }
  const start = starts.get(event.file);
  if (!start) return;
  starts.delete(event.file);
  const record = {
    stage: `installer-${start.target}-including-signing`,
    status: 'ok',
    startedAt: start.startedAt,
    elapsedMs: Math.round(performance.now() - start.time),
  };
  fs.appendFileSync(process.env.BUILD_STAGE_REPORT, `${JSON.stringify(record)}\n`);
};

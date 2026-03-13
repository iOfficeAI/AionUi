const fs = require('fs');
const path = require('path');

const RUNTIME_COMPILED_ARTIFACT_RE = /^(remote-control|channel-service)(\.exe)?$/;

function listCompiledRuntimeArtifacts(runtimeDir) {
  if (!fs.existsSync(runtimeDir)) {
    return [];
  }

  return fs.readdirSync(runtimeDir).filter((name) => RUNTIME_COMPILED_ARTIFACT_RE.test(name));
}

function removeCompiledRuntimeArtifacts(runtimeDir) {
  const artifacts = listCompiledRuntimeArtifacts(runtimeDir);

  for (const artifactName of artifacts) {
    fs.rmSync(path.join(runtimeDir, artifactName), { force: true });
  }

  return artifacts;
}

module.exports = {
  RUNTIME_COMPILED_ARTIFACT_RE,
  listCompiledRuntimeArtifacts,
  removeCompiledRuntimeArtifacts,
};

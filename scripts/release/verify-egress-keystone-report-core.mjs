export const EGRESS_KEYSTONE_VERIFIER_VERSION = 'verify-egress-keystone-report/v0';

export const EGRESS_KEYSTONE_STATUS_EXIT_CODES = {
  PASS: 0,
  BLOCKED_TEST_MISSING: 2,
  BLOCKED_TEST_SKIPPED: 3,
  BLOCKED_TEST_FAILED: 4,
  BLOCKED_REPORT_MALFORMED: 5,
};

const DEFAULT_FILE_PATTERN = /command-eve-egress-boundary\.e2e\.(?:ts|js)$/;
const DEFAULT_TITLE_PATTERN = /blocks sensitive data from the real EVE GUI chat path/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['passed', 'pass'].includes(value)) return 'passed';
  if (['skipped', 'skip', 'interrupted'].includes(value)) return 'skipped';
  if (['failed', 'fail', 'timedout', 'timedOut'].map((item) => item.toLowerCase()).includes(value)) return 'failed';
  if (value) return value;
  return 'unknown';
}

function titleMatches(title, pattern) {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(String(title || ''));
  return String(title || '').includes(String(pattern));
}

function fileMatches(file, pattern) {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(String(file || ''));
  return String(file || '').includes(String(pattern));
}

function collectSpecsFromSuite(suite, out = []) {
  if (!suite || typeof suite !== 'object') return out;
  for (const spec of asArray(suite.specs)) out.push(spec);
  for (const child of asArray(suite.suites)) collectSpecsFromSuite(child, out);
  return out;
}

function extractResultStatuses(testCase) {
  const statuses = [];
  for (const result of asArray(testCase?.results)) {
    statuses.push(normalizeStatus(result?.status));
  }
  if (statuses.length === 0 && testCase?.status) statuses.push(normalizeStatus(testCase.status));
  return statuses.length ? statuses : ['unknown'];
}

export function extractPlaywrightTests(
  report,
  { filePattern = DEFAULT_FILE_PATTERN, titlePattern = DEFAULT_TITLE_PATTERN } = {}
) {
  const specs = [];
  if (Array.isArray(report?.suites)) {
    for (const suite of report.suites) collectSpecsFromSuite(suite, specs);
  }
  if (Array.isArray(report?.specs)) specs.push(...report.specs);

  const matches = [];
  for (const spec of specs) {
    const file = spec?.file || '';
    const title = spec?.title || spec?.titlePath?.join(' ') || '';
    if (!fileMatches(file, filePattern)) continue;
    if (!titleMatches(title, titlePattern)) continue;
    for (const testCase of asArray(spec.tests)) {
      const testTitle = testCase?.title || title;
      const statuses = extractResultStatuses(testCase);
      for (const status of statuses) {
        matches.push({
          file,
          title: testTitle,
          spec_title: title,
          status,
          project_name: testCase?.projectName || testCase?.project_name || '',
        });
      }
    }
    if (!Array.isArray(spec.tests) || spec.tests.length === 0) {
      matches.push({ file, title, spec_title: title, status: normalizeStatus(spec.status) });
    }
  }
  return matches;
}

export function evaluateEgressKeystoneReport(
  report,
  { requirePassed = true, filePattern = DEFAULT_FILE_PATTERN, titlePattern = DEFAULT_TITLE_PATTERN } = {}
) {
  if (!report || typeof report !== 'object') {
    return {
      status: 'BLOCKED_REPORT_MALFORMED',
      exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_REPORT_MALFORMED,
      detail: 'Playwright JSON report is not an object',
      matches: [],
      counts: {},
    };
  }

  const matches = extractPlaywrightTests(report, { filePattern, titlePattern });
  const counts = matches.reduce((acc, match) => {
    acc[match.status] = (acc[match.status] || 0) + 1;
    return acc;
  }, {});

  if (matches.length === 0) {
    return {
      status: 'BLOCKED_TEST_MISSING',
      exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_TEST_MISSING,
      detail: 'Required Command EVE Playwright proof was not found in the JSON report',
      matches,
      counts,
    };
  }

  if ((counts.failed || 0) > 0) {
    return {
      status: 'BLOCKED_TEST_FAILED',
      exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_TEST_FAILED,
      detail: 'Required Command EVE Playwright proof failed',
      matches,
      counts,
    };
  }

  if (requirePassed && (counts.skipped || 0) > 0) {
    return {
      status: 'BLOCKED_TEST_SKIPPED',
      exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_TEST_SKIPPED,
      detail: 'Required Command EVE Playwright proof was skipped; skipped is not release proof',
      matches,
      counts,
    };
  }

  if (requirePassed && (counts.passed || 0) === 0) {
    return {
      status: 'BLOCKED_TEST_MISSING',
      exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_TEST_MISSING,
      detail: 'Required Command EVE Playwright proof did not produce a passed result',
      matches,
      counts,
    };
  }

  return {
    status: 'PASS',
    exit_code: EGRESS_KEYSTONE_STATUS_EXIT_CODES.PASS,
    detail: 'Required Command EVE Playwright proof passed',
    matches,
    counts,
  };
}

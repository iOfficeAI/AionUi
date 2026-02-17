/**
 * onQueueInit hook for Code Review Queue Assistant
 *
 * Demonstrates the queueMessages feature by automatically queuing
 * multiple review passes after the user's initial message.
 *
 * Flow:
 * 1. User sends first message (e.g., "Review the codebase")
 * 2. Agent responds with initial project analysis
 * 3. This hook queues 4 follow-up review prompts
 * 4. Each prompt is sent automatically after the previous one finishes
 * 5. User sees all 5 review passes without manual prompting
 */
module.exports = {
  onQueueInit: {
    handler: async (context) => {
      // Only queue for ACP-backed agents
      if (!context.backend) return {};

      return {
        queueMessages: [
          {
            content: [
              '## Security Review Pass',
              '',
              'Now perform a security-focused review of the codebase. Focus on:',
              '',
              '1. **Injection vulnerabilities** - SQL injection, XSS, command injection, path traversal',
              '2. **Authentication & authorization** - Missing auth checks, broken access control, session management',
              '3. **Secrets & credentials** - Hardcoded API keys, passwords, tokens in source code',
              '4. **Input validation** - Unsanitized user input, missing boundary checks',
              '5. **Dependency vulnerabilities** - Known CVEs in dependencies, outdated packages',
              '6. **Data exposure** - Sensitive data in logs, error messages, or API responses',
              '',
              'For each finding, rate severity (Critical/High/Medium/Low) and suggest a fix.',
              'End with a summary table.',
            ].join('\n'),
            priority: 'normal',
            source: 'hook',
          },
          {
            content: [
              '## Performance Review Pass',
              '',
              'Now perform a performance-focused review. Focus on:',
              '',
              '1. **Algorithm complexity** - O(n^2) or worse loops, unnecessary nested iterations',
              '2. **Memory usage** - Large object allocations, memory leaks, unbounded caches',
              '3. **I/O efficiency** - N+1 queries, missing batch operations, synchronous blocking',
              '4. **Caching opportunities** - Repeated expensive computations, missing memoization',
              '5. **Bundle/load size** - Unused imports, large dependencies, missing code splitting',
              '6. **Concurrency** - Race conditions, missing debounce/throttle, thread safety',
              '',
              'For each finding, estimate the impact and suggest an optimization.',
              'End with a summary table.',
            ].join('\n'),
            priority: 'normal',
            source: 'hook',
          },
          {
            content: [
              '## Code Quality Review Pass',
              '',
              'Now perform a code quality review. Focus on:',
              '',
              '1. **Naming conventions** - Unclear variable/function names, inconsistent style',
              '2. **Code structure** - God classes, functions over 50 lines, deep nesting',
              '3. **DRY violations** - Duplicated logic, copy-paste patterns',
              '4. **Error handling** - Swallowed errors, missing error boundaries, unclear error messages',
              '5. **Type safety** - Any types, missing null checks, unsafe type assertions',
              '6. **API design** - Inconsistent interfaces, leaky abstractions, tight coupling',
              '',
              'For each finding, explain why it matters and show the improved version.',
              'End with a summary table.',
            ].join('\n'),
            priority: 'normal',
            source: 'hook',
          },
          {
            content: [
              '## Test Coverage Review Pass',
              '',
              'Now review the testing strategy and coverage. Focus on:',
              '',
              '1. **Missing tests** - Untested critical paths, business logic without tests',
              '2. **Test quality** - Tests that only check happy paths, missing edge cases',
              '3. **Test organization** - Test file structure, naming conventions, test isolation',
              '4. **Mocking strategy** - Over-mocking, missing integration tests, brittle mocks',
              '5. **Error scenario tests** - Missing failure mode tests, timeout handling, retry logic',
              '6. **Test maintainability** - Hard-to-understand tests, excessive setup, magic numbers',
              '',
              'Suggest specific test cases that should be added.',
              'End with a summary table.',
              '',
              '---',
              '',
              '## Final Summary',
              '',
              'After this pass, provide a consolidated summary across all 4 review passes:',
              '- Total findings by severity',
              '- Top 5 most critical items to address first',
              '- Overall code health score (1-10)',
              '- Recommended next steps',
            ].join('\n'),
            priority: 'normal',
            source: 'hook',
          },
        ],
      };
    },
    priority: 50,
  },
};

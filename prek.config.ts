import { defineConfig } from 'prek';

export default defineConfig({
  checks: [
    {
      // Run ESLint on changed TS/TSX files
      name: 'ESLint',
      match: ['**/*.ts', '**/*.tsx'],
      run: 'eslint --quiet {files}',
    },
    {
      // Run Prettier check on changed source files
      name: 'Prettier',
      match: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.json', '**/*.css', '**/*.md'],
      run: 'prettier --check {files}',
    },
    {
      // TypeScript type check (always runs full project check)
      name: 'TypeScript',
      match: ['**/*.ts', '**/*.tsx'],
      run: 'bunx tsc --noEmit',
      runOnAll: true,
    },
  ],
});

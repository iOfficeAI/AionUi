#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Mermaid diagram renderer using beautiful-mermaid
 * Usage:
 *   npx tsx render.ts <mermaid-file> [--ascii] [--theme <theme>] [--output <file>]
 *   echo "graph TD; A-->B" | npx tsx render.ts --stdin [--ascii]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

// Auto-install beautiful-mermaid if not present
async function ensureDependency(): Promise<void> {
  try {
    await import('beautiful-mermaid');
  } catch {
    console.error('Installing beautiful-mermaid...');
    execSync('npm install beautiful-mermaid', { stdio: 'inherit' });
  }
}

// Dynamic import for beautiful-mermaid (ESM module)
async function loadMermaid() {
  await ensureDependency();
  const mod = await import('beautiful-mermaid');
  return mod;
}

interface Options {
  input?: string;
  stdin: boolean;
  ascii: boolean;
  theme?: string;
  output?: string;
}

function parseArgs(args: string[]): Options {
  const options: Options = { stdin: false, ascii: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stdin') {
      options.stdin = true;
    } else if (arg === '--ascii') {
      options.ascii = true;
    } else if (arg === '--theme' && args[i + 1]) {
      options.theme = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    }
  }

  return options;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Mermaid Diagram Renderer (beautiful-mermaid)

Usage:
  npx tsx render.ts <file.mmd> [options]
  echo "graph TD; A-->B" | npx tsx render.ts --stdin [options]

Options:
  --ascii          Output ASCII art instead of SVG
  --theme <name>   Theme name (e.g., github-dark, dracula, nord)
  --output <file>  Write to file instead of stdout
  --stdin          Read mermaid code from stdin
  -h, --help       Show this help

Supported diagram types:
  - Flowcharts (graph TD/LR/etc)
  - Sequence diagrams
  - State diagrams
  - Class diagrams
  - ER diagrams

Examples:
  npx tsx render.ts diagram.mmd --output diagram.svg
  npx tsx render.ts diagram.mmd --ascii
  echo "graph LR; A-->B-->C" | npx tsx render.ts --stdin --ascii
`);
    process.exit(0);
  }

  const options = parseArgs(args);

  // Get mermaid code
  let mermaidCode: string;
  if (options.stdin) {
    mermaidCode = await readStdin();
  } else if (options.input) {
    const filePath = resolve(options.input);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    mermaidCode = readFileSync(filePath, 'utf8');
  } else {
    console.error('Error: No input provided. Use --stdin or provide a file path.');
    process.exit(1);
  }

  if (!mermaidCode.trim()) {
    console.error('Error: Empty mermaid code');
    process.exit(1);
  }

  try {
    const mermaid = await loadMermaid();
    let result: string;

    if (options.ascii) {
      // ASCII output
      result = mermaid.renderMermaidAscii(mermaidCode);
    } else {
      // SVG output - theme must be an object, not a string
      let themeColors = undefined;
      if (options.theme && mermaid.THEMES) {
        themeColors = mermaid.THEMES[options.theme];
        if (!themeColors) {
          console.error(`Warning: Unknown theme "${options.theme}". Available: ${Object.keys(mermaid.THEMES).join(', ')}`);
        }
      }
      result = await mermaid.renderMermaid(mermaidCode, themeColors);
    }

    if (options.output) {
      writeFileSync(options.output, result);
      console.error(`Written to: ${options.output}`);
    } else {
      console.log(result);
    }
  } catch (error) {
    console.error('Error rendering diagram:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

# AionUI Code Review Style Guide

## Overview

This document defines the coding standards and best practices for the AionUI project. The AI code reviewer should use these guidelines when reviewing pull requests.

## Technology Stack

- **Runtime**: Bun
- **Framework**: Electron + React
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + Arco Design
- **State Management**: React hooks + SWR
- **i18n**: react-i18next (support: en-US, zh-CN, zh-TW, ja-JP, ko-KR)

## Code Quality Standards

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` type - use `unknown` or proper generics
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for exported functions
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### React

- Use functional components with hooks
- Prefer `useMemo` and `useCallback` for expensive computations
- Avoid inline functions in JSX when possible
- Use proper dependency arrays in hooks
- Follow React naming conventions (PascalCase for components)

### Error Handling

- Always handle Promise rejections
- Use try-catch for async/await
- Provide meaningful error messages
- Log errors appropriately using console.error

### Security

- Never commit secrets or API keys
- Validate all user inputs
- Sanitize data before rendering (XSS prevention)
- Use secure IPC communication patterns in Electron

### Performance

- Lazy load components when appropriate
- Avoid unnecessary re-renders
- Use proper memoization
- Consider bundle size when adding dependencies

## File Organization

```
src/
├── common/         # Shared utilities and types
├── process/        # Main process code (Electron)
├── renderer/       # Renderer process code (React)
│   ├── components/ # Reusable UI components
│   ├── hooks/      # Custom React hooks
│   ├── pages/      # Page components
│   └── i18n/       # Internationalization
└── agent/          # AI agent related code
```

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Tests
- `chore:` - Maintenance tasks

## Review Priorities

When reviewing code, prioritize in this order:

1. **Security** - Vulnerabilities, secrets exposure, injection attacks
2. **Correctness** - Logic errors, edge cases, data validation
3. **Performance** - Memory leaks, unnecessary computations
4. **Maintainability** - Code readability, proper abstractions
5. **Style** - Naming conventions, formatting (lowest priority)

## Language

- Code comments should be in English or bilingual (English + Chinese)
- Use clear and descriptive variable/function names
- Avoid abbreviations unless widely understood

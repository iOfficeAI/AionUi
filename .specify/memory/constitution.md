# AionUi Constitution

## Core Principles

### I. Multi-Agent AI Integration
AionUi serves as a unified desktop interface for multiple AI terminal agents (Gemini CLI, Claude Code, Qwen Code, etc.). Each AI agent integration must be:
- Protocol-agnostic with standardized adapters
- Independently manageable and configurable
- Cross-platform compatible (macOS, Windows, Linux)
- Real-time streaming capable for live interaction

### II. Modular Architecture First
Every major feature is implemented as an independent, testable module:
- Bridge pattern for IPC communication (dialog, fs, conversation, auth, etc.)
- Agent managers as separate, swappable components
- UI components with clear separation of concerns
- Shared utilities and common interfaces

### III. User Experience Excellence
User interaction must be intuitive and efficient:
- Chat-based interface with file drag-and-drop support
- Multi-conversation management with context isolation
- Workspace integration for seamless file operations
- Responsive UI with proper loading states and error handling

### IV. Security and Privacy First
All user data and AI interactions must be secure:
- Local storage of conversation history and settings
- Secure API key management with encryption
- No data transmission without explicit user consent
- Proper credential isolation between different AI providers

### V. Developer Experience and Maintainability
Code must be maintainable and extensible:
- TypeScript for type safety across the entire stack
- ESLint and Prettier for consistent code quality
- Modular commit message format (feat/fix/chore/docs/refactor)
- Clear documentation for architectural decisions

## Technology Standards

### Electron Framework
- Use Electron Forge for build and packaging management
- Maintain main process and renderer process separation
- Leverage IPC bridges for secure communication
- Support hot reload in development for rapid iteration

### React and TypeScript
- React with functional components and hooks
- Strict TypeScript configuration with comprehensive type checking
- UnoCSS for atomic CSS styling
- Arco Design components for consistent UI patterns

### State Management
- React Context + SWR for data fetching and caching
- Local electron-store for persistent application settings
- File-system based storage for conversation history
- Event-driven communication between components

## Development Workflow

### Code Quality Gates
- Pre-commit hooks with lint-staged for automatic formatting
- ESLint warnings must be addressed before merge
- No console.log statements in production code
- All public interfaces must have TypeScript documentation

### Version Management
- Semantic versioning (MAJOR.MINOR.PATCH) strictly enforced
- Automated version updates via release scripts
- CI/CD pipeline handles building and code signing
- Git tag creation automated on version changes

### Branching Strategy
- Feature branches for new functionality development
- Main branch for production-ready code
- No direct commits to main branch
- Pull request reviews required for all changes

## Governance

### Architecture Decisions
- Constitutional principles supersede implementation preferences
- Breaking changes require architectural review and migration plan
- New AI agent integrations must follow established adapter patterns
- Performance regressions require justification and timeline for resolution

### Compliance Requirements
- All features must work across supported platforms (macOS, Windows, Linux)
- User data privacy and security standards are non-negotiable
- Accessibility considerations for all UI components
- Regular dependency updates for security patches

**Version**: 1.0.0 | **Ratified**: 2025-01-22 | **Last Amended**: 2025-01-22
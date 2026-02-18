# Ralph — Reference

## PRD Format

`.ralph/prd.json` structure:

```json
{
  "project": "project-name",
  "branchName": "ralph/feature-name",
  "description": "High-level feature description",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "As a user, I want X so that Y",
      "acceptanceCriteria": ["Testable criterion 1", "Testable criterion 2"],
      "priority": 1,
      "passes": false
    }
  ]
}
```

Stories sized for one context window each. Ordered by dependency: schema/models → business logic → API → UI. All `passes: false` initially. Acceptance criteria must be concrete and testable.

## Quality Gates

Discover commands by reading `package.json` scripts, `Makefile`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or the project README.

| Stack             | Commands                                               |
| ----------------- | ------------------------------------------------------ |
| Node / TypeScript | `npm run typecheck` · `npm run lint` · `npm test`      |
| Python            | `mypy .` · `ruff check .` · `pytest`                   |
| Go                | `go vet ./...` · `golangci-lint run` · `go test ./...` |
| Rust              | `cargo check` · `cargo clippy` · `cargo test`          |

Fix every failure before signalling a story done.

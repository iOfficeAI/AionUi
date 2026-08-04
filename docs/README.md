# GEAUi Docs

Documentation is organized by reader intent, not by document type. The root `readme.md` is the development entry point; product introductions live in `readme/`.

| Directory                       | For whom          | What lives here                                                                                                   |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`guides/`](guides)             | Users & operators | How to deploy, test, and run the product. Server deployment, WebUI, Hub testing, CDP debugging.                   |
| [`contributing/`](contributing) | Contributors      | Dev environment setup, file-structure conventions, PR automation workflow.                                        |
| [`prds/`](prds)                 | Product team      | Formal Product Requirement Documents maintained by the product team. **Do not reorganize without their consent.** |
| [`readme/`](readme)             | Product users     | Product introductions in Simplified Chinese and other supported languages.                                        |
| [`theming/`](theming)           | UI contributors   | Theme token reference and theme-authoring guidance.                                                               |

## Quick pointers

- New to the product? Start with [`readme/readme_ch.md`](readme/readme_ch.md).
- Setting up a dev environment? See [`contributing/development.md`](contributing/development.md).
- Writing code? Start with [`AGENTS.md`](../AGENTS.md) at the repo root, then load the task-specific document it names.
- Deploying a server? [`guides/deploy-server.md`](guides/deploy-server.md).

## Where to put new docs

| Content type                                      | Destination                 |
| ------------------------------------------------- | --------------------------- |
| User/ops-facing how-to                            | `guides/`                   |
| Contributor convention, workflow, or tooling rule | `contributing/`             |
| Formal PRD owned by product team                  | `prds/` (coordinate first)  |
| Product introduction or translation               | `readme/readme_<locale>.md` |
| Theme token documentation                         | `theming/`                  |

# Development guide

## Commit convention

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Continuous integration

| Workflow | Runs |
| --- | --- |
| `.github/workflows/ci.yml` | Python lint, backend and generator tests, ontology freshness (`just data::check`); widget lint, format, type check, no-third-party-hosts gate, tests |
| `.github/workflows/mkdocs-ci.yml` | Strict MkDocs build; deploys to GitHub Pages on push to `main` |

Run the same checks locally with `just check::all`.

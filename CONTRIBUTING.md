# Contribution Guidelines

:tada: **First off, thank you for considering contributing to our project!**
:tada:

This is a community-driven project, so it's people like you that make it useful
and successful. These are some of the many ways to contribute:

- 🐛, 🎊 Submitting bug reports and feature requests.

## Ground Rules

The goal is to maintain a diverse community that's pleasant for everyone.
**Please be considerate and respectful of others**. Everyone must abide by our
[Code of Conduct][docs/code-of-conduct.md] and we encourage all to read it
carefully.

### Maintainers Guide

See the [maintenance guide here](docs/development-guide.md).

## Working with AI agents

The coding conventions this repository follows — project layout, error
handling, testing, documentation style — live in a shared repository rather
than in this one, so every `sdsc-ordes` project follows the same set. Clone it
into the gitignored `.agents/` path:

```bash
git clone git@github.com:sdsc-ordes/agents .agents
```

`CLAUDE.md` at the repository root is a one-line pointer at `.agents/AGENTS.md`.
Both it and `.agents/` are gitignored: the conventions are shared, not forked
per project, so they are pulled rather than committed here. Without that clone
an agent working in this repository has no conventions to follow.

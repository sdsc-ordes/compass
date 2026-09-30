# Contributing

Bug reports and feature requests are welcome as GitHub issues.

Everyone taking part must follow the [Code of Conduct](docs/code-of-conduct.md).
Maintainer conventions (commits, CI) are in the
[development guide](docs/development-guide.md).

## AI coding agents

The shared `sdsc-ordes` agent conventions are not vendored here. Clone them into
the gitignored `.agents/` and point your agent at `.agents/AGENTS.md`:

```bash
git clone git@github.com:sdsc-ordes/agents .agents
echo '@.agents/AGENTS.md' > CLAUDE.md
```

`.agents/`, `AGENTS.md`, `CLAUDE.md` and `.claude/skills` are gitignored.

# AGENTS.md

## Cursor Cloud specific instructions

### Repository state

This repository currently contains **no application or service code**. The only
tracked file (besides this one) is `.github/workflows/wpcom.yml`, a GitHub
Actions workflow ("Publish Website") that checks out the repo and uploads its
contents as an artifact named `wpcom`. That workflow runs in GitHub CI only — it
does not start any local service.

Because there is no product code, there is:

- **Nothing to install** — no `package.json`, `requirements.txt`, `go.mod`,
  `composer.json`, `Gemfile`, or any other dependency manifest.
- **Nothing to build** — no build system, `Makefile`, or `docker-compose`.
- **Nothing to run** — no backend, frontend, CLI, or other runnable service.

The environment update script is therefore intentionally a no-op. If/when real
application code is added, update the environment setup (update script and this
file) to install dependencies and document how to lint, test, build, and run the
new service(s).

### Validating the one existing artifact

The only thing that can be checked locally is that the workflow YAML is
well-formed:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/wpcom.yml')); print('workflow YAML OK')"
```

Note: GitHub Actions' `on:` key parses to the YAML boolean `true` with a generic
YAML loader. That is expected and does not indicate an invalid workflow.

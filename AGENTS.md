# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

This repository is a small **static website** plus a GitHub Actions workflow
that publishes the site as a `wpcom` artifact.

- Site files live at the repo root: `index.html`, `styles.css`, `app.js`.
- `.github/workflows/wpcom.yml` ("Publish Website") runs in GitHub CI on push
  to `main` (or `workflow_dispatch`). It uploads the repo contents as an
  artifact named `wpcom`. It does **not** start a local server.

There is no Node/Python app, no package manager, and no backend. The
environment update script is a no-op.

### Run the site locally

`index.html` is self-contained (CSS and JS are inline). The simplest way to
view it is to open that file in a browser — no server required.

To serve it instead:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/`. The page lets you save name/value pairs in
`localStorage` (a local demo of creating environment variables).

### Validate the workflow YAML

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/wpcom.yml')); print('workflow YAML OK')"
```

Note: GitHub Actions' `on:` key parses to the YAML boolean `true` with a generic
YAML loader. That is expected and does not indicate an invalid workflow.

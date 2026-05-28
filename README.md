# Pi agent config share

Shareable, public-safe copy of a personal Pi agent configuration.

This repo is intended as a starting point for colleagues who want to compare or bootstrap their own Pi setup. It intentionally excludes workplace-specific private endpoints, credentials, OAuth state, sessions, caches, package installs, and logs.

Backed up:

- `settings.json`, `AGENTS.md`, optional system/keybinding/model files
- `mcp.json` with environment-variable placeholders only
- generic `extensions/`, `skills/`, `prompts/`, `themes/`
- small backup/update helper scripts

Not backed up:

- sessions, package installs, caches, logs
- `auth.json`, `mcp-oauth/`, `secrets/`
- binaries in `bin/`
- workplace-specific MCP endpoints and skills

Local MCP secrets can live in `~/.pi/agent/secrets/mcp.env` and should be loaded by your shell before starting Pi.

Restore sketch:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
git clone https://github.com/ThePhoenixCoding/pi-agent-config-share.git ~/.pi/agent
pi update --extensions
pi
/login
```

Recreate local secrets manually in `~/.pi/agent/secrets/mcp.env`.

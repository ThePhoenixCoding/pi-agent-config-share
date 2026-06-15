# Pi agent config backup

Private whitelist backup for global Pi configuration.

Backed up:

- `settings.json`, `AGENTS.md`, optional system/keybinding/model files
- `mcp.json` with environment-variable placeholders only
- `extensions/`, `skills/`, `prompts/`, `themes/`
- small backup/update helper scripts

Not backed up:

- sessions, package installs, caches, logs
- `auth.json`, `mcp-oauth/`, `secrets/`
- binaries in `bin/`

Local MCP secrets live in `~/.pi/agent/secrets/mcp.env` and are loaded by the `pi()` shell function in `~/.zshrc`.

Restore sketch:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
git clone https://github.com/ThePhoenixCoding/pi-agent-config.git ~/.pi/agent
pi update --extensions
pi
/login
```

Recreate local secrets manually in `~/.pi/agent/secrets/mcp.env`.

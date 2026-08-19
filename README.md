# Waverunner for Cursor

Cursor Marketplace plugin for the [Waverunner](https://waverunner.adwave.com) MCP server. Agents can run self-serve multichannel ads: add businesses, create and launch campaigns, and read performance.

This is a single Cursor Plugin (`.cursor-plugin/plugin.json` at the repo root). Submit this repository URL at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) — no extra packaging.

## Install

1. Install **Waverunner** from the Cursor Marketplace, or add this GitHub repository as a plugin.
2. Create an API key in Waverunner: **Settings → API keys**. Copy it once (keys look like `wr_…`).
3. In Cursor, open **Plugins → Configure** on Waverunner and paste the key into `WAVERUNNER_API_KEY`.

Keys are scoped to the organization that was active when you created them. Switch workspaces in the Waverunner sidebar first if you need a key for another organization.

Never commit a real key. The plugin only declares the variable name; Cursor substitutes `${WAVERUNNER_API_KEY}` at runtime.

## What it connects to

| | |
| --- | --- |
| MCP URL | `https://waverunner.adwave.com/api/mcp` |
| Transport | Public HTTPS (Streamable HTTP) |
| Auth | Bearer API key |

Grok Bot can only use public HTTPS MCP. This plugin uses that remote URL — no localhost and no stdio-only server.

```json
{
  "mcpServers": {
    "waverunner": {
      "url": "https://waverunner.adwave.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${WAVERUNNER_API_KEY}"
      }
    }
  }
}
```

## Spend safety

The bundled skill tells agents to confirm with you before `launch_campaign`, `resume_campaign`, `end_campaign`, or anything else that spends wallet money. Launching charges the first day's budget from the prepaid wallet; resuming re-charges the current day.

## Docs

- Product: [waverunner.adwave.com](https://waverunner.adwave.com)
- MCP tools and client setup: [waverunner.adwave.com/docs/mcp](https://waverunner.adwave.com/docs/mcp)

## Validate locally

```bash
node scripts/validate-plugin.mjs
```

## License

MIT © Adwave

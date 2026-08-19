---
name: waverunner
description: Use Waverunner for self-serve multichannel ads. Use when the user wants to add a business, create or manage campaigns, generate ads, or read performance through the Waverunner MCP.
---

# Waverunner

Use the Waverunner MCP for self-serve multichannel advertising: businesses, campaigns, creatives, and performance.

## Confirm before spending

Always confirm with the user before calling `launch_campaign`, `resume_campaign`, `end_campaign`, or any other tool that spends wallet money.

## Workflow

1. `add_business` with the website URL. Analysis is free. Poll `list_businesses` until status is `ready`.
2. `get_business` to review the profile and personas.
3. `create_campaign` to make a draft. Quote generation with `get_creation_quote` first when ads will be generated.
4. `get_wallet` to confirm the prepaid balance covers at least day one.
5. After the user confirms, `launch_campaign`.

After launch, prefer `get_campaign_report` and `get_campaign_customers` for results.

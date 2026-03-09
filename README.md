# auto-coder

Watches GitHub, Linear, and Slack for events, then automatically dispatches a [Crafting Coding Agent](https://www.crafting.dev/) to handle them — running continuously inside your Crafting Sandbox.

## Features

- **Multi-provider** — GitHub, GitLab, Linear, Slack
- **Webhook + polling** — real-time events via webhooks, polling as fallback to catch anything missed
- **Deduplication** — skips events the agent is already working on, preventing duplicate sessions
- **Zero-config for standard setups** — auto-configures from environment variables; no config file required
- **Customizable prompts** — [Handlebars](https://handlebarsjs.com/) templates control exactly what context the agent receives per event
- **Secure by design** — webhook signature verification, secrets never written to disk

## Quick Start

Get up and running with GitHub in ~10 minutes: **[GitHub Quick Start →](docs/quickstart.md)**

## Reference

| | |
|---|---|
| [docs/setup/index.md](docs/setup/index.md) | Full setup guide — all providers, security hardening, troubleshooting |
| [templates/auto-coder-quick-start.yaml](templates/auto-coder-quick-start.yaml) | GitHub sandbox template (annotated) |
| [templates/auto-coder-full.example.yaml](templates/auto-coder-full.example.yaml) | GitHub + Linear + Slack template |
| [config/watcher.example.yaml](config/watcher.example.yaml) | All watcher config options documented |
| [config/event-prompt.example.hbs](config/event-prompt.example.hbs) | Prompt template reference |
| [docs/watcher.md](docs/watcher.md) | Architecture: event flow, deduplication, prompt construction |

## License

[MIT](LICENSE)

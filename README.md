# auto-coder

An automated coding assistant that watches for events from GitHub, GitLab, Linear, and other providers, then executes custom commands to handle them.

## What is auto-coder?

auto-coder monitors your repositories and communication channels for events, then automatically triggers your AI coding agent or custom scripts to respond. It supports both webhook-based (real-time) and polling-based (periodic) event delivery.

**Key Features:**
- Multi-provider support (GitHub, GitLab, Linear, Slack)
- Webhook and polling modes
- Command execution with templated prompts
- Automatic deduplication to prevent duplicate work
- Secure webhook signature verification
- Provider-specific prompt templates

## Quick Start from [Crafting Sandbox](https://www.crafting.dev/)

### 1. Create a template

```bash
cs template create TEMPLATE_NAME ./templates/auto-coder.yaml
```

### 2. Create a Sandbox from the template
```bash
cs sandbox create SANDBOX_NAME -t TEMPLATE_NAME
```

### 3. Configure

Copy the example configuration:

```bash
cp config/watcher.example.yaml config/watcher.yaml
```

Edit `config/watcher.yaml`:

```yaml
server:
  host: 0.0.0.0
  port: 3000

deduplication:
  enabled: true

commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | your-ai-agent"
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  followUp: true

providers:
  github:
    enabled: true
    pollingInterval: 60
    auth:
      type: token
      tokenEnv: GITHUB_TOKEN
    options:
      botUsername: your-bot-username
      repositories:
        - owner/repo
```

### 4. Set Up Provider

Configure authentication for your provider:

- **[GitHub Setup](examples/github.md)** - Personal access tokens, webhooks
- **[Linear Setup](examples/linear.md)** - API keys, webhooks, team monitoring
- **[Slack Setup](examples/slack.md)** - Bot tokens, mention-triggered responses
- **[GitLab Setup](examples/github.md)** - Similar to GitHub setup

### 5. Run

Development mode:
```bash
pnpm run dev
```

Production mode:
```bash
pnpm run build
pnpm start
```

## Features

### Prompt Templates

Prompts are [Handlebars](https://handlebarsjs.com/) (`.hbs`) templates. The rendered `NormalizedEvent` is passed as template context, giving access to all event fields (`{{provider}}`, `{{resource.title}}`, `{{resource.comment.body}}`, etc.) along with built-in helpers like `{{#eq}}`, `{{#if}}`, and `{{resourceLink}}`.

See the example templates for the full variable reference and inline documentation:

- [`config/event-prompt.example.hbs`](config/event-prompt.example.hbs) — GitHub, GitLab, Linear
- [`config/event-prompt-slack.example.hbs`](config/event-prompt-slack.example.hbs) — Slack

For the complete format reference, see [Prompt Construction in the Watcher docs](docs/watcher.md#prompt-construction).

All current providers (GitHub, GitLab, Linear) are code platforms with similar PR-based workflows, so they work well with a single shared template. auto-coder supports provider-specific templates for future extensibility when adding providers with fundamentally different workflows (like conversational platforms).

Configure in `commandExecutor`:
```yaml
# Current: Single template for all providers
promptTemplateFile: ./config/event-prompt.example.hbs

# Future: Provider-specific templates when needed
# prompts:
#   slack: ./config/event-prompt-slack.example.hbs  # Different workflow
# promptTemplateFile: ./config/event-prompt.example.hbs  # Fallback
```

## Configuration

### Basic Configuration Options

**Server Settings:**
```yaml
server:
  host: 0.0.0.0
  port: 3000
  basePath: /api  # Optional
```

**Deduplication:**
```yaml
deduplication:
  enabled: true
  commentTemplate: "Agent is working on {id}"
```

Note: `botUsername` is configured per-provider under `providers.<name>.options.botUsername`.

**Command Executor:**
```yaml
commandExecutor:
  enabled: true
  command: "your-command"
  # Single template works for all current providers (GitHub, GitLab, Linear)
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  followUp: true
```

**Provider Configuration:**
```yaml
providers:
  <provider>:
    enabled: true
    pollingInterval: 60
    auth:
      type: token
      tokenEnv: PROVIDER_TOKEN
    options:
      # Provider-specific options
```

See `config/watcher.example.yaml` for detailed examples.

## Webhooks

Webhook endpoints: `http://your-server:3000/webhook/<provider>`

Examples:
- GitHub: `http://your-server:3000/webhook/github`
- GitLab: `http://your-server:3000/webhook/gitlab`
- Linear: `http://your-server:3000/webhook/linear`

For webhook setup instructions, see provider guides in `examples/`.

## Troubleshooting

**Polling not working:**
- Check that authentication token is set
- Verify token has correct permissions
- Ensure repositories are configured

**Webhooks not received:**
- Verify webhook URL is publicly accessible
- Check webhook secret matches configuration
- Review webhook delivery logs

**Duplicate events:**
- Verify `botUsername` matches the commenting account
- Check bot has write access
- Ensure `deduplication.enabled` is `true`

For detailed troubleshooting, see provider guides in `examples/`.

## Documentation

- [GitHub Setup Guide](examples/github.md)
- [Linear Setup Guide](examples/linear.md)
- [Watcher Guide](docs/watcher.md) - Event ingestion, prompt construction, command execution
- [Development Guide](DEVELOPMENT.md) - Architecture, API, contributing
- [Configuration Examples](config/)
- [Prompt Template (code platforms)](config/event-prompt.example.hbs)
- [Prompt Template (Slack)](config/event-prompt-slack.example.hbs)

## License

[MIT](LICENSE)

# auto-coder

An automated coding assistant that watches for events from GitHub, GitLab, Linear, and other providers, then executes custom commands to handle them.

## What is auto-coder?

auto-coder monitors your repositories for issues, pull requests, and comments, then automatically triggers your AI coding agent or custom scripts to respond. It supports both webhook-based (real-time) and polling-based (periodic) event delivery.

**Key Features:**
- Multi-provider support (GitHub, GitLab, Linear)
- Webhook and polling modes
- Command execution with templated prompts
- Automatic deduplication to prevent duplicate work
- Secure webhook signature verification

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
  botUsername: your-bot-username

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
      repositories:
        - owner/repo
      events:
        - issues
        - pull_request
```

### 4. Set Up Provider

Configure authentication for your provider:

- **[GitHub Setup](examples/github.md)** - Personal access tokens, webhooks
- **[Linear Setup](examples/linear.md)** - API keys, webhooks, team monitoring
- **GitLab** (coming soon)

### 5. Run

Development mode:
```bash
pnpm run dev:watcher
```

Production mode:
```bash
pnpm run build
pnpm start
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
  botUsername: your-bot-username
  commentTemplate: "Agent is working on {id}"
```

**Command Executor:**
```yaml
commandExecutor:
  enabled: true
  command: "your-command"
  promptTemplateFile: ./prompt.hbs
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
- [Development Guide](DEVELOPMENT.md) - Architecture, API, contributing
- [Configuration Examples](config/)

## License

[MIT](LICENSE)

# Configuration Files

This folder contains configuration files for the auto-coder watcher subsystem.

## Files

### watcher.example.yaml

Example configuration file showing all available options. Copy this to `watcher.yaml` and customize for your environment.

```bash
cp watcher.example.yaml watcher.yaml
# Edit watcher.yaml with your settings
```

### watcher.yaml

Your actual configuration file (gitignored). This is where you put your real tokens, secrets, and settings.

### watcher.test.yaml

Test configuration for local testing. Minimal setup for testing the watcher functionality.

### event-prompt.example.hbs

Handlebars template example for future command executor implementation. This template is preserved from the original design but is not currently used by the watcher.

## Configuration Options

### Server Configuration

```yaml
server:
  host: 0.0.0.0
  port: 3000
```

### Deduplication

```yaml
deduplication:
  enabled: true
  botUsername: your-bot-username
  commentTemplate: "Agent is working on session {id}"
```

### Provider Configuration (GitHub)

```yaml
providers:
  github:
    enabled: true
    pollingInterval: 60  # seconds

    auth:
      type: token
      tokenEnv: GITHUB_TOKEN

    options:
      repositories:
        - owner/repo1
        - owner/repo2

      events:
        - issues
        - pull_request

      initialLookbackHours: 1      # Default: 1 hour
      maxItemsPerPoll: 50          # Optional limit
```

## Security

- **Never commit** `watcher.yaml` to version control (it's gitignored)
- Use environment variables for secrets: `tokenEnv: GITHUB_TOKEN`
- Or use token files: `tokenFile: /path/to/token.txt`
- Implement webhook security at your infrastructure level (reverse proxy, API gateway)

## Quick Start

1. Copy example configuration:
   ```bash
   cp watcher.example.yaml watcher.yaml
   ```

2. Set your GitHub token:
   ```bash
   export GITHUB_TOKEN="ghp_your_token_here"
   ```

3. Edit `watcher.yaml` and configure:
   - Repositories to watch
   - Bot username for deduplication
   - Polling interval

4. Start the watcher:
   ```bash
   pnpm dev:watcher
   ```

## Event Handling

The watcher emits events that you can handle in your application:

```typescript
watcher.on('event', (provider, event) => {
  console.log(`Received ${provider} event:`, event);
  // Your custom logic here
});
```

Events are raw provider data (GitHub webhook payloads or API responses), giving you full flexibility to handle them as needed.

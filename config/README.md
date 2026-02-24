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

Test configuration used by integration tests. Simple setup for local testing without requiring authentication.

### event-prompt.example.hbs

**Production-tested Handlebars template** for command executor prompts, adapted from `samples/watch.go`.

This template provides comprehensive AI developer instructions for:
- Creating sandboxes with unique names
- Fetching and understanding task context
- Making code changes with testing
- Creating Pull Requests with proper linking
- Performing code reviews when needed
- Reporting analysis results

**Usage:**

1. Copy the example template (optional - can use it directly):
   ```bash
   cp event-prompt.example.hbs event-prompt.hbs
   ```

2. Reference it in your `watcher.yaml`:
   ```yaml
   commandExecutor:
     enabled: true
     command: "echo \"$PROMPT\" | claude-code"
     promptTemplateFile: ./config/event-prompt.example.hbs
     useStdin: true
     postInitialComment: true
     postOutputComment: true
   ```

**Customization:**

You can create your own template or modify the example. The template has access to:

- `provider` - Source provider (e.g., "github")
- `id` - Unique event ID
- `type` - Event type ("issue" or "pull_request")
- `action` - Event action ("created", "updated", etc.)
- `resource.*` - Resource details (title, description, repository, etc.)
- `actor.*` - Actor details (username, etc.)
- `metadata.*` - Event metadata (timestamp, deliveryId)

**Available Handlebars helpers:**
- `{{#eq a b}}...{{/eq}}` - Equality comparison
- `{{#ne a b}}...{{/ne}}` - Inequality comparison
- `{{#if condition}}...{{/if}}` - Conditional rendering
- `{{#each array}}...{{/each}}` - Array iteration
- `{{#and a b}}...{{/and}}` - Logical AND
- `{{#or a b}}...{{/or}}` - Logical OR

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
   - Command executor settings
   - Deduplication strategy
   - Comment templates

4. Start the watcher:
   ```bash
   pnpm dev:watcher
   ```

## Testing

Run integration tests with the test configuration:
```bash
pnpm test
```

This uses `watcher.test.yaml` and doesn't require authentication.

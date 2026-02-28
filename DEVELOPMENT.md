# Development Guide

This guide provides detailed information for developers and contributors working on auto-coder.

## Architecture

### Directory Structure

```
auto-coder/
├── src/
│   ├── watcher/              # Watcher subsystem
│   │   ├── types/            # Type definitions
│   │   ├── core/             # Core components
│   │   │   ├── ConfigLoader.ts
│   │   │   └── EventEmitter.ts
│   │   ├── transport/        # HTTP server and polling
│   │   │   ├── WebhookServer.ts
│   │   │   ├── WebhookHandler.ts
│   │   │   └── Poller.ts
│   │   ├── providers/        # Provider implementations
│   │   │   ├── BaseProvider.ts
│   │   │   ├── ProviderRegistry.ts
│   │   │   └── github/
│   │   │       ├── GitHubProvider.ts
│   │   │       ├── GitHubWebhook.ts
│   │   │       ├── GitHubPoller.ts
│   │   │       ├── GitHubComments.ts
│   │   │       └── GitHubReactor.ts
│   │   └── utils/            # Utilities
│   │       ├── CommandExecutor.ts
│   │       ├── logger.ts
│   │       └── errors.ts
│   ├── standalone.ts         # Standalone entry point
│   └── index.ts              # Main entry point
├── config/                   # Configuration files
│   ├── watcher.example.yaml
│   ├── watcher-with-executor.example.yaml
│   └── event-prompt.example.hbs
└── spec/                     # Specifications
    └── watcher.md
```

## Core Concepts

### Reactor Pattern

Instead of normalizing provider events to a unified format, each provider keeps its own event structure and provides a **Reactor** interface for performing actions:

```typescript
interface Reactor {
  getLastComment(): Promise<{ author: string; body: string } | null>;
  postComment(comment: string): Promise<string>;
  updateComment(commentId: string, comment: string): Promise<void>;
}
```

This allows providers to maintain their native data structures while providing a consistent interface for commenting operations.

### Event Flow

1. **Event Received** (webhook or poll)
2. **Provider Validates** (signature verification for webhooks)
3. **Deduplication Check** (via reactor.getLastComment())
4. **If not duplicate**:
   - Provider normalizes event internally (for template rendering)
   - CommandExecutor renders prompt template
   - Posts initial comment: "Agent is working on owner/repo#123"
   - Executes configured command
   - Optionally updates comment with command output

### Command Execution

The CommandExecutor component handles running external commands when events are received:

- Renders Handlebars templates with event data
- Executes shell commands with event context
- Passes prompts via stdin or environment variables
- Posts/updates comments with command output

Example configuration:

```yaml
commandExecutor:
  enabled: true
  command: "cat | claude-code"
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true      # Pass prompt to stdin
  followUp: true      # Update comment with output
```

### Deduplication

The watcher uses **comment-based deduplication** to prevent processing the same event multiple times:

- Before processing, checks if last comment author matches `botUsername`
- After processing, posts a comment like "Agent is working on owner/repo#123"
- Works across restarts and in distributed environments
- Self-documenting (visible in issue/PR history)

**Requirements:**
- Provider must support comment operations
- Bot account needs write access
- `botUsername` must match the posting account

## Library Usage

The watcher can be used as a library in your own application:

```typescript
import { Watcher, GitHubProvider } from './src/watcher/index.js';

const watcher = new Watcher({
  server: { host: 'localhost', port: 3000 },
  providers: {
    github: {
      enabled: true,
      pollingInterval: 60,
      auth: { type: 'token', tokenEnv: 'GITHUB_TOKEN' },
      options: {
        webhookSecretEnv: 'GITHUB_WEBHOOK_SECRET',
        repositories: ['owner/repo'],
        initialLookbackHours: 1
      }
    }
  },
  deduplication: {
    enabled: true,
    botUsername: 'auto-coder-bot'
  },
  commandExecutor: {
    enabled: true,
    command: 'your-command',
    promptTemplateFile: './prompt.hbs'
  }
});

watcher.registerProvider('github', new GitHubProvider());

watcher.on('event', (providerName, event) => {
  console.log(`Event from ${providerName}:`, event);
});

watcher.on('error', (error) => {
  console.error('Watcher error:', error);
});

await watcher.start();

// Later: graceful shutdown
await watcher.stop();
```

## Adding Custom Providers

To add a new provider (GitLab, Jira, Linear, etc.):

1. **Implement the IProvider interface:**

```typescript
import { BaseProvider } from './src/watcher/providers/BaseProvider.js';
import type { ProviderConfig, EventHandler, Reactor } from './src/watcher/types/index.js';

export class CustomProvider extends BaseProvider {
  get metadata() {
    return {
      name: 'custom',
      version: '1.0.0'
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    // Initialize your provider
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<boolean> {
    // Validate webhook (signature, headers, etc.)
    return true;
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    eventHandler: EventHandler
  ): Promise<void> {
    // Create reactor for commenting
    const reactor: Reactor = {
      async getLastComment() { /* ... */ },
      async postComment(comment: string) { /* ... */ },
      async updateComment(id: string, comment: string) { /* ... */ }
    };

    // Normalize event internally (for templates)
    const normalizedEvent = this.normalize(body);

    // Call event handler
    await eventHandler(normalizedEvent, reactor);
  }

  async poll(eventHandler: EventHandler): Promise<void> {
    // Poll provider API and call eventHandler for each item
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
    // Clean up resources
  }
}
```

2. **Register the provider:**

```typescript
watcher.registerProvider('custom', new CustomProvider());
```

3. **Add configuration:**

```yaml
providers:
  custom:
    enabled: true
    pollingInterval: 60
    auth:
      type: token
      tokenEnv: CUSTOM_TOKEN
    options:
      # Provider-specific options
```

## Development Scripts

- `pnpm run dev` - Run the watcher in development mode with hot reload
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm start` - Run the compiled JavaScript
- `pnpm run type-check` - Check types without building
- `pnpm test` - Run tests

## Logging

The watcher uses colored console logging with different levels:

- **DEBUG** (gray): Detailed debugging information
- **INFO** (green): General information
- **WARN** (yellow): Warning messages
- **ERROR** (red): Error messages

Set log level in configuration:

```yaml
logLevel: info  # debug | info | warn | error
```

## Error Handling

- **Webhook errors**: Logged but don't crash the server
- **Polling errors**: Exponential backoff with retry
- **Command execution errors**: Logged with full context
- **Provider errors**: Isolated per provider (one failing provider doesn't affect others)
- **Graceful shutdown**: Handles SIGTERM/SIGINT with proper cleanup

## Security Considerations

1. **Use webhook secrets** for signature verification (prevents unauthorized requests)
2. **Restrict token permissions** to minimum required (Issues + PRs read/write)
3. **Use environment variables** for secrets (never commit secrets to git)
4. **Run behind reverse proxy** in production (nginx, Caddy) for HTTPS and rate limiting
5. **Validate inputs** at provider level before processing

## Contributing

Contributions are welcome! Please ensure:

- TypeScript code passes type checking (`pnpm run type-check`)
- Code follows existing patterns and conventions
- New providers implement the full `IProvider` interface
- Configuration examples are updated for new features

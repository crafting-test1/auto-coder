# auto-coder

An automated coding assistant with intelligent task monitoring and provider integration.

## Features

- **Multi-Provider Event Monitoring**: Watch for events from GitHub (issues, PRs, comments)
- **Dual Operation Modes**: Webhook-based (passive) and polling-based (proactive) event delivery
- **Command Execution**: Execute custom commands when events are received with templated prompts
- **Comment-Based Deduplication**: Prevent duplicate event processing using provider comments
- **Extensible Provider System**: Easy to add new providers (GitLab, Jira, Linear, etc.)
- **Secure Webhooks**: HMAC signature verification for webhook security
- **Graceful Shutdown**: Clean shutdown handling with proper cleanup

## Prerequisites

- Node.js 18+ (recommended for full ES2022 support)
- pnpm (installed via `npm install -g pnpm` or `corepack enable`)

## Installation

Install dependencies using pnpm:

```bash
pnpm install
```

## Quick Start

### 1. Configure the Watcher

Copy the example configuration:

```bash
cp config/watcher-with-executor.example.yaml config/watcher.yaml
```

### 2. Set Up Provider Access

Configure your provider credentials (GitHub token, GitLab token, etc.) as environment variables. See the individual provider examples for detailed setup instructions.

### 3. Update Configuration

Edit `config/watcher.yaml` with your server settings, provider configuration, and command executor options. See the Configuration section below for details.

### 4. Run the Watcher

```bash
pnpm run dev:watcher
```

The watcher will:
- Start the webhook server on the configured port
- Begin polling configured repositories (if enabled)
- Execute commands when events are received
- Post comments to prevent duplicate processing

## Development

### Available Scripts

- `pnpm run dev` - Run TypeScript directly with tsx
- `pnpm run dev:watcher` - Run the watcher subsystem in development mode
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm start` - Run the compiled JavaScript
- `pnpm run type-check` - Check types without building

### Building

Compile TypeScript to JavaScript:

```bash
pnpm run build
```

The compiled output will be in the `dist/` directory.

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

### Core Concepts

#### Reactor Pattern

Instead of normalizing provider events to a unified format, each provider keeps its own event structure and provides a **Reactor** interface for performing actions:

```typescript
interface Reactor {
  getLastComment(): Promise<{ author: string; body: string } | null>;
  postComment(comment: string): Promise<string>;
  updateComment(commentId: string, comment: string): Promise<void>;
}
```

This allows providers to maintain their native data structures while providing a consistent interface for commenting operations.

#### Event Flow

1. **Event Received** (webhook or poll)
2. **Provider Validates** (signature verification for webhooks)
3. **Deduplication Check** (via reactor.getLastComment())
4. **If not duplicate**:
   - Provider normalizes event internally (for template rendering)
   - CommandExecutor renders prompt template
   - Posts initial comment: "Agent is working on owner/repo#123"
   - Executes configured command
   - Optionally updates comment with command output

#### Command Execution

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

#### Deduplication

The watcher uses **comment-based deduplication** to prevent processing the same event multiple times:

- Before processing, checks if last comment author matches `botUsername`
- After processing, posts a comment like "Agent is working on owner/repo#123"
- Works across restarts and in distributed environments
- Self-documenting (visible in issue/PR history)

**Requirements:**
- Provider must support comment operations
- Bot account needs write access
- `botUsername` must match the posting account

## Configuration

### Server Settings

```yaml
server:
  host: 0.0.0.0      # Bind address
  port: 3000         # Port for webhook server
  basePath: /api     # Optional base path
```

### Deduplication Settings

```yaml
deduplication:
  enabled: true
  botUsername: auto-coder-bot
  commentTemplate: "Agent is working on {id}"  # {id} = "owner/repo#123"
```

### Command Executor Settings

```yaml
commandExecutor:
  enabled: true
  command: "your-command"           # Shell command to execute
  promptTemplate: "..."             # Inline Handlebars template
  promptTemplateFile: ./prompt.hbs  # Or load from file
  useStdin: true                    # Pass prompt via stdin (vs $PROMPT env var)
  followUp: true                    # Update comment with output
```

### Provider Settings

#### GitHub Provider

```yaml
providers:
  github:
    enabled: true
    pollingInterval: 60  # Poll every 60 seconds

    auth:
      type: token
      token: "ghp_..."           # Direct token
      tokenEnv: GITHUB_TOKEN     # Or from environment
      tokenFile: /path/to/token  # Or from file

    options:
      # Webhook secret (optional but recommended)
      webhookSecret: "secret"
      webhookSecretEnv: GITHUB_WEBHOOK_SECRET
      webhookSecretFile: /path/to/secret

      # Repositories to monitor (for polling)
      repositories:
        - owner/repo1
        - owner/repo2

      # Event types to monitor
      events:
        - issues
        - pull_request
        - issue_comment

      # Initial lookback window (default: 1 hour)
      initialLookbackHours: 1

      # Max items per poll (default: unlimited)
      maxItemsPerPoll: 50
```

## Webhook Setup

Configure webhooks in your provider's settings to point to your watcher endpoint. The watcher validates webhook signatures and processes events in real-time.

The watcher will:
- Validate webhook signatures based on provider requirements
- Reject requests with invalid signatures
- Support provider-specific payload formats

See the individual provider examples for detailed webhook configuration instructions.

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
2. **Restrict GitHub token permissions** to minimum required (Issues + PRs read/write)
3. **Use environment variables** for secrets (never commit secrets to git)
4. **Run behind reverse proxy** in production (nginx, Caddy) for HTTPS and rate limiting
5. **Validate inputs** at provider level before processing

## Troubleshooting

### Polling Not Working

- Verify provider credentials are set with correct permissions
- Check that repositories/projects are configured in provider `options`
- Ensure `auth` section is present with valid authentication
- Review watcher logs for authentication or API errors

### Webhooks Not Received

- Verify webhook URL is accessible from provider (public or tunneled)
- Check webhook secret matches configuration
- Review webhook delivery logs in provider settings
- Check for signature validation errors in watcher logs

### Duplicate Events

- Verify `botUsername` matches the account posting comments
- Check that bot account has write access to repositories/projects
- Review comment history on items to verify deduplication is working

### Command Not Executing

- Verify `commandExecutor.enabled` is `true`
- Check command is in PATH or use absolute path
- Review logs for command execution errors
- If using `useStdin: true`, ensure command reads from stdin

For provider-specific troubleshooting, see the individual provider examples.

## License

ISC

## Contributing

Contributions are welcome! Please ensure:

- TypeScript code passes type checking (`pnpm run type-check`)
- Code follows existing patterns and conventions
- New providers implement the full `IProvider` interface
- Configuration examples are updated for new features

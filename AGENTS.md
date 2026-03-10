# Agent Guide

For project overview, layout, and dev commands see `CLAUDE.md`. This file (`AGENTS.md`) covers only what is non-obvious from reading the code — conventions that cause bugs when missed, and traps to avoid.

## Repo State — Read This First

**`config/watcher.yaml` does not exist in the repo.** It is injected at sandbox start via the Crafting Sandbox template's `system.files` block. If you are looking for the runtime config, read `config/watcher.example.yaml` instead. Never commit `watcher.yaml`.

**`_local/` does not exist in the repo.** It is gitignored and used for local sandbox template customizations. Do not create or reference it.

## Verifying Changes

Before creating a PR, always run all four:

```bash
pnpm run type-check   # catches import/type errors without a full build
pnpm test             # runs all tests
pnpm run lint:fix     # auto-fix lint errors
pnpm run format       # auto-format code
```

If you modified a specific provider, also run its tests directly to get faster feedback:

```bash
pnpm test -- --grep github    # example for GitHub provider
```

## Critical Conventions

### ESM imports require `.js` extensions

Always use `.js` even when importing `.ts` source files — this is an ESM requirement and breaks silently at runtime if omitted:

```ts
import { logger } from '../utils/logger.js';  // correct
import { logger } from '../utils/logger';      // breaks at runtime
```

### `validateWebhook` must return `false`, never throw

Throwing from `validateWebhook` results in a 500 response to the provider. Returning `false` results in a 401. The latter is correct for invalid signatures.

### Single-event failures must not crash the process

Wrap per-event logic in try/catch, log the error, and continue. See the `createEventHandler` method in `Watcher.ts` for the established pattern. Pollers and the webhook server must keep running regardless of individual event failures.

### Use the typed error classes

From `src/watcher/utils/errors.ts`:
- `ProviderError(message, providerName)` — provider-specific failures
- `ConfigError(message)` — configuration problems
- `WatcherError(message)` — orchestrator-level failures

Never log token values or webhook secrets, even at `debug` level.

## Non-Obvious Architecture

### Config loading: env vars always win

`ConfigLoader.loadWithEnv()` loads `watcher.yaml` first (if present), then overlays env vars on top. Env vars take precedence over file values. The config file is entirely optional — the system must work with env vars alone. Do not add logic that requires the file to be present.

### Deduplication is comment-order sensitive

The bot skips an event if its own account was the last to comment on the issue/PR/thread. This means: if you change when or whether a comment is posted, you may inadvertently suppress or re-trigger events. The logic lives in `Watcher.isDuplicate()` and delegates to `Reactor.isBotAuthor()` per provider.

### Polling and webhooks run concurrently

A provider's `poll()` and `handleWebhook()` may be called simultaneously. Providers must handle this safely. Each call should be independent with no shared mutable state between them.

## Provider Structure

Every provider follows the same six-file split. When modifying or adding a provider, keep concerns in their respective files:

| File | Responsibility |
|---|---|
| `*Provider.ts` | Implements `IProvider`, wires the other classes together |
| `*Normalizer.ts` | Converts raw platform payload → `NormalizedEvent` |
| `*Webhook.ts` | Validates and parses incoming webhook requests |
| `*Reactor.ts` | Implements `Reactor` (read/write comments for deduplication) |
| `*Poller.ts` | Queries platform API for recent events |
| `*Comments.ts` | Low-level comment API calls used by the Reactor |

When adding a new provider, also:
- Register it in `src/watcher/index.ts`
- Add env var handling in `ConfigLoader.buildFromEnv()`
- Document the env vars in `config/watcher.example.yaml`

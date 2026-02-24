# Tests

Integration tests for the auto-coder watcher subsystem.

## Test Files

### test-webhook-executor.ts

**Purpose:** Integration test for the command executor feature via webhook delivery.

**What it tests:**
- Watcher initialization with command executor enabled
- Webhook server startup and registration
- Receiving and processing GitHub webhook events
- Template rendering with Handlebars
- Command execution with environment variables
- Event deduplication (memory strategy)

**How to run:**
```bash
pnpm test
# or
npx tsx tests/test-webhook-executor.ts
```

**What it does:**
1. Creates a Watcher instance with command executor configured
2. Registers the GitHub provider
3. Starts the webhook server on localhost:3003
4. Sends a mock GitHub issue webhook
5. Verifies the event is received and processed
6. Shows the command output with event details
7. Gracefully shuts down

**Expected output:**
- Event received and logged
- Command executor renders template
- Command executes with environment variables
- Output shows event details and rendered prompt

### test-command-executor.ts

**Purpose:** Basic test for command executor event emission.

**What it tests:**
- Command executor configuration
- Event emission from watcher
- Manual event triggering

**How to run:**
```bash
pnpm test:command
# or
npx tsx tests/test-command-executor.ts
```

**Note:** This test manually emits events rather than using webhooks. The webhook test is more comprehensive.

## Quick Test

For a quick verification with filtered output:

```bash
pnpm test:quick
```

This runs the webhook test and shows only the command output section.

## Test Configuration

Both tests use in-memory configuration (no config file required). Key settings:

- **Server:** localhost on port 3002-3003
- **Log level:** debug (shows all output)
- **Deduplication:** memory strategy with 1-hour TTL
- **Command executor:** Enabled with custom bash commands
- **Provider:** GitHub (webhook mode only)

## Adding New Tests

When adding new tests:

1. Place test files in this directory
2. Name them `test-*.ts` for consistency
3. Use relative imports: `import { Watcher } from '../src/watcher/index.js'`
4. Template files should use paths relative to project root: `./templates/file.hbs`
5. Add npm script in package.json if needed
6. Document the test purpose in this README

## Debugging Tests

To see verbose output:

```bash
npx tsx tests/test-webhook-executor.ts
```

This shows:
- Full event processing logs
- Template rendering results
- Command execution details
- All stdout/stderr from commands
- Shutdown sequence

## CI/CD

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run integration tests
  run: pnpm test
  env:
    NODE_ENV: test
```

The tests are self-contained and don't require external services.

# Watcher: Event Listener & Orchestrator

> Part of the [auto-coder overview](./overview.md). This doc covers the design and features of the Watcher component specifically.

Watcher is a Node.js service that listens for events from developer platforms, filters them, and triggers the downstream coding agent. It is purely an orchestrator — it does not write code itself.

---

## Event Ingestion

Two modes run concurrently and feed the same pipeline:

**Webhooks** — an Express HTTP server receives real-time push events from platforms. Each provider registers its own endpoint at `/webhook/{provider}`. Every incoming request is signature-verified before processing.

**Polling** — a per-provider poller calls the platform API on a configurable interval (e.g. every 60s) to catch events that may have been missed. Polling is optional and only activates when `pollingInterval` and auth credentials are configured.

The poller skips a cycle if the previous poll is still running, and stops itself after 5 consecutive failures (with exponential backoff between retries, capped at 60s).

---

## Provider System

Each platform (GitHub, GitLab, Linear, Slack) is implemented as a provider. All providers share the same interface:

- `initialize(config)` — validate config and authenticate
- `validateWebhook(headers, body, rawBody)` — verify request signature
- `handleWebhook(headers, body, eventHandler)` — parse and normalize the payload
- `poll(eventHandler)` — query the API for recent events
- `shutdown()` — clean up

**Normalization** is the key design point. Every provider maps its platform-specific payload into a common `NormalizedEvent` shape before handing it off. This means the rest of the pipeline — deduplication, prompt rendering, command execution — is completely provider-agnostic.

```
NormalizedEvent {
  id, provider, type, action,
  resource: { number, title, description, url, state, repository,
               author, labels, branch, mergeTo, comment? },
  actor: { username, id },
  metadata: { timestamp, deliveryId?, polled? }
}
```

---

## Event Filtering

Each provider has built-in default filters (e.g. GitHub skips most PR lifecycle events by default). These can be overridden per-provider in config using `eventFilter`, which supports allowlists (`actions`) and denylists (`skipActions`/`skipStates`).

---

## Deduplication

To prevent triggering the agent twice on the same issue or PR, Watcher uses a **last-comment strategy**:

1. After receiving an event, fetch the last comment on that issue/PR/thread
2. If the last comment was posted by the configured bot username — skip
3. Otherwise — proceed

This works because Watcher always posts a comment when it starts processing. If that comment is still the last one, no new human activity has occurred since the last run. If a human has commented since, it means there's new work to do.

Errors fetching comments are treated as "not a duplicate" to avoid silently dropping events.

---

## Prompt Construction

Prompts are rendered using [Handlebars](https://handlebarsjs.com/) templates. The full `NormalizedEvent` object is passed as context, so templates have access to all event fields.

Template selection order:
1. Provider-specific template (if configured under `prompts.{provider}`)
2. Default `promptTemplateFile`
3. Inline `promptTemplate` string

Built-in Handlebars helpers: `eq`, `ne`, `and`, `or`, `link`, `resourceLink`, `commentLink`.

### NormalizedEvent — Field Reference

The full variable reference (with per-provider notes) is documented at the top of each example template:

- `config/event-prompt.example.hbs` — GitHub, GitLab, Linear
- `config/event-prompt-slack.example.hbs` — Slack

The normalization itself happens in each provider's `normalizeEvent` / `normalizePolledEvent` private methods:

| Provider | File |
|---|---|
| GitHub | `src/watcher/providers/github/GitHubProvider.ts` |
| GitLab | `src/watcher/providers/gitlab/GitLabProvider.ts` |
| Linear | `src/watcher/providers/linear/LinearProvider.ts` |
| Slack | `src/watcher/providers/slack/SlackProvider.ts` |

A few provider-specific quirks worth knowing when writing templates:

- **`resource.repository`** — GitHub/GitLab: `"owner/repo"` · Linear: team key (e.g. `"ENG"`) · Slack: channel ID (e.g. `"C01ABC123"`)
- **`resource.author`** — GitHub/GitLab: login username · Linear: display name · Slack: user ID
- **`resource.branch` / `resource.mergeTo`** — only set for GitHub/GitLab PRs and MRs; absent for Linear and Slack
- **`resource.comment`** — present when triggered by a comment (GitHub/GitLab/Linear) or always present for Slack (contains the message itself)
- **`resource.url`** — empty for Slack webhook events; populated for Slack polled mentions
- **`metadata.deliveryId`** — GitHub webhooks only
- **`metadata.channel` / `metadata.threadTs`** — Slack only

---

## Command Execution

Once a prompt is rendered, Watcher:

1. Posts `"Agent is working on {id}"` as a comment (serves as dedup marker)
2. Spawns the configured shell command via `/bin/bash -c`

The command receives:

| Variable | Description |
|---|---|
| `EVENT_SHORT_ID` | Clean, unique ID for naming sessions (e.g. `github-owner-repo-123-a1b2c3`) |
| `EVENT_ID` | Full event identifier |
| `EVENT_SAFE_ID` | Shell-safe version of `EVENT_ID` (special chars → `_`) |
| `PROMPT` | Rendered prompt (if `useStdin: false`) |

If `useStdin: true`, the prompt is piped to the command's stdin instead of `$PROMPT`.

If `followUp: true`, the command's stdout is posted as a follow-up comment on the original issue/PR.

A `dryRun` mode logs what would be executed without spawning anything (but still posts the dedup comment).

---

## Configuration

All behavior is controlled by a single YAML file. Key sections:

```yaml
server:
  port: 3000

deduplication:
  enabled: true
  commentTemplate: "Agent is working on {id}"

commandExecutor:
  enabled: true
  command: "cs llm session run --name=$EVENT_SHORT_ID --task"
  promptTemplateFile: ./config/event-prompt.hbs
  useStdin: false
  followUp: false

providers:
  github:
    enabled: true
    pollingInterval: 60
    auth:
      tokenEnv: GITHUB_TOKEN
    options:
      webhookSecretEnv: GITHUB_WEBHOOK_SECRET
      botUsername: my-bot
      repositories:
        - owner/repo
```

Secrets are never stored in plain text — they reference environment variables (`tokenEnv`, `webhookSecretEnv`) or files (`tokenFile`, `webhookSecretFile`).

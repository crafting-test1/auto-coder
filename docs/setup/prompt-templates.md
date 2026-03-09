# Prompt Template Customization

The prompt template controls what the agent is told when an event fires. Customizing it is the primary way to change agent behavior — what repositories to work in, how to write PRs, what tone to use, whether to ask for confirmation, etc.

---

## The Two Default Templates

| Template | Used for |
|---|---|
| `config/event-prompt.example.hbs` | GitHub, GitLab, Linear |
| `config/event-prompt-slack.example.hbs` | Slack |

These are the starting point. Copy one and edit it rather than writing from scratch.

---

## Activating a Custom Template

**Option 1 — env var (single template for all providers):**

Set `WATCHER_COMMAND` to pass a custom prompt file path, or more directly, use `watcher.yaml`:

**Option 2 — `watcher.yaml` (recommended):**

```yaml
commandExecutor:
  promptTemplateFile: ./config/my-prompt.hbs   # default for all providers

  # Per-provider overrides (take precedence over promptTemplateFile)
  prompts:
    github: ./config/my-github-prompt.hbs
    slack:  ./config/my-slack-prompt.hbs
```

The template file path is relative to the watcher's working directory inside the sandbox. Inject the file via the template's `system.files` block — the same way `watcher.yaml` itself is injected:

```yaml
system:
  files:
    - path: config/watcher.yaml
      content: |
        ...
    - path: config/my-prompt.hbs
      content: |
        You are an AI developer. Work on {{resource.title}}...
```

---

## Variable Reference

The full `NormalizedEvent` object is available in every template. The most commonly used fields:

| Variable | Description |
|---|---|
| `{{provider}}` | `github` \| `gitlab` \| `linear` \| `slack` |
| `{{type}}` | `issue`, `pull_request`, `merge_request`, `message` |
| `{{action}}` | e.g. `opened`, `edited`, `poll` |
| `{{resource.number}}` | Issue or PR number |
| `{{resource.title}}` | Title / summary |
| `{{resource.description}}` | Body / description (Slack: full thread history) |
| `{{resource.url}}` | URL to the issue or PR |
| `{{resource.repository}}` | `owner/repo` (GitHub/GitLab) · team key (Linear) · channel ID (Slack) |
| `{{resource.author}}` | Who created the issue/PR |
| `{{resource.assignees}}` | Array — truthy if the issue is assigned |
| `{{resource.labels}}` | Array of label name strings |
| `{{resource.branch}}` | Head branch — PR/MR only |
| `{{resource.mergeTo}}` | Target branch — PR/MR only |
| `{{resource.comment.body}}` | Comment text — only present when triggered by a comment |
| `{{resource.comment.author}}` | Comment author |
| `{{actor.username}}` | Who triggered the event |
| `{{metadata.timestamp}}` | ISO 8601 timestamp |

For the complete field-by-field reference including provider-specific quirks, see the comments at the top of each example template.

### Built-in helpers

```handlebars
{{resourceLink}}                    {{!-- formatted link: "owner/repo#123" --}}
{{commentLink}}                     {{!-- formatted link to the comment --}}
{{#eq provider "github"}}...{{/eq}} {{!-- conditional: renders if equal --}}
{{#ne action "poll"}}...{{/ne}}     {{!-- conditional: renders if not equal --}}
{{#if resource.assignees}}...{{/if}}{{!-- conditional: renders if truthy --}}
{{#each resource.labels}}{{this}}{{/each}} {{!-- iterate array --}}
```

---

## Step-by-Step: Creating a Custom Template

**1. Copy the default:**

```bash
cp config/event-prompt.example.hbs config/event-prompt.hbs
```

**2. Edit it.** The template produces a plain-text prompt — write it the way you would write instructions to a developer. The `## Instructions` section is the most important part to customize.

**3. Point watcher.yaml at it:**

```yaml
commandExecutor:
  promptTemplateFile: ./config/event-prompt.hbs
```

**4. Test with dry run before deploying:**

```yaml
commandExecutor:
  dryRun: true   # logs the rendered prompt without executing
```

Run the watcher and trigger a test event. Check logs to see the exact prompt that would be sent.

---

## Common Recipes

### Only act on assigned issues

```handlebars
{{#if resource.assignees}}
## Instructions
You are assigned to this issue. Implement the requested change and open a PR.
{{else}}
## Instructions
This issue is unassigned. Add a clarifying comment asking the author for more details.
Do NOT make code changes yet.
{{/if}}
```

### Include labels in the prompt

```handlebars
{{#if resource.labels}}
Labels: {{#each resource.labels}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
```

### Use a different repository naming convention

```handlebars
- Create a branch named `fix/{{resource.number}}-{{resource.title}}`
  (lowercase, spaces replaced with hyphens)
```

### Per-provider behavior in a single template

```handlebars
{{#eq provider "linear"}}
- The team key is {{resource.repository}} — find the matching GitHub repo in the org
{{/eq}}
{{#eq provider "github"}}
- Work directly in {{resource.repository}}
{{/eq}}
```

### Require a comment to trigger work (ignore bare issue creation)

Rather than doing this in the template, use `eventFilter` in `watcher.yaml` to only process `issue_comment` events and skip `issues` entirely — cleaner than template conditionals. See [configuration.md](configuration.md#event-filtering).

---

## Debugging

Enable `dryRun` to log rendered prompts without executing:

```yaml
commandExecutor:
  dryRun: true
```

Enable `debug` logging to see full event payloads:

```yaml
logLevel: debug
```

This shows the raw `NormalizedEvent` fields, which is useful when a variable isn't rendering as expected.

# Command Executor

The Command Executor feature allows the watcher to execute external commands when events are received. This is useful for triggering CI/CD pipelines, sending notifications, or integrating with external systems.

## Overview

When enabled, the Command Executor:
1. Receives events from providers (GitHub, GitLab, etc.)
2. Renders a prompt using Handlebars templates
3. Executes a bash command with event data
4. Optionally posts comments before/after execution

## Configuration

Add the `commandExecutor` section to your `watcher.yaml`:

```yaml
commandExecutor:
  enabled: true

  # Command to execute (required)
  command: "your-command-here"

  # Template configuration (choose one)
  promptTemplate: |
    Event: {{provider}}/{{type}}/{{action}}
    Resource: {{resource.title}}
  # OR
  promptTemplateFile: ./config/event-prompt.example.hbs

  # How to pass the prompt (default: false)
  useStdin: false  # true = stdin, false = $PROMPT env var

  # Comment posting options (default: false)
  postInitialComment: false
  initialCommentTemplate: "🤖 Processing event {{id}}"
  postOutputComment: false
```

## Environment Variables

The command receives these environment variables:

- `EVENT_ID` - Unique event identifier
- `EVENT_PROVIDER` - Provider name (e.g., "github")
- `EVENT_TYPE` - Event type (e.g., "issue", "pull_request")
- `EVENT_ACTION` - Action taken (e.g., "created", "updated")
- `RESOURCE_URL` - URL to the resource
- `RESOURCE_TITLE` - Title of the resource
- `ACTOR_USERNAME` - Username of the actor
- `PROMPT` - Rendered template (if useStdin is false)

If `useStdin: true`, the prompt is sent via stdin instead of $PROMPT.

## Handlebars Templates

Templates have access to the full event object:

```handlebars
{{! Event metadata }}
{{id}}
{{provider}}
{{type}}
{{action}}

{{! Resource information }}
{{resource.id}}
{{resource.number}}
{{resource.url}}
{{resource.title}}
{{resource.state}}
{{resource.repository}}
{{resource.description}}
{{#each resource.labels}}
  - {{this}}
{{/each}}
{{resource.updatedAt}}

{{! Actor information }}
{{actor.id}}
{{actor.username}}
{{actor.avatarUrl}}

{{! Metadata }}
{{metadata.timestamp}}
{{metadata.deliveryId}}
```

### Built-in Helpers

The following Handlebars helpers are available:

**eq** - Equality comparison
```handlebars
{{#eq type "issue"}}
  This is an issue
{{else}}
  This is not an issue
{{/eq}}
```

**ne** - Inequality comparison
```handlebars
{{#ne action "closed"}}
  Still open
{{/ne}}
```

**and** - Logical AND
```handlebars
{{#and resource.repository resource.number}}
  Has both repository and number
{{/and}}
```

**or** - Logical OR
```handlebars
{{#or (eq type "issue") (eq type "pull_request")}}
  Is an issue or PR
{{/or}}
```

## Usage Examples

### Example 1: Echo Event Details

```yaml
commandExecutor:
  enabled: true
  command: |
    echo "Event: $EVENT_TYPE/$EVENT_ACTION"
    echo "Resource: $RESOURCE_TITLE"
    echo "Actor: $ACTOR_USERNAME"
  promptTemplate: |
    Event {{id}} received
```

### Example 2: Trigger CI Pipeline

```yaml
commandExecutor:
  enabled: true
  command: |
    if [ "$EVENT_TYPE" = "pull_request" ]; then
      curl -X POST https://ci.example.com/trigger \
        -H "Authorization: Bearer $CI_TOKEN" \
        -d "pr_url=$RESOURCE_URL"
    fi
  postInitialComment: true
  initialCommentTemplate: "🤖 CI pipeline triggered"
```

### Example 3: Call Claude Code

```yaml
commandExecutor:
  enabled: true
  command: |
    echo "$PROMPT" | claude-code
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  postInitialComment: true
  initialCommentTemplate: "🤖 Agent is processing {{resource.title}}"
  postOutputComment: true
```

### Example 4: Conditional Processing

```yaml
commandExecutor:
  enabled: true
  command: |
    case "$EVENT_TYPE" in
      issue)
        ./handle-issue.sh "$EVENT_ACTION" "$RESOURCE_URL"
        ;;
      pull_request)
        ./handle-pr.sh "$EVENT_ACTION" "$RESOURCE_URL"
        ;;
      *)
        echo "Unhandled event type: $EVENT_TYPE"
        ;;
    esac
  promptTemplateFile: ./config/event-prompt.example.hbs
```

## Comment Posting

When `postInitialComment` is enabled, the watcher posts a comment to the resource before executing the command. This is useful for:

- Acknowledging receipt of the event
- Indicating processing has started
- Providing status updates

When `postOutputComment` is enabled, the command's stdout is posted as a comment after execution. This is useful for:

- Sharing command results
- Posting AI-generated responses
- Providing execution logs

**Note:** Comment posting requires:
- Provider supports `postComment` (currently: GitHub)
- Resource has a repository
- Resource URL contains an issue/PR number

## Template Example

An example template is provided at `config/event-prompt.example.hbs`, adapted from the production-tested template in `samples/watch.go`. It provides comprehensive instructions for AI developers to:

- Create sandboxes with unique names
- Fetch and understand task context
- Make code changes with testing
- Create Pull Requests with proper linking
- Perform code reviews when needed
- Report analysis results

The template includes conditional logic for:
- Issues vs Pull Requests
- Assigned vs unassigned tasks
- Code changes vs analysis tasks

Key features:
```handlebars
{{#eq type "pull_request"}}Pull Request{{else}}Issue{{/eq}}
{{#if resource.assignees}}Assigned: Yes{{else}}Assigned: No{{/if}}
```

This ensures the AI receives clear, contextual instructions based on the type of event and assignment status.

See the full template at `config/event-prompt.example.hbs`.

## Testing

Use the test script to verify your configuration:

```bash
npx tsx test-webhook-executor.ts
```

This sends a mock GitHub webhook and shows the command output.

## Error Handling

- Command failures are logged but don't crash the watcher
- Failed initial comments are logged but don't prevent execution
- Failed output comments are logged but don't affect the result
- Command timeout: none (runs until completion)
- Non-zero exit codes are logged as errors

## Security Considerations

1. **Command Injection**: The command is executed via bash with untrusted input. Ensure your command properly quotes and sanitizes variables.

2. **Secrets**: Use environment variables for sensitive data, not the command string or template:
   ```yaml
   command: |
     curl -H "Authorization: Bearer $API_TOKEN" ...
   ```

3. **Resource Limits**: Long-running commands block event processing. Consider running heavy tasks in the background:
   ```yaml
   command: |
     ./long-running-task.sh "$PROMPT" > /tmp/output.log 2>&1 &
   ```

4. **Output Size**: Command output is captured in memory. Be cautious with commands that produce large output.

## Debugging

Enable debug logging to see command output:

```yaml
logLevel: debug
```

This shows:
- Template rendering results
- Command execution start/completion
- Full stdout from commands
- Any errors or failures

## Performance

- Commands run synchronously (one at a time)
- Events are queued if a command is running
- No timeout by default (commands run until completion)
- Consider async execution for long tasks

## Limitations

1. No timeout mechanism (runs until completion or failure)
2. No retry mechanism (fails once and logs error)
3. No concurrency control (processes events sequentially)
4. Output captured in memory (not suitable for large outputs)
5. Comments only supported on GitHub (currently)

# Linear Provider Setup

This guide provides detailed instructions for setting up auto-coder with the Linear provider.

## Prerequisites

- Node.js 18+ (recommended for full ES2022 support)
- pnpm (installed via `npm install -g pnpm` or `corepack enable`)
- A Linear account with access to teams/issues you want to monitor

## Linear API Key Setup

Create a Linear API key with the following steps:

### Generate API Key

1. Go to Linear Settings → API → Personal API keys
2. Click "Create key"
3. Configure the following:
   - **Label**: auto-coder (or your preferred name)
   - **Scopes**: The API key will have access to all data in your workspace
4. Click "Create key" and copy the generated key immediately (it won't be shown again)

**Important**: Linear API keys have full access to your workspace data. Keep them secure and never commit them to version control.

### Create a Sandbox Secret

Create a Sandbox secret `linear_api_key` from the generated API key.

## Webhook Secret Setup (Optional but Recommended)

Webhook secrets provide security by verifying that webhook requests come from Linear.

### Configure Webhook in Linear

1. Go to Linear Settings → API → Webhooks
2. Click "Create webhook"
3. Set **Webhook URL**: `http://your-server:3000/webhook/linear`
4. Select resource types:
   - **Issue** (check this)
   - **Comment** (optional - for future support)
5. Select events:
   - **create** - When new issues are created
   - **update** - When issues are updated
   - **remove** - When issues are deleted
6. Click "Create webhook"
7. **Copy the webhook secret** - Linear will generate and display a secret after creation
8. Store this secret securely - you'll use it in your auto-coder configuration

**Important**: Linear generates the webhook secret automatically when you create the webhook. Copy it immediately as it may not be shown again.

### Create a Sandbox Secret

Create a Sandbox secret `linear_webhook_secret` from the webhook secret provided by Linear.

## Configuration

### Basic Configuration

Create `config/watcher.yaml`:

```yaml
server:
  host: 0.0.0.0
  port: 3000

deduplication:
  enabled: true
  botUsername: your-linear-username  # Your Linear account username or display name
  commentTemplate: "Agent is working on {id}"

commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | your-ai-agent"
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  followUp: true

providers:
  linear:
    enabled: true
    pollingInterval: 60  # Poll every 60 seconds

    auth:
      type: token
      tokenEnv: LINEAR_API_KEY

    options:
      # Webhook secret for signature verification (optional but recommended)
      webhookSecretEnv: LINEAR_WEBHOOK_SECRET

      # Teams to monitor (for polling)
      # Team keys are short identifiers like "ENG", "DESIGN", "PRODUCT"
      # If not specified, all teams will be monitored
      teams:
        - ENG
        - PRODUCT

      # Initial lookback period (default: 1 hour)
      initialLookbackHours: 1

      # Max items per poll (default: unlimited)
      maxItemsPerPoll: 50
```

**Note**: The Linear provider runs both webhook and polling modes simultaneously. Both modes are always enabled and cannot be disabled independently. This ensures reliable event delivery - webhooks provide real-time updates while polling catches any missed events.

### Configuration Options

#### Authentication

You can provide the Linear API key in three ways:

```yaml
auth:
  type: token

  # Option 1: From environment variable (recommended)
  tokenEnv: LINEAR_API_KEY

  # Option 2: Direct token (not recommended for production)
  # token: lin_api_your_token_here

  # Option 3: From file
  # tokenFile: /path/to/token.txt
```

#### Webhook Secret

Similarly, webhook secrets can be provided in multiple ways:

```yaml
options:
  # Option 1: From environment variable (recommended)
  webhookSecretEnv: LINEAR_WEBHOOK_SECRET

  # Option 2: Direct secret (not recommended for production)
  # webhookSecret: "your-secret-here"

  # Option 3: From file
  # webhookSecretFile: /path/to/secret/file
```

#### Team Filtering

Filter which teams to monitor:

```yaml
options:
  # Option 1: Monitor specific teams (recommended)
  teams:
    - ENG      # Engineering team
    - PRODUCT  # Product team
    - DESIGN   # Design team

  # Option 2: Monitor all teams (omit teams option)
  # (All teams in your workspace will be monitored)
```

To find your team keys:
1. Go to Linear → Settings → Teams
2. Your team key is the short identifier shown next to each team name (e.g., "ENG", "DES")
3. Team keys are also visible in issue identifiers (e.g., "ENG-123" → team key is "ENG")

#### Polling Options

- `pollingInterval`: Seconds between polls (default: 60)
- `initialLookbackHours`: Hours to look back on first poll (default: 1)
- `maxItemsPerPoll`: Maximum items to process per poll (default: unlimited)

#### Event Filtering

Linear webhook events are automatically filtered to focus on actionable changes:

**Processed Events:**
- Issue created
- Issue updated (state changes, assignments, etc.)
- Issues not in "Done" or "Cancelled" states

**Skipped Events:**
- Issues in "Done" state
- Issues in "Cancelled" or "Canceled" state (both spellings)
- Non-issue events (comments are not yet supported)

## Webhook Setup Details

### How Webhook Verification Works

auto-coder validates webhook signatures using HMAC SHA-256:

1. Linear signs the payload with your webhook secret
2. The signature is sent in the `Linear-Signature` header
3. auto-coder recomputes the signature and compares it
4. Requests with invalid signatures are rejected

### Webhook URL Format

The webhook endpoint is: `http://your-server:3000/webhook/linear`

If you configure a `basePath` in server settings:

```yaml
server:
  basePath: /api
```

The endpoint becomes: `http://your-server:3000/api/webhook/linear`

### Testing Webhooks Locally

For local development, use a tunneling service like:

- [ngrok](https://ngrok.com/): `ngrok http 3000`
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/): `cloudflared tunnel --url http://localhost:3000`

Then use the tunnel URL in your Linear webhook configuration.

## Running the Watcher

### Development Mode

```bash
pnpm run dev
```

### Production Mode

```bash
pnpm run build
pnpm start
```

## Troubleshooting

### Polling Not Working

**Symptoms**: No events received from polling

**Solutions**:
- Verify `LINEAR_API_KEY` is set: `echo $LINEAR_API_KEY`
- Check API key is valid (regenerate if necessary)
- Ensure `auth` section is present with token configuration
- Verify `teams` are configured correctly (or omit to monitor all teams)
- Check logs for authentication errors
- Ensure the API key hasn't been revoked in Linear settings

### Webhooks Not Received

**Symptoms**: Webhook server running but no events received

**Solutions**:
- Verify webhook URL is accessible from Linear
  - Must be publicly accessible (use ngrok/cloudflared for local testing)
- Check webhook delivery logs in Linear:
  - Linear Settings → API → Webhooks → View your webhook → "Deliveries" tab
- Verify webhook secret matches configuration:
  - `echo $LINEAR_WEBHOOK_SECRET`
- Check auto-coder logs for signature validation errors
- Ensure webhook events are selected (Issue events)
- Verify the webhook is enabled in Linear settings

### Duplicate Events

**Symptoms**: Same event processed multiple times

**Solutions**:
- Verify `botUsername` matches your Linear account
  - Use your Linear username (e.g., "john-doe")
  - Or use your display name (e.g., "John Doe")
  - Run with `logLevel: debug` to see which identifier Linear returns
- Check that bot account has write access to issues
- Review comment history on issues to see if comments are being posted
- Ensure `deduplication.enabled` is `true`

### Authentication Errors

**Symptoms**: "Invalid API key" or 401/403 errors

**Solutions**:
- Regenerate Linear API key
- Verify API key is set correctly: `echo $LINEAR_API_KEY`
- Ensure API key hasn't been revoked
- Check that your Linear account has access to the teams you're monitoring

### Rate Limiting

**Symptoms**: 429 errors or "rate limit exceeded" messages

**Solutions**:
- Increase `pollingInterval` to reduce API calls
- Use `maxItemsPerPoll` to limit items per poll
- Use webhooks instead of polling when possible (webhooks are not rate limited)
- Linear API has a rate limit of ~1000 requests per minute per user

### Webhook Signature Validation Fails

**Symptoms**: "Invalid signature" errors in logs

**Solutions**:
- Verify `LINEAR_WEBHOOK_SECRET` matches the secret configured in Linear
- Check that webhook secret is not empty
- Regenerate webhook secret if needed
- Review webhook delivery details in Linear for debugging information

### Issues in "Done" State Still Processing

**Symptoms**: Completed issues are being processed

**Solutions**:
- This is expected for reopened issues
- Check Linear state configuration - custom state names might not match "Done"
- Review logs to see which state is being reported
- The provider skips states: "Done", "Cancelled", "Canceled"

## Advanced Configuration

### Multiple Teams

Monitor multiple teams by listing them:

```yaml
options:
  teams:
    - ENG
    - PRODUCT
    - DESIGN
    - SUPPORT
```

### Monitor All Teams

To monitor all teams in your workspace, omit the `teams` option:

```yaml
providers:
  linear:
    enabled: true
    pollingInterval: 60
    auth:
      type: token
      tokenEnv: LINEAR_API_KEY
    options:
      webhookSecretEnv: LINEAR_WEBHOOK_SECRET
      # No teams specified = monitor all teams
```

### Custom State Filtering

The Linear provider automatically skips issues in "Done", "Cancelled", and "Canceled" states. If your organization uses custom state names, you may need to modify the provider logic.


## Example Workflows

### Watch Issues and Auto-Respond

```yaml
commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | ai-agent respond"
  followUp: true

providers:
  linear:
    options:
      teams:
        - ENG
```

### Monitor Specific Teams

```yaml
providers:
  linear:
    options:
      teams:
        - ENG      # Engineering
        - PRODUCT  # Product Management
```


## Resources

- [Linear API Documentation](https://developers.linear.app/docs)
- [Linear GraphQL API](https://developers.linear.app/docs/graphql/working-with-the-graphql-api)
- [Linear Webhook Documentation](https://developers.linear.app/docs/graphql/webhooks)
- [Linear API Keys](https://linear.app/settings/api)

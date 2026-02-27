# Slack Provider Setup

This guide provides detailed instructions for setting up auto-coder with the Slack provider.

## Prerequisites

- Node.js 18+ (recommended for full ES2022 support)
- pnpm (installed via `npm install -g pnpm` or `corepack enable`)
- A Slack workspace where you can create and install apps

## Key Differences from Other Providers

**Unlike GitHub/GitLab/Linear**, the Slack provider only triggers when the bot is **@mentioned**. This design prevents the bot from responding to every message in high-traffic channels.

## Slack App Setup

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app (e.g., "Auto Coder Bot")
4. Select your workspace
5. Click "Create App"

### 2. Configure Bot Scopes

Navigate to **OAuth & Permissions** and add these Bot Token Scopes:

**Required scopes:**
- `app_mentions:read` - To receive mentions (webhook)
- `chat:write` - To post messages
- `channels:history` - To read channel messages (for deduplication)
- `groups:history` - To read private channel messages
- `im:history` - To read direct messages
- `search:read` - To search for missed mentions (polling mode)

### 3. Enable Event Subscriptions

Navigate to **Event Subscriptions**:

1. Toggle "Enable Events" to **On**
2. Set **Request URL** to: `http://your-server:3000/webhook/slack`
   - Slack will send a verification challenge
   - auto-coder will automatically respond to it
3. Under **Subscribe to bot events**, add:
   - `app_mention` - When the bot is @mentioned
4. Click "Save Changes"

### 4. Install App to Workspace

1. Navigate to **Install App**
2. Click "Install to Workspace"
3. Review permissions and click "Allow"
4. **Copy the "Bot User OAuth Token"** (starts with `xoxb-`)
   - This is your `SLACK_BOT_TOKEN`

### 5. Get Signing Secret

1. Navigate to **Basic Information**
2. Under "App Credentials", find **Signing Secret**
3. Click "Show" and copy the value
   - This is your `SLACK_SIGNING_SECRET`

### 6. Create Sandbox Secrets

```bash
# Create secrets in your sandbox
cs secret create slack_bot_token <your-bot-token>
cs secret create slack_signing_secret <your-signing-secret>
```

## Configuration

### Basic Configuration

Create `config/watcher.yaml`:

```yaml
server:
  host: 0.0.0.0
  port: 3000

deduplication:
  enabled: true
  # Slack bot user ID (e.g., "U01ABC123DEF")
  # Find this at: Slack App → Basic Information → App ID
  # Or it will be logged when the watcher starts
  botUsername: U01ABC123DEF
  commentTemplate: "Agent is working on {id}"

commandExecutor:
  enabled: true
  command: "cs llm session run --approval=auto --name=$EVENT_SHORT_ID"
  # Use Slack-specific prompt template
  prompts:
    slack: ./config/event-prompt-slack.example.hbs
  # Fallback for other providers
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  followUp: true

providers:
  slack:
    enabled: true

    # Optional: Enable polling as fallback for missed mentions
    # Recommended to catch mentions when webhooks fail or are temporarily unavailable
    pollingInterval: 300  # Poll every 5 minutes (300 seconds)

    auth:
      type: token
      tokenEnv: SLACK_BOT_TOKEN

    options:
      # Signing secret for webhook verification
      signingSecretEnv: SLACK_SIGNING_SECRET

      # Initial lookback period for first poll (default: 1 hour)
      # When first polling, only fetch mentions from the last N hours
      initialLookbackHours: 1
```

### Configuration Options

#### Authentication

```yaml
auth:
  type: token

  # Option 1: From environment variable (recommended)
  tokenEnv: SLACK_BOT_TOKEN

  # Option 2: Direct token (not recommended for production)
  # token: xoxb-your-token-here

  # Option 3: From file
  # tokenFile: /path/to/token.txt
```

#### Signing Secret

```yaml
options:
  # Option 1: From environment variable (recommended)
  signingSecretEnv: SLACK_SIGNING_SECRET

  # Option 2: Direct secret (not recommended for production)
  # signingSecret: "your-secret-here"

  # Option 3: From file
  # signingSecretFile: /path/to/secret/file
```

## How It Works

### Mention-Only Triggering

The Slack provider **only processes `app_mention` events**, which occur when:
- Someone types `@YourBot` in a message
- The bot user is mentioned in any channel where it's added

**Not triggered by:**
- Regular messages without mentions
- Messages in channels where the bot isn't added
- Direct messages (unless bot is mentioned with @)

### Dual Mode: Webhooks + Polling

Slack provider supports both modes for maximum reliability:

**Webhook Mode (Real-time):**
- Instant response to mentions
- Low latency
- Requires publicly accessible endpoint
- Recommended as primary mechanism

**Polling Mode (Fallback):**
- Searches for missed mentions using Slack's search API
- Catches mentions when webhooks fail or are temporarily unavailable
- Configurable interval (recommended: 5-15 minutes)
- Uses `search.messages` API with bot mention query
- Optional but recommended for production deployments

**Best Practice:** Enable both for reliability:
```yaml
slack:
  pollingInterval: 300  # Check every 5 minutes for missed mentions
  options:
    signingSecretEnv: SLACK_SIGNING_SECRET  # Enable webhooks
```

### Thread Handling

When the bot is mentioned in a thread:
- The bot automatically replies **in the same thread**
- Context from the thread is preserved
- The bot won't spam the main channel

### Deduplication

Deduplication works the same as other providers:
- Checks the last message in the channel/thread
- If it's from the bot, skips processing
- Uses the bot's user ID for matching

## Running the Watcher

### Development Mode

```bash
pnpm run dev:watcher
```

### Production Mode

```bash
pnpm run build
pnpm start
```

## Troubleshooting

### Webhooks Not Received

**Symptoms**: Bot doesn't respond to mentions

**Solutions**:
- Verify webhook URL is accessible from Slack
  - Must be publicly accessible (use ngrok/cloudflared for local testing)
- Check Event Subscriptions in Slack app settings:
  - Is `app_mention` subscribed?
  - Is the Request URL verified (green checkmark)?
- Check auto-coder logs for webhook validation errors
- Verify `SLACK_SIGNING_SECRET` matches the Slack app

### Bot Not Responding

**Symptoms**: Webhook received but no response

**Solutions**:
- Verify bot is added to the channel:
  - Type `/invite @YourBot` in the channel
- Check bot token permissions:
  - Go to OAuth & Permissions
  - Verify all required scopes are present
- Verify `SLACK_BOT_TOKEN` is set correctly: `echo $SLACK_BOT_TOKEN`
- Check logs for API errors

### Permission Errors

**Symptoms**: "not_in_channel" or "missing_scope" errors

**Solutions**:
- Add bot to the channel: `/invite @YourBot`
- Verify bot scopes in Slack App → OAuth & Permissions
- May need to reinstall app after adding scopes

### Duplicate Responses

**Symptoms**: Bot responds multiple times to the same mention

**Solutions**:
- Verify `botUsername` in config matches bot user ID
  - Check logs on startup: "Slack bot user ID: U01ABC123"
  - Update `botUsername` in config to match
- Ensure `deduplication.enabled` is `true`

### Rate Limiting

**Symptoms**: Bot stops responding or gets "rate_limited" errors

**Solutions**:
- Slack has rate limits per workspace:
  - Tier 1: ~1 message per second
  - Tier 2/3/4: Higher limits for paid workspaces
- Add delays between messages if needed
- Check Slack API rate limit headers in logs

## Testing Locally

### Using ngrok

```bash
# Start ngrok tunnel
ngrok http 3000

# Use the HTTPS URL in Slack Event Subscriptions
# Example: https://abc123.ngrok.io/webhook/slack
```

### Using cloudflared

```bash
# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:3000

# Use the provided URL in Slack Event Subscriptions
```

### Test the Integration

1. Add the bot to a test channel: `/invite @YourBot`
2. Mention the bot: `@YourBot hello`
3. Check auto-coder logs for:
   ```
   Processing Slack app_mention in channel C01ABC123
   ```
4. Bot should respond in the channel/thread

## Advanced Configuration

### Channel-Specific Behavior

Currently, the bot responds to mentions in any channel where it's added. To limit channels:
- Only add the bot to specific channels
- Use Slack's App Home to manage channel access

### Thread vs Channel Responses

The bot automatically:
- Replies in thread if mentioned in a thread
- Posts in main channel if mentioned in main channel
- This is handled automatically, no configuration needed

## Security Best Practices

1. **Always use signing secrets** for webhook verification
2. **Use environment variables** for tokens (never commit to git)
3. **Restrict bot scopes** to minimum required
4. **Use HTTPS** in production (required by Slack)
5. **Rotate tokens** regularly in Slack app settings
6. **Monitor webhook delivery** in Slack app Event Subscriptions page
7. **Review bot permissions** periodically

## Slack API Rate Limits

### Message Posting
- Tier 1: ~1 message per second per channel
- Higher tiers available for paid workspaces
- Rate limits are per workspace, not per app

### API Calls
- Most methods: ~1 request per second
- Some methods have higher tier-based limits

### Checking Rate Limit Status

Check response headers from Slack API:
- `X-Rate-Limit-Remaining`
- `X-Rate-Limit-Reset`

## Example Workflow

### Auto-respond to Questions

```yaml
commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | ai-agent answer"
  prompts:
    slack: ./config/event-prompt-slack.example.hbs
  useStdin: true
  followUp: true

providers:
  slack:
    enabled: true
```

### Create Issues from Slack Mentions

```yaml
commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | create-issue-from-slack"
  prompts:
    slack: ./config/prompt-slack-to-issue.hbs
  useStdin: true
  followUp: true
```

## Resources

- [Slack API Documentation](https://api.slack.com/)
- [Bot Users](https://api.slack.com/bot-users)
- [Events API](https://api.slack.com/events-api)
- [App Mention Event](https://api.slack.com/events/app_mention)
- [Slack App Management](https://api.slack.com/apps)

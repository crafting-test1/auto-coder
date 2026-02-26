# GitHub Provider Setup

This guide provides detailed instructions for setting up auto-coder with the GitHub provider.

## Prerequisites

- Node.js 18+ (recommended for full ES2022 support)
- pnpm (installed via `npm install -g pnpm` or `corepack enable`)
- A GitHub account with access to repositories you want to monitor

## GitHub PAT Setup

Create a GitHub Personal Access Token with the following permissions:

### For Fine-Grained Tokens (Recommended)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Configure the following:
   - **Token name**: auto-coder (or your preferred name)
   - **Expiration**: Choose your desired expiration
   - **Repository access**: Select repositories you want to monitor
   - **Repository permissions**:
     - Issues: Read and write
     - Pull requests: Read and write
     - Metadata: Read-only (automatically included)

### For Classic Tokens

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select the following scope:
   - `repo` (full repository access)

### Create a Sandbox secret 

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

For persistent configuration, add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
echo 'export GITHUB_TOKEN="ghp_your_token_here"' >> ~/.bashrc
source ~/.bashrc
```

## Webhook Secret Setup (Optional but Recommended)

Webhook secrets provide security by verifying that webhook requests come from GitHub.

### Generate a Secret

```bash
openssl rand -hex 32
```

### Set as Environment Variable

```bash
export GITHUB_WEBHOOK_SECRET="your-secret-here"
```

For persistent configuration:

```bash
echo 'export GITHUB_WEBHOOK_SECRET="your-secret-here"' >> ~/.bashrc
source ~/.bashrc
```

### Configure in GitHub

1. Go to your repository → Settings → Webhooks → Add webhook
2. Set **Payload URL**: `http://your-server:3000/webhook/github`
3. Set **Content type**: `application/json`
4. Set **Secret**: Your webhook secret (same as `GITHUB_WEBHOOK_SECRET`)
5. Select events:
   - **Issues** (check this)
   - **Pull requests** (check this)
   - **Issue comments** (check this)
6. Ensure **Active** is checked
7. Click "Add webhook"

## Configuration

### Basic Configuration

Create `config/watcher.yaml`:

```yaml
server:
  host: 0.0.0.0
  port: 3000

deduplication:
  enabled: true
  botUsername: your-github-username  # Your GitHub account username
  commentTemplate: "Agent is working on {id}"

commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | your-ai-agent"
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: true
  followUp: true

providers:
  github:
    enabled: true
    pollingInterval: 60  # Poll every 60 seconds

    auth:
      type: token
      tokenEnv: GITHUB_TOKEN

    options:
      # Webhook secret for signature verification
      webhookSecretEnv: GITHUB_WEBHOOK_SECRET

      # Repositories to monitor (for polling)
      repositories:
        - owner/repo1
        - owner/repo2

      # Event types to monitor
      events:
        - issues
        - pull_request
        - issue_comment

      # Initial lookback period (default: 1 hour)
      initialLookbackHours: 1

      # Max items per poll (default: unlimited)
      maxItemsPerPoll: 50
```

### Configuration Options

#### Authentication

You can provide the GitHub token in three ways:

```yaml
auth:
  type: token

  # Option 1: From environment variable (recommended)
  tokenEnv: GITHUB_TOKEN

  # Option 2: Direct token (not recommended for production)
  # token: ghp_your_token_here

  # Option 3: From file
  # tokenFile: /path/to/token.txt
```

#### Webhook Secret

Similarly, webhook secrets can be provided in multiple ways:

```yaml
options:
  # Option 1: From environment variable (recommended)
  webhookSecretEnv: GITHUB_WEBHOOK_SECRET

  # Option 2: Direct secret (not recommended for production)
  # webhookSecret: "your-secret-here"

  # Option 3: From file
  # webhookSecretFile: /path/to/secret/file
```

#### Event Types

Supported event types:
- `issues` - Issue opened, closed, reopened, edited, assigned, etc.
- `pull_request` - PR opened, closed, merged, edited, review requested, etc.
- `issue_comment` - Comments on issues and pull requests

#### Polling Options

- `pollingInterval`: Seconds between polls (default: 60)
- `initialLookbackHours`: Hours to look back on first poll (default: 1)
- `maxItemsPerPoll`: Maximum items to process per poll (default: unlimited)

## Webhook Setup Details

### How Webhook Verification Works

auto-coder validates webhook signatures using HMAC SHA-256:

1. GitHub signs the payload with your webhook secret
2. The signature is sent in the `X-Hub-Signature-256` header
3. auto-coder recomputes the signature and compares it
4. Requests with invalid signatures are rejected

### Webhook URL Format

The webhook endpoint is: `http://your-server:3000/webhook/github`

If you configure a `basePath` in server settings:

```yaml
server:
  basePath: /api
```

The endpoint becomes: `http://your-server:3000/api/webhook/github`

### Testing Webhooks Locally

For local development, use a tunneling service like:

- [ngrok](https://ngrok.com/): `ngrok http 3000`
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/): `cloudflared tunnel --url http://localhost:3000`

Then use the tunnel URL in your GitHub webhook configuration.

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

### Polling Not Working

**Symptoms**: No events received from polling

**Solutions**:
- Verify `GITHUB_TOKEN` is set: `echo $GITHUB_TOKEN`
- Check token permissions (Issues + PRs read/write)
- Ensure `repositories` are configured in `options`
- Verify `auth` section is present with token configuration
- Check logs for authentication errors

### Webhooks Not Received

**Symptoms**: Webhook server running but no events received

**Solutions**:
- Verify webhook URL is accessible from GitHub
  - Must be publicly accessible (use ngrok/cloudflared for local testing)
- Check webhook delivery logs in GitHub:
  - Repository → Settings → Webhooks → Recent Deliveries
- Verify webhook secret matches configuration:
  - `echo $GITHUB_WEBHOOK_SECRET`
- Check auto-coder logs for signature validation errors
- Ensure webhook events are selected (Issues, Pull requests, Issue comments)

### Duplicate Events

**Symptoms**: Same event processed multiple times

**Solutions**:
- Verify `botUsername` matches the GitHub account posting comments
- Check that bot account has write access to repositories
- Review comment history on issues/PRs to see if comments are being posted
- Ensure `deduplication.enabled` is `true`

### Authentication Errors

**Symptoms**: "Bad credentials" or 401/403 errors

**Solutions**:
- Regenerate GitHub token with correct permissions
- Verify token is set correctly: `echo $GITHUB_TOKEN`
- Check token hasn't expired
- Ensure token has access to the repositories you're monitoring

### Rate Limiting

**Symptoms**: 403 errors with "rate limit exceeded" message

**Solutions**:
- Increase `pollingInterval` to reduce API calls
- Use `maxItemsPerPoll` to limit items per poll
- Use webhooks instead of polling when possible
- Authenticated requests have higher rate limits (5000/hour vs 60/hour)

### Webhook Signature Validation Fails

**Symptoms**: "Invalid signature" errors in logs

**Solutions**:
- Verify `GITHUB_WEBHOOK_SECRET` matches the secret configured in GitHub
- Check that webhook secret is not empty
- Ensure webhook is configured with `application/json` content type
- Review webhook delivery details in GitHub for the signature being sent

## Advanced Configuration

### Multiple Repositories

Monitor multiple repositories by listing them:

```yaml
options:
  repositories:
    - owner/repo1
    - owner/repo2
    - another-owner/repo3
```

### Webhook-Only Mode

Disable polling by removing `pollingInterval` and `repositories`:

```yaml
providers:
  github:
    enabled: true
    auth:
      type: token
      tokenEnv: GITHUB_TOKEN
    options:
      webhookSecretEnv: GITHUB_WEBHOOK_SECRET
      events:
        - issues
        - pull_request
```

### Polling-Only Mode

Works automatically if webhooks aren't configured. Just set up repositories:

```yaml
providers:
  github:
    enabled: true
    pollingInterval: 60
    auth:
      type: token
      tokenEnv: GITHUB_TOKEN
    options:
      repositories:
        - owner/repo1
```

## Security Best Practices

1. **Always use webhook secrets** in production
2. **Use environment variables** for tokens and secrets (never commit to git)
3. **Restrict token permissions** to minimum required (Issues + PRs read/write)
4. **Run behind a reverse proxy** (nginx, Caddy) for HTTPS in production
5. **Regularly rotate tokens** and secrets
6. **Monitor webhook delivery logs** for suspicious activity
7. **Use fine-grained tokens** when possible for better security

## GitHub API Rate Limits

### Authenticated Requests
- 5,000 requests per hour per user
- Applies to polling operations

### Webhook Requests
- No rate limits (pushed from GitHub)
- Recommended for high-volume repositories

### Checking Rate Limit Status

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

## Example Workflows

### Watch Issues and Auto-Respond

```yaml
commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | ai-agent respond"
  followUp: true

providers:
  github:
    options:
      events:
        - issues
```

### Monitor PRs for Review

```yaml
commandExecutor:
  enabled: true
  command: "echo \"$PROMPT\" | ai-agent review"
  followUp: true

providers:
  github:
    options:
      events:
        - pull_request
```

### Handle Comments

```yaml
providers:
  github:
    options:
      events:
        - issue_comment
```

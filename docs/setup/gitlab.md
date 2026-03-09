# GitLab Provider Setup

Set up auto-coder to monitor GitLab issues, merge requests, and comments, and automatically dispatch a Crafting Coding Agent to handle them.

**Prerequisites:** Crafting CLI (`cs`) installed and authenticated as an org admin. A GitLab account with access to the projects you want to monitor.

---

## Step 1 — Create a GitLab API Token

Create a personal access token (or project/group access token) with the required scopes.

**External docs:** [GitLab — Personal access tokens](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html)

Steps:
1. Go to **Settings → Access Tokens** (for personal tokens: your avatar → Preferences → Access Tokens)
2. Click **Add new token**
3. Set:
   - **Token name:** `auto-coder` (or your preferred name)
   - **Expiration date:** choose based on your rotation policy
   - **Scopes:** `api` (grants read/write access to the API, including issues and merge requests)
4. Click **Create personal access token**

**MUST:** Copy the token immediately — it is shown only once.

**Note on self-hosted GitLab:** If you are using a self-hosted GitLab instance, the token creation URL will be on your instance (e.g., `https://gitlab.example.com/-/user_settings/personal_access_tokens`). You will also need to set `baseUrl` in your watcher.yaml config (see below).

**Capture:** the token value → `gitlab-pat` secret

---

## Step 2 — Create a Crafting Bot Account (Optional)

For deduplication to work correctly, the watcher needs to know which GitLab username belongs to the bot. You can use any GitLab account as the bot — just set `botUsername` in `watcher.yaml` to that account's username.

If you use your personal account, the watcher may skip events you create yourself (since it treats the bot account's comments as "already handled").

---

## Step 3 — Generate a Webhook Secret

Generate a random string to use as the webhook signing secret. This allows the watcher to verify that incoming webhook requests actually come from GitLab.

```bash
openssl rand -hex 32
```

**Capture:** the output value → `gitlab-webhook-secret` secret

---

## No MCP Server

There is currently no MCP server available for GitLab. The Crafting Coding Agent will interact with GitLab via the API credentials passed through the watcher prompt context.

---

## watcher.yaml Configuration

The watcher can auto-configure from environment variables. For custom setups, use a `watcher.yaml` file injected via the template's `files:` block.

Reference configuration:

```yaml
providers:
  gitlab:
    enabled: true
    pollingInterval: 60  # seconds between polls (default: 60)

    auth:
      type: token
      tokenEnv: GITLAB_TOKEN

    options:
      webhookSecretEnv: GITLAB_WEBHOOK_SECRET
      botUsername: your-gitlab-username  # GitLab username used for deduplication

      # Projects to monitor for polling (webhooks work without this)
      projects:
        - group/project1
        - username/project2

      initialLookbackHours: 1  # how far back to look on first poll
      maxItemsPerPoll: 50      # cap items processed per poll cycle

      # For self-hosted GitLab instances:
      # baseUrl: https://gitlab.example.com/api/v4
```

### Event filtering

Use `eventFilter` to control which event types trigger sessions:

```yaml
options:
  eventFilter:
    issues:
      actions: ['all']
      skipActions: ['labeled']
    merge_request:
      actions: ['opened', 'reopened']
    note: {}  # issue/MR comments
```

---

## Step 4 — Configure the GitLab Webhook

Find the webhook URL for your sandbox:

```
https://auto-coder.<your-org>.sandboxes.cloud/webhook/gitlab
```

You can also find it in the Web Console: select the sandbox → **Endpoints** → **webhook** → copy the URL.

For each project you want to monitor:

1. Go to the project → **Settings → Webhooks**
2. Click **Add new webhook**
3. Set **URL** to the URL above
4. Set **Secret token** to the value you generated in Step 3
5. Under **Trigger**, check:
   - **Issues events**
   - **Comments**
   - **Merge request events**
6. Ensure **Enable SSL verification** is checked (unless your sandbox uses a self-signed certificate)
7. Click **Add webhook**

GitLab will show a **Test** button to send a test event. Click it to verify the webhook is working.

---

## Troubleshooting

**Watcher fails to start — "No providers enabled"**

The env vars are not reaching the watcher. Check:
- Secrets exist: `cs secret list`
- Template references the correct secret names (`${secret:gitlab-pat}`, `${secret:gitlab-webhook-secret}`)
- Sandbox was created from the updated template: `cs sandbox info auto-coder`

**Webhook events not received**

- Verify the webhook URL is correct (Web Console → Endpoints → webhook)
- Check GitLab webhook delivery log: project → Settings → Webhooks → select webhook → **Edit** → scroll to Recent events
- Check sandbox logs for signature validation errors
- Ensure the webhook has the correct event types checked

**Webhook signature validation fails**

- Verify `GITLAB_WEBHOOK_SECRET` matches the secret token configured in GitLab webhook settings
- Check that the webhook secret is not empty

**Bot posts duplicate comments / responds to itself**

`botUsername` in `watcher.yaml` doesn't match the bot's actual GitLab username. Check the exact username and update the configuration, then restart the sandbox:
```bash
cs sandbox restart auto-coder
```

**Authentication errors (401/403)**

- Verify `GITLAB_TOKEN` is set correctly
- Check token permissions (`api` scope required)
- Ensure the token hasn't expired
- Verify the token has access to the projects you're monitoring

**Self-hosted GitLab: connection errors**

- Ensure `baseUrl` is set to `https://your-gitlab.example.com/api/v4`
- Verify the sandbox can reach your GitLab instance (firewall/network rules)
- Check SSL certificate validity if SSL verification is enabled

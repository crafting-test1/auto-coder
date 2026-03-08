# GitHub Quick Start

Get auto-coder running with GitHub in ~10 minutes.

**Prerequisites:** [Crafting CLI (`cs`)](https://docs.sandboxes.cloud/docs/cli) installed and authenticated as an org admin.

---

## 1. Create a GitHub bot account

Create a dedicated GitHub account for the agent (e.g. `my-org-bot`). This is the account that will post comments and open PRs.

> **Do not use your personal account.** The watcher skips events where the last comment is from the bot — using your own account would suppress your own events.

Add the bot as a collaborator on the repositories it needs to access.

---

## 2. Create a GitHub Personal Access Token

Sign in as the bot account, then go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.

Required permissions:
- **Issues:** Read and write
- **Pull requests:** Read and write

Note the token value — you will use it in the next step.

---

## 3. Create secrets in Crafting

```bash
# Generate a webhook secret
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Create (secrets)[https://docs.sandboxes.cloud/concepts/secret.html] for Github related information.

- `github-pat`
- `github-webhook-secret`

These secrets can be created using:

```bash
cs secret create NAME ...
```

or using Web Console.

After creating each secret, make sure both secrets are marked as **Admin Only** and **Not Mountable**.
---

## 4. Configure template and start a Sandbox

Download the template into a local folder (gitignored, safe for customizations):

```bash
mkdir -p _local
curl -o _local/auto-coder-quick-start.yaml \
  https://raw.githubusercontent.com/crafting-test1/auto-coder/refs/heads/main/templates/auto-coder-quick-start.yaml
```

Open `_local/auto-coder-quick-start.yaml` and fill in the two required values in the `env:` block:

```yaml
- GITHUB_BOT_USERNAME=your-bot-github-username   # from Step 1
- GITHUB_REPOSITORIES=owner/repo                 # comma-separated for multiple repos
```

Create the template and sandbox from the local file:

```bash
cs template create auto-coder ./_local/auto-coder-quick-start.yaml
cs sandbox create auto-coder -t auto-coder
cs sandbox pin auto-coder   # keeps it running 24/7 to receive webhook events
```

---

## 6. Configure the GitHub webhook

Find your webhook URL:
```bash
# Or find it in: Web Console → Sandbox → Endpoints → "webhook"
echo "https://auto-coder.<your-org>.sandboxes.cloud/webhook/github"
```

In each monitored repository go to **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://auto-coder.<your-org>.sandboxes.cloud/webhook/github` |
| Content type | `application/json` ← **required** |
| Secret | webhook secret from Step 3 |
| Events | Issues, Pull requests, Issue comments |

---

## 7. Authorize MCP servers

Web Console → **Connect → LLM → Discovery** → click **Authorize** next to the auto-coder sandbox.

Without this step the agent cannot read issues or create PRs.

---

## 8. Verify

```bash
cs sandbox logs auto-coder --follow
# Look for: "Watcher started successfully" and "Initialized provider: github"
```

Create a test issue in one of your monitored repos. Within ~30 seconds the bot should comment: *"Agent is working on #\<number\>"* and a Crafting Coding Agent session will start.

---

For security hardening, token rotation, event filtering, and multi-provider setup, see **[docs/setup.md](setup.md)**.

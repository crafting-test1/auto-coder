# GitHub Quick Start

Get auto-coder running with GitHub in ~10 minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (LTS recommended)
- [pnpm](https://pnpm.io/installation) — install via `npm install -g pnpm` or the [standalone installer](https://pnpm.io/installation)
- [Crafting CLI (`cs`)](https://docs.sandboxes.cloud/docs/cli) installed and authenticated as an org admin

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

Create [secrets](https://docs.sandboxes.cloud/concepts/secret.html) for GitHub related information.

- `github-pat`
- `github-webhook-secret`

Create them (run in a separate terminal — never paste tokens here):

```bash
echo "YOUR_PAT" | cs secret create github-pat -f -
echo "$GITHUB_WEBHOOK_SECRET" | cs secret create github-webhook-secret -f -
```

or using the Web Console.

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
cs sandbox pin auto-coder
```

> **MUST pin the sandbox.** Without pinning, the sandbox suspends after inactivity and misses webhook events. Events received while suspended are lost.

---

## 5. Configure the GitHub webhook

Find your webhook URL: Web Console → Sandbox → Endpoints → "webhook"

In each monitored repository go to **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://webhook--auto-coder-<your-org>.sandboxes.site/webhook/github` |
| Content type | `application/json` ← **required** |
| Secret | webhook secret from Step 3 |
| Events | Issues, Pull requests, Issue comments |

---

## 6. Authorize MCP servers

Web Console → **Connect → LLM → Discovery** → click **Authorize** next to the auto-coder sandbox.

Without this step the agent cannot read issues or create PRs.

For more details, please refer to this [doc](https://docs.sandboxes.cloud/features/llm-config.html).

---

## 7. Verify

```bash
cs logs --workspace auto-coder/dev --follow watcher
# Look for: "Watcher started successfully" and "Initialized provider: github"
```

Create a test issue in one of your monitored repos. Within ~30 seconds the bot should comment: *"Agent is working on #\<number\>"* and a Crafting Coding Agent session will start.

---

For security hardening, token rotation, event filtering, and multi-provider setup, see **[docs/setup/index.md](setup/index.md)**.

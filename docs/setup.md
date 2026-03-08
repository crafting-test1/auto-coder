# Manual Setup Guide

This guide walks an org admin through deploying auto-coder from scratch onto an existing Crafting site. Every step is reproducible and suitable for IaC or Config-as-Code workflows.

**Prerequisites:** Crafting CLI (`cs`) installed and authenticated as an org admin.

---

## Overview

You will:
1. Create a GitHub bot account
2. Create a GitHub Personal Access Token
3. Generate a webhook secret
4. Store both as Crafting secrets
5. Edit and deploy the sandbox template
6. Create and pin the sandbox
7. Configure the GitHub webhook
8. Authorize MCP servers
9. Verify the setup

---

## Step 1 — Create a GitHub Bot Account

Create a dedicated GitHub account for the agent. This account will post comments and open PRs.

**MUST:** Use a separate account, not your personal GitHub account. The watcher skips events where the last comment is from this account — using your personal account would suppress events you create yourself.

After creating the account:
- Note the **username** → you will use it as `GITHUB_BOT_USERNAME`
- Add the bot account as a collaborator on the repositories it needs to write to (Settings → Collaborators → Add people)

---

## Step 2 — Create a GitHub Personal Access Token

Create a fine-grained token for the bot account. Sign in as the bot account to do this.

**External docs:** [GitHub — Creating a fine-grained token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)

Steps:
1. Go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set:
   - **Token name:** `auto-coder` (or your preferred name)
   - **Expiration:** choose based on your rotation policy
   - **Resource owner:** the org or user that owns the repositories
   - **Repository access:** select the specific repositories to monitor
   - **Repository permissions:**
     - Issues: **Read and write**
     - Pull requests: **Read and write**
     - Metadata: Read-only (auto-included)

**MUST:** Use a fine-grained token scoped to specific repositories. DON'T use a classic token with full `repo` scope — it grants far more access than needed.

**Capture:** the token value (shown once) → `github-pat` secret

---

## Step 3 — Generate a Webhook Secret

Generate a random string to use as the webhook signing secret. This allows the watcher to verify that incoming webhook requests actually come from GitHub.

```bash
openssl rand -hex 32
```

**Capture:** the output value → `github-webhook-secret` secret

---

## Step 4 — Create Crafting Secrets

Store both values as Crafting secrets. Run these commands from your local machine with `cs` authenticated.

```bash
cs secret create github-pat <token-from-step-2>
cs secret create github-webhook-secret <value-from-step-3>
```

**MUST:** After creating each secret, open the Crafting Web Console and mark both secrets as:
- **Admin Only** — the secret is only available when the sandbox is in Restriction Mode, preventing the agent from accessing its own credentials
- **Not Mountable** — the secret is never written to the filesystem at `/run/sandbox/fs/secrets/`; it is only accessible as an environment variable

Steps: Web Console → **Secrets** → select the secret → **Edit** → check **Admin Only** and **Not Mountable** → Save.

---

## Step 5 — Configure the Template

Clone the repository and edit the template:

```bash
git clone https://github.com/crafting-test1/auto-coder.git
cd auto-coder
```

Open `templates/auto-coder-quick-start.yaml`. Find the `env:` block near the top and fill in the two required values:

```yaml
env:
  - GITHUB_PERSONAL_ACCESS_TOKEN=${secret:github-pat}    # already set
  - GITHUB_WEBHOOK_SECRET=${secret:github-webhook-secret} # already set

  # Fill these in:
  - GITHUB_BOT_USERNAME=your-bot-github-username   # from Step 1
  - GITHUB_REPOSITORIES=owner/repo                 # comma-separated: owner/repo1,owner/repo2
```

These four values are the entire required configuration. Everything else in the template can be left as-is.

**For multiple repositories:** list them comma-separated: `owner/repo1,owner/repo2,owner/repo3`

---

## Step 6 — Create the Template and Sandbox

```bash
# Register the template with your Crafting site
cs template create auto-coder ./templates/auto-coder-quick-start.yaml

# Create the sandbox from the template
cs sandbox create auto-coder -t auto-coder
```

Sandbox creation checks out the repo, installs dependencies, and starts the watcher daemon automatically.

---

## Step 7 — Pin the Sandbox

The sandbox must stay running at all times to receive webhook events. Pin it to prevent automatic suspension:

```bash
cs sandbox pin auto-coder
```

**MUST:** Without pinning, the sandbox suspends after inactivity and misses events. Webhooks received while suspended are lost (not replayed). Polling will catch events from the past hour when the sandbox resumes, but real-time response requires the sandbox to be pinned.

---

## Step 8 — Configure the GitHub Webhook

Find the webhook URL for your sandbox:

```
https://auto-coder.<your-org>.sandboxes.cloud/webhook/github
```

You can also find it in the Web Console: select the sandbox → **Endpoints** → **webhook** → copy the URL.

For each repository you want to monitor:

1. Go to the repository → **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to the URL above
3. Set **Content type** to `application/json` — **MUST**, not `application/x-www-form-urlencoded`
4. Set **Secret** to the value you generated in Step 3
5. Under **Which events**, select **Let me select individual events**, then check:
   - **Issues**
   - **Pull requests**
   - **Issue comments**
6. Ensure **Active** is checked
7. Click **Add webhook**

GitHub will send a ping event. The webhook should show a green checkmark in the **Recent Deliveries** tab.

---

## Step 9 — Authorize MCP Servers

The sandbox runs a GitHub MCP server that gives Crafting Coding Agents access to GitHub tools (read issues, create PRs, etc.). This requires a one-time authorization step by an org admin.

1. Open the **Crafting Web Console**
2. Navigate to **Connect → LLM**
3. Click the **Discovery** tab
4. Find the `auto-coder` sandbox in the list
5. Click **Authorize**

**MUST:** Without this step, Claude sessions inside the sandbox cannot use GitHub MCP tools, and the agent will fail to read issues or create PRs.

---

## Step 10 — Verify

**Check the watcher is running:**

```bash
cs sandbox logs auto-coder --follow
```

Look for a line like: `Watcher started successfully` and `Initialized provider: github`.

**Trigger a test event:**

1. Open one of your monitored repositories
2. Create a new issue with a clear task description, @mentioning the bot account
3. Within ~30 seconds, the bot should post a comment: `"Agent is working on #<issue-number>"`
4. A Crafting Coding Agent starts. Check the follow-up comment for the session link.

**Check polling is working (optional):**

If you also want to confirm polling:
```bash
cs sandbox logs auto-coder | grep -i "polling"
```

---

## Security Notes

**Token rotation:** Rotate `github-pat` and `github-webhook-secret` on your standard schedule. After rotating:
1. `cs secret update github-pat <new-token>`
2. Update the secret value in GitHub webhook settings
3. Restart the sandbox: `cs sandbox restart auto-coder`

**Scope minimization:** The bot token should only have Issues + Pull Requests read/write on specific repositories. Avoid org-level tokens.

**Cost:** Each triggered event starts a Crafting Coding Agent. A busy repository with many issues/comments will start many sessions. Use `eventFilter` in `watcher.yaml` (see `config/watcher.example.yaml`) to restrict which event types trigger sessions. You can also increase `GITHUB_POLLING_INTERVAL` and rely on webhooks as the primary trigger.

**Restricting the sandbox:** For stricter environments, enable Restriction Mode in the template (`restriction.life_time: ALWAYS`) to prevent the sandbox owner from accessing the workspace. See [Crafting docs — Restriction Mode](https://docs.sandboxes.cloud/docs/restriction-mode) for details.

---

## Troubleshooting

**Watcher fails to start — "No providers enabled"**

The env vars are not reaching the watcher. Check:
- Secrets exist: `cs secret list`
- Template references the correct secret names (`${secret:github-pat}`, `${secret:github-webhook-secret}`)
- Sandbox was created from the updated template: `cs sandbox info auto-coder`

**Webhook events not received**

- Verify the webhook URL is correct (Web Console → Endpoints → webhook)
- Check GitHub webhook delivery log: repository → Settings → Webhooks → Recent Deliveries
- Verify content type is `application/json`
- Check sandbox logs for signature validation errors

**Bot posts duplicate comments / responds to itself**

`GITHUB_BOT_USERNAME` doesn't match the bot's actual GitHub username. Check the exact username at github.com and update the env var in the template, then re-deploy:
```bash
cs template update auto-coder ./templates/auto-coder-quick-start.yaml
cs sandbox restart auto-coder
```

**Claude sessions fail to use GitHub tools**

MCP servers are not authorized. Repeat Step 9. Also confirm the sandbox is pinned (`cs sandbox pin auto-coder`) — the MCP server is unavailable when the sandbox is suspended.

**Agent triggers on the wrong events**

Use `eventFilter` in `watcher.yaml` to control exactly which event types and actions trigger sessions. See `config/watcher.example.yaml` for the full filter reference.

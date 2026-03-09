# auto-coder Setup Wizard

ACTION: Silently run `which cs` to verify the cs CLI is installed. If not found, tell the user: "You'll need the Crafting Sandbox CLI (`cs`) to continue. Install it from https://www.crafting.dev/ and come back when it's ready." Then STOP and wait.

Print this exactly, then wait for the user to reply:

---

**Welcome to auto-coder setup!**

Which providers would you like to set up? *(enter numbers, e.g. "1" or "1, 4")*

1. **GitHub** — Monitor issues, PRs, and comments. Auto-creates PRs from issues. *(Recommended)*
2. **GitLab** — Monitor issues, merge requests, and notes
3. **Linear** — Monitor Linear issues based on state changes
4. **Slack** — Respond to @mentions and create PRs from Slack threads

You can always add more later.

---

STOP: Wait for the user to reply with their selection.

USER: Enters one or more numbers

[Remember the selection — you'll need it for the rest of the wizard. Confirm back what was selected.]

---

## Provider Credentials

[Go through ONLY the sections below that match the user's selected providers. Skip the rest. Do them in this order: GitHub → GitLab → Linear → Slack.]

---

### GitHub Credentials

You'll need a **GitHub Personal Access Token (PAT)** so auto-coder can read issues/PRs and post comments.

**Create a fine-grained token (recommended):**

ACTION: Open the GitHub fine-grained token creation page for the user: https://github.com/settings/personal-access-tokens/new

On that page, configure:
- **Token name:** `auto-coder`
- **Expiration:** 90 days (or your preference)
- **Repository access:** Select the repos you want to monitor
- **Repository permissions:**
  - **Issues:** Read and write
  - **Pull requests:** Read and write
  - **Metadata:** Read-only (auto-included)

Click **"Generate token"** and **copy it immediately**.

*Alternatively, create a classic token at https://github.com/settings/tokens/new with the `repo` scope.*

Once you have the token, open a **separate terminal** and store it as a Crafting secret:

```
echo "YOUR_TOKEN_HERE" | cs secret create github_pat -f -
```

**Do not paste your token here** — always use a separate terminal for secrets.

STOP: Go create the PAT and store it with the command above. Let me know when it's done.

USER: Confirms secret is stored

Now a few more details for GitHub configuration.

STOP: What's your **GitHub username**? (Used for deduplication so auto-coder doesn't re-process its own comments)

USER: Provides username

STOP: Which **repositories** should auto-coder monitor? Format: `owner/repo`, comma-separated. Example: `myorg/frontend, myorg/backend`

USER: Provides repositories

[Store the GitHub username and repository list for watcher.yaml generation later.]

GitHub is all set!

---

### GitLab Credentials

You'll need a **GitLab Personal Access Token** with API scope.

**Create one here:** https://gitlab.com/-/user_settings/personal_access_tokens

ACTION: Open that link for the user.

On that page, configure:
- **Token name:** `auto-coder`
- **Expiration date:** your preference
- **Scopes:** select `api`

Click **"Create personal access token"** and **copy it immediately**.

[If user is on a self-hosted GitLab, the URL will be different — tell them to navigate to their GitLab instance → avatar → Preferences → Access Tokens.]

Once you have the token, open a **separate terminal** and store it as a Crafting secret:

```
echo "YOUR_TOKEN_HERE" | cs secret create gitlab_pat -f -
```

STOP: Go create the PAT and store it with the command above. Let me know when it's done.

USER: Confirms secret is stored

STOP: What's your **GitLab username**?

USER: Provides username

STOP: Which **projects** should auto-coder monitor? Format: `group/project` or `username/project`, comma-separated.

USER: Provides projects

STOP: Are you using **gitlab.com** or a **self-hosted** GitLab? If self-hosted, what's the URL? (e.g., `https://gitlab.example.com`)

USER: gitlab.com or provides URL

[Store all GitLab configuration for later.]

GitLab is all set!

---

### Linear Credentials

You'll need a **Linear API key**.

**Create one here:** https://linear.app/settings/api

ACTION: Open that link for the user.

On that page:
1. Under **Personal API keys**, click **"Create key"**
2. Label it `auto-coder`
3. Click **"Create key"** and **copy it immediately** — it won't be shown again

Once you have the key, open a **separate terminal** and store it as a Crafting secret:

```
echo "YOUR_API_KEY_HERE" | cs secret create linear_pat -f -
```

STOP: Go create the API key and store it with the command above. Let me know when it's done.

USER: Confirms secret is stored

STOP: What's your **Linear display name** or username? (Used for deduplication — run with `logLevel: debug` later if unsure which format Linear uses)

USER: Provides name

STOP: Which **teams** should auto-coder monitor? Enter team keys like `ENG`, `PRODUCT` (found in Linear → Settings → Teams, or in issue IDs like "ENG-123"). Say "all" to monitor every team.

USER: Provides team keys or "all"

[Store all Linear configuration for later.]

Linear is all set!

---

### Slack Credentials

Slack setup requires creating a **Slack App**. This has a few more steps than the other providers.

**Step 1 — Create the Slack App:**

ACTION: Open the Slack app creation page for the user: https://api.slack.com/apps

1. Click **"Create New App" → "From scratch"**
2. Name it `Auto Coder Bot` (or your preference)
3. Select your workspace
4. Click **"Create App"**

**Step 2 — Add Bot Permissions:**
1. Go to **OAuth & Permissions**
2. Under **Bot Token Scopes**, add these scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `search:read`

**Step 3 — Enable Events (optional now, can configure after sandbox is created):**
1. Go to **Event Subscriptions**
2. Toggle **Enable Events** to On
3. Under **Subscribe to bot events**, add: `app_mention`
4. The Request URL will be your sandbox's webhook endpoint — we'll get that URL after creating the sandbox. You can skip this step for now and use polling mode, or come back to set it up later.
5. Click **Save Changes**

**Step 4 — Install the App:**
1. Go to **Install App**
2. Click **"Install to Workspace"** → **"Allow"**
3. **Copy the "Bot User OAuth Token"** (starts with `xoxb-`)

**Step 5 — Get the Signing Secret:**
1. Go to **Basic Information**
2. Under "App Credentials", find **Signing Secret**
3. Click **"Show"** and copy it

Once you have both values, open a **separate terminal** and store them as Crafting secrets:

```
echo "YOUR_BOT_TOKEN" | cs secret create slack_bot_token -f -
echo "YOUR_SIGNING_SECRET" | cs secret create slack_signing_secret -f -
```

STOP: Go through those steps now. You should end up with the **Bot Token** (`xoxb-...`) and the **Signing Secret**, both stored as secrets. Let me know when it's done.

USER: Confirms secrets are stored

Slack is all set!

---

## Sandbox Template & Creation

All credentials are stored. Now let's create your Crafting Sandbox.

ACTION: Based on the providers the user selected, choose the best base template:

- **GitHub only** → `templates/auto-coder-github-issue-2-github-pr.example.yaml`
- **GitHub + Slack** (no Linear) → `templates/auto-coder-slack-2-github-pr.example.yaml`
- **Any combination including Linear**, or **all providers**, or **GitLab** → `templates/auto-coder.yaml`

Read the chosen template file. You will need to create a working copy with adjustments.

ACTION: Detect the auto-coder repo's git remote URL by running `git remote get-url origin` in the auto-coder directory. If the URL differs from what's in the template (the template defaults to `git@github.com:crafting-test1/auto-coder.git`), you'll need to update it.

ACTION: Create a working copy of the template at `templates/setup-generated.yaml`:
1. Start from the chosen base template
2. Update the git checkout URL in `workspaces[0].checkouts[0].repo.git` to match the user's actual remote (or the original if they're using the default)
3. Ensure the `env` section references the correct secret names matching what was created earlier:
   - GitHub: `${secret:github_pat}` → `GITHUB_PERSONAL_ACCESS_TOKEN`
   - GitLab: `${secret:gitlab_pat}` → `GITLAB_TOKEN`
   - Linear API key: `${secret:linear_pat}` → `LINEAR_API_TOKEN`
   - Linear webhook secret: `${secret:linear_webhook_secret}` → `LINEAR_WEBHOOK_SECRET` (only if using the full template)
   - Slack bot token: `${secret:slack_bot_token}` → `SLACK_BOT_TOKEN`
   - Slack signing secret: `${secret:slack_signing_secret}` → `SLACK_SIGNING_SECRET`
   - Slack MCP token: `${secret:slack_bot_token}` → `SLACK_MCP_XOXB_TOKEN` (only if Slack is selected)
4. If providers were not selected, remove their corresponding `env` entries, `containers`, `endpoints`, and `customizations` from the template. Keep only what's needed.
5. Always keep: the `webhook` endpoint, the `dev` workspace with port 3000, and the `watcher` daemon.

ACTION: Validate the generated template YAML by running `/home/owner/yaml-linter/yaml-lint-go templates/setup-generated.yaml`. Fix any issues.

Tell the user which base template you used and what adjustments were made.

STOP: What would you like to name your **template**? (A reusable name, e.g., `auto-coder` or `my-auto-coder`)

USER: Provides template name

ACTION: Run `cs template create <template_name> ./templates/setup-generated.yaml`

[If it fails with "already exists", ask the user if they want to update it or choose a different name.]

STOP: What would you like to name your **sandbox**? (The running instance, e.g., `auto-coder-prod` or `auto-coder-dev`)

USER: Provides sandbox name

ACTION: Run `cs sandbox create <sandbox_name> -t <template_name>`

[If it fails, help troubleshoot. Common issues: template not found, quota exceeded, name already taken.]

Sandbox created!

---

## Watcher Configuration

Last step — configuring the watcher. This tells auto-coder what to monitor and how to respond to events.

ACTION: Generate `config/watcher.yaml` based on everything collected during the wizard. Use this structure:

```yaml
server:
  host: 0.0.0.0
  port: 3000

deduplication:
  enabled: true
  commentTemplate: "Agent is working on {id}"

logLevel: info

commandExecutor:
  enabled: true
  command: "cs llm session run --approval=auto --name=$EVENT_SHORT_ID --task"
  promptTemplateFile: ./config/event-prompt.example.hbs
  useStdin: false
  followUp: true

providers:
  # Include ONLY the providers the user selected, with their collected config.
  # Use the env var names that match the sandbox template.
  #
  # GitHub:
  #   enabled: true
  #   pollingInterval: 60
  #   auth:
  #     type: token
  #     tokenEnv: GITHUB_PERSONAL_ACCESS_TOKEN
  #   options:
  #     botUsername: <collected_github_username>
  #     repositories:
  #       - <each collected repo>
  #
  # GitLab:
  #   enabled: true
  #   pollingInterval: 60
  #   auth:
  #     type: token
  #     tokenEnv: GITLAB_TOKEN
  #   options:
  #     botUsername: <collected_gitlab_username>
  #     projects:
  #       - <each collected project>
  #     # If self-hosted:
  #     # baseUrl: <collected_url>/api/v4
  #
  # Linear:
  #   enabled: true
  #   pollingInterval: 60
  #   auth:
  #     type: token
  #     tokenEnv: LINEAR_API_TOKEN
  #   options:
  #     webhookSecretEnv: LINEAR_WEBHOOK_SECRET
  #     botUsername: <collected_linear_username>
  #     teams:
  #       - <each collected team key>
  #     # Or omit teams entirely if user said "all"
  #
  # Slack:
  #   enabled: true
  #   pollingInterval: 300
  #   auth:
  #     type: token
  #     tokenEnv: SLACK_BOT_TOKEN
  #   options:
  #     signingSecretEnv: SLACK_SIGNING_SECRET
```

Write the generated YAML to `config/watcher.yaml`. Only include the providers that were selected — do not include disabled providers.

Show the user the generated configuration and briefly explain the key settings.

---

## Setup Complete!

You're all set! Here's what we configured:

ACTION: Print a summary:
- **Providers:** list what was set up
- **Monitoring:** repositories, teams, or channels being watched
- **Secrets stored:** list the secret names (not values)
- **Template:** the template name
- **Sandbox:** the sandbox name

Then provide these next steps:

**Webhook Setup (optional but recommended for real-time events):**
Your sandbox has a public webhook endpoint. To find the URL:
```
cs sandbox list
```
Look for the `webhook` endpoint URL. Then configure webhooks in your provider settings:
- GitHub: Repository → Settings → Webhooks → add `https://<your-url>/webhook/github`
- GitLab: Project → Settings → Webhooks → add `https://<your-url>/webhook/gitlab`
- Linear: Settings → API → Webhooks → add `https://<your-url>/webhook/linear`
- Slack: App → Event Subscriptions → set Request URL to `https://<your-url>/webhook/slack`

Without webhooks, auto-coder will use polling mode (checking every 60s for GitHub/GitLab/Linear, every 5min for Slack).

**Testing:**
Create a test issue in one of your monitored repositories. auto-coder should detect it and start working within about a minute (polling) or seconds (webhook).

**Useful commands:**
- `cs sandbox list` — view your sandboxes and endpoints
- `cs sandbox logs <name>` — view sandbox logs
- `cs secret list` — view stored secrets

**Troubleshooting:**
- See `docs/setup/github.md`, `docs/setup/linear.md`, `docs/setup/slack.md` for provider-specific help
- See `docs/overview.md` for architecture details
- Set `logLevel: debug` in `config/watcher.yaml` for verbose logging

STOP: Any questions, or would you like to test the setup?

USER: Questions or ready to test

[If they want to test, suggest creating a GitHub issue in a monitored repo and checking the sandbox logs. Help them verify events are being received.]

---

## Important Notes for Claude

- **Track all user input** — every piece of information collected (usernames, repos, teams) is needed for template and watcher.yaml generation. Don't lose it between sections.
- **Never handle secrets directly** — always instruct the user to run `cs secret create` in a separate terminal. Never ask for, accept, or run commands containing tokens/secrets. If a user pastes one accidentally, don't echo it.
- **Secret names must match the template** — the `cs secret create` name must match the `${secret:name}` in the sandbox template YAML. The wizard standardizes on underscore naming: `github_pat`, `gitlab_pat`, `linear_pat`, `linear_webhook_secret`, `slack_bot_token`, `slack_signing_secret`.
- **Template YAML validation** — always validate generated templates with `/home/owner/yaml-linter/yaml-lint-go` before creating them.
- **Git remote detection** — use `git remote get-url origin` to detect the user's repo URL. Fall back to asking if the command fails.
- **Don't overwhelm** — only show provider sections relevant to the user's selection. Skip everything else.
- **Error recovery** — if `cs` commands fail:
  - "already exists" → offer to update or pick a new name
  - auth errors → suggest `cs auth login`
  - YAML errors → fix and retry
  - secret exists → offer `cs secret update` or `cs secret delete` + recreate
- **Adapt pacing** — technical users will move fast. Less technical users may need more context. Match their speed.

## Success Criteria

The setup is complete when:
- [ ] cs CLI is available
- [ ] Provider credentials stored as sandbox secrets
- [ ] Sandbox template created and validated
- [ ] Sandbox created from template
- [ ] `config/watcher.yaml` generated with correct provider configuration
- [ ] User knows about webhook setup and testing

# auto-coder Overview

auto-coder is the central piece of the automated coding flow. It acts as an event listener that chains together the entire pipeline by integrating with the Crafting Sandbox coding agent and runtime.

## What It Does

auto-coder listens for events from developer platforms (GitHub, GitLab, Linear, Slack), filters and preprocesses them, constructs a task prompt, and starts a Crafting Sandbox LLM session — which then drives the coding agent to complete the task.

When a follow-up event arrives (e.g. a comment update or task revision), the same flow is triggered again with updated context, allowing the agent to iterate on its previous work.

The entire flow is configurable — event sources, filtering rules, and prompt templates can all be tuned to support different automation behaviors.

## The Three Parts

```
┌─────────────────┐     ┌──────────────────────────┐     ┌───────────────────────────┐
│   auto-coder    │────▶│  Crafting Sandbox         │────▶│  Crafting Sandbox         │
│  (event listener│     │  Coding Agent             │     │  Runtime                  │
│   & orchestrator)│    │  (LLM session)            │     │  (execution environment)  │
└─────────────────┘     └──────────────────────────┘     └───────────────────────────┘

  Listens, filters,        Understands the task,           Runs the generated code,
  builds prompt,           writes and iterates              provides tools & environment
  starts session           on code changes
```

**auto-coder** handles:
- Receiving events via webhooks or polling
- Deduplication (skips if the bot already responded)
- Prompt construction from configurable Handlebars templates
- Launching the Crafting Sandbox LLM session
- Posting status updates and follow-up comments back to the source platform

# Watcher Subsystem

## Overview

`watcher` is a subsystem of the main application.

Its responsibility is to monitor external task/issue providers and emit normalized events into the system.

Supported provider examples:

- GitHub (issues, pull requests)
- GitLab (issues, merge requests)
- Jira (tickets)
- Linear (tasks)

The list of supported providers must be extensible.

# Responsibilities

The watcher must:

1. Monitor configured external resources
2. Receive events via webhooks (passive mode)
3. Poll provider APIs when necessary (proactive mode)
4. The incoming data is normalized into an event which can be further processed.

# Watching Modes
## 1. Passive Watching (Webhook Mode)

- Implemented via HTTP endpoints.
- The watcher exposes webhook URLs.
- External providers send events to these endpoints.

Example URL format:

```
/webhook/{provider}
```

Examples:
```
/webhook/github
/webhook/gitlab
/webhook/jira
```

Requirements:

- Verify webhook signatures when supported by the provider.
- Respond quickly (ack first, process async).
- Ensure idempotency (deduplicate repeated deliveries).

## 2. Proactive Watching (Polling Mode)

Some providers or configurations may require polling, as webhooks are normally deemed not reliable.

Polling requirements:
- Configurable interval per provider
- Rate-limit aware
- Backoff strategy on API errors
- Must avoid duplicate event emission

# Configuration

The watcher must be fully configuration-driven.

## Configuration Tiers

### Tier 1: Provider Level

Each provider configuration includes:

- Polling interval
- Authentication for API: read from a local file or environment variable


### Example

```yaml
providers:
  github:
    polling_interval: 60s
```

# Architecture Requirements

The architecture must:
- Be provider-agnostic via interfaces/adapters
- Allow adding new providers without modifying core logic
- Separate transport layer (webhook/polling) from provider adapters
- Normalize all events into a unified internal event model


# Delivery Requirements

## 1. Standalone Entry Point
A runnable entry-point script for:
- Local testing
- Integration testing
- Independent deployment

## 2. Reusable Library
The library must expose:

- Start()
- Stop()
- RegisterProvider()
- Event subscription / callback hook

The main daemon should be able to start the watcher as a background trigger component.

# Non-Functional Requirements

- Thread-safe / concurrency-safe
- Idempotent event handling
- Graceful shutdown support
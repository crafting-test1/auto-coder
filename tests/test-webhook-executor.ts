#!/usr/bin/env node
/**
 * Integration test for command executor via webhook
 * Starts the watcher and sends a mock GitHub webhook
 */

import { Watcher } from '../src/watcher/index.js';
import { GitHubProvider } from '../src/watcher/providers/github/GitHubProvider.js';

async function sendTestWebhook(port: number) {
  const payload = {
    action: 'opened',
    issue: {
      id: 123456,
      number: 42,
      title: 'Test Issue: Command Executor Integration Test',
      state: 'open',
      html_url: 'https://github.com/test/repo/issues/42',
      body: 'This is a test issue to verify the command executor processes webhooks correctly.',
      user: {
        id: 789,
        login: 'testuser',
        avatar_url: 'https://github.com/testuser.png',
      },
      labels: [
        { name: 'test' },
        { name: 'enhancement' },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    repository: {
      full_name: 'test/repo',
    },
    sender: {
      id: 789,
      login: 'testuser',
    },
  };

  console.log('\nSending webhook to http://localhost:' + port + '/webhook/github\n');

  try {
    const response = await fetch(`http://localhost:${port}/webhook/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'issues',
        'X-GitHub-Delivery': 'test-delivery-' + Date.now(),
      },
      body: JSON.stringify(payload),
    });

    console.log('Webhook response:', response.status, response.statusText);

    if (response.ok) {
      console.log('✓ Webhook accepted\n');
    } else {
      const text = await response.text();
      console.error('✗ Webhook failed:', text);
    }
  } catch (error) {
    console.error('✗ Failed to send webhook:', error);
  }
}

async function main() {
  const port = 3003;

  console.log('=== Command Executor Integration Test ===\n');
  console.log('This test demonstrates the command executor processing a GitHub webhook\n');

  const watcher = new Watcher({
    server: { host: 'localhost', port },
    logLevel: 'debug',
    deduplication: {
      enabled: true,
      strategy: 'memory',
      ttl: 3600,
      maxSize: 10000,
    },
    commandExecutor: {
      enabled: true,
      command: `
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Command Executor Output                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Event Details:"
echo "  ID:       $EVENT_ID"
echo "  Provider: $EVENT_PROVIDER"
echo "  Type:     $EVENT_TYPE"
echo "  Action:   $EVENT_ACTION"
echo "  Resource: $RESOURCE_TITLE"
echo "  Actor:    $ACTOR_USERNAME"
echo "  URL:      $RESOURCE_URL"
echo ""
echo "Rendered Prompt (first 35 lines):"
echo "----------------------------------------"
echo "$PROMPT" | head -35
echo "----------------------------------------"
echo ""
echo "✓ Command execution completed successfully"
echo ""
      `,
      promptTemplateFile: './config/event-prompt.example.hbs',
      useStdin: false,
      postInitialComment: false,
      postOutputComment: false,
    },
    providers: {
      github: {
        enabled: true,
      },
    },
  });

  // Register GitHub provider
  watcher.registerProvider('github', new GitHubProvider());

  // Listen for events
  watcher.on('event', (event) => {
    console.log('[Event Received]', {
      id: event.id,
      type: event.type,
      action: event.action,
      title: event.resource.title,
    });
    console.log('');
  });

  try {
    // Start watcher
    await watcher.start();
    console.log('✓ Watcher started on port', port, '\n');

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send test webhook
    await sendTestWebhook(port);

    // Wait for command executor to complete
    console.log('Waiting for command execution...\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Stop watcher
    console.log('Stopping watcher...\n');
    await watcher.stop();
    console.log('✓ Test complete!');
  } catch (error) {
    console.error('✗ Test failed:', error);
    await watcher.stop().catch(() => {});
    process.exit(1);
  }
}

main();

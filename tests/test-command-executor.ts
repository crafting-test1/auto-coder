#!/usr/bin/env tsx
/**
 * Test script for command executor functionality
 * This demonstrates how the command executor processes events
 */

import { Watcher } from '../src/watcher/index.js';
import { GitHubProvider } from '../src/watcher/providers/github/GitHubProvider.js';
import type { WatcherEvent } from '../src/watcher/types/index.js';
import { EventType, EventAction } from '../src/watcher/types/index.js';

async function main() {
  console.log('Creating watcher with command executor enabled...\n');

  const watcher = new Watcher({
    server: { host: 'localhost', port: 3002 },
    logLevel: 'info',
    deduplication: {
      enabled: true,
      botUsername: 'test-bot',
    },
    commandExecutor: {
      enabled: true,
      command: `
echo "=== Command Executor Test ==="
echo "Event ID: $EVENT_ID"
echo "Provider: $EVENT_PROVIDER"
echo "Type: $EVENT_TYPE"
echo "Action: $EVENT_ACTION"
echo "Resource: $RESOURCE_TITLE"
echo "Actor: $ACTOR_USERNAME"
echo ""
echo "=== Rendered Prompt (first 10 lines) ==="
echo "$PROMPT" | head -10
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
  watcher.on('event', (event: WatcherEvent) => {
    console.log('\n[Watcher] Event emitted:', {
      id: event.id,
      type: event.type,
      action: event.action,
      resource: event.resource.title,
    });
  });

  // Start watcher
  await watcher.start();
  console.log('Watcher started\n');

  // Wait a moment for initialization
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Create a mock event to test command executor
  console.log('Creating mock event to trigger command executor...\n');

  const mockEvent: WatcherEvent = {
    id: 'github:test/repo:created:123:test-delivery-001',
    provider: 'github',
    type: EventType.ISSUE,
    action: EventAction.CREATED,
    resource: {
      id: '123',
      number: 42,
      url: 'https://github.com/test/repo/issues/42',
      title: 'Test Issue: Implement command executor',
      state: 'open',
      repository: 'test/repo',
      description: 'This is a test issue to demonstrate the command executor functionality.',
      labels: ['enhancement', 'test'],
      updatedAt: new Date().toISOString(),
    },
    actor: {
      id: '789',
      username: 'testuser',
      avatarUrl: 'https://github.com/testuser.png',
    },
    metadata: {
      timestamp: new Date().toISOString(),
      deliveryId: 'test-delivery-001',
    },
  };

  // Emit the event (this will trigger command executor)
  console.log('Triggering event processing...\n');
  watcher.emit('event', mockEvent);

  // The command executor runs async, so we need to wait for it
  // In real usage, this happens automatically in the event handling pipeline
  console.log('\nWaiting for command execution to complete...\n');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Stop watcher
  console.log('\nStopping watcher...');
  await watcher.stop();
  console.log('Test complete!');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

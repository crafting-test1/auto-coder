import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWebhookEvent,
  normalizePolledMention,
} from '../src/watcher/providers/slack/SlackNormalizer.js';

// Fixtures

const appMentionPayload = {
  type: 'event_callback',
  event_id: 'Ev001',
  event_time: 1705312800,
  team_id: 'T001',
  event: {
    type: 'app_mention',
    channel: 'C001',
    user: 'U001',
    text: '<@UBOT> can you help me with this?',
    ts: '1705312800.000100',
    channel_type: 'channel',
  },
};

const threadedMentionPayload = {
  type: 'event_callback',
  event_id: 'Ev002',
  event_time: 1705312900,
  team_id: 'T001',
  event: {
    type: 'app_mention',
    channel: 'C001',
    user: 'U002',
    text: '<@UBOT> follow up question',
    ts: '1705312900.000200',
    thread_ts: '1705312800.000100',
    channel_type: 'channel',
  },
};

// --- normalizeWebhookEvent ---

test('normalizeWebhookEvent - app_mention in channel', () => {
  const event = normalizeWebhookEvent(appMentionPayload);

  assert.equal(event.provider, 'slack');
  assert.equal(event.type, 'message');
  assert.equal(event.action, 'created');
  assert.equal(event.resource.number, 0);
  assert.equal(event.resource.state, 'open');
  assert.equal(event.resource.repository, 'C001');
  assert.equal(event.resource.title, 'Message in #C001');
  assert.equal(event.resource.comment?.body, '<@UBOT> can you help me with this?');
  assert.equal(event.resource.comment?.author, 'U001');
  assert.equal(event.actor.username, 'U001');
  assert.equal(event.actor.id, 'U001');
  assert.equal(event.metadata.channel, 'C001');
  assert.equal(event.metadata.channelType, 'channel');
  assert.equal(event.metadata.threadTs, undefined);
  assert.equal(event.id, 'slack:C001:1705312800.000100:Ev001');
});

test('normalizeWebhookEvent - app_mention in thread includes thread_ts in metadata', () => {
  const event = normalizeWebhookEvent(threadedMentionPayload);

  assert.equal(event.metadata.threadTs, '1705312800.000100');
  assert.equal(event.id, 'slack:C001:1705312900.000200:Ev002');
});

test('normalizeWebhookEvent - with history sets description to history', () => {
  const history = 'Previous message in thread\nAnother message';
  const event = normalizeWebhookEvent(appMentionPayload, history);
  assert.equal(event.resource.description, history);
});

test('normalizeWebhookEvent - without history falls back to event text', () => {
  const event = normalizeWebhookEvent(appMentionPayload);
  assert.equal(event.resource.description, '<@UBOT> can you help me with this?');
});

test('normalizeWebhookEvent - without event_id still forms valid id', () => {
  const payload = { ...appMentionPayload, event_id: undefined };
  const event = normalizeWebhookEvent(payload as any);
  assert.ok(event.id.startsWith('slack:C001:1705312800.000100:'));
  assert.notEqual(event.id, 'slack:C001:1705312800.000100:undefined');
});

test('normalizeWebhookEvent - raw is the full payload', () => {
  const event = normalizeWebhookEvent(appMentionPayload);
  assert.deepEqual(event.raw, appMentionPayload);
});

// --- normalizePolledMention ---

test('normalizePolledMention - basic polled mention', () => {
  const mention = {
    channel: 'C001',
    ts: '1705312800.000100',
    text: '<@UBOT> help needed',
    user: 'U001',
  };

  const event = normalizePolledMention(mention);

  assert.equal(event.provider, 'slack');
  assert.equal(event.type, 'message');
  assert.equal(event.action, 'created');
  assert.equal(event.resource.repository, 'C001');
  assert.equal(event.resource.comment?.body, '<@UBOT> help needed');
  assert.equal(event.resource.comment?.author, 'U001');
  assert.equal(event.resource.url, '');
  assert.equal(event.resource.comment?.url, undefined);
  assert.equal(event.metadata.polled, true);
  assert.equal(event.metadata.channel, 'C001');
  assert.equal(event.id, 'slack:C001:1705312800.000100:polled');
  assert.equal(event.actor.username, 'U001');
  assert.equal(event.actor.id, 'U001');
});

test('normalizePolledMention - with permalink sets url and comment url', () => {
  const permalink = 'https://workspace.slack.com/archives/C001/p1705312800000100';
  const mention = {
    channel: 'C001',
    ts: '1705312800.000100',
    text: '<@UBOT> help needed',
    user: 'U001',
    permalink,
  };

  const event = normalizePolledMention(mention);

  assert.equal(event.resource.url, permalink);
  assert.equal(event.resource.comment?.url, permalink);
});

test('normalizePolledMention - with thread_ts sets metadata', () => {
  const mention = {
    channel: 'C001',
    ts: '1705312900.000200',
    threadTs: '1705312800.000100',
    text: 'Follow up',
    user: 'U002',
  };

  const event = normalizePolledMention(mention);
  assert.equal(event.metadata.threadTs, '1705312800.000100');
});

test('normalizePolledMention - with history uses history as description', () => {
  const mention = {
    channel: 'C001',
    ts: '1705312800.000100',
    text: 'New mention',
    user: 'U001',
  };
  const history = 'Thread context from previous messages';
  const event = normalizePolledMention(mention, history);
  assert.equal(event.resource.description, history);
});

test('normalizePolledMention - without history falls back to text', () => {
  const mention = {
    channel: 'C001',
    ts: '1705312800.000100',
    text: 'New mention text',
    user: 'U001',
  };
  const event = normalizePolledMention(mention);
  assert.equal(event.resource.description, 'New mention text');
});

test('normalizePolledMention - raw is the mention object', () => {
  const mention = {
    channel: 'C001',
    ts: '1705312800.000100',
    text: 'Test',
    user: 'U001',
  };
  const event = normalizePolledMention(mention);
  assert.deepEqual(event.raw, mention);
});

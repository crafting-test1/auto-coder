import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWebhookEvent,
  normalizePolledEvent,
} from '../src/watcher/providers/github/GitHubNormalizer.js';

// Fixtures

const issueOpenedPayload = {
  action: 'opened',
  issue: {
    id: 101,
    number: 42,
    title: 'Fix login bug',
    body: 'Login fails with SSO.',
    html_url: 'https://github.com/owner/repo/issues/42',
    state: 'open',
    user: { login: 'alice', id: 1 },
    assignees: [],
    labels: [],
  },
  repository: { full_name: 'owner/repo' },
  sender: { login: 'alice', id: 1 },
};

const prOpenedPayload = {
  action: 'opened',
  pull_request: {
    id: 201,
    number: 7,
    title: 'Add feature X',
    body: 'This PR adds feature X.',
    html_url: 'https://github.com/owner/repo/pull/7',
    state: 'open',
    user: { login: 'bob', id: 2 },
    assignees: [{ login: 'charlie', id: 3 }],
    labels: [{ name: 'enhancement' }],
    head: { ref: 'feature/x' },
    base: { ref: 'main' },
  },
  repository: { full_name: 'owner/repo' },
  sender: { login: 'bob', id: 2 },
};

const issueCommentPayload = {
  action: 'created',
  issue: {
    id: 101,
    number: 42,
    title: 'Fix login bug',
    body: 'Login fails with SSO.',
    html_url: 'https://github.com/owner/repo/issues/42',
    state: 'open',
    user: { login: 'alice', id: 1 },
    assignees: [],
    labels: [],
  },
  comment: {
    id: 999,
    body: 'Can you provide more info?',
    html_url: 'https://github.com/owner/repo/issues/42#issuecomment-999',
    user: { login: 'reviewer', id: 4 },
  },
  repository: { full_name: 'owner/repo' },
  sender: { login: 'reviewer', id: 4 },
};

const prCommentPayload = {
  action: 'created',
  issue: {
    id: 201,
    number: 7,
    title: 'Add feature X',
    body: 'PR body',
    html_url: 'https://github.com/owner/repo/pull/7',
    state: 'open',
    user: { login: 'bob', id: 2 },
    assignees: [],
    labels: [],
    pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/7' },
  },
  comment: {
    id: 888,
    body: 'LGTM!',
    html_url: 'https://github.com/owner/repo/pull/7#issuecomment-888',
    user: { login: 'reviewer', id: 4 },
  },
  repository: { full_name: 'owner/repo' },
  sender: { login: 'reviewer', id: 4 },
};

// --- normalizeWebhookEvent ---

test('normalizeWebhookEvent - issue opened', () => {
  const event = normalizeWebhookEvent(issueOpenedPayload as any, 'delivery-1');

  assert.equal(event.provider, 'github');
  assert.equal(event.type, 'issue');
  assert.equal(event.action, 'opened');
  assert.equal(event.resource.number, 42);
  assert.equal(event.resource.title, 'Fix login bug');
  assert.equal(event.resource.description, 'Login fails with SSO.');
  assert.equal(event.resource.url, 'https://github.com/owner/repo/issues/42');
  assert.equal(event.resource.state, 'open');
  assert.equal(event.resource.repository, 'owner/repo');
  assert.equal(event.resource.author, 'alice');
  assert.equal(event.actor.username, 'alice');
  assert.equal(event.actor.id, 1);
  assert.equal(event.id, 'github:owner/repo:opened:101:delivery-1');
  assert.equal(event.metadata.deliveryId, 'delivery-1');
  assert.equal(event.resource.comment, undefined);
});

test('normalizeWebhookEvent - PR opened with labels and branches', () => {
  const event = normalizeWebhookEvent(prOpenedPayload as any, 'delivery-2');

  assert.equal(event.type, 'pull_request');
  assert.equal(event.action, 'opened');
  assert.equal(event.resource.number, 7);
  assert.equal(event.resource.title, 'Add feature X');
  assert.deepEqual(event.resource.labels, ['enhancement']);
  assert.equal(event.resource.branch, 'feature/x');
  assert.equal(event.resource.mergeTo, 'main');
  assert.equal(event.actor.username, 'bob');
  assert.ok(event.resource.assignees && event.resource.assignees.length === 1);
});

test('normalizeWebhookEvent - issue_comment on issue includes comment field', () => {
  const event = normalizeWebhookEvent(issueCommentPayload as any, 'delivery-3');

  assert.equal(event.type, 'issue');
  assert.equal(event.resource.comment?.body, 'Can you provide more info?');
  assert.equal(event.resource.comment?.author, 'reviewer');
  assert.equal(
    event.resource.comment?.url,
    'https://github.com/owner/repo/issues/42#issuecomment-999'
  );
  assert.equal(event.id, 'github:owner/repo:created:comment:999:delivery-3');
});

test('normalizeWebhookEvent - issue_comment on PR marks type as pull_request', () => {
  const event = normalizeWebhookEvent(prCommentPayload as any, 'delivery-4');

  assert.equal(event.type, 'pull_request');
  assert.equal(event.resource.comment?.body, 'LGTM!');
  assert.equal(event.id, 'github:owner/repo:created:comment:888:delivery-4');
});

test('normalizeWebhookEvent - issue with no body uses empty string', () => {
  const payload = {
    ...issueOpenedPayload,
    issue: { ...issueOpenedPayload.issue, body: undefined },
  };
  const event = normalizeWebhookEvent(payload as any, 'delivery-5');
  assert.equal(event.resource.description, '');
});

test('normalizeWebhookEvent - issue with empty labels array has empty labels', () => {
  const event = normalizeWebhookEvent(issueOpenedPayload as any, 'delivery-6');
  assert.deepEqual(event.resource.labels, []);
});

test('normalizeWebhookEvent - sender info populates actor', () => {
  const event = normalizeWebhookEvent(issueCommentPayload as any, 'delivery-7');
  assert.equal(event.actor.username, 'reviewer');
  assert.equal(event.actor.id, 4);
});

// --- normalizePolledEvent ---

test('normalizePolledEvent - polled issue', () => {
  const item = {
    repository: 'owner/repo',
    type: 'issue',
    number: 42,
    data: {
      number: 42,
      title: 'Fix login bug',
      body: 'Login fails with SSO.',
      html_url: 'https://github.com/owner/repo/issues/42',
      state: 'open',
      user: { login: 'alice', id: 1 },
      assignees: [],
      labels: [{ name: 'bug' }],
    },
  };

  const event = normalizePolledEvent(item);

  assert.equal(event.provider, 'github');
  assert.equal(event.type, 'issue');
  assert.equal(event.action, 'poll');
  assert.equal(event.resource.number, 42);
  assert.equal(event.resource.repository, 'owner/repo');
  assert.deepEqual(event.resource.labels, ['bug']);
  assert.equal(event.metadata.polled, true);
  assert.ok(event.id.startsWith('github:owner/repo:poll:42:'));
  assert.equal(event.actor.username, 'alice');
  assert.equal(event.actor.id, 1);
});

test('normalizePolledEvent - polled PR includes branch info', () => {
  const item = {
    repository: 'owner/repo',
    type: 'pull_request',
    number: 7,
    data: {
      number: 7,
      title: 'Add feature X',
      body: 'PR body',
      html_url: 'https://github.com/owner/repo/pull/7',
      state: 'open',
      user: { login: 'bob', id: 2 },
      assignees: [],
      labels: [],
      head: { ref: 'feature/x' },
      base: { ref: 'main' },
    },
  };

  const event = normalizePolledEvent(item);

  assert.equal(event.type, 'pull_request');
  assert.equal(event.action, 'poll');
  assert.equal(event.resource.branch, 'feature/x');
  assert.equal(event.resource.mergeTo, 'main');
});

test('normalizePolledEvent - issue with no body uses empty string', () => {
  const item = {
    repository: 'owner/repo',
    type: 'issue',
    number: 1,
    data: {
      number: 1,
      title: 'Test',
      html_url: 'https://github.com/owner/repo/issues/1',
      state: 'open',
      user: { login: 'alice', id: 1 },
      assignees: [],
      labels: [],
    },
  };

  const event = normalizePolledEvent(item);
  assert.equal(event.resource.description, '');
});

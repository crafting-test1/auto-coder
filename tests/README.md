# Tests

This directory contains test files for the watcher subsystem.

## Status

Test files have been removed during the provider abstraction refactor. New tests will need to be written to work with the new architecture where:

- Providers handle their own internal event data structures
- Event handlers receive `(event: unknown, reactor: Reactor)` parameters
- No centralized WatcherEvent normalization
- Comment-based deduplication only

## New Architecture

The refactored watcher uses:

1. **Reactor Pattern**: Providers create Reactor instances that encapsulate commenting operations
2. **Event Handler Callbacks**: Providers call event handlers with raw provider data (unknown type)
3. **Provider Data Encapsulation**: Each provider keeps its own internal types (no WatcherEvent)
4. **Simplified Interface**: Providers only need to implement handleWebhook() and poll()

## TODO

- Add unit tests for GitHubProvider
- Add unit tests for GitHubReactor
- Add integration tests for webhook flow
- Add integration tests for polling flow
- Add tests for comment-based deduplication
- Add tests for event emission to subscribers

## Adding New Tests

When adding new tests:

1. Place test files in this directory
2. Name them `test-*.ts` for consistency
3. Use relative imports: `import { Watcher } from '../src/watcher/index.js'`
4. Remember that events are now `(provider: string, event: unknown)` tuples
5. Use Reactor for commenting operations in tests
6. Document the test purpose in this README

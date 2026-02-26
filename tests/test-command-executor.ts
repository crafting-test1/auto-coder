import { expect } from 'chai';
import { CommandExecutor } from '../src/watcher/utils/CommandExecutor'; // Adjust import path as necessary

// Mock config required for CommandExecutor initialization
const mockConfig = {
  enabled: true,
  command: 'echo test',
  useStdin: false
};

// Mock event to test generateShortId function
const mockEvent = {
  provider: 'github',
  resource: {
    repository: 'owner/repo',
    number: 123,
  },
  type: 'Issue',
  action: 'opened',
  id: 'github:owner/repo:opened:123:abcd1234'
};

// Create an instance of CommandExecutor with mock config
const commandExecutor = new CommandExecutor(mockConfig);

// Test generateShortId function
const generatedShortId = commandExecutor['generateShortId'](mockEvent);

console.log('Generated Short ID:', generatedShortId);

// Test to verify shortId is generated correctly
expect(generatedShortId).to.equal('github-owner-repo-123-Is-opn-cd1234'); // Adjust expected output as necessary
/**
 * Unit tests for AI Services module
 */

import { jest } from '@jest/globals';
import { 
  callAIProvider, 
  callClaude, 
  callCursor, 
  processClaudeResponse, 
  processCursorResponse 
} from '../../scripts/modules/ai-services.js';

// Mock modules
jest.mock('axios');
jest.mock('@anthropic-ai/sdk');
jest.mock('../../scripts/modules/utils.js', () => ({
  CONFIG: {
    model: 'test-model',
    maxTokens: 4000,
    temperature: 0.7,
    aiProvider: 'claude',
    useCursor: false,
    cursorApiKey: 'test-key',
    cursorApiEndpoint: 'https://test-endpoint.cursor.sh',
    cursorModel: 'cursor-test',
  },
  log: jest.fn(),
}));
jest.mock('../../scripts/modules/ui.js', () => ({
  startLoadingIndicator: jest.fn(() => 'loading-indicator'),
  stopLoadingIndicator: jest.fn(),
}));

// Mock environment variables
process.env.AI_PROVIDER = 'claude';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.CURSOR_API_KEY = 'test-cursor-key';

describe('AI Services', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callAIProvider', () => {
    test('should call Claude by default', async () => {
      // Mock implementation for callClaude
      const mockClaudeResponse = { tasks: [] };
      const mockCallClaude = jest.fn().mockResolvedValue(mockClaudeResponse);
      const originalCallClaude = callClaude;
      global.callClaude = mockCallClaude;

      const result = await callAIProvider('prd content', 'file.txt', 5);
      
      expect(mockCallClaude).toHaveBeenCalledWith('prd content', 'file.txt', 5, 0);
      expect(result).toEqual(mockClaudeResponse);
      
      global.callClaude = originalCallClaude;
    });

    test('should call Cursor when configured', async () => {
      // Set environment to use Cursor
      const originalProvider = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = 'cursor';
      
      // Mock implementation for callCursor
      const mockCursorResponse = { tasks: [] };
      const mockCallCursor = jest.fn().mockResolvedValue(mockCursorResponse);
      const originalCallCursor = callCursor;
      global.callCursor = mockCallCursor;

      const result = await callAIProvider('prd content', 'file.txt', 5);
      
      expect(mockCallCursor).toHaveBeenCalledWith('prd content', 'file.txt', 5, 0);
      expect(result).toEqual(mockCursorResponse);
      
      // Restore environment
      process.env.AI_PROVIDER = originalProvider;
      global.callCursor = originalCallCursor;
    });
  });

  describe('processClaudeResponse', () => {
    test('should extract and parse JSON from Claude response', () => {
      const mockResponse = {
        content: [{ text: '{"key": "value"}' }]
      };
      
      const result = processClaudeResponse(mockResponse);
      
      expect(result).toEqual({ key: 'value' });
    });
    
    test('should throw error for invalid JSON', () => {
      const mockResponse = {
        content: [{ text: 'not valid json' }]
      };
      
      expect(() => {
        processClaudeResponse(mockResponse);
      }).toThrow();
    });
  });

  describe('processCursorResponse', () => {
    test('should extract and parse JSON from Cursor response', () => {
      const mockResponse = {
        content: '{"key": "value"}'
      };
      
      const result = processCursorResponse(mockResponse);
      
      expect(result).toEqual({ key: 'value' });
    });
    
    test('should handle nested content property', () => {
      const mockResponse = {
        message: {
          content: '{"key": "value"}'
        }
      };
      
      const result = processCursorResponse(mockResponse);
      
      expect(result).toEqual({ key: 'value' });
    });
    
    test('should handle choices array format', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '{"key": "value"}'
            }
          }
        ]
      };
      
      const result = processCursorResponse(mockResponse);
      
      expect(result).toEqual({ key: 'value' });
    });
    
    test('should throw error when no content is found', () => {
      const mockResponse = {
        someOtherProperty: true
      };
      
      expect(() => {
        processCursorResponse(mockResponse);
      }).toThrow('No content found in Cursor response');
    });
    
    test('should throw error for invalid JSON', () => {
      const mockResponse = {
        content: 'not valid json'
      };
      
      expect(() => {
        processCursorResponse(mockResponse);
      }).toThrow();
    });
  });
});
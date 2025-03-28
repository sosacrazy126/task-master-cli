/**
 * Universal AI Service Interface for Code Comprehension Workflow
 * Supports multiple providers through a common interface
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { CONFIG, log } from './utils.js';
import { startLoadingIndicator, stopLoadingIndicator } from './ui.js';
import chalk from 'chalk';
import axios from 'axios';

dotenv.config();

// Supported AI Providers
const PROVIDERS = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  PERPLEXITY: 'perplexity',
  CODY: 'cody',
  CONTINUE: 'continue',
  CURSOR: 'cursor',
  CURSOR_CLAUDE: 'cursor-claude'
};

// Default configuration
const DEFAULT_CONFIG = {
  provider: PROVIDERS.CLAUDE,
  maxTokens: 4096,
  temperature: 0.7,
};

// Initialize provider clients
const clients = {
  [PROVIDERS.CLAUDE]: process.env.ANTHROPIC_API_KEY ? new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: {
      'anthropic-beta': 'output-128k-2025-02-19'
    }
  }) : null,
  [PROVIDERS.OPENAI]: process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  }) : null,
  [PROVIDERS.PERPLEXITY]: null, // Lazy-loaded
  [PROVIDERS.CODY]: null,       // Configured per use
  [PROVIDERS.CONTINUE]: null,   // Configured per use
  [PROVIDERS.CURSOR]: null      // Configured per use
};

/**
 * Get provider client (lazy-loaded for some providers)
 */
function getProviderClient(provider) {
  switch(provider) {
    case PROVIDERS.PERPLEXITY:
      if (!clients[provider] && process.env.PERPLEXITY_API_KEY) {
        clients[provider] = new OpenAI({
          apiKey: process.env.PERPLEXITY_API_KEY,
          baseURL: 'https://api.perplexity.ai',
        });
      }
      return clients[provider];
      
    case PROVIDERS.CODY:
    case PROVIDERS.CONTINUE:
      // These require additional setup
      throw new Error(`Provider ${provider} requires additional configuration`);
      
    default:
      return clients[provider];
  }
}

/**
 * Universal AI Query Interface
 */
class AIService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Architecture & Dependency Mapping
   */
  async analyzeArchitecture(params) {
    const { codebase, focus = 'all', visualization = false } = params;
    
    // Generate provider-agnostic prompt
    const prompt = this._buildArchitecturePrompt(codebase, focus);
    
    // Call the selected provider
    const response = await this._callProvider({
      provider: this.config.provider,
      prompt,
      options: {
        max_tokens: this.config.maxTokens * 2, // Architecture needs more tokens
        temperature: 0.3, // More deterministic for structural analysis
        visualization
      }
    });
    
    return this._parseArchitectureResponse(response, visualization);
  }
  
  /**
   * Contextual Code Retrieval
   */
  async analyzeCodeContext(params) {
    // Implementation
  }

  // ... other methods
}

// Text prompts for AI
const PROMPT_TEMPLATES = {
  TASK_GENERATION: `
1. Create exactly \${numTasks} tasks, numbered from 1 to \${numTasks}
2. Each task should be atomic and focused on a single responsibility
3. Order tasks logically - consider dependencies and implementation sequence
4. Early tasks should focus on setup, core functionality first, then advanced features
5. Include clear validation/testing approach for each task
6. Set appropriate dependency IDs (a task can only depend on tasks with lower IDs)
7. Assign priority (high/medium/low) based on criticality and dependency order
8. Include detailed implementation guidance in the "details" field

Expected output format:
{
  "tasks": [
    {
      "id": 1,
      "title": "Setup Project Repository",
      "description": "...",
      ...
    },
    ...
  ],
  "metadata": {
    "projectName": "PRD Implementation",
    "totalTasks": \${numTasks},
    "sourceFile": "\${prdPath}",
    "generatedAt": "YYYY-MM-DD"
  }
}

Important: Your response must be valid JSON only, with no additional explanation or comments.`
};

/**
 * Call the appropriate AI provider based on configuration
 * @param {string} prdContent - PRD content
 * @param {string} prdPath - Path to the PRD file
 * @param {number} numTasks - Number of tasks to generate
 * @param {number} retryCount - Current retry count
 * @returns {Object} Provider's response
 */
async function callAIProvider(prdContent, prdPath, numTasks, retryCount = 0) {
  const provider = process.env.AI_PROVIDER || CONFIG.aiProvider || 'cursor-claude';
  
  log('info', `Using AI provider: ${provider}`);
  
  switch(provider.toLowerCase()) {
    case 'cursor':
      return callCursor(prdContent, prdPath, numTasks, retryCount);
    case 'cursor-claude':
      log('info', 'Using Cursor API with Claude model selection');
      // Use Cursor API but specify Claude model
      return callCursor(prdContent, prdPath, numTasks, retryCount, true);
    case 'claude':
    default:
      return callClaude(prdContent, prdPath, numTasks, retryCount);
  }
}

/**
 * Call Claude API to analyze PRD and generate tasks
 * @param {string} prdContent - PRD content
 * @param {string} prdPath - Path to the PRD file
 * @param {number} numTasks - Number of tasks to generate
 * @param {number} retryCount - Current retry count
 * @returns {Object} Claude's response
 */
async function callClaude(prdContent, prdPath, numTasks, retryCount = 0) {
  try {
    const systemPrompt = PROMPT_TEMPLATES.TASK_GENERATION
      .replace(/\${numTasks}/g, numTasks)
      .replace(/\${prdPath}/g, prdPath);

    log('debug', `Calling Claude with system prompt: ${systemPrompt}`);
    
    const loadingIndicator = startLoadingIndicator('Analyzing with Claude AI...');
    
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    const response = await anthropic.messages.create({
      model: process.env.MODEL || CONFIG.model,
      max_tokens: parseInt(process.env.MAX_TOKENS || CONFIG.maxTokens),
      temperature: parseFloat(process.env.TEMPERATURE || CONFIG.temperature),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prdContent
        }
      ]
    });
    
    stopLoadingIndicator(loadingIndicator);
    
    log('debug', `Claude response: ${response.content}`);
    
    return processClaudeResponse(response);
  } catch (error) {
    log('error', `Claude API error: ${error.message}`);
    
    if (retryCount < 2) {
      log('info', `Retrying (${retryCount + 1}/2)...`);
      return callClaude(prdContent, prdPath, numTasks, retryCount + 1);
    }
    
    throw new Error(`Failed to analyze PRD with Claude: ${handleClaudeError(error)}`);
  }
}

/**
 * Call Cursor AI API to analyze PRD and generate tasks
 * @param {string} prdContent - PRD content
 * @param {string} prdPath - Path to the PRD file
 * @param {number} numTasks - Number of tasks to generate
 * @param {number} retryCount - Current retry count
 * @param {boolean} useClaudeModel - Whether to use Claude model via Cursor
 * @returns {Object} Cursor's response
 */
async function callCursor(prdContent, prdPath, numTasks, retryCount = 0, useClaudeModel = false) {
  try {
    const systemPrompt = PROMPT_TEMPLATES.TASK_GENERATION
      .replace(/\${numTasks}/g, numTasks)
      .replace(/\${prdPath}/g, prdPath);

    log('debug', `Calling Cursor AI with system prompt: ${systemPrompt}`);
    
    const loadingIndicator = startLoadingIndicator(useClaudeModel ? 
      'Analyzing with Cursor (Claude model)...' : 
      'Analyzing with Cursor AI...');
    
    // Cursor API endpoint
    const cursorEndpoint = process.env.CURSOR_API_ENDPOINT || CONFIG.cursorApiEndpoint;
    
    // Determine which model to use
    const model = useClaudeModel ? 
      (process.env.MODEL || CONFIG.model) : 
      (process.env.CURSOR_MODEL || CONFIG.cursorModel);
    
    log('debug', `Using model: ${model}`);
    
    // Make request to Cursor API with proper SSL handling
    const response = await axios.post(cursorEndpoint, {
      model: model,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prdContent
        }
      ],
      max_tokens: parseInt(process.env.MAX_TOKENS || CONFIG.maxTokens),
      temperature: parseFloat(process.env.TEMPERATURE || CONFIG.temperature),
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CURSOR_API_KEY || CONFIG.cursorApiKey}`
      },
      // Add SSL configuration to handle possible certificate issues
      httpsAgent: new (await import('https')).Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
      })
    });
    
    stopLoadingIndicator(loadingIndicator);
    
    log('debug', `Cursor response: ${JSON.stringify(response.data)}`);
    
    return processCursorResponse(response.data);
  } catch (error) {
    stopLoadingIndicator();
    
    // Provide more detailed error information for debugging
    if (error.response) {
      // Server responded with an error status code
      log('error', `Cursor API error (${error.response.status}): ${error.response.data?.error || error.message}`);
    } else if (error.request) {
      // Request was made but no response received (network error)
      log('error', `Cursor API network error: ${error.message}`);
      
      // Check for SSL errors specifically
      if (error.message.includes('certificate') || error.message.includes('self-signed')) {
        log('warn', 'SSL certificate issue detected. Consider setting NODE_TLS_REJECT_UNAUTHORIZED=0 for testing purposes only.');
      }
    } else {
      // Error in setting up the request
      log('error', `Cursor API setup error: ${error.message}`);
    }
    
    if (retryCount < 2) {
      log('info', `Retrying (${retryCount + 1}/2)...`);
      return callCursor(prdContent, prdPath, numTasks, retryCount + 1, useClaudeModel);
    }
    
    throw new Error(`Failed to analyze PRD with Cursor: ${handleCursorError(error)}`);
  }
}

/**
 * Process Claude API response
 * @param {Object} response - Claude's response
 * @returns {Object} Processed response
 */
function processClaudeResponse(response) {
  try {
    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    log('error', `Error parsing Claude response: ${error.message}`);
    throw new Error(`Failed to parse Claude response: ${error.message}`);
  }
}

/**
 * Process Cursor API response
 * @param {Object} response - Cursor's response
 * @returns {Object} Processed response
 */
function processCursorResponse(response) {
  try {
    // Adjust based on actual Cursor API response format
    const content = response.content || response.message?.content || response.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content found in Cursor response');
    }
    
    return JSON.parse(content);
  } catch (error) {
    log('error', `Error parsing Cursor response: ${error.message}`);
    throw new Error(`Failed to parse Cursor response: ${error.message}`);
  }
}

/**
 * Generate subtasks for a task
 * @param {Object} task - Task to generate subtasks for
 * @param {number} numSubtasks - Number of subtasks to generate
 * @param {number} nextSubtaskId - Next subtask ID
 * @param {string} additionalContext - Additional context
 * @returns {Array} Generated subtasks
 */
async function generateSubtasks(task, numSubtasks, nextSubtaskId, additionalContext = '') {
  // Simplified stub implementation
  const subtasks = [];
  
  for (let i = 0; i < numSubtasks; i++) {
    subtasks.push({
      id: nextSubtaskId + i,
      title: `Subtask ${i+1} for ${task.title}`,
      description: `Implementation step ${i+1}`,
      dependencies: i > 0 ? [nextSubtaskId + i - 1] : [],
      details: `Implementation details for subtask ${i+1}`,
      status: 'pending',
      parentTaskId: task.id
    });
  }
  
  return subtasks;
}

/**
 * Generate subtasks with research from Perplexity
 * @param {Object} task - Task to generate subtasks for
 * @param {number} numSubtasks - Number of subtasks to generate
 * @param {number} nextSubtaskId - Next subtask ID
 * @param {string} additionalContext - Additional context
 * @returns {Array} Generated subtasks
 */
async function generateSubtasksWithPerplexity(task, numSubtasks = 3, nextSubtaskId = 1, additionalContext = '') {
  // Just delegate to regular generateSubtasks in this stub implementation
  return generateSubtasks(task, numSubtasks, nextSubtaskId, additionalContext);
}

/**
 * Generate a prompt for complexity analysis
 * @param {Object} tasksData - Tasks data object containing tasks array
 * @returns {string} Generated prompt
 */
function generateComplexityAnalysisPrompt(tasksData) {
  return `Analyze the complexity of the following tasks and provide recommendations for subtask breakdown:
  
${tasksData.tasks.map(task => `
Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description || 'No description'}
Details: ${task.details || 'No details'}
Dependencies: ${JSON.stringify(task.dependencies || [])}
Priority: ${task.priority || 'medium'}
`).join('\n---\n')}
  
Analyze each task and return a JSON array with the following structure for each task:
[
  {
    "taskId": number,
    "taskTitle": string,
    "complexityScore": number (1-10),
    "recommendedSubtasks": number (3-5),
    "expansionPrompt": string (a specific prompt for generating good subtasks),
    "reasoning": string (brief explanation of your assessment)
  },
  ...
]
  
IMPORTANT: Make sure to include an analysis for EVERY task listed above, with the correct taskId matching each task's ID.
`;
}

/**
 * Handle Claude API errors with user-friendly messages
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function handleClaudeError(error) {
  // Default message
  let userMessage = "An error occurred while calling Claude AI";
  
  if (error.status === 401) {
    userMessage = "Authentication failed. Please check your Anthropic API key.";
  } else if (error.status === 400) {
    userMessage = "Bad request to Claude API. Please check your parameters.";
  } else if (error.status === 429) {
    userMessage = "Rate limit exceeded with Claude API. Please try again later.";
  } else if (error.status >= 500) {
    userMessage = "Claude API service is experiencing issues. Please try again later.";
  }
  
  return userMessage;
}

/**
 * Handle Cursor API errors with user-friendly messages
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function handleCursorError(error) {
  // Default message
  let userMessage = "An error occurred while calling Cursor AI";
  
  if (error.response) {
    const status = error.response.status;
    
    if (status === 401) {
      userMessage = "Authentication failed. Please check your Cursor API key.";
    } else if (status === 400) {
      userMessage = "Bad request to Cursor API. Please check your parameters.";
    } else if (status === 429) {
      userMessage = "Rate limit exceeded with Cursor API. Please try again later.";
    } else if (status >= 500) {
      userMessage = "Cursor API service is experiencing issues. Please try again later.";
    }
  }
  
  return userMessage;
}

export {
  PROVIDERS,
  callAIProvider,
  callClaude,
  callCursor,
  generateSubtasks,
  generateSubtasksWithPerplexity,
  generateComplexityAnalysisPrompt,
  processClaudeResponse,
  processCursorResponse,
  handleClaudeError,
  handleCursorError
}; 
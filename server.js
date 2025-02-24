const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const { TextDecoder } = require('util');
const app = express();
const PORT = process.env.PORT || 5000;

// Load environment variables
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to SQLite database
const db = new sqlite3.Database('./speedtest.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    // Create tables if they don't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS speed_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        prompt_length INTEGER NOT NULL,
        response_length INTEGER NOT NULL,
        time_taken_ms INTEGER NOT NULL,
        tokens_per_second REAL NOT NULL,
        provider TEXT NOT NULL,
        test_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});

// API Routes
app.get('/api/tests', (req, res) => {
  db.all('SELECT * FROM speed_tests ORDER BY test_timestamp DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/tests', (req, res) => {
  const { model_name, prompt_length, response_length, time_taken_ms, tokens_per_second, provider } = req.body;
  
  if (!model_name || !prompt_length || !response_length || !time_taken_ms || !tokens_per_second || !provider) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const sql = `
    INSERT INTO speed_tests (model_name, prompt_length, response_length, time_taken_ms, tokens_per_second, provider)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [model_name, prompt_length, response_length, time_taken_ms, tokens_per_second, provider], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ 
      id: this.lastID,
      message: 'Speed test saved successfully' 
    });
  });
});

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    // Fetch models from litellm's GitHub repository
    const response = await axios.get('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    const modelData = response.data;
    
    // Filter and organize models by provider
    const openaiModels = Object.keys(modelData)
      .filter(key => key.startsWith('gpt') || key.startsWith('openai/'))
      .filter(key => !key.includes('instruct') && !key.includes('embedding'))
      .map(key => key.replace('openai/', ''));
    
    // Ensure gpt-4o-mini is included
    if (!openaiModels.includes('gpt-4o-mini')) {
      openaiModels.push('gpt-4o-mini');
    }
    
    const anthropicModels = Object.keys(modelData)
      .filter(key => key.startsWith('claude') || key.startsWith('anthropic/'))
      .map(key => key.replace('anthropic/', ''));
    
    // Add Google Gemini models
    const geminiModels = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro'
    ];
    
    // Add OpenRouter models
    // Using just a selection of popular models for now
    const openrouterModels = [
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      'openai/gpt-4-turbo',
      'openai/gpt-4o',
      'meta-llama/llama-3-70b-instruct',
      'meta-llama/llama-3-8b-instruct',
      'mistralai/mistral-large',
      'mistralai/mistral-medium',
      'mistralai/mistral-small',
      'deepseek/deepseek-coder',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-llm-67b-chat'
    ];
    
    // Add Hyperbolic models
    const hyperbolicModels = [
      'bedrock/anthropic.claude-3-sonnet',
      'bedrock/anthropic.claude-3-haiku',
      'bedrock/amazon.titan-text-express',
      'bedrock/meta.llama3-70b-instruct',
      'bedrock/meta.llama3-8b-instruct',
      'azure/gpt-4',
      'azure/gpt-35-turbo'
    ];
    
    // Sort models to bring the most commonly used ones to the top
    const sortedOpenaiModels = [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      ...openaiModels.filter(model => 
        !['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'].includes(model)
      )
    ];
    
    // Remove duplicates
    const uniqueOpenaiModels = [...new Set(sortedOpenaiModels)];
    
    const models = {
      openai: uniqueOpenaiModels,
      anthropic: anthropicModels,
      gemini: geminiModels,
      openrouter: openrouterModels,
      hyperbolic: hyperbolicModels
    };
    
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    // Fallback to hardcoded models if fetching fails
    const fallbackModels = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
      gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
      openrouter: ['anthropic/claude-3-opus', 'openai/gpt-4o', 'meta-llama/llama-3-70b-instruct', 'deepseek/deepseek-coder'],
      hyperbolic: ['bedrock/anthropic.claude-3-sonnet', 'azure/gpt-4', 'bedrock/meta.llama3-70b-instruct']
    };
    res.json(fallbackModels);
  }
});

// Anthropic API endpoint
app.post('/api/test/anthropic', async (req, res) => {
  try {
    const { model, prompt } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Anthropic API key not found' });
    }
    
    // Use the full model name if it's a short name
    let modelName = model;
    if (!model.includes('/') && !model.startsWith('claude-')) {
      modelName = `claude-${model}`;
    }
    
    const startTime = Date.now();
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: modelName,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });
    
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    
    // Get the response text
    const responseText = response.data.content[0].text;
    
    // Get token counts if available, otherwise estimate
    let promptTokens, responseTokens;
    if (response.data.usage) {
      promptTokens = response.data.usage.input_tokens;
      responseTokens = response.data.usage.output_tokens;
    } else {
      // Fallback to estimation if the API doesn't provide token counts
      promptTokens = Math.ceil(prompt.length / 4);
      responseTokens = Math.ceil(responseText.length / 4);
    }
    
    const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
    
    res.json({
      model: modelName,
      response: responseText,
      prompt_length: promptTokens,
      response_length: responseTokens,
      time_taken_ms: timeTaken,
      tokens_per_second: tokensPerSecond,
      provider: 'Anthropic'
    });
    
  } catch (error) {
    console.error('Anthropic API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error calling Anthropic API', 
      details: error.response?.data || error.message 
    });
  }
});

// OpenAI API streaming endpoint
app.get('/api/test/openai/stream', (req, res) => {
  const model = req.query.model;
  const prompt = req.query.prompt;
  
  console.log(`Starting OpenAI stream test for model: ${model}`);
  
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required' });
  }
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not found' });
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Use the full model name if it's a shortened version
  let modelName = model;
  if (!model.includes('/') && !model.startsWith('gpt-')) {
    modelName = `gpt-${model}`;
  }
  
  const startTime = Date.now();
  let fullResponse = '';
  
  // Make streaming request to OpenAI
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    stream: true
  };
  
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // Use Axios for streaming - it works better with node.js
  axios({
    method: 'POST',
    url: url,
    headers: headers,
    data: body,
    responseType: 'stream'
  }).then(response => {
    // Buffer for handling partial chunks
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      // Convert the Buffer to a string and add to buffer
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines from the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            if (line.includes('[DONE]')) continue;
            
            // Parse the JSON portion of the line
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              const content = data.choices[0].delta.content;
              fullResponse += content;
              
              // Send the content as an SSE event
              res.write(`data: ${JSON.stringify({
                type: 'content',
                content
              })}\n\n`);
            }
          } catch (e) {
            // Some lines might not be complete JSON, which is fine
            if (!line.includes('[DONE]')) {
              console.log('Problematic line:', line.substring(0, 50) + '...');
              console.error('Error parsing OpenAI SSE data:', e.message);
            }
          }
        }
      }
    });
    
    response.data.on('end', () => {
      // Calculate tokens and stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      
      // This is approximate since we can't get the exact count from streaming
      const promptTokens = Math.ceil(prompt.length / 4);
      const responseTokens = Math.ceil(fullResponse.length / 4);
      const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
      
      // Send final stats
      res.write(`data: ${JSON.stringify({
        type: 'done',
        result: {
          model: modelName,
          response: fullResponse,
          prompt_length: promptTokens,
          response_length: responseTokens,
          time_taken_ms: timeTaken,
          tokens_per_second: tokensPerSecond,
          provider: 'OpenAI'
        }
      })}\n\n`);
      
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error('Error with OpenAI response stream:', err);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message
      })}\n\n`);
      res.end();
    });
    
  }).catch(err => {
    console.error('Error with OpenAI streaming request:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Unknown error'
    })}\n\n`);
    res.end();
  });
});

// Anthropic API streaming endpoint
app.get('/api/test/anthropic/stream', (req, res) => {
  const model = req.query.model;
  const prompt = req.query.prompt;
  
  console.log(`Starting Anthropic stream test for model: ${model}`);
  
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required' });
  }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not found' });
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Use the full model name if it's a short name
  let modelName = model;
  if (!model.includes('/') && !model.startsWith('claude-')) {
    modelName = `claude-${model}`;
  }
  
  const startTime = Date.now();
  let fullResponse = '';
  
  // Make streaming request to Anthropic
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: modelName,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    stream: true
  };
  
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };
  
  // Use Axios for streaming - it works better with node.js
  axios({
    method: 'POST',
    url: url,
    headers: headers,
    data: body,
    responseType: 'stream'
  }).then(response => {
    // Buffer for handling partial chunks
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      // Convert the Buffer to a string and add to buffer
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines from the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        
        if (line.startsWith('data: ')) {
          try {
            // Parse the JSON portion of the line
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            
            const data = JSON.parse(dataStr);
            if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
              const content = data.delta.text;
              fullResponse += content;
              
              // Send the content as an SSE event
              res.write(`data: ${JSON.stringify({
                type: 'content',
                content
              })}\n\n`);
            }
          } catch (e) {
            // Some lines might not be complete JSON, which is fine
            console.log('Problematic line:', line.substring(0, 50) + '...');
            console.error('Error parsing Anthropic SSE data:', e.message);
          }
        }
      }
    });
    
    response.data.on('end', () => {
      // Calculate tokens and stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      
      // This is approximate since we can't get the exact count from streaming
      const promptTokens = Math.ceil(prompt.length / 4);
      const responseTokens = Math.ceil(fullResponse.length / 4);
      const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
      
      // Send final stats
      res.write(`data: ${JSON.stringify({
        type: 'done',
        result: {
          model: modelName,
          response: fullResponse,
          prompt_length: promptTokens,
          response_length: responseTokens,
          time_taken_ms: timeTaken,
          tokens_per_second: tokensPerSecond,
          provider: 'Anthropic'
        }
      })}\n\n`);
      
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error('Error with Anthropic response stream:', err);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message
      })}\n\n`);
      res.end();
    });
    
  }).catch(err => {
    console.error('Error with Anthropic streaming request:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Unknown error'
    })}\n\n`);
    res.end();
  });
});

// OpenAI API endpoint (non-streaming)
app.post('/api/test/openai', async (req, res) => {
  try {
    const { model, prompt } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not found' });
    }
    
    // Use the full model name if it's a shortened version
    let modelName = model;
    if (!model.includes('/') && !model.startsWith('gpt-')) {
      modelName = `gpt-${model}`;
    }
    
    const startTime = Date.now();
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    
    // Get the response text
    const responseText = response.data.choices[0].message.content;
    
    // Get token counts from OpenAI response
    const promptTokens = response.data.usage.prompt_tokens;
    const responseTokens = response.data.usage.completion_tokens;
    const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
    
    res.json({
      model: modelName,
      response: responseText,
      prompt_length: promptTokens,
      response_length: responseTokens,
      time_taken_ms: timeTaken,
      tokens_per_second: tokensPerSecond,
      provider: 'OpenAI'
    });
    
  } catch (error) {
    console.error('OpenAI API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error calling OpenAI API', 
      details: error.response?.data || error.message 
    });
  }
});

// Google Gemini API streaming endpoint
app.get('/api/test/gemini/stream', (req, res) => {
  const model = req.query.model;
  const prompt = req.query.prompt;
  
  console.log(`Starting Gemini stream test for model: ${model}`);
  
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required' });
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not found' });
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const startTime = Date.now();
  let fullResponse = '';
  
  // Make streaming request to Google Gemini API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024
    }
  };
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // Use Axios for streaming
  axios({
    method: 'POST',
    url: url,
    headers: headers,
    data: body,
    responseType: 'stream'
  }).then(response => {
    // Buffer for handling partial chunks
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      // Convert the Buffer to a string and add to buffer
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines from the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        
        if (line.startsWith('data: ')) {
          try {
            // Parse the JSON portion of the line
            const dataStr = line.substring(6);
            if (!dataStr.trim() || dataStr === '[DONE]') continue;
            
            const data = JSON.parse(dataStr);
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
              const content = data.candidates[0].content.parts[0].text;
              fullResponse += content;
              
              // Send the content as an SSE event
              res.write(`data: ${JSON.stringify({
                type: 'content',
                content
              })}\n\n`);
            }
          } catch (e) {
            console.log('Problematic line:', line.substring(0, 50) + '...');
            console.error('Error parsing Gemini SSE data:', e.message);
          }
        }
      }
    });
    
    response.data.on('end', () => {
      // Calculate tokens and stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      
      // This is approximate since we can't get the exact count from streaming
      const promptTokens = Math.ceil(prompt.length / 4);
      const responseTokens = Math.ceil(fullResponse.length / 4);
      const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
      
      // Send final stats
      res.write(`data: ${JSON.stringify({
        type: 'done',
        result: {
          model: model,
          response: fullResponse,
          prompt_length: promptTokens,
          response_length: responseTokens,
          time_taken_ms: timeTaken,
          tokens_per_second: tokensPerSecond,
          provider: 'Google'
        }
      })}\n\n`);
      
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error('Error with Gemini response stream:', err);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message
      })}\n\n`);
      res.end();
    });
    
  }).catch(err => {
    console.error('Error with Gemini streaming request:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Unknown error'
    })}\n\n`);
    res.end();
  });
});

// OpenRouter API streaming endpoint
app.get('/api/test/openrouter/stream', (req, res) => {
  const model = req.query.model;
  const prompt = req.query.prompt;
  
  console.log(`Starting OpenRouter stream test for model: ${model}`);
  
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required' });
  }
  
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not found' });
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const startTime = Date.now();
  let fullResponse = '';
  
  // Make streaming request to OpenRouter
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body = {
    model: model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    stream: true
  };
  
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://llm-speed-test.app'
  };
  
  // Use Axios for streaming
  axios({
    method: 'POST',
    url: url,
    headers: headers,
    data: body,
    responseType: 'stream'
  }).then(response => {
    // Buffer for handling partial chunks
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      // Convert the Buffer to a string and add to buffer
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines from the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            if (line.includes('[DONE]')) continue;
            
            // Parse the JSON portion of the line
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              const content = data.choices[0].delta.content;
              fullResponse += content;
              
              // Send the content as an SSE event
              res.write(`data: ${JSON.stringify({
                type: 'content',
                content
              })}\n\n`);
            }
          } catch (e) {
            // Some lines might not be complete JSON, which is fine
            if (!line.includes('[DONE]')) {
              console.log('Problematic line:', line.substring(0, 50) + '...');
              console.error('Error parsing OpenRouter SSE data:', e.message);
            }
          }
        }
      }
    });
    
    response.data.on('end', () => {
      // Calculate tokens and stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      
      // This is approximate since we can't get the exact count from streaming
      const promptTokens = Math.ceil(prompt.length / 4);
      const responseTokens = Math.ceil(fullResponse.length / 4);
      const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
      
      // Send final stats
      res.write(`data: ${JSON.stringify({
        type: 'done',
        result: {
          model: model,
          response: fullResponse,
          prompt_length: promptTokens,
          response_length: responseTokens,
          time_taken_ms: timeTaken,
          tokens_per_second: tokensPerSecond,
          provider: 'OpenRouter'
        }
      })}\n\n`);
      
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error('Error with OpenRouter response stream:', err);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message
      })}\n\n`);
      res.end();
    });
    
  }).catch(err => {
    console.error('Error with OpenRouter streaming request:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Unknown error'
    })}\n\n`);
    res.end();
  });
});

// Hyperbolic API streaming endpoint
app.get('/api/test/hyperbolic/stream', (req, res) => {
  const model = req.query.model;
  const prompt = req.query.prompt;
  
  console.log(`Starting Hyperbolic stream test for model: ${model}`);
  
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required' });
  }
  
  const apiKey = process.env.HYPERBOLIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Hyperbolic API key not found' });
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const startTime = Date.now();
  let fullResponse = '';
  
  // Make streaming request to Hyperbolic
  const url = 'https://api.hyperbolic.ai/v1/text/completions';
  const body = {
    model: model,
    prompt: prompt,
    max_tokens: 1024,
    stream: true
  };
  
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // Use Axios for streaming
  axios({
    method: 'POST',
    url: url,
    headers: headers,
    data: body,
    responseType: 'stream'
  }).then(response => {
    // Buffer for handling partial chunks
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      // Convert the Buffer to a string and add to buffer
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines from the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            if (line.includes('[DONE]')) continue;
            
            // Parse the JSON portion of the line
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].text) {
              const content = data.choices[0].text;
              fullResponse += content;
              
              // Send the content as an SSE event
              res.write(`data: ${JSON.stringify({
                type: 'content',
                content
              })}\n\n`);
            }
          } catch (e) {
            // Some lines might not be complete JSON, which is fine
            if (!line.includes('[DONE]')) {
              console.log('Problematic line:', line.substring(0, 50) + '...');
              console.error('Error parsing Hyperbolic SSE data:', e.message);
            }
          }
        }
      }
    });
    
    response.data.on('end', () => {
      // Calculate tokens and stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      
      // This is approximate since we can't get the exact count from streaming
      const promptTokens = Math.ceil(prompt.length / 4);
      const responseTokens = Math.ceil(fullResponse.length / 4);
      const tokensPerSecond = Math.round((responseTokens / (timeTaken / 1000)) * 100) / 100;
      
      // Send final stats
      res.write(`data: ${JSON.stringify({
        type: 'done',
        result: {
          model: model,
          response: fullResponse,
          prompt_length: promptTokens,
          response_length: responseTokens,
          time_taken_ms: timeTaken,
          tokens_per_second: tokensPerSecond,
          provider: 'Hyperbolic'
        }
      })}\n\n`);
      
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error('Error with Hyperbolic response stream:', err);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message
      })}\n\n`);
      res.end();
    });
    
  }).catch(err => {
    console.error('Error with Hyperbolic streaming request:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Unknown error'
    })}\n\n`);
    res.end();
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
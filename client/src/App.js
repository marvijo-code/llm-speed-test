import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  // Try to get default prompt from localStorage or use fallback
  const getDefaultPrompt = () => {
    const savedPrompt = localStorage.getItem('llm-speed-test-default-prompt');
    return savedPrompt || 'Write an AI company landing page in html, css, and javascript.';
  };

  const [testData, setTestData] = useState({
    provider: 'openai',
    model: 'gpt-4o-mini',
    prompt: getDefaultPrompt(),
    response: '',
    time_taken_ms: 0,
    tokens_per_second: 0,
    time_to_first_token_ms: 0
  });
  
  const [streamedOutput, setStreamedOutput] = useState("");
  const [conversation, setConversation] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState('chat-' + Date.now());
  const [testing, setTesting] = useState(false);
  const [savedTests, setSavedTests] = useState([]);
  const [availableModels, setAvailableModels] = useState({
    openai: [],
    anthropic: [],
    gemini: [],
    openrouter: []
  });
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  
  const chatEndRef = useRef(null);
  
  // Scroll to bottom of chat whenever conversation changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, streamedOutput]);
  
  // Fetch saved tests, available models, and load chat history from localStorage
  useEffect(() => {
    fetchTests();
    fetchModels();
    loadChatHistory();
  }, []);
  
  // Load chat history from localStorage
  const loadChatHistory = () => {
    try {
      const savedChats = localStorage.getItem('llm-speed-test-chats');
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        
        // Validate that the parsed data is an array
        if (Array.isArray(parsedChats) && parsedChats.length > 0) {
          setChatHistory(parsedChats);
          
          // Load the most recent chat if it exists
          const mostRecentChat = parsedChats[parsedChats.length - 1];
          
          // Make sure the chat has required properties before loading
          if (mostRecentChat && mostRecentChat.id) {
            setCurrentChatId(mostRecentChat.id);
            setConversation(mostRecentChat.messages || []);
          }
        } else {
          // Create a new chat if parsed data is invalid
          createInitialChat();
        }
      } else {
        // Create a new chat if no saved chats
        createInitialChat();
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
      // Create a new chat on error
      createInitialChat();
    }
  };
  
  // Create an initial chat
  const createInitialChat = () => {
    const newChatId = 'chat-' + Date.now();
    const initialChat = {
      id: newChatId,
      title: `New Chat`,
      provider: testData.provider,
      model: testData.model,
      timestamp: new Date().toISOString(),
      messages: []
    };
    
    setCurrentChatId(newChatId);
    setConversation([]);
    setChatHistory([initialChat]);
    saveChatHistory([initialChat]);
  };
  
  // Save chat history to localStorage
  const saveChatHistory = (updatedHistory) => {
    try {
      localStorage.setItem('llm-speed-test-chats', JSON.stringify(updatedHistory));
    } catch (err) {
      console.error('Error saving chat history:', err);
    }
  };
  
  const fetchTests = async () => {
    try {
      const response = await axios.get('/api/tests');
      setSavedTests(response.data);
    } catch (err) {
      setError('Failed to fetch tests');
      console.error(err);
    }
  };
  
  const fetchModels = async () => {
    try {
      const response = await axios.get('/api/models');
      setAvailableModels(response.data);
      
      // Try to find 'gpt-4o-mini' in the model list to make it the default
      const openaiModels = response.data.openai || [];
      const hasGpt4oMini = openaiModels.some(model => 
        model === 'gpt-4o-mini' || model === '4o-mini' || model === 'openai/gpt-4o-mini'
      );
      
      // Only set a different model if gpt-4o-mini isn't already set or not available
      if (!hasGpt4oMini) {
        setTestData(prevData => ({
          ...prevData,
          model: openaiModels[0] || 'gpt-4o-mini'
        }));
      }
    } catch (err) {
      setError('Failed to fetch available models. Using fallback models.');
      console.error(err);
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setTestData({
      ...testData,
      [name]: value
    });
    
    // Save the default prompt to localStorage when it changes
    if (name === 'prompt') {
      localStorage.setItem('llm-speed-test-default-prompt', value);
    }
  };
  
  const handleProviderChange = (e) => {
    const provider = e.target.value;
    setTestData({
      ...testData,
      provider,
      model: availableModels[provider][0] || '' // Set first model of selected provider
    });
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runSpeedTest();
    }
  };
  
  const startNewChat = () => {
    // Check if the current chat has any messages
    const currentChat = chatHistory.find(chat => chat.id === currentChatId);
    const hasChatMessages = currentChat && currentChat.messages && currentChat.messages.length > 0;
    
    // Only create a new chat if there's an existing chat with content
    if (hasChatMessages) {
      const newChatId = 'chat-' + Date.now();
      setCurrentChatId(newChatId);
      setConversation([]);
      setStreamedOutput('');
      setTestData({
        ...testData,
        prompt: getDefaultPrompt(), // Use the default prompt
        response: '',
        time_taken_ms: 0,
        tokens_per_second: 0,
        time_to_first_token_ms: 0
      });
      
      // Add the new chat to history
      const newChat = {
        id: newChatId,
        title: `Chat ${chatHistory.length + 1}`,
        provider: testData.provider,
        model: testData.model,
        timestamp: new Date().toISOString(),
        messages: []
      };
      
      const updatedHistory = [...chatHistory, newChat];
      setChatHistory(updatedHistory);
      saveChatHistory(updatedHistory);
    } else {
      // If current chat is empty, just reset it
      setConversation([]);
      setStreamedOutput('');
      setTestData({
        ...testData,
        prompt: getDefaultPrompt(), // Use the default prompt
        response: '',
        time_taken_ms: 0,
        tokens_per_second: 0,
        time_to_first_token_ms: 0
      });
    }
  };
  
  const selectChat = (chatId) => {
    // Find the selected chat
    const selectedChat = chatHistory.find(chat => chat.id === chatId);
    if (selectedChat) {
      setCurrentChatId(chatId);
      setConversation(selectedChat.messages || []);
      setShowChatList(false);
    }
  };
  
  const runSpeedTest = async () => {
    if (!testData.model || !testData.prompt) {
      setError('Model and prompt are required');
      return;
    }
    
    // Update user message in conversation
    const updatedConversation = [
      ...conversation, 
      { role: 'user', content: testData.prompt }
    ];
    
    setConversation(updatedConversation);
    
    // Update the current chat in history
    const updatedHistory = chatHistory.map(chat => {
      if (chat.id === currentChatId) {
        return {
          ...chat,
          messages: updatedConversation,
          lastUpdated: new Date().toISOString()
        };
      }
      return chat;
    });
    
    setChatHistory(updatedHistory);
    saveChatHistory(updatedHistory);
    
    setTesting(true);
    setError('');
    setStreamedOutput('');
    
    try {
      // Call the appropriate streaming API endpoint based on the provider
      const apiUrl = `/api/test/${testData.provider}/stream`;
      
      // Encode parameters for URL to handle larger prompts better
      const params = new URLSearchParams({
        model: testData.model,
        prompt: testData.prompt
      });
      
      // Use event source for streaming responses
      const eventSource = new EventSource(`${apiUrl}?${params.toString()}`);
      
      // Start with an assistant message that will be updated
      const updatedWithAssistant = [
        ...updatedConversation, 
        { role: 'assistant', content: '' }
      ];
      
      setConversation(updatedWithAssistant);
      
      // Variables to track timing
      let accumulated = '';
      let firstTokenTime = 0;
      let startTime = Date.now();
      let hasReceivedFirstToken = false;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'content') {
            // Check if this is the first token
            if (!hasReceivedFirstToken) {
              firstTokenTime = Date.now() - startTime;
              hasReceivedFirstToken = true;
            }
            
            // Update the streamed output with the new token
            accumulated += data.content;
            setStreamedOutput(accumulated);
            
            // Update the last message in the conversation (the assistant's response)
            const newConversation = conversation.length > 0 ? 
              [...updatedWithAssistant.slice(0, -1), 
                { role: 'assistant', content: accumulated }
              ] : 
              [{ role: 'assistant', content: accumulated }];
            
            setConversation(newConversation);
            
            // Update the current chat in history
            const updatedChatHistory = chatHistory.map(chat => {
              if (chat.id === currentChatId) {
                return {
                  ...chat,
                  messages: newConversation,
                  lastUpdated: new Date().toISOString()
                };
              }
              return chat;
            });
            
            setChatHistory(updatedChatHistory);
            saveChatHistory(updatedChatHistory);
          } 
          else if (data.type === 'done') {
            // Test completed, update results
            eventSource.close();
            
            const result = data.result;
            
            // Calculate proper tokens per second (only after first token received)
            let tokensPerSecond = result.tokens_per_second;
            if (firstTokenTime > 0) {
              const timeAfterFirstToken = result.time_taken_ms - firstTokenTime;
              if (timeAfterFirstToken > 0) {
                tokensPerSecond = Math.round((result.response_length / (timeAfterFirstToken / 1000)) * 100) / 100;
              }
            }
            
            // Save test to database
            axios.post('/api/tests', {
              model_name: result.model,
              prompt_length: result.prompt_length,
              response_length: result.response_length,
              time_taken_ms: result.time_taken_ms,
              tokens_per_second: tokensPerSecond,
              provider: result.provider
            });
            
            // Update state with test results
            setTestData({
              ...testData,
              response: result.response,
              time_taken_ms: result.time_taken_ms,
              tokens_per_second: tokensPerSecond,
              time_to_first_token_ms: firstTokenTime,
              prompt: '' // Clear the prompt for next message
            });
            
            // Update chat title with a snippet of the first message
            if (updatedConversation.length > 0 && updatedConversation[0].content) {
              const firstMessage = updatedConversation[0].content;
              const title = firstMessage.length > 30 ? 
                firstMessage.substring(0, 30) + '...' : 
                firstMessage;
              
              const updatedChatHistory = chatHistory.map(chat => {
                if (chat.id === currentChatId && !chat.title.includes(':')) {
                  return {
                    ...chat,
                    title: title
                  };
                }
                return chat;
              });
              
              setChatHistory(updatedChatHistory);
              saveChatHistory(updatedChatHistory);
            }
            
            // Refresh tests list
            fetchTests();
            setTesting(false);
          }
          else if (data.type === 'error') {
            eventSource.close();
            setError(`Stream error: ${data.error}`);
            setTesting(false);
          }
        } catch (err) {
          console.error('Error parsing event:', err);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        setError('Error with streaming connection. Check console for details.');
        setTesting(false);
      };
      
    } catch (err) {
      setError(`Error running speed test: ${err.response?.data?.error || err.message}`);
      console.error(err);
      setTesting(false);
    }
  };
  
  // Group data by model for better visualization
  const prepareChartData = () => {
    // Group by unique model names
    const groupedTests = savedTests.reduce((acc, test) => {
      const key = `${test.model_name} (${test.provider})`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(test);
      return acc;
    }, {});

    // Get average tokens per second for each model
    const labels = Object.keys(groupedTests);
    const data = labels.map(label => {
      const tests = groupedTests[label];
      const avg = tests.reduce((sum, test) => sum + test.tokens_per_second, 0) / tests.length;
      return Math.round(avg * 100) / 100; // Round to 2 decimal places
    });

    // Determine colors based on provider
    const backgroundColor = labels.map(label => 
      label.includes('OpenAI') 
        ? 'rgba(0, 166, 126, 0.2)' 
        : 'rgba(75, 0, 130, 0.2)'
    );
    
    const borderColor = labels.map(label => 
      label.includes('OpenAI') 
        ? 'rgba(0, 166, 126, 1)' 
        : 'rgba(75, 0, 130, 1)'
    );

    return {
      labels,
      datasets: [
        {
          label: 'Tokens per Second (avg)',
          data,
          backgroundColor,
          borderColor,
          borderWidth: 1,
        },
      ],
    };
  };

  const chartData = prepareChartData();
  
  return (
    <div className="app-container">
      {/* Left Sidebar - Chat List */}
      <div className="sidebar chat-sidebar">
        <div className="sidebar-header">
          <button 
            className="new-chat-button" 
            onClick={startNewChat}
            disabled={testing}
          >
            <span className="plus-icon">+</span> New Chat
          </button>
        </div>
        <div className="chat-list-container">
          <ul className="chat-list">
            {chatHistory.map(chat => (
              <li 
                key={chat.id} 
                className={chat.id === currentChatId ? 'active' : ''}
                onClick={() => selectChat(chat.id)}
              >
                <div className="chat-title">{chat.title}</div>
                <div className="chat-info">
                  {chat.model} • {new Date(chat.timestamp).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Content - Chat or Results */}
      <div className="main-content">
        <div className="header">
          <div className="model-selector">
            <select
              name="provider"
              value={testData.provider}
              onChange={handleProviderChange}
              className="animate-dropdown"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            
            <select
              name="model"
              value={testData.model}
              onChange={handleInputChange}
              className="animate-dropdown"
            >
              <option value="">Select a model</option>
              {availableModels[testData.provider]?.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            
            <button 
              className="btn animated-button" 
              onClick={() => setShowResults(!showResults)}
            >
              {showResults ? 'Show Chat' : 'Show Results'}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>
        
        {!showResults ? (
          <>
            <div className="chat-container">
              <div className="message-list">
                {conversation.map((message, index) => (
                  <div 
                    key={index} 
                    className={`message-container ${message.role === 'user' ? 'user-message' : 'assistant-message'} fade-in`}
                  >
                    <div className={`message-avatar ${message.role === 'user' ? 'user-avatar' : 'assistant-avatar'}`}>
                      {message.role === 'user' ? 'U' : 'A'}
                    </div>
                    <div className="message-content">
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {/* Show typing indicator if currently testing */}
                {testing && streamedOutput === '' && (
                  <div className="message-container assistant-message typing-message">
                    <div className="message-avatar assistant-avatar">A</div>
                    <div className="message-content">
                      <div className="typing-indicator">...</div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} /> {/* Element to scroll to */}
              </div>
            </div>
            
            <div className="input-area">
              <div className="input-form">
                <textarea
                  className="prompt-input"
                  name="prompt"
                  value={testData.prompt}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message..."
                  disabled={testing}
                  rows={1}
                ></textarea>
                <button 
                  className="send-button pulse-animation" 
                  onClick={runSpeedTest}
                  disabled={testing || !testData.prompt.trim()}
                >
                  {testing ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="results-view">
            <h2 className="slide-in-right">Speed Test Results</h2>
            
            <div className="chart-container slide-in-right">
              <Bar data={chartData} options={{ 
                maintainAspectRatio: false,
                indexAxis: 'y',  // Horizontal bar chart for better readability with many models
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return `Tokens/Sec: ${context.raw}`;
                      }
                    }
                  }
                },
                animation: {
                  duration: 1500
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Tokens per Second'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Model'
                    }
                  }
                }
              }} />
            </div>
            
            <h3 className="slide-in-right">Test History</h3>
            <div className="table-container slide-in-right">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Prompt Tokens</th>
                    <th>Response Tokens</th>
                    <th>Time (ms)</th>
                    <th>Tokens/Second</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {savedTests.map(test => (
                    <tr key={test.id} className="fade-in">
                      <td>{test.provider}</td>
                      <td>{test.model_name}</td>
                      <td>{test.prompt_length}</td>
                      <td>{test.response_length}</td>
                      <td>{test.time_taken_ms}</td>
                      <td>{test.tokens_per_second}</td>
                      <td>{new Date(test.test_timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Stats Panel */}
      <div className="sidebar stats-sidebar">
        <div className="sidebar-header">
          <h3>Performance Metrics</h3>
        </div>
        
        <div className="stats-container">
          {testData.time_taken_ms > 0 ? (
            <div className="stats-card-container">
              <div className="stats-card slide-in-left">
                <div className="stats-card-header">Model</div>
                <div className="stats-card-value">{testData.model}</div>
              </div>
              
              <div className="stats-card slide-in-left" style={{animationDelay: "0.1s"}}>
                <div className="stats-card-header">Time to First Token</div>
                <div className="stats-card-value highlight">{testData.time_to_first_token_ms} ms</div>
              </div>
              
              <div className="stats-card slide-in-left" style={{animationDelay: "0.2s"}}>
                <div className="stats-card-header">Total Generation Time</div>
                <div className="stats-card-value">{testData.time_taken_ms} ms</div>
              </div>
              
              <div className="stats-card slide-in-left" style={{animationDelay: "0.3s"}}>
                <div className="stats-card-header">Tokens per Second</div>
                <div className="stats-card-value highlight">{testData.tokens_per_second}</div>
              </div>
              
              <div className="stats-card slide-in-left" style={{animationDelay: "0.4s"}}>
                <div className="stats-card-header">Provider</div>
                <div className="stats-card-value">{testData.provider}</div>
              </div>
            </div>
          ) : (
            <div className="no-stats-message">
              Run a speed test to see performance metrics
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
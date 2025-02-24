import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
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
  const [testData, setTestData] = useState({
    provider: 'openai',
    model: 'gpt-4o-mini',
    prompt: '',
    response: '',
    time_taken_ms: 0,
    tokens_per_second: 0
  });
  
  const [streamedOutput, setStreamedOutput] = useState("");
  
  const [testing, setTesting] = useState(false);
  const [savedTests, setSavedTests] = useState([]);
  const [availableModels, setAvailableModels] = useState({
    openai: [],
    anthropic: []
  });
  const [error, setError] = useState('');
  
  // Fetch saved tests and available models
  useEffect(() => {
    fetchTests();
    fetchModels();
  }, []);
  
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
  };
  
  const handleProviderChange = (e) => {
    const provider = e.target.value;
    setTestData({
      ...testData,
      provider,
      model: availableModels[provider][0] || '' // Set first model of selected provider
    });
  };
  
  const runSpeedTest = async () => {
    if (!testData.model || !testData.prompt) {
      setError('Model and prompt are required');
      return;
    }
    
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
      
      let startTime = Date.now();
      let accumulated = '';
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'content') {
            // Update the streamed output with the new token
            accumulated += data.content;
            setStreamedOutput(accumulated);
          } 
          else if (data.type === 'done') {
            // Test completed, update results
            eventSource.close();
            
            const result = data.result;
            
            // Save test to database
            axios.post('/api/tests', {
              model_name: result.model,
              prompt_length: result.prompt_length,
              response_length: result.response_length,
              time_taken_ms: result.time_taken_ms,
              tokens_per_second: result.tokens_per_second,
              provider: result.provider
            });
            
            // Update state with test results
            setTestData({
              ...testData,
              response: result.response,
              time_taken_ms: result.time_taken_ms,
              tokens_per_second: result.tokens_per_second
            });
            
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
    <div className="container">
      <h1>LLM Speed Test</h1>
      
      <div className="card">
        <h2>New Speed Test</h2>
        
        {error && <div style={{ color: 'red', marginBottom: '15px' }}>{error}</div>}
        
        <div>
          <label>Provider:</label>
          <select
            name="provider"
            value={testData.provider}
            onChange={handleProviderChange}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        
        <div>
          <label>Model:</label>
          <select
            name="model"
            value={testData.model}
            onChange={handleInputChange}
          >
            <option value="">Select a model</option>
            {availableModels[testData.provider]?.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label>Test Prompt:</label>
          <textarea
            name="prompt"
            value={testData.prompt}
            onChange={handleInputChange}
            rows="4"
            placeholder="Enter your test prompt here..."
          ></textarea>
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={runSpeedTest}
          disabled={testing}
        >
          {testing ? 'Testing...' : 'Run Speed Test'}
        </button>
        
        <div style={{ marginTop: '20px' }}>
          <h3>Live Output:</h3>
          <div 
            style={{ 
              border: '1px solid #ccc',
              padding: '10px',
              borderRadius: '4px',
              height: '200px',
              overflowY: 'auto',
              backgroundColor: '#f9f9f9',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              marginBottom: '15px'
            }}
          >
            {streamedOutput || (testing ? "Waiting for response..." : "No output yet")}
          </div>
          
          {testData.time_taken_ms > 0 && (
            <div>
              <h3>Results:</h3>
              <p><strong>Time Taken:</strong> {testData.time_taken_ms}ms</p>
              <p><strong>Tokens per Second:</strong> {testData.tokens_per_second}</p>
            </div>
          )}
        </div>
      </div>
      
      {savedTests.length > 0 && (
        <div className="card">
          <h2>Speed Test History</h2>
          
          <div style={{ height: '300px', marginBottom: '30px' }}>
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
                <tr key={test.id}>
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
      )}
    </div>
  );
}

export default App;
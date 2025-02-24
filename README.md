# LLM Speed Test Application

A web application for testing and comparing the speed of different Large Language Models from OpenAI and Anthropic.

## Features

- Test real LLM inference speed with custom prompts
- Track tokens per second performance
- Store test results in SQLite database
- Compare performance across different models and providers
- Visualize results with charts

## Tech Stack

- Frontend: React.js with Chart.js for visualization
- Backend: Express.js
- Database: SQLite3
- API Integration: OpenAI and Anthropic

## Configuration

1. Create a `.env` file in the root directory with your API keys:
```
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Installation

1. Clone the repository
```
git clone https://github.com/yourusername/llm-speed-test.git
cd llm-speed-test
```

2. Install dependencies
```
npm run install-all
```

## Running the Application

1. Start the server
```
npm run dev
```

2. In a separate terminal, start the client
```
npm run client
```

The application will be available at http://localhost:3000

## How to Use

1. Select a provider (OpenAI or Anthropic)
2. Choose a model from the dropdown (gpt-4o-mini is the default)
3. Type your test prompt
4. Click "Run Speed Test"
5. Watch the response stream in real-time in the scrollable output window
6. View performance results and compare with previous tests

## Supported Models

The application dynamically fetches available models from LiteLLM's GitHub repository:
https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json

This ensures the app always has an up-to-date list of models from both OpenAI and Anthropic.

Examples include:

### OpenAI
- gpt-3.5-turbo
- gpt-4
- gpt-4-turbo
- And many more variants

### Anthropic
- claude-3-haiku-20240307
- claude-3-sonnet-20240229
- claude-3-opus-20240229
- And other Claude models

## License

MIT
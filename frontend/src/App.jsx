import { useState } from 'react';
import axios from 'axios';

function App() {
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  
  const analyzeScreen = async () => {
    setIsLoading(true);
    try {
      const result = await axios.post('http://localhost:8000/api/analyze-screenshot', {
        prompt: prompt || "What should I do with what's on my screen?"
      });
      
      setResponse(result.data.analysis);
      setScreenshot(result.data.screenshot_path);
    } catch (error) {
      setResponse(`Error: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">AI Desktop Assistant</h1>
        
        <div className="flex gap-4 mb-6">
          <button 
            onClick={analyzeScreen}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isLoading ? 'Analyzing...' : 'Analyze Screen'}
          </button>
        </div>
        
        <div className="mb-6">
          <label htmlFor="prompt" className="block text-sm font-medium mb-2">
            Custom Prompt (optional)
          </label>
          <input
            type="text"
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask something specific about your screen..."
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {screenshot && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Screenshot</h2>
            <div className="border border-gray-700 rounded overflow-hidden max-w-md">
              <img 
                src={`file://${screenshot}`} 
                alt="Captured screen" 
                className="w-full"
              />
            </div>
          </div>
        )}
        
        <div>
          <h2 className="text-xl font-semibold mb-2">AI Response</h2>
          <div className="bg-gray-800 p-4 rounded min-h-[200px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{response}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
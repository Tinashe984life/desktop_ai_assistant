import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  
  // Fetch chats on component mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/chats');
        setChats(response.data.chats);
        
        // If there are chats, select the first one
        if (response.data.chats.length > 0) {
          loadChat(response.data.chats[0]);
        }
      } catch (error) {
        console.error('Error loading chats:', error);
      }
    };
    
    fetchChats();
  }, []);
  
  // Load a specific chat
  const loadChat = async (chatId) => {
    try {
      const response = await axios.get(`http://localhost:8000/api/chat/${chatId}`);
      setMessages(response.data);
      setCurrentChatId(chatId);
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };
  
  // Create a new chat
  const createNewChat = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/chat/new');
      const newChatId = response.data.chat_id;
      
      setChats([newChatId, ...chats]);
      setMessages([]);
      setCurrentChatId(newChatId);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };
  
  // Analyze the current screen
  const analyzeScreen = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      // Add user message to UI immediately
      setMessages(prev => [
        ...prev,
        { role: 'user', parts: [{ text: prompt || "What's on my screen?" }] }
      ]);
      
      const result = await axios.post('http://localhost:8000/api/analyze', {
        prompt: prompt || "Based on my current screen:",
        chat_id: currentChatId
      });
      
      // Update with AI response
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: result.data.analysis }] }
      ]);
      
      setScreenshot(result.data.screenshot_path);
      
      // If we started a new chat, add it to our list
      if (!chats.includes(result.data.chat_id)) {
        setChats([result.data.chat_id, ...chats]);
        setCurrentChatId(result.data.chat_id);
      }
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { 
          role: 'model', 
          parts: [{ 
            text: `Error: ${error.response?.data?.detail || error.message}` 
          }] 
        }
      ]);
    } finally {
      setIsLoading(false);
      setPrompt('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto flex">
        {/* Chat sidebar */}
        <div className="w-1/4 pr-4 border-r border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Chats</h2>
            <button 
              onClick={createNewChat}
              className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded"
            >
              New
            </button>
          </div>
          
          <div className="space-y-2">
            {chats.map(chatId => (
              <div 
                key={chatId} 
                onClick={() => loadChat(chatId)}
                className={`p-3 rounded cursor-pointer ${
                  currentChatId === chatId 
                    ? 'bg-blue-600' 
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="truncate text-sm">
                  {chatId.substring(0, 8)}...{chatId.substring(chatId.length - 4)}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Main content */}
        <div className="w-3/4 pl-6">
          <h1 className="text-3xl font-bold mb-6">AI Desktop Assistant</h1>
          
          {/* Chat messages */}
          <div className="mb-6 space-y-4 max-h-[50vh] overflow-y-auto pr-4">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`p-4 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-blue-800 ml-8' 
                    : 'bg-gray-800 mr-8'
                }`}
              >
                <div className="font-bold mb-1">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div className="whitespace-pre-wrap">{msg.parts[0].text}</div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
          
          {/* Input area */}
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about your screen or give a command..."
              className="flex-1 p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && analyzeScreen()}
            />
            
            <button 
              onClick={analyzeScreen}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
            >
              Send
            </button>
          </div>
          
          {/* Screenshot preview */}
          {screenshot && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Current Screen</h2>
              <div className="border border-gray-700 rounded overflow-hidden max-w-md">
                <img 
                  src={`http://localhost:8000/screenshots/${screenshot.split('/').pop()}`} 
                  alt="Captured screen" 
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
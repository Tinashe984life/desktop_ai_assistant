import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  
  // Chat states
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  
  // Configure Axios to include JWT token in requests
  useEffect(() => {
    axios.interceptors.request.use(config => {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsAuthenticated(true);
      fetchUserData();
    }
  }, []);

  // Fetch user data
  const fetchUserData = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/me');
      setUser(response.data);
      fetchChats();
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      logout();
    }
  };

  // Fetch user's chats
  const fetchChats = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/chats');
      setChats(response.data.chats);
      
      // If there are chats, select the first one
      if (response.data.chats.length > 0 && !currentChatId) {
        loadChat(response.data.chats[0].id);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  // Load a specific chat
  const loadChat = async (chatId) => {
    try {
      const response = await axios.get(`http://localhost:8000/api/chat/${chatId}`);
      setMessages(response.data.messages);
      setCurrentChatId(chatId);
      setScreenshot(null); // Reset screenshot when switching chats
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  // Create a new chat
  const createNewChat = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/chat/new');
      const newChatId = response.data.chat_id;
      
      // Update chats list
      const newChat = {
        id: newChatId,
        title: `Chat ${new Date().toLocaleString()}`,
        created_at: new Date().toISOString(),
        message_count: 0
      };
      
      setChats([newChat, ...chats]);
      setMessages([]);
      setCurrentChatId(newChatId);
      setScreenshot(null);
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
        { 
          role: 'user', 
          content: prompt || "What's on my screen?",
          timestamp: new Date().toISOString()
        }
      ]);
      
      const result = await axios.post('http://localhost:8000/api/analyze', {
        prompt: prompt || "Based on my current screen:",
        chat_id: currentChatId
      });
      
      // Update with AI response
      setMessages(prev => [
        ...prev,
        { 
          role: 'model', 
          content: result.data.analysis,
          timestamp: new Date().toISOString()
        }
      ]);
      
      setScreenshot(result.data.screenshot_path);
      
      // Refresh chats to update message counts
      fetchChats();
      
      // Clear prompt
      setPrompt('');
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { 
          role: 'model', 
          content: `Error: ${error.response?.data?.detail || error.message}`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:8000/token', 
        `username=${encodeURIComponent(loginEmail)}&password=${encodeURIComponent(loginPassword)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      localStorage.setItem('access_token', response.data.access_token);
      setIsAuthenticated(true);
      fetchUserData();
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please check your credentials.');
    }
  };

  // Registration function
  const handleRegister = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/register', {
        email: registerEmail,
        password: registerPassword
      });
      
      if (response.data.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        setIsAuthenticated(true);
        fetchUserData();
      }
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Registration failed. Please try a different email.');
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
    setUser(null);
    setChats([]);
    setMessages([]);
    setCurrentChatId(null);
    setScreenshot(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Show login/register screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl">
          <h1 className="text-3xl font-bold mb-8 text-center">AI Desktop Assistant</h1>
          
          {/* Login Form */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Login</h2>
            <div className="space-y-4">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Email"
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleLogin}
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded font-medium"
              >
                Sign In
              </button>
            </div>
          </div>
          
          {/* Registration Form */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Create Account</h2>
            <div className="space-y-4">
              <input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="Email"
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleRegister}
                className="w-full bg-green-600 hover:bg-green-700 py-3 rounded font-medium"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main application interface
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto flex flex-col h-screen">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold">AI Desktop Assistant</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">
              {user?.email}
            </span>
            <button 
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 py-2 px-4 rounded text-sm"
            >
              Logout
            </button>
          </div>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Chat sidebar */}
          <div className="w-1/4 pr-4 border-r border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Chats</h2>
              <button 
                onClick={createNewChat}
                className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded text-sm"
              >
                New Chat
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => loadChat(chat.id)}
                  className={`p-3 rounded cursor-pointer ${
                    currentChatId === chat.id 
                      ? 'bg-blue-600' 
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium truncate">
                    {chat.title || `Chat ${chat.id.substring(0, 8)}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(chat.created_at)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {chat.message_count} messages
                  </div>
                </div>
              ))}
              
              {chats.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No chats yet. Start a new chat!
                </div>
              )}
            </div>
          </div>
          
          {/* Main content */}
          <div className="w-3/4 pl-6 flex flex-col">
            {/* Chat header */}
            <div className="mb-4">
              <h2 className="text-xl font-bold">
                {chats.find(c => c.id === currentChatId)?.title || "New Chat"}
              </h2>
            </div>
            
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-4">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded-lg max-w-3xl ${
                    msg.role === 'user' 
                      ? 'bg-blue-800 ml-auto' 
                      : 'bg-gray-800 mr-auto'
                  }`}
                >
                  <div className="font-bold mb-1">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className="text-xs text-gray-400 mt-2">
                    {formatDate(msg.timestamp)}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-center p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              )}
              
              {messages.length === 0 && !isLoading && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-xl mb-2">👋 Welcome to AI Desktop Assistant!</div>
                  <p className="max-w-md mx-auto">
                    Capture your screen and get AI-powered assistance with your tasks.
                    Start by clicking "Send" or asking a question below.
                  </p>
                </div>
              )}
            </div>
            
            {/* Input area */}
            <div className="mt-auto pt-4 border-t border-gray-700">
              <div className="flex gap-4 mb-4">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask about your screen or give a command..."
                  className="flex-1 p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && analyzeScreen()}
                  disabled={isLoading}
                />
                
                <button 
                  onClick={analyzeScreen}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
              
              {/* Screenshot preview */}
              {screenshot && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2 text-gray-400">
                    Current Screen Reference
                  </div>
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
      </div>
    </div>
  );
}

export default App;
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

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
  
  // Overlay state
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const overlayRef = useRef(null);
  const appWindow = useRef(null);

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

  // Initialize window and authentication
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Only try to get the Tauri window if we're running in Tauri
        if (window.__TAURI__) {
          appWindow.current = getCurrentWebviewWindow();
          
          if (appWindow.current) {
            await appWindow.current.setIgnoreCursorEvents(true);
            await appWindow.current.hide();
          }
        }

        // Check authentication
        const token = localStorage.getItem('access_token');
        if (token) {
          setIsAuthenticated(true);
          await fetchUserData();
        }
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    initializeApp();
  }, []);

  // Add keyboard shortcut (Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        toggleOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayActive]);

  // Toggle overlay visibility
  const toggleOverlay = async () => {
    try {
      if (!appWindow.current && window.__TAURI__) {
        appWindow.current = getCurrentWebviewWindow();
      }
      
      const newState = !isOverlayActive;
      setIsOverlayActive(newState);
      
      if (window.__TAURI__ && appWindow.current) {
        if (newState) {
          await appWindow.current.show();
          await appWindow.current.setFocus();
          await appWindow.current.setIgnoreCursorEvents(false);
        } else {
          await appWindow.current.hide();
          await appWindow.current.setIgnoreCursorEvents(true);
        }
      }
    } catch (error) {
      console.error('Toggle overlay error:', error);
    }
  };

  // Fetch user data
  const fetchUserData = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/me');
      setUser(response.data);
      await fetchChats();
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
      setScreenshot(null);
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  // Create a new chat
  const createNewChat = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/chat/new');
      const newChatId = response.data.chat_id;
      
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
      setMessages(prev => [
        ...prev,
        { role: 'user', content: prompt || "What's on my screen?", timestamp: new Date().toISOString() }
      ]);
      
      const result = await axios.post('http://localhost:8000/api/analyze', {
        prompt: prompt || "Based on my current screen:",
        chat_id: currentChatId
      });
      
      setMessages(prev => [
        ...prev,
        { role: 'model', content: result.data.analysis, timestamp: new Date().toISOString() }
      ]);
      
      setScreenshot(result.data.screenshot_path);
      fetchChats();
      setPrompt('');
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: 'model', content: `Error: ${error.response?.data?.detail || error.message}`, timestamp: new Date().toISOString() }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Login
  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:8000/token', 
        `username=${encodeURIComponent(loginEmail)}&password=${encodeURIComponent(loginPassword)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      
      localStorage.setItem('access_token', response.data.access_token);
      setIsAuthenticated(true);
      fetchUserData();
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please check your credentials.');
    }
  };

  // Register
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

  // Logout
  const logout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
    setUser(null);
    setChats([]);
    setMessages([]);
    setCurrentChatId(null);
    setScreenshot(null);
  };

  // Date formatting
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Show login/register screen if not authenticated
 if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">AI Desktop Assistant</h1>
          
          {/* Login Form */}
          <div className="auth-section">
            <h2 className="auth-subtitle">Login</h2>
            <div className="auth-form">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Email"
                className="auth-input"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="auth-input"
              />
              <button
                onClick={handleLogin}
                className="auth-btn login-btn"
              >
                Sign In
              </button>
            </div>
          </div>
          
          {/* Registration Form */}
          <div className="auth-section">
            <h2 className="auth-subtitle">Create Account</h2>
            <div className="auth-form">
              <input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="Email"
                className="auth-input"
              />
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Password"
                className="auth-input"
              />
              <button
                onClick={handleRegister}
                className="auth-btn register-btn"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-wrapper ${isOverlayActive ? 'overlay-active' : ''}`}>
      {/* Floating Toggle Button */}
      {isOverlayActive && (
        <button 
          onClick={toggleOverlay}
          className="toggle-btn close-btn"
          title="Toggle Overlay"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {!isOverlayActive && (
        <button 
          onClick={toggleOverlay}
          className="toggle-btn open-btn"
          title="Show Assistant"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {isOverlayActive && (
        <div className="main-container">
          {/* Top Bar */}
          <div className="top-bar">
            <div className="user-info">
              <div className="user-icon">
                <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 005 10a6 6 0 0012 0c0-1.103-.298-2.14-.826-3.036A5 5 0 0010 11z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h1 className="app-title">AI Desktop Assistant</h1>
                <p className="user-email">{user?.email}</p>
              </div>
            </div>
            
            <div className="action-buttons">
              <button 
                onClick={toggleOverlay}
                className="action-btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Hide
              </button>
              <button 
                onClick={logout}
                className="action-btn"
              >
                Logout
              </button>
            </div>
          </div>
          
          <div className="content-container">
            {/* Chat Sidebar */}
            <div className="chat-sidebar">
              <div className="sidebar-header">
                <h2 className="sidebar-title">Conversations</h2>
                <button 
                  onClick={createNewChat}
                  className="new-chat-btn"
                  title="New Chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              
              <div className="chat-list">
                {chats.map(chat => (
                  <div 
                    key={chat.id} 
                    onClick={() => loadChat(chat.id)}
                    className={`chat-item ${currentChatId === chat.id ? 'active-chat' : ''}`}
                  >
                    <div className="chat-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div className="chat-details">
                      <div className="chat-title">
                        {chat.title || `Chat ${chat.id.substring(0, 6)}`}
                      </div>
                      <div className="chat-date">
                        {formatDate(chat.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
                
                {chats.length === 0 && (
                  <div className="empty-chats">
                    <div className="empty-text">No conversations yet</div>
                    <button 
                      onClick={createNewChat}
                      className="start-chat-btn"
                    >
                      Start your first chat
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Main Chat Area */}
            <div className="chat-main">
              {/* Chat Header */}
              <div className="chat-header">
                <h2 className="chat-title">
                  {chats.find(c => c.id === currentChatId)?.title || "New Chat"}
                </h2>
              </div>
              
              {/* Chat Messages */}
              <div className="messages-container">
                {messages.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`message ${msg.role === 'user' ? 'user-message' : 'model-message'}`}
                  >
                    <div className="message-icon">
                      {msg.role === 'user' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-sender">
                        {msg.role === 'user' ? 'You' : 'Aura'}
                      </div>
                      <div className="message-text">{msg.content}</div>
                      <div className="message-timestamp">
                        {formatDate(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="loading-indicator">
                    <div className="spinner"></div>
                    <span className="loading-text">Analyzing your screen...</span>
                  </div>
                )}
                
                {messages.length === 0 && !isLoading && (
                  <div className="welcome-screen">
                    <div className="welcome-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" className="welcome-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="welcome-title">Welcome to Aura</h3>
                    <p className="welcome-description">
                      Your AI desktop assistant. Capture your screen and get instant assistance with any task.
                    </p>
                    
                    <div className="feature-grid">
                      <div className="feature-card">
                        <div className="feature-header">
                          <svg xmlns="http://www.w3.org/2000/svg" className="feature-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="feature-title">Quick Start</span>
                        </div>
                        <p className="feature-desc">
                          Press <kbd className="shortcut-key">Ctrl+Shift+A</kbd> to toggle overlay
                        </p>
                      </div>
                      
                      <div className="feature-card">
                        <div className="feature-header">
                          <svg xmlns="http://www.w3.org/2000/svg" className="feature-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="feature-title">Capture Screen</span>
                        </div>
                        <p className="feature-desc">
                          Click "Send" to capture current screen and get AI analysis
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Input Area */}
              <div className="input-container">
                <div className="input-group">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask about your screen or give a command..."
                    className="chat-input"
                    onKeyDown={(e) => e.key === 'Enter' && analyzeScreen()}
                    disabled={isLoading}
                  />
                  
                  <button 
                    onClick={analyzeScreen}
                    disabled={isLoading}
                    className="send-btn"
                  >
                    {isLoading ? (
                      <div className="send-spinner"></div>
                    ) : (
                      <>
                        <span className="send-text">Send</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="send-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
                
                {/* Screenshot preview (30vw) */}
                {screenshot && (
                  <div className="screenshot-container">
                    <div className="screenshot-label">
                      Current Screen Reference
                    </div>
                    <div className="screenshot-preview">
                      <img 
                        src={`http://localhost:8000/screenshots/${screenshot.split('/').pop()}`} 
                        alt="Captured screen" 
                        className="screenshot-image"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
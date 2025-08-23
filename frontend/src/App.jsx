import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
//import { invoke } from '@tauri-apps/api/tauri';
import './App.css';

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
  const [response, setResponse] = useState(null);
  const [chats, setChats] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  
  // UI states
  const [inputPosition, setInputPosition] = useState({ x: 50, y: window.innerHeight - 100 });
  const [responsePosition, setResponsePosition] = useState({ x: 50, y: 100 });
  const [isDraggingInput, setIsDraggingInput] = useState(false);
  const [isDraggingResponse, setIsDraggingResponse] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isClickThrough, setIsClickThrough] = useState(false); // Start with false for auth forms
  
  const appWindow = useRef(null);
  const inputRef = useRef(null);

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
            // Start with click-through disabled for authentication but keep transparency
            await appWindow.current.setIgnoreCursorEvents(false);
            
            // Set window to always on top
            await appWindow.current.setAlwaysOnTop(true);
            
            // Remove window decorations for better transparency
            await appWindow.current.setDecorations(false);
          }
        }

        // Check authentication
        const token = localStorage.getItem('access_token');
        if (token) {
          setIsAuthenticated(true);
          await fetchUserData();
          // Enable click-through after authentication
          setClickThrough(true);
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
        toggleClickThrough();
      }
      
      // Focus input when slash key is pressed
      if (e.key === '/' && inputRef.current && isAuthenticated) {
        e.preventDefault();
        setClickThrough(false);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Toggle click-through state
  const toggleClickThrough = async () => {
    try {
      if (!appWindow.current && window.__TAURI__) {
        appWindow.current = getCurrentWebviewWindow();
      }
      
      if (window.__TAURI__ && appWindow.current) {
        const newClickThroughState = !isClickThrough;
        setIsClickThrough(newClickThroughState);
        
        await invoke('set_window_clickthrough', { 
          clickthrough: newClickThroughState 
        });
        
        await appWindow.current.setIgnoreCursorEvents(newClickThroughState);
      }
    } catch (error) {
      console.error('Toggle click-through error:', error);
    }
  };

  // Set click-through state
  const setClickThrough = async (clickthrough) => {
    try {
      if (!appWindow.current && window.__TAURI__) {
        appWindow.current = getCurrentWebviewWindow();
      }
      
      if (window.__TAURI__ && appWindow.current) {
        setIsClickThrough(clickthrough);
        
        await invoke('set_window_clickthrough', { 
          clickthrough: clickthrough 
        });
        
        await appWindow.current.setIgnoreCursorEvents(clickthrough);
      }
    } catch (error) {
      console.error('Set click-through error:', error);
    }
  };

  // Handle drag start for input container
  const handleInputDragStart = (e) => {
    // Only allow dragging from the container, not the input field
    if (e.target === inputRef.current) return;
    
    setIsDraggingInput(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  };

  // Handle drag start for response container
  const handleResponseDragStart = (e) => {
    setIsDraggingResponse(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  };

  // Handle drag for both input and response
  useEffect(() => {
    const handleDrag = (e) => {
      if (isDraggingInput) {
        setInputPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isDraggingResponse) {
        setResponsePosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleDragEnd = () => {
      setIsDraggingInput(false);
      setIsDraggingResponse(false);
    };

    if (isDraggingInput || isDraggingResponse) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDraggingInput, isDraggingResponse, dragOffset]);

  // Focus input when menu is closed and click-through is disabled
  useEffect(() => {
    if (!showMenu && !isClickThrough && inputRef.current && isAuthenticated) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [showMenu, isClickThrough, isAuthenticated]);

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
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  // Analyze the current screen
  const analyzeScreen = async () => {
    if (isLoading || !prompt.trim()) return;
    
    setIsLoading(true);
    try {
      const result = await axios.post('http://localhost:8000/api/analyze', {
        prompt: prompt.trim(),
        chat_id: null
      });
      
      setResponse({
        content: result.data.analysis,
        timestamp: new Date().toISOString()
      });
      
      setPrompt('');
      fetchChats();
    } catch (error) {
      setResponse({
        content: `Error: ${error.response?.data?.detail || error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load a specific chat
  const loadChat = async (chatId) => {
    try {
      const response = await axios.get(`http://localhost:8000/api/chat/${chatId}`);
      const messages = response.data.messages;
      if (messages.length > 0) {
        setResponse({
          content: messages[messages.length - 1].content,
          timestamp: messages[messages.length - 1].timestamp
        });
      }
      setShowMenu(false);
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  // Create a new chat
  const createNewChat = async () => {
    try {
      await axios.post('http://localhost:8000/api/chat/new');
      setResponse(null);
      setPrompt('');
      setShowMenu(false);
      fetchChats();
    } catch (error) {
      console.error('Error creating new chat:', error);
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
      // Enable click-through after successful login
      setClickThrough(true);
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
        // Enable click-through after successful registration
        setClickThrough(true);
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
    setResponse(null);
    setPrompt('');
    // Disable click-through for authentication forms
    setClickThrough(false);
  };

  // Date formatting
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Handle input focus
  const handleInputFocus = () => {
    setClickThrough(false);
  };

  // Handle input blur
  const handleInputBlur = () => {
    // Don't set click-through if menu is open
    if (!showMenu) {
      setClickThrough(true);
    }
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
    <div className="simplified-app">
      {/* Menu Button */}
      <button 
        className="menu-button"
        onClick={() => {
          setShowMenu(!showMenu);
          setClickThrough(false);
        }}
        title="Menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="menu-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Menu Dropdown */}
      {showMenu && (
        <div className="menu-dropdown">
          <div className="menu-header">
            <span className="menu-title">Aura Assistant</span>
            <button 
              className="menu-close"
              onClick={() => {
                setShowMenu(false);
                setClickThrough(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="menu-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="menu-section">
            <h3 className="menu-section-title">Conversations</h3>
            <button 
              className="menu-item new-chat-btn"
              onClick={createNewChat}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="menu-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
            
            <div className="chat-list">
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => loadChat(chat.id)}
                  className="chat-item"
                >
                  <div className="chat-title">
                    {chat.title || `Chat ${chat.id.substring(0, 6)}`}
                  </div>
                  <div className="chat-date">
                    {formatDate(chat.created_at)}
                  </div>
                </div>
              ))}
              
              {chats.length === 0 && (
                <div className="empty-chats">
                  No conversations yet
                </div>
              )}
            </div>
          </div>
          
          <div className="menu-section">
            <h3 className="menu-section-title">Settings</h3>
            <button 
              className="menu-item"
              onClick={toggleClickThrough}
            >
              {isClickThrough ? 'Disable Click-Through' : 'Enable Click-Through'}
            </button>
            <button 
              className="menu-item"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Response Container (Draggable) */}
      {response && (
        <div 
          className="response-container"
          style={{ left: `${responsePosition.x}px`, top: `${responsePosition.y}px` }}
          onMouseDown={handleResponseDragStart}
        >
          <div className="response-header">
            <span>Aura Response</span>
            <button 
              className="response-close"
              onClick={() => setResponse(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="response-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="response-content">
            {response.content}
          </div>
          <div className="response-footer">
            {formatDate(response.timestamp)}
          </div>
        </div>
      )}

      {/* Input Container (Draggable) */}
      <div 
        className="input-container"
        style={{ left: `${inputPosition.x}px`, top: `${inputPosition.y}px` }}
        onMouseDown={handleInputDragStart}
      >
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Aura about your screen... (Press '/' to focus)"
          className="chat-input"
          onKeyDown={(e) => e.key === 'Enter' && analyzeScreen()}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          disabled={isLoading}
        />
        
        <button 
          onClick={analyzeScreen}
          disabled={isLoading || !prompt.trim()}
          className="send-btn"
          title="Send prompt"
        >
          {isLoading ? (
            <div className="send-spinner"></div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="send-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default App;
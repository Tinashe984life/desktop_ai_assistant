import os
import datetime
import uuid
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import ImageGrab
import uvicorn
from google import genai
from dotenv import load_dotenv
import base64
from typing import Optional, Dict, Any, List
import json
from pathlib import Path

# Load environment variables
load_dotenv()

app = FastAPI()


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (e.g., screenshots)
app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")

# Initialize Gemini client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable not set")

client = genai.Client(api_key=GEMINI_API_KEY)

# Define the main system prompt
MAIN_SYSTEM_PROMPT = """
You are **Aura**, an advanced, genius-level AI desktop assistant designed to be a proactive and indispensable partner for a user on their computer. Your core function is to observe the user's screen and provide expert, context-aware assistance. You should be proactive, insightful, and capable of generating detailed, well-structured responses. You must always maintain a helpful, encouraging, and highly intelligent tone.

### General Principles and Persona

* **Be a Genius:** Your responses should reflect a deep understanding of the task at hand. Don't just give a quick answer; provide a comprehensive explanation, offer multiple solutions, and anticipate the user's needs.
* **Be Proactive:** Look for opportunities to help, even when not explicitly asked. If you see a user struggling with a piece of code, suggest an elegant solution. If you see them writing an email, offer to draft a more compelling version.
* **Be Detailed:** Your responses should be substantial. Aim for a minimum of two paragraphs and a maximum of three, unless the user's request is extremely simple. Use well-formatted paragraphs and code blocks to ensure clarity.
* **Be Context-Aware:** Always analyze the entire screen, including the open application, the window title, and the content itself. Use this information to inform and tailor your response precisely.

---

### Core Task-Specific Directives

Here are your specific instructions for different types of tasks.

#### 1. Coding and Software Development 🧑‍💻

When you detect a user is in an IDE (like VS Code, IntelliJ, etc.), a code editor, or a GitHub page, your expertise is paramount.

* **If the user asks for help:** Analyze the code and the current task. Provide a complete, rewritten code snippet if necessary, formatted with proper indentation and comments. Explain why the new code is better, detailing any bug fixes, performance improvements, or best-practice suggestions.
* **If no prompt is given:** Look for common coding problems. Is there a syntax error? A logical flaw? An inefficient loop? Suggest a fix and explain the reasoning. Offer to write a function or a piece of boilerplate code that seems relevant to the current project. For example, if you see them working with a database, you could offer to write a simple CRUD (Create, Read, Update, Delete) function.

#### 2. Email and Communication 📧

When you detect an email client, you should act as a brilliant communication consultant.

* **If the user asks for help:** Draft a complete, professional, and well-structured response based on the content of the email and the user's prompt. Go beyond a simple one-line reply. Provide a response that is polite, clear, and achieves the user's objective, whether it's setting up a meeting, declining an offer, or providing detailed information.
* **If no prompt is given:** Analyze the email and the sender. If it's a simple informational email, suggest a polite acknowledgment. If it's a request for action, draft a response that sets clear expectations and timelines. If it's a complex, multi-part email, offer to break it down and draft a response to each point, asking the user to confirm the details.

#### 3. General Chat and Research 📚

When the user is in a browser, a text document, or a similar general-purpose application, you should act as a fountain of knowledge.

* **If the user asks for help:** Provide a detailed and factual response to their question. If the question is about a topic on their screen, use that as the primary source and supplement it with your vast knowledge. Your response should be well-organized into paragraphs, possibly with bullet points or bolded keywords for clarity.
* **If no prompt is given:** Look at the user's current activity. Are they reading an article? Offer a concise but comprehensive summary of the main points. Are they on a shopping site? Suggest similar products or provide a quick comparison of the item on screen. Your goal is to be helpful without being intrusive.

#### 4. Studying and Learning 🧠

When you detect educational content such as lecture slides, academic articles, or textbooks, you are a world-class tutor.

* **If the user asks for help:** Summarize complex topics into easily digestible points. Create flashcards, practice questions, or a hierarchical outline of the content. Explain difficult concepts using analogies and examples.
* **If no prompt is given:** Scan the content and identify key themes, definitions, or equations. Offer a summary of the current slide or page, and suggest that you can create study materials to help them prepare for an exam. For example, if you see a physics equation, offer to explain the variables and its application.

---

### Important Technical Directives

* **Response Formatting:** Always use **Markdown** to format your responses. Use headings (`#`), bold text (`**`), and bullet points (`*`) where appropriate. Use code blocks (```python ... ```) for any code you generate. This is critical for making your responses readable and actionable.
* **Conversation Context:** You will be provided with the full chat history, including the user's previous prompts and your own responses. **Use this history to maintain context** and provide relevant follow-up information. Never start a new response as if the conversation just began. Refer back to previous points to demonstrate your understanding.
* **Handling Ambiguity:** If the user's intent is unclear, make an intelligent assumption based on the screen context and provide a relevant, helpful response. For example, if you see a user on a cooking website, and they ask "what should I do next?", assume they need instructions on the next step of the recipe.
* **No-Prompt Fallback:** If there is no specific prompt, your response should be a helpful suggestion or an offer to assist, always based on the screen. The default "I am ready to assist" should only be used as a last resort, when the screen content offers no clear direction. Instead, provide a proactive offer like, "It looks like you're working on a new email. Can I help you draft a professional response?"
"""

# Add these constants at the top of your file
SETTINGS_FILE = "assistant_settings.json"
CHAT_HISTORY_FILE = "chat_history.json"
DEFAULT_SETTINGS = {
    "model": "gemini-1.5-flash",
    "temperature": 0.7,
    "max_output_tokens": 8000,
    "default_prompt": MAIN_SYSTEM_PROMPT,
    "auto_capture": True,
    "recent_prompts": [],
    "custom_instructions": {
        "email": "Draft a professional email response",
        "coding": "Help improve this code",
        "summary": "Summarize this content",
        "custom": "Your custom instruction here"
    }
}

def load_settings() -> Dict[str, Any]:
    """Load settings from JSON file or return defaults"""
    try:
        if Path(SETTINGS_FILE).exists():
            with open(SETTINGS_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading settings: {e}")
    
    # Return defaults and create settings file
    save_settings(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS.copy()

def save_settings(settings: Dict[str, Any]):
    """Save settings to JSON file"""
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False

def load_chat_history() -> Dict[str, List[Dict[str, str]]]:
    """Load chat history from JSON file"""
    try:
        if Path(CHAT_HISTORY_FILE).exists():
            with open(CHAT_HISTORY_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading chat history: {e}")
    
    return {}

def save_chat_history(history: Dict[str, List[Dict[str, str]]]):
    """Save chat history to JSON file"""
    try:
        with open(CHAT_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving chat history: {e}")
        return False

# Initialize settings and chat history at startup
app_settings = load_settings()
chat_history = load_chat_history()

# Helper function to capture screenshot
def capture_screenshot():
    """Capture and save timestamped screenshot"""
    try:
        os.makedirs("screenshots", exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshots/screenshot_{timestamp}.png"
        
        screenshot = ImageGrab.grab()
        screenshot.save(filename)
        return {"status": "success", "path": filename}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Helper function to analyze screenshot with Gemini AI
def analyze_screenshot(image_path: str, prompt: Optional[str] = "", chat_id: Optional[str] = None):
    """Analyze screenshot with Gemini AI using settings and chat history"""
    if not os.path.exists(image_path):
        return {"status": "error", "message": f"Image not found: {image_path}"}
    
    try:
        # Read image data
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
        
        # Prepare conversation history
        messages = []
        
        # If chat_id exists, load its history
        if chat_id and chat_id in chat_history:
            messages = chat_history[chat_id].copy()
        
        # Add system prompt only for new chats
        if not messages:
            messages.append({
                "role": "user",
                "parts": [
                    {"text": app_settings['default_prompt']},
                    {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(image_data).decode("utf-8")}}
                ]
            })
        else:
            # For existing chats, add new user message with screenshot
            messages.append({
                "role": "user",
                "parts": [
                    {"text": prompt} if prompt else {"text": "Based on my current screen:"},
                    {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(image_data).decode("utf-8")}}
                ]
            })
        
        # Get settings values
        model = app_settings.get('model', 'gemini-1.5-flash')
        temperature = app_settings.get('temperature', 0.7)
        max_tokens = app_settings.get('max_output_tokens', 8000)
        
        # Generate content with Gemini
        try:
            response = client.models.generate_content(
                model=model,
                contents=messages,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens
                }
            )
        except TypeError:
            # Fallback if generation_config not supported
            response = client.models.generate_content(
                model=model,
                contents=messages
            )
        
        # Add AI response to messages
        messages.append({
            "role": "model",
            "parts": [{"text": response.text}]
        })
        
        # Update chat history
        if chat_id:
            chat_history[chat_id] = messages
            save_chat_history(chat_history)
        
        # Add to recent prompts if new
        if prompt and prompt not in app_settings['recent_prompts']:
            app_settings['recent_prompts'].insert(0, prompt)
            app_settings['recent_prompts'] = app_settings['recent_prompts'][:10]
            save_settings(app_settings)
        
        return {
            "status": "success",
            "analysis": response.text,
            "chat_id": chat_id or str(uuid.uuid4())
        }
    except Exception as e:
        return {"status": "error", "message": f"AI analysis failed: {str(e)}"}

# API endpoints
@app.get("/api/screenshot")
async def take_screenshot():
    """Endpoint to capture screenshot"""
    result = capture_screenshot()
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.post("/api/analyze")
async def analyze_screenshot_endpoint(request: Request):
    """
    Analyze screenshot with AI with chat context support
    
    Expects JSON: {
        "prompt": "User question (optional)",
        "chat_id": "Existing chat ID (optional)"
    }
    """
    data = await request.json()
    prompt = data.get("prompt", "")
    chat_id = data.get("chat_id", None)
    
    # Capture new screenshot
    screenshot_result = capture_screenshot()
    if screenshot_result["status"] != "success":
        raise HTTPException(status_code=500, detail=screenshot_result["message"])
    
    # Analyze the screenshot
    image_path = screenshot_result["path"]
    analysis_result = analyze_screenshot(image_path, prompt, chat_id)
    
    if analysis_result["status"] == "error":
        raise HTTPException(status_code=500, detail=analysis_result["message"])
    
    return {
        "status": "success",
        "screenshot_path": image_path,
        "prompt": prompt,
        "analysis": analysis_result["analysis"],
        "chat_id": analysis_result["chat_id"]
    }

@app.get("/api/chats")
async def list_chats():
    """List all available chat sessions"""
    return {
        "chats": list(chat_history.keys()),
        "count": len(chat_history)
    }

@app.get("/api/chat/{chat_id}")
async def get_chat(chat_id: str):
    """Get specific chat history"""
    if chat_id in chat_history:
        return chat_history[chat_id]
    raise HTTPException(status_code=404, detail="Chat not found")

@app.delete("/api/chat/{chat_id}")
async def delete_chat(chat_id: str):
    """Delete specific chat history"""
    if chat_id in chat_history:
        del chat_history[chat_id]
        save_chat_history(chat_history)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Chat not found")

@app.post("/api/chat/new")
async def create_new_chat():
    """Create a new chat session"""
    new_chat_id = str(uuid.uuid4())
    chat_history[new_chat_id] = []
    save_chat_history(chat_history)
    return {"chat_id": new_chat_id}

@app.get("/api/settings")
async def get_settings():
    """Return current application settings"""
    return app_settings

@app.post("/api/settings")
async def update_settings(request: Request):
    """Update application settings"""
    try:
        update_data = await request.json()
        
        # Update existing settings with new values
        for key, value in update_data.items():
            if key in app_settings:
                # Handle nested dictionaries
                if isinstance(app_settings[key], dict) and isinstance(value, dict):
                    app_settings[key].update(value)
                else:
                    app_settings[key] = value
        
        # Save to disk
        save_settings(app_settings)
        
        return {"status": "success", "settings": app_settings}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid settings: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
import os
import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import ImageGrab
import uvicorn
from google import genai
from dotenv import load_dotenv
import base64
from typing import Optional
import json
from pathlib import Path
from typing import Dict, Any

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

# Initialize Gemini client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable not set")

#genai.configure(api_key=GEMINI_API_KEY)
client = genai.Client(api_key=GEMINI_API_KEY)

# Define the main system prompt
MAIN_SYSTEM_PROMPT = """
You are an intelligent, helpful, and proactive AI desktop assistant. Your primary goal is to analyze the user's current screen and provide context-aware assistance.

Your main task is to identify what the user is doing on their computer and offer a relevant, concise, and helpful suggestion. Your response should be a single, focused piece of advice, a summary, or a drafted response.

Here are your specific rules and behaviors based on what you see on the screen:

1.  **If the user is reading a document, article, or webpage:** Provide a brief summary of the key points.
2.  **If the user is viewing an email:** Draft a professional and polite response. If the email is a simple informational message, suggest a concise acknowledgment or action item.
3.  **If the user is looking at a presentation, slideshow, or study materials:** Generate a set of key study notes or a bullet-point summary of the current slide.
4.  **If the user is writing or editing code:** Suggest code improvements, identify potential bugs, or propose a way to complete the current function.
5.  **If the user is writing a document or message (e.g., in a text editor, Google Docs):** Offer suggestions for improving grammar, tone, or word choice, or suggest a relevant next sentence.
6.  **If the user is performing a general task and no clear intent can be determined:** Provide a simple, encouraging message and state that you are ready to help. For example: "I am ready to assist. Please provide a specific task or question."

Always keep your responses brief and to the point. Do not engage in a conversation or ask for more information unless it is absolutely necessary. Your primary function is to provide an immediate, helpful response to the user's current task.
"""

# Add these constants at the top of your file
SETTINGS_FILE = "assistant_settings.json"
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

# Initialize settings at startup
app_settings = load_settings()

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
def analyze_screenshot(image_path: str, prompt: Optional[str] = ""):
    """Analyze screenshot with Gemini AI using settings"""
    if not os.path.exists(image_path):
        return {"status": "error", "message": f"Image not found: {image_path}"}
    
    try:
        # Read image data
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
        
        # Combine prompts
        combined_prompt = app_settings['default_prompt']
        if prompt:
            combined_prompt += f"\n\nUser's specific request: {prompt}"
        
        # Create content input
        content_input = [
            {
                "role": "user",
                "parts": [
                    {"text": combined_prompt},
                    {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(image_data).decode("utf-8")}}
                ]
            }
        ]
        
        # Get settings values
        model = app_settings.get('model', 'gemini-1.5-flash')
        temperature = app_settings.get('temperature', 0.7)
        max_tokens = app_settings.get('max_output_tokens', 8000)
        
        # Add generation config if supported
        try:
            response = client.models.generate_content(
                model=model,
                contents=content_input,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens
                }
            )
        except TypeError:
            # Fallback if generation_config not supported
            response = client.models.generate_content(
                model=model,
                contents=content_input
            )
        
        # Add to recent prompts if new
        if prompt and prompt not in app_settings['recent_prompts']:
            app_settings['recent_prompts'].insert(0, prompt)
            # Keep only last 10 prompts
            app_settings['recent_prompts'] = app_settings['recent_prompts'][:10]
            save_settings(app_settings)
        
        return {"status": "success", "analysis": response.text}
    except Exception as e:
        return {"status": "error", "message": f"AI analysis failed: {str(e)}"}

# Define API endpoints
@app.get("/api/screenshot")
async def take_screenshot():
    """Endpoint to capture screenshot"""
    result = capture_screenshot()
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.post("/api/analyze-screenshot")
async def analyze_latest_screenshot(request: Request):
    """
    Analyze the latest screenshot with AI
    
    Expects JSON: {"prompt": "Your question about the screenshot" or None}
    """
    data = await request.json()
    # The prompt is now optional
    prompt = data.get("prompt", "")
    
    # Capture new screenshot for current context
    screenshot_result = capture_screenshot()
    if screenshot_result["status"] != "success":
        raise HTTPException(status_code=500, detail=screenshot_result["message"])
    
    # Analyze the screenshot
    image_path = screenshot_result["path"]
    analysis_result = analyze_screenshot(image_path, prompt)
    
    if analysis_result["status"] == "error":
        raise HTTPException(status_code=500, detail=analysis_result["message"])
    
    return {
        "status": "success",
        "screenshot_path": image_path,
        "prompt": prompt,
        "analysis": analysis_result["analysis"]
    }

# Add these new API endpoints
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
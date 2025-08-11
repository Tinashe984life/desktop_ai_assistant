import os
import uuid
import json
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import ImageGrab
import uvicorn
from google import genai
from dotenv import load_dotenv
import base64
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import sessionmaker, Session, declarative_base, relationship
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime as dt, timedelta  # Renamed to avoid conflict
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

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

# Mount screenshots directory
app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")

# Initialize Gemini client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable not set")

client = genai.Client(api_key=GEMINI_API_KEY)

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./assistant.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT setup
SECRET_KEY = os.getenv("JWT_SECRET", "your_secret_key_here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Database models
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(String, default=lambda: dt.utcnow().isoformat())
    chats = relationship("ChatSession", back_populates="user")
    settings = relationship("UserSettings", back_populates="user", uselist=False)

class UserSettings(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    model = Column(String, default="gemini-1.5-flash")
    temperature = Column(String, default="0.7")
    max_output_tokens = Column(Integer, default=8000)
    auto_capture = Column(Boolean, default=True)
    recent_prompts = Column(Text, default=json.dumps([]))
    custom_instructions = Column(Text, default=json.dumps({
        "email": "Draft a professional email response",
        "coding": "Help improve this code",
        "summary": "Summarize this content",
        "custom": "Your custom instruction here"
    }))
    user = relationship("User", back_populates="settings")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(String, default=lambda: dt.utcnow().isoformat())
    title = Column(String, default="New Chat")
    messages = relationship("ChatMessage", back_populates="chat")
    user = relationship("User", back_populates="chats")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(String, ForeignKey("chat_sessions.id"))
    role = Column(String)  # 'user' or 'model'
    content = Column(Text)
    screenshot_path = Column(String, nullable=True)
    timestamp = Column(String, default=lambda: dt.utcnow().isoformat())
    chat = relationship("ChatSession", back_populates="messages")

# Create tables
Base.metadata.create_all(bind=engine)

# Define the main system prompt
MAIN_SYSTEM_PROMPT = """
You are Aura, an advanced, genius-level AI desktop assistant designed to be a proactive and indispensable partner for a user on their computer. Your core function is to observe the user's screen and provide expert, context-aware assistance. You should be proactive, insightful, and capable of generating detailed, well-structured responses. You must always maintain a helpful, encouraging, and highly intelligent tone.

General Principles and Persona
Be a Genius: Your responses should reflect a deep understanding of the task at hand. Don't just give a quick answer; provide a comprehensive explanation, offer multiple solutions, and anticipate the user's needs.

Be Proactive: Look for opportunities to help, even when not explicitly asked. If you see a user struggling with a piece of code, suggest an elegant solution. If you see them writing an email, offer to draft a more compelling version.

Be Detailed: Your responses should be substantial. Aim for a minimum of two paragraphs and a maximum of three, unless the user's request is extremely simple. Use well-formatted paragraphs and code blocks to ensure clarity.

Be Context-Aware: Always analyze the entire screen, including the open application, the window title, and the content itself. Use this information to inform and tailor your response precisely.

Core Task-Specific Directives
Here are your specific instructions for different types of tasks.

1. Coding and Software Development 🧑‍💻
When you detect a user is in an IDE (like VS Code, IntelliJ, etc.), a code editor, or a GitHub page, your expertise is paramount.

If the user asks for help: Analyze the code and the current task. Provide a complete, rewritten code snippet if necessary, formatted with proper indentation and comments. Explain why the new code is better, detailing any bug fixes, performance improvements, or best-practice suggestions.

If no prompt is given: Look for common coding problems. Is there a syntax error? A logical flaw? An inefficient loop? Suggest a fix and explain the reasoning. Offer to write a function or a piece of boilerplate code that seems relevant to the current project. For example, if you see them working with a database, you could offer to write a simple CRUD (Create, Read, Update, Delete) function.

2. Email and Communication 📧
When you detect an email client, you should act as a brilliant communication consultant.

If the user asks for help: Draft a complete, professional, and well-structured response based on the content of the email and the user's prompt. Go beyond a simple one-line reply. Provide a response that is polite, clear, and achieves the user's objective, whether it's setting up a meeting, declining an offer, or providing detailed information.

If no prompt is given: Analyze the email and the sender. If it's a simple informational email, suggest a polite acknowledgment. If it's a request for action, draft a response that sets clear expectations and timelines. If it's a complex, multi-part email, offer to break it down and draft a response to each point, asking the user to confirm the details.

3. General Chat and Research 📚
When the user is in a browser, a text document, or a similar general-purpose application, you should act as a fountain of knowledge.

If the user asks for help: Provide a detailed and factual response to their question. If the question is about a topic on their screen, use that as the primary source and supplement it with your vast knowledge. Your response should be well-organized into paragraphs, possibly with bullet points or bolded keywords for clarity.

If no prompt is given: Look at the user's current activity. Are they reading an article? Offer a concise but comprehensive summary of the main points. Are they on a shopping site? Suggest similar products or provide a quick comparison of the item on screen. Your goal is to be helpful without being intrusive.

4. Studying and Learning 🧠
When you detect educational content such as lecture slides, academic articles, or textbooks, you are a world-class tutor.

If the user asks for help: Summarize complex topics into easily digestible points. Create flashcards, practice questions, or a hierarchical outline of the content. Explain difficult concepts using analogies and examples.

If no prompt is given: Scan the content and identify key themes, definitions, or equations. Offer a summary of the current slide or page, and suggest that you can create study materials to help them prepare for an exam. For example, if you see a physics equation, offer to explain the variables and its application.

Important Technical Directives
Response Formatting: Always use Markdown to format your responses. Use headings (#), bold text (**), and bullet points (*) where appropriate. Use code blocks (python ... ) for any code you generate. This is critical for making your responses readable and actionable.

Conversation Context: You will be provided with the full chat history, including the user's previous prompts and your own responses. Use this history to maintain context and provide relevant follow-up information. Never start a new response as if the conversation just began. Refer back to previous points to demonstrate your understanding.

Handling Ambiguity: If the user's intent is unclear, make an intelligent assumption based on the screen context and provide a relevant, helpful response. For example, if you see a user on a cooking website, and they ask "what should I do next?", assume they need instructions on the next step of the recipe.

No-Prompt Fallback: If there is no specific prompt, your response should be a helpful suggestion or an offer to assist, always based on the screen. The default "I am ready to assist" should only be used as a last resort, when the screen content offers no clear direction. Instead, provide a proactive offer like, "It looks like you're working on a new email. Can I help you draft a professional response?"
"""

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = dt.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

# Helper function to capture screenshot
def capture_screenshot():
    """Capture and save timestamped screenshot"""
    try:
        os.makedirs("screenshots", exist_ok=True)
        timestamp = dt.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshots/screenshot_{timestamp}.png"
        
        screenshot = ImageGrab.grab()
        screenshot.save(filename)
        return {"status": "success", "path": filename}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Helper function to analyze screenshot with Gemini AI
def analyze_screenshot(
    image_path: str, 
    prompt: Optional[str] = "", 
    chat_id: Optional[str] = None,
    user: User = None,
    db: Session = None
):
    """Analyze screenshot with Gemini AI using settings and chat history"""
    if not os.path.exists(image_path):
        return {"status": "error", "message": f"Image not found: {image_path}"}
    
    try:
        # Read image data
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
        
        # Get user settings
        settings = user.settings if user and user.settings else None
        model = "gemini-1.5-flash"
        temperature = 0.7
        max_tokens = 8000
        custom_instructions = {}
        
        if settings:
            model = settings.model or model
            temperature = float(settings.temperature) if settings.temperature else temperature
            max_tokens = settings.max_output_tokens or max_tokens
            if settings.custom_instructions:
                try:
                    custom_instructions = json.loads(settings.custom_instructions)
                except:
                    custom_instructions = {}
        
        # Prepare conversation history
        messages = []
        
        # Load chat history if chat_id provided
        if chat_id and db:
            chat_messages = db.query(ChatMessage).filter(
                ChatMessage.chat_id == chat_id
            ).order_by(ChatMessage.timestamp.asc()).all()
            
            for msg in chat_messages:
                parts = [{"text": msg.content}]
                if msg.screenshot_path:
                    try:
                        with open(msg.screenshot_path, "rb") as img_file:
                            img_data = img_file.read()
                        parts.append({
                            "inline_data": {
                                "mime_type": "image/png", 
                                "data": base64.b64encode(img_data).decode("utf-8")
                            }
                        })
                    except:
                        pass
                messages.append({
                    "role": msg.role,
                    "parts": parts
                })
        
        # For new chats, add system prompt
        if not messages:
            messages.append({
                "role": "user",
                "parts": [
                    {"text": MAIN_SYSTEM_PROMPT},
                    {"inline_data": {
                        "mime_type": "image/png", 
                        "data": base64.b64encode(image_data).decode("utf-8")
                    }}
                ]
            })
        else:
            # For existing chats, add new user message with screenshot
            user_message = {"role": "user", "parts": []}
            if prompt:
                user_message["parts"].append({"text": prompt})
            user_message["parts"].append({
                "inline_data": {
                    "mime_type": "image/png", 
                    "data": base64.b64encode(image_data).decode("utf-8")
                }
            })
            messages.append(user_message)
        
        # Generate content with Gemini
        try:
            response = client.models.generate_content(
                model=model,
                contents=messages,
                
            )
            ai_response = response.text
        except Exception as e:
            ai_response = f"AI analysis failed: {str(e)}"
        
        # Save to database if user and db are available
        if db and user:
            # Create new chat if needed
            if not chat_id:
                new_chat = ChatSession(
                    user_id=user.id,
                    title=f"Chat {dt.utcnow().strftime('%Y-%m-%d %H:%M')}"
                )
                db.add(new_chat)
                db.commit()
                chat_id = new_chat.id
            
            # Save user message
            if prompt or messages:
                user_msg = ChatMessage(
                    chat_id=chat_id,
                    role="user",
                    content=prompt or "Based on my current screen",
                    screenshot_path=image_path
                )
                db.add(user_msg)
            
            # Save AI response
            ai_msg = ChatMessage(
                chat_id=chat_id,
                role="model",
                content=ai_response,
                screenshot_path=None
            )
            db.add(ai_msg)
            db.commit()
        
        # Update recent prompts in settings
        if settings and prompt:
            try:
                recent_prompts = json.loads(settings.recent_prompts) if settings.recent_prompts else []
                if prompt not in recent_prompts:
                    recent_prompts.insert(0, prompt)
                    recent_prompts = recent_prompts[:10]
                    settings.recent_prompts = json.dumps(recent_prompts)
                    db.commit()
            except:
                pass
        
        return {
            "status": "success",
            "analysis": ai_response,
            "chat_id": chat_id
        }
    except Exception as e:
        return {"status": "error", "message": f"AI analysis failed: {str(e)}"}

# Authentication endpoints
@app.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/register")
async def register_user(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    
    # Check if user exists
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_password = get_password_hash(password)
    new_user = User(email=email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create default settings
    default_settings = UserSettings(
        user_id=new_user.id,
        model="gemini-1.5-flash",
        temperature="0.7",
        max_output_tokens=8000,
        auto_capture=True,
        recent_prompts=json.dumps([]),
        custom_instructions=json.dumps({
            "email": "Draft a professional email response",
            "coding": "Help improve this code",
            "summary": "Summarize this content",
            "custom": "Your custom instruction here"
        })
    )
    db.add(default_settings)
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": str(new_user.id)})
    
    return {
        "status": "success",
        "user_id": new_user.id,
        "access_token": access_token,
        "token_type": "bearer"
    }

@app.get("/api/me")
def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": current_user.created_at,
        "settings": {
            "model": settings.model if settings else "gemini-1.5-flash",
            "temperature": settings.temperature if settings else "0.7",
            "max_output_tokens": settings.max_output_tokens if settings else 8000,
            "auto_capture": settings.auto_capture if settings else True,
            "recent_prompts": json.loads(settings.recent_prompts) if settings and settings.recent_prompts else [],
            "custom_instructions": json.loads(settings.custom_instructions) if settings and settings.custom_instructions else {}
        } if settings else {}
    }

# API endpoints
@app.get("/api/screenshot")
async def take_screenshot():
    """Endpoint to capture screenshot"""
    result = capture_screenshot()
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.post("/api/analyze")
async def analyze_screenshot_endpoint(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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
    analysis_result = analyze_screenshot(
        image_path, 
        prompt, 
        chat_id,
        current_user,
        db
    )
    
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
async def list_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all available chat sessions for current user"""
    chats = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc()).all()
    
    return {
        "chats": [{
            "id": chat.id,
            "title": chat.title,
            "created_at": chat.created_at,
            "message_count": len(chat.messages)
        } for chat in chats],
        "count": len(chats)
    }

@app.get("/api/chat/{chat_id}")
async def get_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific chat history"""
    chat = db.query(ChatSession).filter(
        ChatSession.id == chat_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    messages = db.query(ChatMessage).filter(
        ChatMessage.chat_id == chat_id
    ).order_by(ChatMessage.timestamp.asc()).all()
    
    return {
        "id": chat.id,
        "title": chat.title,
        "created_at": chat.created_at,
        "messages": [{
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "screenshot_path": msg.screenshot_path,
            "timestamp": msg.timestamp
        } for msg in messages]
    }

@app.delete("/api/chat/{chat_id}")
async def delete_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete specific chat history"""
    chat = db.query(ChatSession).filter(
        ChatSession.id == chat_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Delete messages first
    db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).delete()
    # Then delete the chat
    db.delete(chat)
    db.commit()
    
    return {"status": "success"}

@app.post("/api/chat/new")
async def create_new_chat(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new chat session"""
    new_chat = ChatSession(
        user_id=current_user.id,
        title=f"Chat {dt.utcnow().strftime('%Y-%m-%d %H:%M')}"
    )
    db.add(new_chat)
    db.commit()
    
    return {"chat_id": new_chat.id}

@app.get("/api/settings")
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return current application settings"""
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    
    return {
        "model": settings.model,
        "temperature": settings.temperature,
        "max_output_tokens": settings.max_output_tokens,
        "auto_capture": settings.auto_capture,
        "recent_prompts": json.loads(settings.recent_prompts) if settings.recent_prompts else [],
        "custom_instructions": json.loads(settings.custom_instructions) if settings.custom_instructions else {}
    }

@app.post("/api/settings")
async def update_settings(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update application settings"""
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    
    try:
        update_data = await request.json()
        
        # Update settings
        if "model" in update_data:
            settings.model = update_data["model"]
        if "temperature" in update_data:
            settings.temperature = str(update_data["temperature"])
        if "max_output_tokens" in update_data:
            settings.max_output_tokens = int(update_data["max_output_tokens"])
        if "auto_capture" in update_data:
            settings.auto_capture = bool(update_data["auto_capture"])
        if "recent_prompts" in update_data:
            settings.recent_prompts = json.dumps(update_data["recent_prompts"])
        if "custom_instructions" in update_data:
            settings.custom_instructions = json.dumps(update_data["custom_instructions"])
        
        db.commit()
        return {"status": "success", "settings": {
            "model": settings.model,
            "temperature": settings.temperature,
            "max_output_tokens": settings.max_output_tokens,
            "auto_capture": settings.auto_capture,
            "recent_prompts": json.loads(settings.recent_prompts) if settings.recent_prompts else [],
            "custom_instructions": json.loads(settings.custom_instructions) if settings.custom_instructions else {}
        }}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid settings: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
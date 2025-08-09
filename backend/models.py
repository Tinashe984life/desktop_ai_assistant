from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    settings = relationship("UserSettings", back_populates="user", uselist=False)
    chats = relationship("ChatSession", back_populates="user")

class UserSettings(Base):
    __tablename__ = 'user_settings'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    model = Column(String(50), default="gemini-1.5-flash")
    temperature = Column(Integer, default=0.7)
    max_output_tokens = Column(Integer, default=8000)
    auto_capture = Column(Integer, default=1)  # 1 for True, 0 for False
    custom_instructions = Column(Text)
    user = relationship("User", back_populates="settings")

class ChatSession(Base):
    __tablename__ = 'chat_sessions'
    id = Column(String(36), primary_key=True, index=True)  # UUID
    user_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    title = Column(String(255))
    messages = relationship("ChatMessage", back_populates="chat")
    user = relationship("User", back_populates="chats")

class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(String(36), ForeignKey('chat_sessions.id'))
    role = Column(String(10))  # 'user' or 'model'
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    screenshot_path = Column(String(255))
    chat = relationship("ChatSession", back_populates="messages")
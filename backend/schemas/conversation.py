from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)
    timestamp: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=100)
    messages: List[Message] = Field(..., min_length=1)


class ConversationListItem(BaseModel):
    """목록 응답에는 messages를 포함하지 않는다. 전체 내용은 GET /api/conversations/{id}로 조회."""
    id: str
    title: str
    message_count: int
    preview: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ConversationOut(BaseModel):
    id: str
    title: str
    messages: List[Message]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

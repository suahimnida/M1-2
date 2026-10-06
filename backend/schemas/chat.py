from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, examples=["오늘 컨디션에 맞는 운동 추천해줘"])
    conversation_id: Optional[str] = Field(None, description="이어서 대화할 경우 대화 ID")


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    summary_text: str = Field(..., description="이번 답변에 주입된 데이터 요약")

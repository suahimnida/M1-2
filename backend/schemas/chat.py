from typing import Literal, Optional

from pydantic import BaseModel, Field

# 화면의 빠른 버튼으로 보낸 요청 종류
ChatMode = Literal["workout", "juice", "trend"]


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, examples=["오늘 컨디션 어때?"])
    conversation_id: Optional[str] = Field(None, description="이어서 대화할 경우 대화 ID")
    mode: Optional[ChatMode] = Field(
        None,
        description="빠른 버튼 요청일 때만: workout(오늘 운동 추천), juice(주스 레시피), trend(최근 흐름 분석). 일반 채팅은 비워 둠",
    )


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    summary_text: str = Field(..., description="이번 답변에 주입된 데이터 요약")

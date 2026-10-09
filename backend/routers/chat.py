import logging

from fastapi import APIRouter, HTTPException

from core.utils import now_iso
from schemas.chat import ChatRequest, ChatResponse
from services import ai_service, conversation_service, summary_service

router = APIRouter(prefix="/api/chat", tags=["AI 채팅"])
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse, summary="AI 대화 (데이터 요약 컨텍스트 주입 + 자동 저장)")
def chat(body: ChatRequest):
    # 1) 데이터 요약 조회
    summary = summary_service.build_summary()

    # 2) 이어지는 대화라면 이전 메시지 불러오기
    history = []
    if body.conversation_id:
        conv = conversation_service.get_conversation(body.conversation_id)
        if not conv:
            raise HTTPException(404, "대화를 찾을 수 없습니다.")
        history = conv.get("messages", [])

    # 3) 요약을 시스템 프롬프트에 넣어 AI 호출 (버튼 요청이면 mode에 맞는 작업 지시)
    try:
        reply = ai_service.chat(summary["text"], history, body.message, body.mode)
    except Exception as e:
        logger.exception("AI 호출 실패")
        raise HTTPException(502, f"AI 응답을 받지 못했습니다: {e}")

    # 4) conversations에 자동 저장
    now = now_iso()
    new_messages = [
        {"role": "user", "content": body.message, "timestamp": now},
        {"role": "assistant", "content": reply, "timestamp": now_iso()},
    ]
    if body.conversation_id:
        conv_id = body.conversation_id
        conversation_service.append_messages(conv_id, new_messages)
    else:
        conv_id = conversation_service.create_conversation(new_messages)["id"]

    return ChatResponse(reply=reply, conversation_id=conv_id, summary_text=summary["text"])

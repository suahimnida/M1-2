from typing import List

from fastapi import APIRouter, HTTPException

from schemas.conversation import ConversationCreate, ConversationListItem, ConversationOut
from services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["대화 기록"])


@router.post("", response_model=ConversationOut, status_code=201, summary="대화 저장")
def create_conversation(body: ConversationCreate):
    messages = [m.model_dump() for m in body.messages]
    return conversation_service.create_conversation(messages, body.title)


@router.get("", response_model=List[ConversationListItem], summary="대화 목록 (messages 미포함)")
def list_conversations():
    return conversation_service.list_conversations()


@router.get("/{conv_id}", response_model=ConversationOut, summary="특정 대화 전체 메시지 조회")
def get_conversation(conv_id: str):
    conv = conversation_service.get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    return conv


@router.delete("/{conv_id}", summary="대화 삭제")
def delete_conversation(conv_id: str):
    if not conversation_service.delete_conversation(conv_id):
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    return {"deleted": conv_id}

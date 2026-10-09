import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import ValidationError

from schemas.data import ConditionCreate, ConditionOut, ConditionUpdate
from services import data_service, playlist_service, summary_service

router = APIRouter(prefix="/api/data", tags=["컨디션 데이터"])
logger = logging.getLogger(__name__)


# /summary는 /{id}보다 먼저 선언해야 경로가 겹치지 않는다
@router.get("/summary", summary="데이터 요약 (프롬프트 주입용)")
def get_summary():
    return summary_service.build_summary()


@router.post("", response_model=ConditionOut, status_code=201, summary="컨디션 기록 추가")
def create_data(item: ConditionCreate, background: BackgroundTasks):
    if data_service.find_by_date(item.date.isoformat()):
        raise HTTPException(409, f"{item.date} 기록이 이미 있습니다. 수정(PUT)을 사용하세요.")
    created = data_service.create_data(item)
    background.add_task(playlist_service.save_if_stressful, created)
    return created


@router.get("", response_model=List[ConditionOut], summary="컨디션 기록 목록 (최신순)")
def list_data(limit: Optional[int] = Query(None, ge=1, le=1000)):
    # 기록 하나가 형식에 맞지 않아도 목록 전체가 실패하지 않도록 하나씩 검사
    valid = []
    for row in data_service.list_data(limit):
        try:
            valid.append(ConditionOut.model_validate(row))
        except ValidationError as e:
            logger.warning("읽을 수 없는 기록을 건너뜀 (id=%s, date=%s): %s",
                           row.get("id"), row.get("date"), e.errors()[:3])
    return valid


@router.put("/{doc_id}", response_model=ConditionOut, summary="컨디션 기록 수정")
def update_data(doc_id: str, item: ConditionUpdate, background: BackgroundTasks):
    if item.date:
        same = data_service.find_by_date(item.date.isoformat())
        if same and same["id"] != doc_id:
            raise HTTPException(409, f"{item.date} 기록이 이미 있습니다.")
    updated = data_service.update_data(doc_id, item)
    if not updated:
        raise HTTPException(404, "기록을 찾을 수 없습니다.")
    background.add_task(playlist_service.save_if_stressful, updated)
    return updated


@router.delete("/{doc_id}", summary="컨디션 기록 삭제")
def delete_data(doc_id: str):
    if not data_service.delete_data(doc_id):
        raise HTTPException(404, "기록을 찾을 수 없습니다.")
    return {"deleted": doc_id}

"""컨디션 기록 스키마. 과제의 (date, value, memo)에 추천용 필드를 더했다."""
import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field


class ConditionBase(BaseModel):
    date: dt.date = Field(..., description="기록 날짜 (YYYY-MM-DD)", examples=["2026-10-06"])
    value: int = Field(..., ge=1, le=10, description="오늘 컨디션 점수 (1~10)", examples=[7])
    memo: str = Field("", max_length=300, description="메모", examples=["어깨가 좀 뻐근함"])
    stress: int = Field(5, ge=1, le=10, description="스트레스 (1~10)", examples=[8])
    sleep_hours: float = Field(7.0, ge=0, le=24, description="수면 시간", examples=[5.5])
    goal: Optional[str] = Field(None, max_length=50, description="오늘의 목적", examples=["체지방 감량"])


class ConditionCreate(ConditionBase):
    pass


class ConditionUpdate(BaseModel):
    """수정은 보낸 필드만 반영한다."""
    date: Optional[dt.date] = None
    value: Optional[int] = Field(None, ge=1, le=10)
    memo: Optional[str] = Field(None, max_length=300)
    stress: Optional[int] = Field(None, ge=1, le=10)
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    goal: Optional[str] = Field(None, max_length=50)


class ConditionOut(ConditionBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

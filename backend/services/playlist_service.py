"""스트레스 많은 날 자동 음악 저장 (playlists 컬렉션)."""
import logging
import random
from typing import List, Optional

from firebase_admin import firestore

from core import config
from core.firebase import get_db
from core.utils import now_iso
from services import ai_service

COLLECTION = "playlists"
logger = logging.getLogger(__name__)

# AI가 응답하지 못할 때(혼잡, 한도 초과 등) 대신 저장할 기본 곡들
FALLBACK_SONGS = [
    {"title": "Weightless", "artist": "Marconi Union", "reason": "느린 템포가 긴장을 천천히 풀어줘요"},
    {"title": "밤편지", "artist": "아이유", "reason": "잔잔한 멜로디로 마음을 가라앉혀줘요"},
    {"title": "Clair de Lune", "artist": "Claude Debussy", "reason": "부드러운 피아노가 호흡을 느리게 해줘요"},
    {"title": "River Flows in You", "artist": "이루마", "reason": "편안한 피아노 선율로 머리를 비우기 좋아요"},
    {"title": "Bloom", "artist": "The Paper Kites", "reason": "따뜻한 어쿠스틱 사운드로 기분을 전환해줘요"},
    {"title": "Square (2017)", "artist": "백예린", "reason": "몽글몽글한 분위기로 쉬어가기 좋아요"},
    {"title": "Let It Be", "artist": "The Beatles", "reason": "익숙한 위로의 노래예요"},
    {"title": "Holo", "artist": "이하이", "reason": "혼자인 시간에 위로가 되는 노래예요"},
]


def _col():
    return get_db().collection(COLLECTION)


def _exists_for(data_id: str) -> bool:
    return any(True for _ in _col().where("data_id", "==", data_id).limit(1).stream())


def save_if_stressful(entry: dict) -> Optional[dict]:
    """기록의 스트레스가 기준 이상이면 곡 목록을 생성해 저장. 백그라운드 작업으로 실행된다."""
    try:
        stress = int(entry.get("stress") or 0)
        if stress < config.STRESS_THRESHOLD:
            return None
        if _exists_for(entry["id"]):
            logger.info("이미 음악이 저장된 기록: %s", entry["id"])
            return None

        source = "ai"
        try:
            songs = ai_service.generate_playlist(entry)
        except Exception:
            logger.exception("AI 플레이리스트 생성 실패 → 기본 곡으로 저장")
            songs = []
        if not songs:
            source = "fallback"
            songs = random.sample(FALLBACK_SONGS, 5)

        payload = {
            "date": entry["date"],
            "stress": stress,
            "data_id": entry["id"],
            "songs": songs,
            "source": source,
            "created_at": now_iso(),
        }
        ref = _col().document()
        ref.set(payload)
        logger.info("스트레스 날 음악 저장 완료: %s (%s)", entry["date"], source)
        return {"id": ref.id, **payload}
    except Exception:
        # 백그라운드 작업이라 여기서 에러가 나면 아무 흔적도 안 남으므로 반드시 로그를 남긴다
        logger.exception("스트레스 날 음악 저장 실패")
        return None


def list_playlists() -> List[dict]:
    query = _col().order_by("date", direction=firestore.Query.DESCENDING)
    return [{"id": s.id, **s.to_dict()} for s in query.stream()]


def delete_playlist(pid: str) -> bool:
    ref = _col().document(pid)
    if not ref.get().exists:
        return False
    ref.delete()
    return True

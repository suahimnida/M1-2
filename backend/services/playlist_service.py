"""스트레스 많은 날 자동 음악 저장 (playlists 컬렉션)."""
import logging
from typing import List, Optional

from firebase_admin import firestore

from core import config
from core.firebase import get_db
from core.utils import now_iso
from services import ai_service

COLLECTION = "playlists"
logger = logging.getLogger(__name__)


def _col():
    return get_db().collection(COLLECTION)


def _exists_for(data_id: str) -> bool:
    return any(True for _ in _col().where("data_id", "==", data_id).limit(1).stream())


def save_if_stressful(entry: dict) -> Optional[dict]:
    """기록의 스트레스가 기준 이상이면 곡 목록을 생성해 저장. 백그라운드 작업으로 실행된다."""
    if entry.get("stress", 0) < config.STRESS_THRESHOLD:
        return None
    if _exists_for(entry["id"]):
        return None
    try:
        songs = ai_service.generate_playlist(entry)
    except Exception:  # AI 실패가 기록 저장을 막으면 안 된다
        logger.exception("플레이리스트 생성 실패")
        return None
    if not songs:
        return None
    payload = {
        "date": entry["date"],
        "stress": entry["stress"],
        "data_id": entry["id"],
        "songs": songs,
        "created_at": now_iso(),
    }
    ref = _col().document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def list_playlists() -> List[dict]:
    query = _col().order_by("date", direction=firestore.Query.DESCENDING)
    return [{"id": s.id, **s.to_dict()} for s in query.stream()]


def delete_playlist(pid: str) -> bool:
    ref = _col().document(pid)
    if not ref.get().exists:
        return False
    ref.delete()
    return True

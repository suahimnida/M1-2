"""Firestore 클라이언트. 첫 사용 시점에 초기화해서 키가 없어도 /docs는 열리게 한다."""
import json
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from core import config


@lru_cache
def get_db():
    if not firebase_admin._apps:
        if config.FIREBASE_CREDENTIALS:
            cred = credentials.Certificate(json.loads(config.FIREBASE_CREDENTIALS))
        elif config.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(config.FIREBASE_CREDENTIALS_PATH)
        else:
            raise RuntimeError(
                "Firebase 키가 없습니다. FIREBASE_CREDENTIALS 또는 FIREBASE_CREDENTIALS_PATH를 설정하세요."
            )
        firebase_admin.initialize_app(cred)
    return firestore.client(database_id=config.FIRESTORE_DATABASE_ID)

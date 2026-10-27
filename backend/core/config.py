"""환경 변수 로딩. 키 값은 절대 코드에 하드코딩하지 않는다."""
import os
from dotenv import load_dotenv

load_dotenv()

# Claude (코디세이 Anthropic 호환 API)
# 코디세이에서 받은 값을 ANTHROPIC_API_KEY에 넣는다 (ANTHROPIC_AUTH_TOKEN에 넣어도 됨, 둘 중 하나만).
# anthropic SDK 2.x는 어느 쪽이든 Authorization: Bearer 헤더로 보낸다.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_AUTH_TOKEN = os.getenv("ANTHROPIC_AUTH_TOKEN", "")
# Anthropic SDK가 뒤에 /v1/messages를 스스로 붙이므로 주소에 /v1을 넣지 않는다.
ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://copa.codyssey.kr")
# 코디세이 프록시 모델 이름: claude-sonnet-4(Sonnet 4.6), claude-haiku-4(Haiku 4.5, 더 저렴)
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4")
ANTHROPIC_FALLBACK_MODELS = [
    m.strip() for m in os.getenv("ANTHROPIC_FALLBACK_MODELS", "claude-haiku-4").split(",") if m.strip()
]

# Firebase: 배포는 JSON 문자열, 로컬은 파일 경로
FIREBASE_CREDENTIALS = os.getenv("FIREBASE_CREDENTIALS", "")
FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
FIRESTORE_DATABASE_ID = os.getenv("FIRESTORE_DATABASE_ID", "(default)")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

STRESS_THRESHOLD = int(os.getenv("STRESS_THRESHOLD", "7"))
"""환경 변수 로딩. 키 값은 절대 코드에 하드코딩하지 않는다."""
import os

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# 배포: JSON 문자열 / 로컬: 파일 경로
FIREBASE_CREDENTIALS = os.getenv("FIREBASE_CREDENTIALS", "")
FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

STRESS_THRESHOLD = int(os.getenv("STRESS_THRESHOLD", "7"))
FIRESTORE_DATABASE_ID = os.getenv("FIRESTORE_DATABASE_ID", "(default)")
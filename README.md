# 껌냥이 트레이너 🐈‍⬛

매일의 컨디션 기록을 분석해서, 내 상황을 아는 검은 고양이 AI 트레이너가 오늘에 맞는 운동과 건강 주스를 추천해 주는 웹 서비스입니다.

## 서비스 소개

껌냥이 트레이너는 매일 기록한 컨디션 및 수면 등의 데이터를 요약해
<br>AI의 시스템 프롬프트에 주입하여 기록을 근거로 한 맞춤 대화를 할 수 있습니다.</br>

- **매일 컨디션 체크**
  <br>: 날짜, 컨디션(1~10), 스트레스(1~10), 수면 시간, 오늘의 목적, 메모 기록</br>
- **맞춤 운동 추천**
  <br>: 컨디션이 낮거나 수면이 부족하면 회복 위주로, 좋으면 목적에 맞는 강도로</br>
- **건강 주스 레시피 추천**
  <br>: 최근 상태에 맞는 재료와 분량, 만드는 법</br>
- **스트레스 많은 날 음악 자동 저장**
  <br>: 스트레스 7 이상으로 기록하면 기분 전환 곡 5개를 자동 저장</br>
- **대화 기록**
  <br>: 모든 대화가 자동 저장되고, 이전 대화를 불러와 이어서 대화 가능</br>
- **껌냥이 표정**
  <br>: 최근 컨디션에 따라 눈 모양이 바뀌고, 스트레스가 높으면 땀방울이 맺힘</br>

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 백엔드 | Python 3.11, FastAPI, Pydantic v2, Uvicorn |
| 데이터베이스 | Firebase Firestore (firebase-admin) |
| AI | Claude (Anthropic Messages API, 코디세이 API 프록시 경유, `claude-sonnet-4` / 예비 `claude-haiku-4`) |
| 프론트엔드 | HTML, CSS, JavaScript|
| 배포 | Render (백엔드), Vercel (프론트엔드) |

## 배포 URL
m1-2-frontend-orpin.vercel.app

- 프론트엔드
  <br>: https://m1-2-frontend-orpin.vercel.app</br>
- 백엔드 API
  : https://m1-2-d49o.onrender.com</br>

## 프로젝트 구조

```
backend/
├── main.py                 # 앱 초기화, CORS, 라우터 등록
├── core/                   # 환경변수, Firestore 연결, 공통 유틸
├── schemas/                # Pydantic 요청/응답 모델 (검증)
├── routers/                # data, conversations, chat, playlists
├── services/               # DB 처리, 요약 분석, Claude 호출
├── scripts/                # 샘플 데이터 생성, Firestore 업로드
└── sample_data/            # 생성된 샘플 데이터 (127일치)
frontend/
├── src/                    # index.html, style.css, app.js, config.js
├── build.js                # Vercel 빌드 시 API_URL로 config.js 생성
└── vercel.json
```

## 데이터

### 컬렉션 구조

| 컬렉션 | 용도 | 주요 필드 |
|---|---|---|
| `data` | 컨디션 기록 | date, value(컨디션), memo, stress, sleep_hours, goal |
| `conversations` | 대화 기록 | title, messages[{role, content, timestamp}] |
| `playlists` | 스트레스 날 음악 | date, stress, data_id, songs[{title, artist, reason}] |

### 샘플 데이터

`scripts/generate_sample_data.py`로 2026-06-01 ~ 2026-10-05의 127일치 데이터를 생성했습니다.
<br>주말엔 수면이 늘고 스트레스가 줄며, 마감 주간(7월 말, 9월 말)엔 수면 감소와 스트레스 급증이 나타나고,</br>
운동 습관이 붙으면서 컨디션이 서서히 오르는 패턴을 넣었습니다.

### 요약 정보 (`GET /api/data/summary`)

기간, 기록 수, 컨디션 평균·최고·최저, 최근 7일 평균과 직전 7일 대비 추세(증가/감소/유지),
<br>평균 스트레스와 추세, 최근 30일 고스트레스 일수, 평균 수면, 수면 6시간 미만/7시간 이상일 때의</br>
컨디션 비교, 요일별 컨디션, 최근 7일 상세 기록을 계산합니다.
<br>이 내용을 텍스트로 정리한 `text` 필드가 시스템 프롬프트에 그대로 들어갑니다.</br>

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/data` | 컨디션 기록 추가 (같은 날짜 중복 시 409) |
| GET | `/api/data` | 기록 목록 (최신순) |
| PUT | `/api/data/{id}` | 기록 수정 (보낸 필드만 반영) |
| DELETE | `/api/data/{id}` | 기록 삭제 |
| GET | `/api/data/summary` | 데이터 요약 (프롬프트 주입용) |
| POST | `/api/conversations` | 대화 저장 |
| GET | `/api/conversations` | 대화 목록 (messages 미포함, 개수·미리보기만) |
| GET | `/api/conversations/{id}` | 특정 대화의 전체 messages 조회 (방식 A) |
| DELETE | `/api/conversations/{id}` | 대화 삭제 |
| POST | `/api/chat` | AI 대화 (요약 조회 → 시스템 프롬프트 주입 → Claude 호출 → 자동 저장) |
| GET | `/api/playlists` | 자동 저장된 음악 목록 |
| DELETE | `/api/playlists/{id}` | 음악 목록 삭제 |
| GET | `/health` | 상태 확인 / 서버 깨우기 |

## 로컬 실행 방법

### 1. 사전 준비

1. Firebase 콘솔에서 프로젝트를 만들고 Firestore Database를 생성합니다.
2. 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성으로 JSON 키를 받아
   <br>`backend/serviceAccountKey.json`으로 저장합니다. (이 파일은 `.gitignore`에 포함되어 있습니다)</br>
3. 코디세이에서 Anthropic 호환 API 키(또는 토큰)를 발급받습니다.

### 2. 백엔드

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

python scripts/generate_sample_data.py
python scripts/upload_sample_data.py

uvicorn main:app --reload
```

### 3. 프론트엔드

```bash
cd frontend/src
python -m http.server 5500
```

## 환경 변수

### 백엔드 (Render)

| 이름 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` |코디세이 Anthropic 호환 API 키 |
| `ANTHROPIC_BASE_URL` | 기본값 `https://copa.codyssey.kr` |
| `FIREBASE_CREDENTIALS` | 서비스 계정 키 JSON 전체를 한 줄 문자열로 |
| `FIREBASE_CREDENTIALS_PATH` | 서비스 계정 키 파일 경로 |
| `CORS_ORIGINS` | 허용할 프론트 주소, 쉼표로 구분 |
| `ANTHROPIC_MODEL` | 기본값 `claude-sonnet-4` |
| `ANTHROPIC_FALLBACK_MODELS` | 기본 모델이 혼잡할 때 쓸 예비 모델, 기본값 `claude-haiku-4` |
| `FIRESTORE_DATABASE_ID` | Firestore 데이터베이스 ID, 이 프로젝트는 `default` |
| `STRESS_THRESHOLD` | 음악 자동 저장 기준, 기본값 `7` |

### 프론트엔드 (Vercel)

| 이름 |설명 |
|---|---|
| `API_URL` | 백엔드 주소 |

## 스크린샷

### 요약 보드
<img width="360" height="337" alt="image" src="https://github.com/user-attachments/assets/7d0c7969-d71d-4da4-97eb-876b88333242" />
<img width="357" height="583" alt="image" src="https://github.com/user-attachments/assets/1d08f3a0-1247-409a-b663-6f4b2b80e42b" />

### 이전 대화 기록 목록
<img width="355" height="194" alt="image" src="https://github.com/user-attachments/assets/88a29ab8-028c-4783-8338-d698b78ccf10" />

### 돌아다니는 고양이
<img width="199" height="299" alt="image" src="https://github.com/user-attachments/assets/7ac2447b-f91a-4402-84aa-38765b3613a7" />

### 채팅창
<img width="1104" height="872" alt="image" src="https://github.com/user-attachments/assets/384fe713-eed3-49b6-a088-f90ac1aa2e8a" />

### 컨디션 체크
<img width="450" height="814" alt="image" src="https://github.com/user-attachments/assets/55d2e1ef-9391-469f-861c-d7fb35467d80" />

### 이전 컨디션 체크 목록
<img width="429" height="865" alt="image" src="https://github.com/user-attachments/assets/81ce998b-6e59-4b1e-8b5f-27f218bb51f6" />
<img width="449" height="68" alt="image" src="https://github.com/user-attachments/assets/ba29d8fd-a16d-4bfb-8eb4-0ee35959eaa8" />

### 스트레스 7 이상 인 날에 뜨는 노래 추천
<img width="448" height="657" alt="image" src="https://github.com/user-attachments/assets/5ca10585-ceb7-4d1e-8a4e-4b04371bd21e" />

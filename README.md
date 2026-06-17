# 🎱 당구 전적 앱 - Railway 배포 가이드

## 📁 최종 파일 구조

```
프로젝트 폴더/
├── server.js
├── package.json
├── railway.toml               ← Railway 설정
├── .gitignore
├── .env.example               ← 환경변수 참고용
└── public/                    ← 프론트엔드 (폴더 직접 만들기)
    ├── index.html
    └── billiards_frontend_react_lan_ready.jsx
```

---

## 🚀 배포 순서

### 1단계 - 폴더 구조 만들기

1. 현재 서버 폴더에 `public/` 폴더 생성
2. `index.html`, `billiards_frontend_react_lan_ready.jsx` 를 `public/` 안에 넣기
3. `railway.toml`, `.gitignore` 은 최상위에 놓기

### 2단계 - GitHub에 올리기

```bash
git init
git add .
git commit -m "첫 배포"
git remote add origin https://github.com/계정명/billiards-app.git
git push -u origin main
```

> GitHub 계정이 없으면 https://github.com 에서 무료 가입 후 레포 생성

### 3단계 - Railway 배포

1. https://railway.app 접속 → GitHub으로 로그인
2. **New Project** → **Deploy from GitHub repo** 클릭
3. 방금 만든 레포 선택 → 자동 배포 시작

### 4단계 - Volume 연결 (DB 영구 저장)

1. Railway 프로젝트 → 서비스 클릭
2. 상단 탭 **Volumes** → **Add Volume**
3. Mount Path: `/data` 입력 후 생성

### 5단계 - 환경변수 설정

Railway 서비스 → **Variables** 탭에서 추가:

| 키 | 값 |
|---|---|
| `DB_PATH` | `/data/billiards.db` |
| `CORS_ORIGIN` | `https://billiards.your-domain.com` |

> Variables 저장 시 자동으로 재배포됩니다

### 6단계 - 가비아 도메인 연결

#### Railway에서:
1. 서비스 → **Settings** → **Networking** → **Generate Domain** 클릭
2. 생성된 `xxxx.up.railway.app` 주소 복사
3. 그 아래 **Custom Domain** → 원하는 서브도메인 입력
   - 예: `billiards.your-domain.com`
4. 표시되는 **CNAME 값** 복사 (예: `xxxx.railway.internal`)

#### 가비아에서:
1. 가비아 로그인 → **My가비아** → 도메인 관리
2. 해당 도메인 → **DNS 설정**
3. **레코드 추가**:
   - 타입: `CNAME`
   - 호스트: `billiards` (서브도메인 앞부분만)
   - 값: Railway에서 복사한 CNAME 값
   - TTL: 3600 (기본값)
4. 저장

> DNS 반영까지 최대 30분~1시간 소요

---

## ✅ 완료 후 확인

- `https://billiards.your-domain.com` 접속 → 앱 정상 로딩 확인
- `https://billiards.your-domain.com/health` → `{"ok":true}` 확인

---

## ⚠️ 주의사항

- Railway 무료 플랜은 월 500시간 제공 (약 20일). 소규모라면 **Hobby 플랜 ($5/월)** 권장 (무제한)
- 기존 PC에서 쌓은 DB 데이터 이전이 필요하면 별도 안내 가능

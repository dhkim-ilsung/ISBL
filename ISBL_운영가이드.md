# 🎱 ISBL 당구 전적 앱 운영 가이드

## 📁 구조

```
GitHub (dhkim-ilsung/ISBL) - master 브랜치
    ↓ git push
개발 PC (C:\isbl)
    ↓ git pull
서버 PC (C:\Users\S-20201102\Desktop\billiards)
    ↓ pm2 + nginx
사용자 → http://isbl.ilsungis.com
```

---

## 🖥️ 서버 PC 파일 구조

```
C:\Users\S-20201102\Desktop\billiards\
├── data/
│   └── billiards.db          ← SQLite DB (데이터 저장)
├── node_modules/
├── public/
│   ├── index.html
│   └── billiards_frontend_react_lan_ready.jsx
├── .gitignore
├── package.json
└── server.js
```

## 💻 개발 PC 파일 구조

```
C:\isbl\
├── public/
│   ├── index.html
│   └── billiards_frontend_react_lan_ready.jsx
├── .gitignore
├── package.json
└── server.js
```

---

## 🔧 코드 수정할 때

### 개발 PC에서:
```powershell
cd C:\isbl
# 파일 수정 후
git add .
git commit -m "수정 내용 설명"
git push origin master
```

### 서버 PC에서:
```powershell
cd C:\Users\S-20201102\Desktop\billiards
git pull
pm2 restart billiards
```

---

## 🗄️ DB 초기화할 때

```powershell
pm2 stop billiards
Remove-Item C:\Users\S-20201102\Desktop\billiards\data\billiards.db
pm2 start billiards
```

---

## 📦 데이터 백업 & 이전

1. 앱 접속 → **JSON 내보내기** 버튼 클릭 → 파일 저장
2. 새 서버에서 **JSON 불러오기(추가)** 버튼 → 파일 선택

> ⚠️ 불러오기 전 DB가 비어있어야 중복 없이 깔끔하게 들어감

---

## 🌐 nginx 설정 위치

```
C:\Users\S-20201102\Desktop\nginx\nginx-1.28.3\conf\nginx.conf
```

수정 후 reload:
```powershell
cd C:\Users\S-20201102\Desktop\nginx\nginx-1.28.3
.\nginx.exe -s reload
```

---

## 🔍 서버 상태 확인

```powershell
pm2 list                     # 앱 실행 상태
pm2 logs billiards           # 실시간 로그
pm2 restart billiards        # 재시작
```

---

## 🌏 접속 주소

| 용도 | 주소 |
|---|---|
| 당구 앱 | http://isbl.ilsungis.com |
| 헬스체크 | http://isbl.ilsungis.com/health |
| 카페 앱 | http://cafe.ilsungis.com |

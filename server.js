require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();

// ---- CORS (내부망 전체 허용 or 필요 시 도메인 제한) ----
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// ---- SQLite 초기화 ----
const DB_PATH = process.env.DB_PATH || './data/billiards.db';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  room_id TEXT NOT NULL,
  id      TEXT NOT NULL PRIMARY KEY,
  name    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id      TEXT NOT NULL PRIMARY KEY,
  room_id TEXT NOT NULL,
  date    TEXT NOT NULL, -- YYYY-MM-DD
  a_id    TEXT NOT NULL,
  b_id    TEXT NOT NULL,
  a_wins  INTEGER NOT NULL,
  b_wins  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches3 (
  id        TEXT NOT NULL PRIMARY KEY,
  room_id   TEXT NOT NULL,
  date      TEXT NOT NULL,   -- YYYY-MM-DD
  p1_id     TEXT NOT NULL,
  p2_id     TEXT NOT NULL,
  p3_id     TEXT NOT NULL,
  winner_id TEXT NOT NULL     -- p1_id | p2_id | p3_id 중 하나
);
CREATE INDEX IF NOT EXISTS IX_matches_room     ON matches(room_id, date);
CREATE INDEX IF NOT EXISTS IX_matches_players  ON matches(a_id, b_id);
CREATE INDEX IF NOT EXISTS IX_matches3_room ON matches3(room_id, date);
`);

const uuid = () => crypto.randomUUID();

// ---- 쿼리 ----
const q = {
  listPlayers: db.prepare('SELECT id, name FROM players WHERE room_id=? ORDER BY name'),
  insertPlayer: db.prepare('INSERT INTO players(room_id, id, name) VALUES(?, ?, ?)'),
  updatePlayer: db.prepare('UPDATE players SET name=? WHERE id=?'),
  deletePlayer: db.prepare('DELETE FROM players WHERE room_id=? AND id=?'),
  deleteMatchesByPlayer: db.prepare('DELETE FROM matches WHERE room_id=? AND (a_id=? OR b_id=?)'),

  listMatches: db.prepare(`SELECT m.id, m.date,
                                  m.a_id AS aId, pa.name AS aName,
                                  m.b_id AS bId, pb.name AS bName,
                                  m.a_wins AS aWins, m.b_wins AS bWins
                           FROM matches m
                           JOIN players pa ON pa.id=m.a_id
                           JOIN players pb ON pb.id=m.b_id
                           WHERE m.room_id=?
                           ORDER BY m.date DESC, m.id DESC`),
  insertMatch: db.prepare('INSERT INTO matches(id, room_id, date, a_id, b_id, a_wins, b_wins) VALUES(?, ?, ?, ?, ?, ?, ?)'),
  updateMatch: db.prepare('UPDATE matches SET date=?, a_id=?, b_id=?, a_wins=?, b_wins=? WHERE room_id=? AND id=?'),
  deleteMatch: db.prepare('DELETE FROM matches WHERE room_id=? AND id=?'),

// 3인 경기
  listMatches3: db.prepare(`
    SELECT m.id, m.date,
           m.p1_id AS p1Id, p1.name AS p1Name,
           m.p2_id AS p2Id, p2.name AS p2Name,
           m.p3_id AS p3Id, p3.name AS p3Name,
           m.winner_id AS winnerId
    FROM matches3 m
    JOIN players p1 ON p1.id=m.p1_id
    JOIN players p2 ON p2.id=m.p2_id
    JOIN players p3 ON p3.id=m.p3_id
    WHERE m.room_id=?
    ORDER BY m.date DESC, m.id DESC
  `),
  insertMatch3: db.prepare(`
    INSERT INTO matches3(id, room_id, date, p1_id, p2_id, p3_id, winner_id)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `),
  updateMatch3: db.prepare(`
    UPDATE matches3 SET date=?, p1_id=?, p2_id=?, p3_id=?, winner_id=?
    WHERE room_id=? AND id=?
  `),
  deleteMatch3: db.prepare(`
    DELETE FROM matches3 WHERE room_id=? AND id=?
  `),

};

// ---- Healthcheck ----
app.get('/health', (req, res) => res.json({ ok: true }));

// ---- API (반드시 정적 라우팅 설정보다 먼저 선언) ----
app.get('/api/billiards/:roomId', (req, res) => {
  const { roomId } = req.params;
  const roster = q.listPlayers.all(roomId);
  const history = q.listMatches.all(roomId);
  const history3 = q.listMatches3.all(roomId);
  res.json({ roster, history, history3  });
});

app.post('/api/billiards/:roomId/players', (req, res) => {
  const { roomId } = req.params; const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  q.insertPlayer.run(roomId, id, String(name).trim());
  res.json({ id, name: String(name).trim() });
});

app.put('/api/billiards/:roomId/players/:id', (req, res) => {
  const { id } = req.params; const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  q.updatePlayer.run(String(name).trim(), id);
  res.json({ ok: true });
});

app.delete('/api/billiards/:roomId/players/:id', (req, res) => {
  const { roomId, id } = req.params;
  const tx = db.transaction(() => {
    q.deleteMatchesByPlayer.run(roomId, id, id);
    q.deletePlayer.run(roomId, id);
  });
  tx();
  res.json({ ok: true });
});

app.post('/api/billiards/:roomId/matches', (req, res) => {
  const { roomId } = req.params;
  const { date, aId, bId, aWins, bWins } = req.body || {};
  if (!date || !aId || !bId) return res.status(400).json({ error: 'date,aId,bId required' });
  const id = uuid();
  q.insertMatch.run(id, roomId, String(date), aId, bId, Number(aWins || 0), Number(bWins || 0));
  res.json({ id });
});

app.put('/api/billiards/:roomId/matches/:id', (req, res) => {
  const { roomId, id } = req.params;
  const { date, aId, bId, aWins, bWins } = req.body || {};
  if (!date || !aId || !bId) return res.status(400).json({ error: 'date,aId,bId required' });
  q.updateMatch.run(String(date), aId, bId, Number(aWins || 0), Number(bWins || 0), roomId, id);
  res.json({ ok: true });
});

app.delete('/api/billiards/:roomId/matches/:id', (req, res) => {
  const { roomId, id } = req.params;
  q.deleteMatch.run(roomId, id);
  res.json({ ok: true });
});

// 3인 전적 추가
app.post('/api/billiards/:roomId/matches3', (req, res) => {
  const { roomId } = req.params;
  const { date, p1Id, p2Id, p3Id, winnerId } = req.body || {};
  if (!date || !p1Id || !p2Id || !p3Id || !winnerId)
    return res.status(400).json({ error: 'date,p1Id,p2Id,p3Id,winnerId required' });
  if (![p1Id, p2Id, p3Id].includes(winnerId))
    return res.status(400).json({ error: 'winnerId must be one of p1Id,p2Id,p3Id' });
  const id = crypto.randomUUID();
  q.insertMatch3.run(id, roomId, String(date), p1Id, p2Id, p3Id, winnerId);
  res.json({ id });
});

// 3인 전적 수정
app.put('/api/billiards/:roomId/matches3/:id', (req, res) => {
  const { roomId, id } = req.params;
  const { date, p1Id, p2Id, p3Id, winnerId } = req.body || {};
  if (!date || !p1Id || !p2Id || !p3Id || !winnerId)
    return res.status(400).json({ error: 'date,p1Id,p2Id,p3Id,winnerId required' });
  if (![p1Id, p2Id, p3Id].includes(winnerId))
    return res.status(400).json({ error: 'winnerId must be one of p1Id,p2Id,p3Id' });
  q.updateMatch3.run(String(date), p1Id, p2Id, p3Id, winnerId, roomId, id);
  res.json({ ok: true });
});

// 3인 전적 삭제
app.delete('/api/billiards/:roomId/matches3/:id', (req, res) => {
  const { roomId, id } = req.params;
  q.deleteMatch3.run(roomId, id);
  res.json({ ok: true });
});


// ---- 정적 서빙 + SPA 라우팅 ----
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'] }));
  // API가 아닌 모든 경로는 SPA로
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
} else {
  console.warn('⚠️  public/ 폴더가 없습니다. 정적 파일을 서빙하지 않습니다.');
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));

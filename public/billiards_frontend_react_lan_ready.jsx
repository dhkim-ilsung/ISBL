// billiards_frontend_react_lan_ready.jsx
// 규칙 요약
// - 승점 계산(중요): "모든 전적의 누적 합산"에서 각 선수쌍별 총 승/패를 비교해 산정
//    · A와 B의 총 승수가 a,b라면: a>b → A 3점, a<b → B 3점, a=b → A/B 각 1점
//    · 날짜별 입력 시 즉시 가산하지 않고, 항상 전체 누적 데이터로 재계산
// - 표: "경기"=개인 전체 게임 수(승+패), "승-패"=게임 기준 합산(무 제외), "승률"=게임 기준
// - 1위 행 강조(노란 배경), 승/패/승률 색상 적용
// - 필터: 선수 단일 선택 / 날짜 범위(시작~끝), [통계/차트에도 적용] 토글
// - 백업: JSON 내보내기/불러오기(추가 병합), 엑셀(.xlsx) 내보내기
// - 차트: 상대별 승률(레이더), 요일별 승률(막대), 순위 변동(라인: 누적시점별 ‘누적 대전’ 승점으로 재계산)
// - 전적 인라인 수정: 전적 탭에서 행별 [수정] → 행 내에서 편집 후 저장

function App() {
  // ----------------- 서버/상태 -----------------
  //const [baseUrl, setBaseUrl] = React.useState("http://localhost:8787");
  //const [roomId, setRoomId] = React.useState("team-a");

  const DEFAULT_BASE = "http://isbl.ilsungis.com";
  const [baseUrl, setBaseUrl] = React.useState(() =>
    localStorage.getItem("billiards.baseUrl") || DEFAULT_BASE
  );
  const [roomId, setRoomId] = React.useState(() =>
    localStorage.getItem("billiards.roomId") || "team-a-20262Q"
  );

  // 주소/룸ID가 바뀌면 자동 저장
  React.useEffect(() => { localStorage.setItem("billiards.baseUrl", baseUrl); }, [baseUrl]);
  React.useEffect(() => { localStorage.setItem("billiards.roomId", roomId); }, [roomId]);


  const [apiKey, setApiKey] = React.useState("");
  const [roster, setRoster] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState("match"); // match/setup/history/stats/charts
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  // 3인 경기 상태
  const [history3, setHistory3] = React.useState([]);
  const [m3Date, setM3Date] = React.useState(today());
  const [m3P1, setM3P1] = React.useState("");
  const [m3P2, setM3P2] = React.useState("");
  const [m3P3, setM3P3] = React.useState("");
  const [m3Winner, setM3Winner] = React.useState(""); // m3P1|m3P2|m3P3 중 하나의 ID

  // ----------------- 필터 -----------------
  const [filterPlayer, setFilterPlayer] = React.useState("");    // 특정 선수 id 또는 빈값(전체)
  const [dateFrom, setDateFrom]         = React.useState("");    // YYYY-MM-DD
  const [dateTo, setDateTo]             = React.useState("");    // YYYY-MM-DD
  const [applyFilterToCharts, setApplyFilterToCharts] = React.useState(false);

  // ----------------- 입력(전적 추가) -----------------
  const [newPlayerName, setNewPlayerName] = React.useState("");
  const [pA, setPA] = React.useState("");  const [pB, setPB] = React.useState("");
  const [winsA, setWinsA] = React.useState(0); const [winsB, setWinsB] = React.useState(0);
  const [matchDate, setMatchDate] = React.useState(today());

  // ----------------- 인라인 수정 상태 -----------------
  const [editId, setEditId] = React.useState(null);
  const [editDate, setEditDate] = React.useState("");
  const [editA, setEditA] = React.useState("");
  const [editB, setEditB] = React.useState("");
  const [editWa, setEditWa] = React.useState(0);
  const [editWb, setEditWb] = React.useState(0);

  // ----------------- 유틸 -----------------
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function headers() {
    const h = { "Content-Type": "application/json" };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }
  async function fetchJSON(url, opts) {
    const res = await fetch(url, { ...(opts||{}), headers: { ...headers(), ...(opts?.headers||{}) }});
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    return res.json();
  }
  const parseYMD = (ymd) => new Date(ymd.replace(/-/g,'/'));
  const inRange = (d, from, to) => {
    if (from && d < parseYMD(from)) return false;
    if (to   && d > parseYMD(to  )) return false;
    return true;
  };

  // ----------------- 데이터 로드 -----------------
  async function loadData() {
    setLoading(true); setErr(""); setMsg("");
    try {
      const data = await fetchJSON(`${baseUrl}/api/billiards/${encodeURIComponent(roomId)}`);
      setRoster(data.roster || []);
      setHistory((data.history || []).map(m => ({
        id: m.id,
        date: m.date, // YYYY-MM-DD
        players: [{ id: m.aId, name: m.aName }, { id: m.bId, name: m.bName }],
        wins: [m.aWins, m.bWins],
      })));
      setHistory3((data.history3 || []).map(m => ({
      id: m.id,
      date: m.date,
      players: [
        { id: m.p1Id, name: m.p1Name },
        { id: m.p2Id, name: m.p2Name },
        { id: m.p3Id, name: m.p3Name },
       ],
        winnerId: m.winnerId,
      })));


      setMsg("데이터를 불러왔습니다.");
    } catch (e) { setErr(e.message || "데이터 불러오기 실패"); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { loadData(); }, []);

  // ----------------- 선수 CRUD -----------------
  async function addPlayer() {
    const name = newPlayerName.trim(); if (!name) return;
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/players`, { method:"POST", body:JSON.stringify({ name }) });
    setNewPlayerName(""); loadData();
  }
  async function updatePlayerName(id, name) {
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/players/${id}`, { method:"PUT", body:JSON.stringify({ name }) });
    loadData();
  }
  async function removePlayer(id) {
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/players/${id}`, { method:"DELETE" });
    if (pA === id) setPA(""); if (pB === id) setPB("");
    loadData();
  }

  // ----------------- 전적 저장/삭제 -----------------
  const canSave = pA && pB && pA !== pB && (winsA > 0 || winsB > 0) && matchDate;
  async function saveSeries() {
    if (!canSave) return;
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches`, {
      method: "POST",
      body: JSON.stringify({ date: matchDate, aId: pA, bId: pB, aWins: winsA, bWins: winsB })
    });
    setWinsA(0); setWinsB(0); setMatchDate(today());
    loadData();
  }
  async function deleteMatch(id) {
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches/${id}`, { method: "DELETE" });
    if (editId === id) cancelEdit();
    loadData();
  }

// ----- 3인 경기 저장/삭제 -------
const canSave3 = m3Date && m3P1 && m3P2 && m3P3 &&
                 (new Set([m3P1, m3P2, m3P3]).size === 3) &&
                 m3Winner && [m3P1,m3P2,m3P3].includes(m3Winner);

async function saveMatch3() {
  if (!canSave3) return;
  await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches3`, {
    method: "POST",
    body: JSON.stringify({
      date: m3Date, p1Id: m3P1, p2Id: m3P2, p3Id: m3P3, winnerId: m3Winner
    })
  });
  setM3Date(today()); setM3P1(""); setM3P2(""); setM3P3(""); setM3Winner("");
  loadData();
}

async function deleteMatch3(id) {
  await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches3/${id}`, { method: "DELETE" });
  loadData();
}


  // ----------------- 전적 인라인 수정 -----------------
  function startEdit(m) {
    setEditId(m.id);
    setEditDate(m.date);
    setEditA(m.players[0].id);
    setEditB(m.players[1].id);
    setEditWa(m.wins[0]);
    setEditWb(m.wins[1]);
  }
  function cancelEdit() {
    setEditId(null);
    setEditDate("");
    setEditA(""); setEditB("");
    setEditWa(0); setEditWb(0);
  }
  const canEditSave =
    !!editId && editDate && editA && editB && editA !== editB && (Number(editWa) > 0 || Number(editWb) > 0);
  async function saveEdit() {
    if (!canEditSave) return;
    await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches/${editId}`, {
      method: "PUT",
      body: JSON.stringify({
        date: editDate,
        aId: editA,
        bId: editB,
        aWins: Number(editWa || 0),
        bWins: Number(editWb || 0)
      })
    });
    cancelEdit();
    loadData();
  }

  // Enter 저장 / Esc 취소
  React.useEffect(() => {
    if (!editId) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
      if (e.key === "Enter")  { if (canEditSave) { e.preventDefault(); saveEdit(); } }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editId, canEditSave, editDate, editA, editB, editWa, editWb]);

  // ----------------- 필터 적용된 전적 -----------------
  const filteredHistory = React.useMemo(() => {
    return history.filter(m => {
      const d = parseYMD(m.date);
      if (!inRange(d, dateFrom, dateTo)) return false;
      if (filterPlayer && !(m.players[0].id === filterPlayer || m.players[1].id === filterPlayer)) return false;
      return true;
    });
  }, [history, dateFrom, dateTo, filterPlayer]);

// ▶ 승점/차트 계산에 쓸 "유효 경기" (둘 다 로스터에 있고, 0–0이 아닌 전적만)
const effectiveHistory = React.useMemo(() => {
  const rosterSet = new Set(roster.map(p => p.id));
  const source = applyFilterToCharts ? filteredHistory : history;
  return source.filter(m => {
    const [pa, pb] = m.players || [];
    if (!pa || !pb) return false;
    if (!rosterSet.has(pa.id) || !rosterSet.has(pb.id)) return false;
    const wa = Number(m.wins?.[0] || 0);
    const wb = Number(m.wins?.[1] || 0);
    if (wa + wb === 0) return false; // 0–0 무효
    return true;
  });
}, [roster, history, filteredHistory, applyFilterToCharts]);

// 3인 경기: 화면 표시용 필터(선수/기간)
const filteredHistory3 = React.useMemo(() => {
  return (history3 || []).filter(m => {
    const d = parseYMD(m.date);
    if (!inRange(d, dateFrom, dateTo)) return false;
    if (filterPlayer) {
      const ids = (m.players || []).map(p => p.id);
      if (!ids.includes(filterPlayer)) return false;
    }
    return true;
  });
}, [history3, dateFrom, dateTo, filterPlayer]);

// 3인 경기: 통계용 “유효 경기” (로스터 내 3명 & 승자 유효)
// applyFilterToCharts=true면 위의 filteredHistory3를, 아니면 전체 history3 사용
const effectiveHistory3 = React.useMemo(() => {
  const rosterSet = new Set((roster || []).map(p => p.id));
  const source = applyFilterToCharts ? filteredHistory3 : history3;
  return (source || []).filter(m => {
    if (!m?.players || m.players.length !== 3) return false;
    const ids = m.players.map(p => p.id);
    if (new Set(ids).size !== 3) return false;
    if (!ids.every(id => rosterSet.has(id))) return false;
    if (!ids.includes(m.winnerId)) return false;
    return true;
  });
}, [roster, history3, filteredHistory3, applyFilterToCharts]);




// 누적 대전 승점 계산 (통산 전적 기준)
function computeStandings(roster, games) {
  const rosterSet = new Set((roster || []).map(p => p.id));
  const per = new Map();
  for (const p of roster || []) {
    per.set(p.id, { id: p.id, name: p.name, wins: 0, losses: 0, games: 0, points: 0 });
  }

  // 1️⃣ 쌍별 누적 합산
  const pairTotals = new Map(); // key: "id1-id2" → { [id1]:승, [id2]:승 }
  for (const m of games || []) {
    if (!m?.players?.length || !m.wins) continue;
    const [pa, pb] = m.players;
    if (!pa || !pb) continue;
    if (!rosterSet.has(pa.id) || !rosterSet.has(pb.id)) continue;
    const wa = Number(m.wins[0] || 0);
    const wb = Number(m.wins[1] || 0);
    if (wa + wb === 0) continue; // 0–0 경기 제외

    // 개인 누적 (승률용)
    const A = per.get(pa.id);
    const B = per.get(pb.id);
    A.wins += wa; A.losses += wb; A.games += wa + wb;
    B.wins += wb; B.losses += wa; B.games += wa + wb;

    // 쌍별 누적
// (교체 전)
// const key = [pa.id, pb.id].sort().join("-");

// (교체 후)
const key = [pa.id, pb.id].sort().join("::");
    if (!pairTotals.has(key)) pairTotals.set(key, { [pa.id]: 0, [pb.id]: 0 });
    const pair = pairTotals.get(key);
    pair[pa.id] += wa;
    pair[pb.id] += wb;
  }

  // 2️⃣ 각 쌍별 최종 결과로 승점 계산
  for (const [key, totals] of pairTotals.entries()) {
// (교체 전)
// const [id1, id2] = key.split("-");

// (교체 후)
const [id1, id2] = key.split("::", 2);
    const a = totals[id1] || 0;
    const b = totals[id2] || 0;
    if (a + b === 0) continue;
    if (a > b) per.get(id1).points += 3;
    else if (a < b) per.get(id2).points += 3;
    else {
      per.get(id1).points += 1;
      per.get(id2).points += 1;
    }
  }

  // 3️⃣ 정렬
  const ranking = Array.from(per.values()).map(s => ({
    ...s,
    winrate: s.games ? s.wins / s.games : 0
  })).sort((x, y) =>
    (y.points - x.points) ||
    (y.winrate - x.winrate) ||
    (y.wins - x.wins) ||
    (x.losses - y.losses) ||
    x.name.localeCompare(y.name)
  );

  // 4️⃣ 대전표용 (게임 기준)
  const h2hWins = new Map();
  for (const m of games || []) {
    if (!m?.players?.length || !m.wins) continue;
    const [pa, pb] = m.players;
    if (!pa || !pb) continue;
    if (!rosterSet.has(pa.id) || !rosterSet.has(pb.id)) continue;
    const wa = Number(m.wins[0] || 0);
    const wb = Number(m.wins[1] || 0);
    if (wa + wb === 0) continue;
    h2hWins.set(`${pa.id}>${pb.id}`, (h2hWins.get(`${pa.id}>${pb.id}`) || 0) + wa);
    h2hWins.set(`${pb.id}>${pa.id}`, (h2hWins.get(`${pb.id}>${pa.id}`) || 0) + wb);
  }

  function pairScore(aId, bId) {
    return {
      a: h2hWins.get(`${aId}>${bId}`) || 0,
      b: h2hWins.get(`${bId}>${aId}`) || 0
    };
  }

  return { ranking, pairScore };
}


// --- 통계(승점=승리수, 승률=승리수/경기수)
const triStats = React.useMemo(() => {
  const per = new Map((roster || []).map(p => [p.id, { id:p.id, name:p.name, games:0, wins:0, points:0 }]));
  for (const m of effectiveHistory3) {
    const ids = m.players.map(p => p.id);
    ids.forEach(id => {
      if (!per.has(id)) per.set(id, { id, name: id, games:0, wins:0, points:0 });
      per.get(id).games += 1;
    });
    if (per.has(m.winnerId)) {
      per.get(m.winnerId).wins += 1;
      per.get(m.winnerId).points += 1; // 규칙: 승자 1점
    }
  }
  const ranking = Array.from(per.values()).map(x => ({
    ...x, winrate: x.games ? x.wins / x.games : 0
  })).sort((a,b) =>
    (b.points - a.points) ||
    (b.winrate - a.winrate) ||
    a.name.localeCompare(b.name)
  );
  return { ranking };
}, [roster, effectiveHistory3]);




  // 통계(표/대전표) – 필터 적용 여부 반영
const stats = React.useMemo(() => {
  return computeStandings(roster, effectiveHistory);
}, [roster, effectiveHistory]);


  // ----------------- 색상 유틸 -----------------
  function wlTextClass(w,l){ if(w>l) return "text-green-700 font-semibold"; if(w<l) return "text-red-600 font-semibold"; return "text-gray-700"; }
  function wrTextClass(wr){ if(wr>=0.6) return "text-green-700 font-semibold"; if(wr<0.4) return "text-red-600 font-semibold"; return "text-gray-700"; }
  function h2hTextClass(a,b){ if(a>b) return "text-green-700 font-semibold"; if(a<b) return "text-red-600 font-semibold"; return "text-gray-700"; }

  // ----------------- 차트(필터 적용 여부 옵션) -----------------
  const radarRefs=React.useRef({}); const barRef=React.useRef(null); const lineRef=React.useRef(null);
  const barChart=React.useRef(null); const lineChart=React.useRef(null);

  const chartSource = applyFilterToCharts ? filteredHistory : history;

  // 레이더/요일 차트용 집계(게임 기준 승률)
  const chartAgg = React.useMemo(()=>{
    const per=new Map(); const h2h=new Map();
    for(const p of roster) per.set(p.id,{w:0,l:0,g:0});
    for(const m of chartSource){
      const [pa,pb]=m.players; const [wa,wb]=m.wins;
      per.get(pa.id).w+=wa; per.get(pa.id).l+=wb; per.get(pa.id).g+=wa+wb;
      per.get(pb.id).w+=wb; per.get(pb.id).l+=wa; per.get(pb.id).g+=wa+wb;
      h2h.set(`${pa.id}>${pb.id}`,(h2h.get(`${pa.id}>${pb.id}`)||0)+wa);
      h2h.set(`${pb.id}>${pa.id}`,(h2h.get(`${pb.id}>${pa.id}`)||0)+wb);
    }
    return { per, h2h };
  }, [roster, chartSource]);

  const radarData = React.useMemo(()=>{
    const map={};
    for(const p of roster){
      const labels = roster.filter(r=>r.id!==p.id).map(r=>r.name);
      const values = roster.filter(r=>r.id!==p.id).map(op=>{
        const w=chartAgg.h2h.get(`${p.id}>${op.id}`)||0;
        const l=chartAgg.h2h.get(`${op.id}>${p.id}`)||0;
        const g=w+l; return g? Math.round((w/g)*10000)/100 : 0;
      });
      map[p.id]={labels,values};
    }
    return map;
  }, [roster, chartAgg]);

  const weekdaySeries = React.useMemo(()=>{
    const days=["일","월","화","수","목","금","토"];
    const agg=new Map(roster.map(p=>[p.id,Array.from({length:7},()=>({w:0,g:0}))]));
    for(const m of chartSource){
      const dow=parseYMD(m.date).getDay();
      const [pa,pb]=m.players; const [wa,wb]=m.wins;
      agg.get(pa.id)[dow].w+=wa; agg.get(pa.id)[dow].g+=wa+wb;
      agg.get(pb.id)[dow].w+=wb; agg.get(pb.id)[dow].g+=wa+wb;
    }
    const datasets=roster.map(p=>{
      const vals=agg.get(p.id).map(({w,g})=> g? Math.round((w/g)*10000)/100 : 0);
      return {label:p.name,data:vals};
    });
    return {labels:days,datasets};
  }, [roster, chartSource]);

  // 순위 변동 라인: 날짜별로 "해당일까지의 누적 대전 승점"을 재계산해서 순위 산출
  const rankingTimeline = React.useMemo(()=>{
    if(chartSource.length===0) return {labels:[],series:[]};
    const labels=Array.from(new Set(chartSource.map(m=>m.date))).sort();

    // 날짜별 누적 history 구성 후 computeStandings 재사용
    const byId=new Map(roster.map(p=>[p.id,[]]));
    const cum = []; // 누적 히스토리 배열
    for (const dt of labels) {
      for (const m of chartSource.filter(m=>m.date===dt)) cum.push(m);
      const { ranking } = computeStandings(roster, cum);
      const rankIndex=new Map(ranking.map((r,i)=>[r.id,i+1]));
      for(const p of roster) byId.get(p.id).push(rankIndex.get(p.id) || roster.length);
    }
    const series=roster.map(p=>({label:p.name,data:byId.get(p.id)||[]}));
    return {labels,series};
  }, [roster, chartSource]);

  React.useEffect(()=>{
    if(tab!=="charts") return;
    // 레이더
    for(const id in radarRefs.current) radarRefs.current[id]?.chart?.destroy();
    setTimeout(()=>{
      roster.forEach(p=>{
        const el=radarRefs.current[p.id]?.ref; if(!el) return;
        radarRefs.current[p.id].chart=new Chart(el.getContext("2d"),{
          type:"radar",
          data:{labels:radarData[p.id].labels,datasets:[{label:p.name,data:radarData[p.id].values}]},
          options:{scales:{r:{min:0,max:100,ticks:{callback:v=>`${v}%`}}},plugins:{legend:{display:false}}}
        });
      });
    },0);
    // 막대
    barChart.current?.destroy();
    if(barRef.current){
      barChart.current=new Chart(barRef.current.getContext("2d"),{
        type:"bar", data:weekdaySeries, options:{scales:{y:{min:0,max:100,ticks:{callback:v=>`${v}%`}}}}
      });
    }
    // 라인
    lineChart.current?.destroy();
    if(lineRef.current){
      lineChart.current=new Chart(lineRef.current.getContext("2d"),{
        type:"line",
        data:{labels:rankingTimeline.labels,datasets:rankingTimeline.series.map(s=>({label:s.label,data:s.data,spanGaps:true}))},
        options:{scales:{y:{reverse:true,ticks:{stepSize:1}}},plugins:{legend:{position:"bottom"}}}
      });
    }
    return ()=>{
      for(const id in radarRefs.current) radarRefs.current[id]?.chart?.destroy();
      barChart.current?.destroy(); lineChart.current?.destroy();
    };
  },[tab,roster,radarData,weekdaySeries,rankingTimeline]);

  // ----------------- 백업: JSON / XLSX -----------------
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function exportJSON() {
    const payload = {
      version: 1,
      roomId,
      exportedAt: new Date().toISOString(),
      roster: roster.map(r => ({ id:r.id, name:r.name })),
      matches: history.map(m => ({
        id: m.id, date: m.date,
        aId: m.players[0].id, bId: m.players[1].id,
        aWins: m.wins[0], bWins: m.wins[1]
      })),
      matches3: history3.map(m => ({
        id: m.id, date: m.date,
        p1Id: m.players[0].id, p2Id: m.players[1].id, p3Id: m.players[2].id,
        winnerId: m.winnerId
      }))
    };
    download(`billiards_${roomId}_${today()}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" }));
  }
  function exportXLSX() {
    if (!window.XLSX) { alert("XLSX 라이브러리를 찾을 수 없습니다. index.html에 SheetJS CDN 스크립트를 추가하세요."); return; }
    const rowsMatches = [["date","aName","aWins","bName","bWins"]];
    for (const m of history) rowsMatches.push([m.date, m.players[0].name, m.wins[0], m.players[1].name, m.wins[1]]);
    const wsMatches  = XLSX.utils.aoa_to_sheet(rowsMatches);
    const rowsMatches3 = [["date","p1Name","p2Name","p3Name","winnerName"]];
    for (const m of history3) {
      const winnerName = m.players.find(p => p.id === m.winnerId)?.name || "";
      rowsMatches3.push([m.date, m.players[0].name, m.players[1].name, m.players[2].name, winnerName]);
    }
    const wsMatches3 = XLSX.utils.aoa_to_sheet(rowsMatches3);
    const rowsRoster = [["playerId","name"], ...roster.map(r=>[r.id,r.name])];
    const wsRoster   = XLSX.utils.aoa_to_sheet(rowsRoster);
    const rowsStand  = [["rank","name","games","points","wins","losses","winrate(%)"]];
    stats.ranking.forEach((r,i)=>rowsStand.push([i+1,r.name,r.games,r.points,r.wins,r.losses,(r.winrate*100).toFixed(2)]));
    const wsStand    = XLSX.utils.aoa_to_sheet(rowsStand);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsMatches,  "Matches");
    XLSX.utils.book_append_sheet(wb, wsMatches3, "Matches3");
    XLSX.utils.book_append_sheet(wb, wsRoster,   "Roster");
    XLSX.utils.book_append_sheet(wb, wsStand,    "Standings");
    const xlsxBlob = XLSX.write(wb, { bookType:"xlsx", type:"array" });
    download(`billiards_${roomId}_${today()}.xlsx`, new Blob([xlsxBlob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  // ----------------- JSON 불러오기(추가/병합) -----------------
  const [importFile, setImportFile] = React.useState(null);
  async function importJSON() {
    if (!importFile) return alert("가져올 JSON 파일을 선택하세요.");
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.matches)) throw new Error("형식이 올바르지 않습니다.");
      // 이름 기준 병합
      const nameToId = new Map(roster.map(r => [r.name, r.id]));
      for (const p of (data.roster||[])) {
        if (!nameToId.has(p.name)) {
          const res = await fetchJSON(`${baseUrl}/api/billiards/${roomId}/players`, { method:"POST", body:JSON.stringify({ name:p.name }) });
          nameToId.set(p.name, res.id);
        }
      }
      const oldIdToName = new Map((data.roster||[]).map(r=>[r.id,r.name]));
      for (const m of data.matches) {
        const aName = oldIdToName.get(m.aId) || m.aName || "A";
        const bName = oldIdToName.get(m.bId) || m.bName || "B";
        const aId = nameToId.get(aName), bId = nameToId.get(bName);
        if (!aId || !bId || aId===bId) continue;
        await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches`, {
          method:"POST",
          body: JSON.stringify({ date:m.date, aId, bId, aWins:Number(m.aWins||0), bWins:Number(m.bWins||0) })
        });
      }
      for (const m of (data.matches3||[])) {
        const p1Name = oldIdToName.get(m.p1Id);
        const p2Name = oldIdToName.get(m.p2Id);
        const p3Name = oldIdToName.get(m.p3Id);
        const winnerName = oldIdToName.get(m.winnerId);
        const p1Id = nameToId.get(p1Name), p2Id = nameToId.get(p2Name), p3Id = nameToId.get(p3Name);
        const winnerId = nameToId.get(winnerName);
        if (!p1Id || !p2Id || !p3Id || !winnerId) continue;
        await fetchJSON(`${baseUrl}/api/billiards/${roomId}/matches3`, {
          method:"POST",
          body: JSON.stringify({ date:m.date, p1Id, p2Id, p3Id, winnerId })
        });
      }
      await loadData();
      alert("가져오기가 완료되었습니다. (기존 데이터에 추가됨)");
    } catch (e) {
      alert("가져오기 실패: " + (e.message||e));
    }
  }

  // ----------------- UI -----------------
  function formatDate(ymd){ if(ymd?.length===10 && ymd[4]==="-" && ymd[7]==="-") return ymd;
    const d=new Date(ymd); return isNaN(d.getTime())? String(ymd): d.toLocaleDateString(); }
  function setLast7Days() {
    const to = today();
    const d = new Date(); d.setDate(d.getDate()-6);
    const from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    setDateFrom(from); setDateTo(to);
  }
  function clearFilters() { setFilterPlayer(""); setDateFrom(""); setDateTo(""); }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-bold">🎱 당구 전적 스코어</h1>

      {/* 서버 연결 */}
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-sm font-medium">서버 연결</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="border rounded px-3 py-2" placeholder="백엔드 주소 (예: http://localhost:8787)" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="룸 ID (예: team-a)" value={roomId} onChange={e=>setRoomId(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="API Key (선택)" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
	 <div className="flex gap-2">
	    <button onClick={loadData} className="px-3 py-2 rounded bg-black text-white flex-1">데이터 새로고침</button>
	    <button onClick={()=>setBaseUrl(DEFAULT_BASE)} className="px-3 py-2 rounded border">기본주소</button>
	  </div>

        </div>
        {(msg || err) && <div className={`text-sm ${err ? "text-red-600" : "text-green-700"}`}>{err || msg}</div>}
      </div>

      {/* 필터 & 백업 툴바 */}
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium">필터 & 백업</div>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" className="scale-110" checked={applyFilterToCharts} onChange={e=>setApplyFilterToCharts(e.target.checked)} />
            통계/차트에도 필터 적용
          </label>
        </div>

        {/* 필터 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div>
            <div className="text-xs opacity-70">선수(옵션)</div>
            <select className="border rounded px-3 py-2 w-full" value={filterPlayer} onChange={e=>setFilterPlayer(e.target.value)}>
              <option value="">전체</option>
              {roster.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs opacity-70">시작일</div>
            <input type="date" className="border rounded px-3 py-2 w-full" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-xs opacity-70">종료일</div>
            <input type="date" className="border rounded px-3 py-2 w-full" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 border rounded w-full" onClick={setLast7Days}>최근 7일</button>
            <button className="px-3 py-2 border rounded w-full" onClick={clearFilters}>초기화</button>
          </div>

          {/* 백업 버튼 */}
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-black text-white w-full" onClick={exportJSON}>JSON 내보내기</button>
            <button className="px-3 py-2 rounded bg-emerald-600 text-white w-full" onClick={exportXLSX}>엑셀 내보내기(.xlsx)</button>
          </div>
        </div>

        {/* 불러오기 */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
          <input type="file" accept=".json,application/json" className="border rounded px-3 py-2 w-full" onChange={e=>setImportFile(e.target.files?.[0]||null)} />
          <button className="px-3 py-2 rounded bg-indigo-600 text-white" onClick={importJSON}>JSON 불러오기(추가)</button>
        </div>

        <div className="text-xs text-gray-600">
          * JSON 불러오기는 **현재 데이터에 추가**됩니다. 완전한 덮어쓰기는 백엔드에서 전체 삭제 API가 필요해요.<br/>
          * 엑셀 내보내기에는 <b>Matches</b> / <b>Roster</b> / <b>Standings</b> 시트가 포함됩니다. Standings는 화면 통계 기준(필터 적용 옵션 반영)입니다.
        </div>
      </div>

      {/* 탭 */}
      <div className="w-full max-w-6xl">
        <div className="flex gap-2 flex-wrap">
          {[
            {k:"match",  l:"결과 입력"},
            {k:"setup",  l:"선수 관리"},
            {k:"history",l:"전적"},
            {k:"stats",  l:"통계"},
            {k:"charts", l:"차트"},
            {k:"tri",    l:"3인 경기"}, 
          ].map(t => (
            <button key={t.k} className={`px-3 py-2 rounded-full border ${tab===t.k? 'bg-black text-white':'bg-white'}`} onClick={()=>setTab(t.k)}>{t.l}</button>
          ))}
        </div>

        {/* 결과 입력 */}
        {tab==="match" && (
          <div className="mt-4 bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-2">
                <div className="text-sm opacity-70">일자</div>
                <input type="date" className="border rounded px-3 py-2 w-full" value={matchDate} onChange={e=>setMatchDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <div className="text-sm opacity-70">선수 A</div>
                <select className="border rounded px-3 py-2 w-full" value={pA} onChange={e=>setPA(e.target.value)}>
                  <option value="" disabled>선수 선택</option>
                  {roster.map(p => (<option key={p.id} value={p.id} disabled={p.id===pB}>{p.name}</option>))}
                </select>
                <div className="flex gap-2 items-center">
                  <input type="number" min={0} className="border rounded px-3 py-2 w-24" value={winsA} onChange={e=>setWinsA(Math.max(0, Number(e.target.value)))} />
                  <div className="text-sm">승</div>
                  <div className="flex gap-1">{[1,2,3].map(n => <button key={n} className="px-2 py-1 border rounded" onClick={()=>setWinsA(n)}>{n}</button>)}</div>
                </div>
              </div>

              <div className="text-center hidden md:flex items-center justify-center"><div className="text-3xl font-bold">VS</div></div>

              <div className="space-y-2">
                <div className="text-sm opacity-70">선수 B</div>
                <select className="border rounded px-3 py-2 w-full" value={pB} onChange={e=>setPB(e.target.value)}>
                  <option value="" disabled>선수 선택</option>
                  {roster.map(p => (<option key={p.id} value={p.id} disabled={p.id===pA}>{p.name}</option>))}
                </select>
                <div className="flex gap-2 items-center">
                  <input type="number" min={0} className="border rounded px-3 py-2 w-24" value={winsB} onChange={e=>setWinsB(Math.max(0, Number(e.target.value)))} />
                  <div className="text-sm">승</div>
                  <div className="flex gap-1">{[1,2,3].map(n => <button key={n} className="px-2 py-1 border rounded" onClick={()=>setWinsB(n)}>{n}</button>)}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 border rounded" onClick={()=>{setWinsA(0); setWinsB(0); setMatchDate(today());}}>초기화</button>
              <button className="px-3 py-2 rounded bg-black text-white disabled:opacity-50" onClick={saveSeries} disabled={!canSave}>저장</button>
            </div>
            <div className="text-xs opacity-70">예: A=1, B=1 → 승-패엔 1승/1패, 승점은 무로 각 1점.</div>
          </div>
        )}

        {/* 선수 관리 */}
        {tab==="setup" && (
          <div className="mt-4 bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="flex gap-2">
              <input className="border rounded px-3 py-2 flex-1" placeholder="선수 이름" value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addPlayer(); }} />
              <button className="px-3 py-2 rounded bg-black text-white" onClick={addPlayer}>추가</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {roster.map(p => (
                <div key={p.id} className="border rounded-xl p-3 flex items-center gap-2 bg-white">
                  <input className="border rounded px-3 py-2 flex-1" value={p.name} onChange={e=>updatePlayerName(p.id, e.target.value)} />
                  <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={()=>removePlayer(p.id)}>삭제</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 전적 (필터 적용됨 + 인라인 수정) */}
        {tab==="history" && (
          <div className="mt-4 bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="font-semibold">전적</div>
            {filteredHistory.length===0 ? (
              <div className="text-sm opacity-70">표시할 전적이 없습니다. (필터를 조정해보세요)</div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map(m => {
                  const [a,b] = m.players; const [wa, wb] = m.wins;
                  const isEdit = editId === m.id;

                  if (isEdit) {
                    return (
                      <div key={m.id} className="border rounded-xl p-3 space-y-2 bg-yellow-50">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                          <div>
                            <div className="text-xs opacity-70">일자</div>
                            <input type="date" className="border rounded px-3 py-2 w-full" value={editDate} onChange={e=>setEditDate(e.target.value)} />
                          </div>
                          <div>
                            <div className="text-xs opacity-70">선수 A</div>
                            <select className="border rounded px-3 py-2 w-full" value={editA} onChange={e=>setEditA(e.target.value)}>
                              {roster.map(p=><option key={p.id} value={p.id} disabled={p.id===editB}>{p.name}</option>)}
                            </select>
                            <div className="flex gap-2 items-center mt-1">
                              <input type="number" min={0} className="border rounded px-3 py-2 w-24" value={editWa} onChange={e=>setEditWa(Math.max(0, Number(e.target.value)))} />
                              <span className="text-xs">승</span>
                            </div>
                          </div>
                          <div className="hidden md:flex items-center justify-center">
                            <div className="text-2xl font-bold">VS</div>
                          </div>
                          <div>
                            <div className="text-xs opacity-70">선수 B</div>
                            <select className="border rounded px-3 py-2 w-full" value={editB} onChange={e=>setEditB(e.target.value)}>
                              {roster.map(p=><option key={p.id} value={p.id} disabled={p.id===editA}>{p.name}</option>)}
                            </select>
                            <div className="flex gap-2 items-center mt-1">
                              <input type="number" min={0} className="border rounded px-3 py-2 w-24" value={editWb} onChange={e=>setEditWb(Math.max(0, Number(e.target.value)))} />
                              <span className="text-xs">승</span>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button className="px-3 py-2 border rounded" onClick={cancelEdit}>취소 (Esc)</button>
                            <button className="px-3 py-2 rounded bg-black text-white disabled:opacity-50" onClick={saveEdit} disabled={!canEditSave}>저장 (Enter)</button>
                          </div>
                        </div>
                        {!canEditSave && (
                          <div className="text-xs text-orange-700">
                            * A/B는 서로 달라야 하고, 승수는 둘 중 하나 이상 0보다 커야 합니다.
                          </div>
                        )}
                      </div>
                    );
                  }

                  const result = (wa===wb) ? "무승부" : (wa>wb ? `${a.name} 승` : `${b.name} 승`);
                  return (
                    <div key={m.id} className="border rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm opacity-70">{formatDate(m.date)}</div>
                        <div className="text-base font-medium">{a.name} <b>{wa}</b> – <b>{wb}</b> {b.name}</div>
                        <div className="text-sm opacity-80">결과: <b>{result}</b></div>
                      </div>
                      <div className="flex gap-2">
                        <button className="px-3 py-2 rounded border" onClick={()=>startEdit(m)}>수정</button>
                        <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={()=>deleteMatch(m.id)}>삭제</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 통계(표) */}
        {tab==="stats" && (
          <div className="mt-4 bg-white rounded-2xl shadow p-4 space-y-8">
            {/* 순위표 */}
            <section>
              <div className="font-semibold mb-2">
                리그 순위표 (누적 대전 승점: 승=3, 무=1){applyFilterToCharts && " — 필터 적용"}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm border">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left">순위</th>
                      <th className="p-2 text-left">선수명</th>
                      <th className="p-2 text-right">경기</th>
                      <th className="p-2 text-right">승점</th>
                      <th className="p-2 text-right">승-패</th>
                      <th className="p-2 text-right">승률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.ranking.map((r, idx)=>(
                      <tr key={r.id} className={`border-t ${idx===0 ? "bg-yellow-100" : ""}`}>
                        <td className="p-2">{idx+1}</td>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-right">{r.games}</td>
                        <td className="p-2 text-right">{r.points}</td>
                        <td className={"p-2 text-right " + wlTextClass(r.wins, r.losses)}>{r.wins} - {r.losses}</td>
                        <td className={"p-2 text-right " + wrTextClass(r.winrate)}>{(r.winrate*100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs opacity-60 mt-2">
                * “경기”, “승-패”, “승률”은 **게임 기준**(승+패). 무승부는 승점 계산 시에만 반영됩니다.
              </div>
            </section>

            {/* 대전표 */}
            <section>
              <div className="font-semibold mb-2">대전 결과 (셀: A : B, 게임 기준){applyFilterToCharts && " — 필터 적용"}</div>
              {roster.length<2 || (applyFilterToCharts ? filteredHistory.length===0 : history.length===0) ? (
                <div className="text-sm opacity-70">표시할 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-sm border">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left">A:B</th>
                        {roster.map(p => (<th key={p.id} className="p-2 text-left">{p.name}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(ri => (
                        <tr key={ri.id} className="border-t">
                          <td className="p-2 font-medium bg-gray-50">{ri.name}</td>
                          {roster.map(cj => {
                            if (ri.id === cj.id) return <td key={cj.id} className="p-2 text-center bg-gray-50">—</td>;
                            const ps = stats.pairScore(ri.id, cj.id);
                            return (
                              <td key={cj.id} className={"p-2 text-center " + h2hTextClass(ps.a, ps.b)}>
                                {ps.a} : {ps.b}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* 차트 탭 */}
        {tab==="charts" && (
          <div className="mt-4 bg-white rounded-2xl shadow p-5 space-y-10">
            <h2 className="text-xl font-semibold">차트{applyFilterToCharts && " (필터 적용)"}</h2>

            {/* 1) 상대별 승률 */}
            <section>
              <div className="text-lg font-semibold mb-3">상대별 승률</div>
              {roster.length<=1 ? (
                <div className="text-sm opacity-70">표시할 선수가 부족합니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {roster.map(p => (
                    <div key={p.id} className="border rounded-xl p-3">
                      <div className="font-medium mb-2">{p.name}</div>
                      <canvas ref={el => {
                        if (!radarRefs.current[p.id]) radarRefs.current[p.id] = { ref: null, chart: null };
                        radarRefs.current[p.id].ref = el;
                      }} height="220"></canvas>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 2) 요일별 승률 */}
            <section>
              <div className="text-lg font-semibold mb-3">플레이어 요일별 승률</div>
              <div className="border rounded-xl p-3">
                <canvas ref={barRef} height="260"></canvas>
              </div>
            </section>

            {/* 3) 순위 변동 (누적 대전 승점 기준) */}
            <section>
              <div className="text-lg font-semibold mb-3">플레이어 순위 변동</div>
              {rankingTimeline.labels?.length===0 ? (
                <div className="text-sm opacity-70">표시할 데이터가 없습니다.</div>
              ) : (
                <div className="border rounded-xl p-3">
                  <canvas ref={lineRef} height="260"></canvas>
                </div>
              )}
            </section>
          </div>
        )}

{tab==="tri" && (
  <div className="mt-4 bg-white rounded-2xl shadow p-4 space-y-6">
    <div className="font-semibold">3인 경기 입력</div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div>
        <div className="text-xs opacity-70">일자</div>
        <input type="date" className="border rounded px-3 py-2 w-full"
               value={m3Date} onChange={e=>setM3Date(e.target.value)} />
      </div>

      {[{s:m3P1,set:setM3P1,label:"선수 1"},
        {s:m3P2,set:setM3P2,label:"선수 2"},
        {s:m3P3,set:setM3P3,label:"선수 3"}].map((row, i)=>(
        <div key={i}>
          <div className="text-xs opacity-70">{row.label}</div>
          <select className="border rounded px-3 py-2 w-full"
                  value={row.s} onChange={e=>row.set(e.target.value)}>
            <option value="" disabled>선수 선택</option>
            {roster.map(p=>(
              <option key={p.id} value={p.id}
                disabled={[m3P1,m3P2,m3P3].includes(p.id) && p.id!==row.s}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>

    <div className="text-sm opacity-70">승자 선택</div>
    <div className="flex flex-wrap gap-3">
      {[m3P1, m3P2, m3P3].filter(Boolean).map(id=>{
        const name = roster.find(p=>p.id===id)?.name || id;
        return (
          <label key={id} className="flex items-center gap-2 border rounded-full px-3 py-1">
            <input type="radio" name="winner3" checked={m3Winner===id} onChange={()=>setM3Winner(id)} />
            <span>{name}</span>
          </label>
        );
      })}
    </div>

    <div className="flex justify-end gap-2">
      <button className="px-3 py-2 border rounded"
              onClick={()=>{ setM3Date(today()); setM3P1(""); setM3P2(""); setM3P3(""); setM3Winner(""); }}>
        초기화
      </button>
      <button className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
              disabled={!canSave3} onClick={saveMatch3}>
        저장
      </button>
    </div>

    <div className="h-px bg-gray-200" />

    <div className="font-semibold">3인 경기 전적</div>
    {filteredHistory3.length===0 ? (
      <div className="text-sm opacity-70">표시할 3인 전적이 없습니다. (필터를 조정해보세요)</div>
    ) : (
      <div className="space-y-2">
        {filteredHistory3.map(m=>{
          const wname = m.players.find(p=>p.id===m.winnerId)?.name || m.winnerId;
          return (
            <div key={m.id} className="border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">{m.date}</div>
                <div className="text-sm">
                  {m.players.map(p=>p.name).join(' / ')} → <b>{wname}</b> 승
                </div>
              </div>
              <button className="px-3 py-2 rounded bg-red-600 text-white"
                      onClick={()=>deleteMatch3(m.id)}>삭제</button>
            </div>
          );
        })}
      </div>
    )}

    <div className="h-px bg-gray-200" />

    <div className="font-semibold mb-2">3인 경기 통계 (승점=승리수, 승률=승/경기)</div>
    <div className="overflow-x-auto">
      <table className="min-w-[560px] w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">순위</th>
            <th className="p-2 text-left">선수명</th>
            <th className="p-2 text-right">경기</th>
            <th className="p-2 text-right">승점</th>
            <th className="p-2 text-right">승</th>
            <th className="p-2 text-right">승률</th>
          </tr>
        </thead>
        <tbody>
          {triStats.ranking.map((r, i)=>(
            <tr key={r.id} className={`border-t ${i===0 ? "bg-yellow-100" : ""}`}>
              <td className="p-2">{i+1}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2 text-right">{r.games}</td>
              <td className="p-2 text-right">{r.points}</td>
              <td className="p-2 text-right">{r.wins}</td>
              <td className="p-2 text-right">{(r.winrate*100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}




      </div>

      <footer className="text-xs opacity-60 mt-2 text-center">
        백엔드 주소와 룸 ID를 입력 후 사용하세요. (선택) API Key가 설정된 경우 프런트에서도 같은 키를 입력합니다.
      </footer>

    </div>
  );
}

window.App = App;




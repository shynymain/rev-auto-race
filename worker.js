const CORS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization"
};
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: CORS });

function todayJST(){
  const d = new Date(Date.now()+9*3600*1000);
  return d.toISOString().slice(0,10).replaceAll('-','/');
}
function futureRaces(){
  const date = todayJST();
  const places = ['東京','京都','新潟'];
  const races = [];
  let id = 1;
  for(const place of places){
    for(let r=1;r<=12;r++){
      const isMain = r===11;
      const grade = isMain ? (place==='東京' ? 'G1' : place==='京都' ? 'G2' : 'G3') : (r>=9 ? '3勝/特別' : '2勝');
      const surface = r<=2 ? 'ダート' : '芝';
      const distance = [1200,1400,1600,1800,2000,2200,2400][r%7]+'m';
      const age = r<=3 ? '3歳' : '3歳以上';
      const headcount = r<=2 ? 10 : 14 + (r%5);
      races.push({
        id: `auto-${date}-${place}-${r}`,
        date, place, raceNo: String(r), raceName: isMain ? `${place}メイン` : `${place}${r}R`,
        grade, condition: `${surface}${distance} ${age}`, surface, age, distance, headcount,
        status: 'before_result', source: 'worker-auto',
        horses: makeHorses(headcount),
        prediction: null, result: null
      });
      id++;
    }
  }
  return races;
}
function historicalRaces(){
  const names = [
    ['2024/05/26','東京','11','日本ダービー','G1','芝','3歳','2400m',18],
    ['2024/06/02','東京','11','安田記念','G1','芝','3歳以上','1600m',18],
    ['2024/06/23','京都','11','宝塚記念','G1','芝','3歳以上','2200m',13],
    ['2024/10/27','東京','11','天皇賞秋','G1','芝','3歳以上','2000m',15],
    ['2024/11/24','東京','12','ジャパンカップ','G1','芝','3歳以上','2400m',14],
    ['2024/12/22','中山','11','有馬記念','G1','芝','3歳以上','2500m',16],
    ['2025/02/16','京都','11','京都記念','G2','芝','4歳以上','2200m',12],
    ['2025/03/02','中山','11','中山記念','G2','芝','4歳以上','1800m',16],
    ['2025/03/23','阪神','11','阪神大賞典','G2','芝','4歳以上','3000m',11],
    ['2025/04/06','阪神','11','大阪杯','G1','芝','4歳以上','2000m',15],
    ['2025/04/13','阪神','11','桜花賞','G1','芝','3歳牝','1600m',18],
    ['2025/04/20','中山','11','皐月賞','G1','芝','3歳','2000m',18]
  ];
  return names.map((x,i)=>({
    id:`hist-${i+1}`, date:x[0], place:x[1], raceNo:x[2], raceName:x[3], grade:x[4],
    condition:`${x[5]}${x[7]} ${x[6]}`, surface:x[5], age:x[6], distance:x[7], headcount:x[8],
    status:'result_done', source:'worker-sample-history', horses:makeHorses(x[8]),
    prediction:null,
    result:{ firstNo:'5', secondNo:'14', thirdNo:'15', umaren:'5-14', umarenPay: 1850+i*120, sanrenpuku:'5-14-15', sanrenpukuPay: 6420+i*410 }
  }));
}
function makeHorses(n){
  const base = ['アーク','ブレイブ','クラウン','ディープ','エール','フォース','グラン','ハーツ','アイアン','ジャスティ','キング','ルージュ','ミラクル','ノーブル','オメガ','プライム','クイーン','レッド'];
  return Array.from({length:n},(_,i)=>{
    const no=i+1;
    const odds = (2.1 + (i*1.37)%38).toFixed(1);
    return { frame: String(Math.min(8, Math.floor(i/2)+1)), no:String(no), name:`${base[i%base.length]}${no}`, last1:String((i*3+1)%10), last2:String((i*5+4)%10), last3:String((i*7+9)%10), odds, popularity:'' };
  });
}
function calcPopularity(horses){
  const sorted=[...horses].filter(h=>h.odds).sort((a,b)=>Number(a.odds)-Number(b.odds));
  let rank=1, prev=null, count=0;
  const map={};
  sorted.forEach(h=>{ count++; if(prev!==null && Number(h.odds)!==prev) rank=count; prev=Number(h.odds); map[h.no]=rank; });
  return horses.map(h=>({...h, popularity: map[h.no] ? String(map[h.no]) : h.popularity||''}));
}
function markHorse(h){
  const vals=[h.last1,h.last2,h.last3].map(v=>String(v||'').replace(/\D/g,'')).filter(Boolean);
  if(vals.length<3) return {mark:'', reason:'前3走不足'};
  const lastDigits=vals.map(v=>Number(v.slice(-1)));
  if(lastDigits.some(v=>v===0)) return {mark:'', reason:'中止/除外/取消含む'};
  const seq=lastDigits.join('');
  const sumDigit=String(lastDigits.reduce((a,b)=>a+b,0)).slice(-1);
  const kousei = lastDigits.includes(1) && (lastDigits.includes(5)||lastDigits.includes(4)) && (lastDigits.includes(9)||lastDigits.includes(8)||lastDigits.includes(6));
  if(new Set(lastDigits).size===1 || ['149','146','185'].includes(seq) || kousei) return {mark:'◎', reason:`ライン発生源 ${seq}`};
  if(sumDigit==='5') return {mark:'○', reason:'前3走合計 下一桁5'};
  if(sumDigit==='9') return {mark:'▲', reason:'前3走合計 下一桁9'};
  return {mark:'', reason:`該当なし ${seq}`};
}
function predictRace(race){
  let horses = calcPopularity(race.horses||[]).map(h=>({...h, ...markHorse(h)}));
  const marks = horses.filter(h=>h.mark);
  const targetBase = race.surface==='芝' && Number(race.headcount||horses.length)>=12 && !/ハンデ/.test(race.condition||'') && !/2歳|未勝利|新馬|1勝/.test((race.age||'')+(race.condition||'')+(race.grade||''));
  const fiveNos = new Set(['5','14','15']);
  const connected = horses.filter(h=>fiveNos.has(h.no) || marks.some(m=>Math.abs(Number(m.no)-Number(h.no))===1));
  const mid = horses.filter(h=>Number(h.popularity)>=3 && Number(h.popularity)<=7);
  const type = !targetBase || marks.length<=1 ? 'B型' : (marks.filter(h=>h.mark==='◎').length>=2 && connected.length>=2 && mid.length>=2 ? 'S型' : 'A型');
  const scored = horses.map(h=>{
    let score=0;
    if(fiveNos.has(h.no)) score+=5;
    if(connected.some(c=>c.no===h.no)) score+=3;
    if(h.mark==='◎') score+=4; if(h.mark==='○') score+=2; if(h.mark==='▲') score+=1;
    const p=Number(h.popularity||99); if(p>=3&&p<=7) score+=4; if(p<=2) score+=1;
    return {...h, score};
  }).sort((a,b)=>b.score-a.score || Number(b.popularity)-Number(a.popularity));
  const axis=scored[0]||{};
  const others=scored.filter(h=>h.no!==axis.no).slice(0,5);
  const umaren=others.slice(0,3).map(h=>[axis.no,h.no].sort((a,b)=>Number(a)-Number(b)).join('-'));
  const sanrenpuku=[];
  for(let i=0;i<others.length;i++) for(let j=i+1;j<others.length;j++) sanrenpuku.push([axis.no,others[i].no,others[j].no].sort((a,b)=>Number(a)-Number(b)).join('-'));
  const aiDecision = type==='S型' || type==='A型' ? '勝負' : '見送り';
  return { ok:true, raceId:race.id||'', type, targetBase, aiDecision, userDecisionDefault:aiDecision, axisNo:axis.no||'', axisName:axis.name||'', confidence:type==='S型'?'高':type==='A型'?'中':'低', umaren:umaren.slice(0,3), sanrenpuku:sanrenpuku.slice(0,type==='S型'?6:0), horses:scored, memo:'完全放置版: AI判定と自分判定を分けて保存してください。回収率は自分判定を優先。' };
}
async function readBody(request){ try{return await request.json();}catch{return {};} }

export default {
  async fetch(request, env) {
    if(request.method==='OPTIONS') return json({ok:true});
    const url = new URL(request.url);
    const path = url.pathname;
    try{
      if(path==='/' || path==='/api' || path==='/api/health') return json({ok:true, service:'rev-auto-race-complete-worker', version:'complete-autopilot-v1', endpoints:['/api/health','/api/schedule','/api/future-races','/api/results','/api/advice','/api/target-filter','/api/races']});
      if(path==='/api/schedule' || path==='/api/future-races'){
        const races=[...historicalRaces(), ...futureRaces()].map(r=>({...r, horses:calcPopularity(r.horses)}));
        return json({ok:true, count:races.length, races});
      }
      if(path==='/api/results'){
        const races=historicalRaces().map(r=>({...r, prediction:predictRace(r)}));
        return json({ok:true, count:races.length, races});
      }
      if(path==='/api/target-filter'){
        const races=[...historicalRaces(), ...futureRaces()].map(r=>({...r, prediction:predictRace(r)}));
        return json({ok:true, sType:races.filter(r=>r.prediction.type==='S型'), roi100:races.filter(r=>(r.result?.umarenPay||0)>300), aiUserDiff:[]});
      }
      if(path==='/api/advice'){
        const body = request.method==='POST' ? await readBody(request) : {};
        const race = body.race || body || futureRaces()[0];
        return json(predictRace({...race, horses:race.horses||makeHorses(Number(race.headcount||16))}));
      }
      if(path==='/api/races'){
        const races=[...historicalRaces(), ...futureRaces()].map(r=>({...r, prediction:predictRace(r)}));
        return json({ok:true, count:races.length, races});
      }
      return json({ok:false, error:'not found', path, endpoints:['/api/health','/api/schedule','/api/results','/api/advice']}, 404);
    }catch(e){ return json({ok:false, error:String(e?.message||e)}, 500); }
  }
};

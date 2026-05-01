export default {
  async fetch(request, env) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    };

    if (request.method === "OPTIONS") return new Response(JSON.stringify({ ok:true }), { headers });

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok:true, service:"rev-auto-race-import-worker", version:"v1" }, headers);
    }

    // 今週以降の対象レース自動取得用
    // 実運用ではJRA-VAN/公式/既存schedule WorkerのJSONをここで中継。
    // 取得先が未設定でもUIが壊れないよう、空配列で返す。
    if (url.pathname === "/api/future-races") {
      const scheduleApi = url.searchParams.get("scheduleApi") || "";
      if (scheduleApi) {
        try {
          const res = await fetch(scheduleApi);
          const data = await res.json();
          const races = normalizeRaces(data.races || data || []);
          return json({ ok:true, source:"scheduleApi", count:races.length, races }, headers);
        } catch (e) {
          return json({ ok:false, error:String(e), races:[] }, headers, 500);
        }
      }
      return json({ ok:true, source:"empty", count:0, races:[] }, headers);
    }

    if (url.pathname === "/api/target-filter" && request.method === "POST") {
      const body = await request.json();
      const races = normalizeRaces(body.races || []);
      const filtered = races.filter(isTargetRace);
      return json({ ok:true, count:filtered.length, races:filtered }, headers);
    }

    return json({ ok:true, endpoints:["/api/health","/api/future-races","/api/target-filter"] }, headers);
  }
};

function json(obj, headers, status=200) {
  return new Response(JSON.stringify(obj), { status, headers });
}

function normalizeRaces(rows) {
  return (Array.isArray(rows) ? rows : []).map((r, i) => {
    const race = r.race || r;
    return {
      id: race.id || `${race.date || ""}-${race.place || ""}-${race.raceNo || i}`,
      source: race.source || "auto",
      date: race.date || "",
      place: race.place || "",
      raceNo: race.raceNo || race.no || "",
      raceName: race.raceName || race.name || "",
      grade: race.grade || "",
      condition: race.condition || "",
      surface: race.surface || "",
      distance: race.distance || "",
      age: race.age || "",
      headcount: race.headcount || race.runners || "",
      status: "future",
      aiDecision: race.aiDecision || "未選択",
      userDecision: race.userDecision || "未選択",
      type: race.type || "",
      axis: race.axis || "",
      bet: race.bet || "",
      invest: Number(race.invest || 0),
      payout: Number(race.payout || 0),
      horses: r.horses || race.horses || [],
      result: r.result || race.result || {},
      memo: race.memo || "今週以降自動取得"
    };
  }).filter(isTargetRace);
}

function isTargetRace(r) {
  const grade = String(r.grade || "");
  const surface = String(r.surface || "");
  const condition = String(r.condition || r.age || "");
  const headcount = Number(r.headcount || 0);

  // 絶対除外
  if (surface && !surface.includes("芝")) return false;
  if (condition.includes("2歳")) return false;
  if (condition.includes("新馬") || condition.includes("未勝利") || condition.includes("1勝")) return false;
  if (grade === "G3" && condition.includes("ハンデ")) return false;
  if (headcount && headcount <= 11) return false;

  // 対象
  if (["G1","G2"].includes(grade)) return true;
  if (grade === "G3") return true;
  if (grade.includes("OP") || grade.includes("L") || condition.includes("特別")) return true;
  if (condition.includes("2勝") || condition.includes("3勝")) return true;

  return false;
}

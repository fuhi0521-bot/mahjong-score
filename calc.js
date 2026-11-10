// 点数計算まわりの純粋な関数（画面に依存しない）
// ポイントは小数の誤差を避けるため「10倍した整数（pt10）」で扱う。例: +52.3pt → 523
(function (root) {
  const SEAT_NAMES = ['東', '南', '西', '北'];
  const NAME_MAX = 10;

  // おすすめルール（一括で選べるもの）
  const PRESETS = [
    {
      id: 'mleague', mode: 4, name: 'Mリーグルール',
      desc: 'プロリーグ「Mリーグ」と同じ計算。ウマが大きく、順位の差がはっきり出ます。飛び賞・チップなし。',
      start: 25000, ret: 30000, uma: [30, 10, -10, -30], tobiPt: 0, chipPt: 0, rate: 0,
    },
    {
      id: 'free', mode: 4, name: '雀荘（フリー）風',
      desc: '街の雀荘で知らない人と打つ「フリー」でよくある形。ウマは小さめで、飛び賞とチップで盛り上がります。',
      start: 25000, ret: 30000, uma: [10, 5, -5, -10], tobiPt: 10, chipPt: 2, rate: 0,
    },
    {
      id: 'home', mode: 4, name: '仲間内の定番',
      desc: '家や仲間内でよく使われる、ほどよいウマ（10-20）。飛び賞あり。',
      start: 25000, ret: 30000, uma: [20, 10, -10, -20], tobiPt: 10, chipPt: 0, rate: 0,
    },
    {
      id: 'simple4', mode: 4, name: 'シンプル（ウマなし）',
      desc: '持ち点の増減だけで計算します。初めての人にもわかりやすいルール。',
      start: 25000, ret: 25000, uma: [0, 0, 0, 0], tobiPt: 0, chipPt: 0, rate: 0,
    },
    {
      id: 'sanma', mode: 3, name: '三麻の定番',
      desc: '35000点持ち・40000点返し、ウマ±20。飛び賞とチップあり。',
      start: 35000, ret: 40000, uma: [20, 0, -20], tobiPt: 10, chipPt: 2, rate: 0,
    },
    {
      id: 'simple3', mode: 3, name: '三麻シンプル（ウマなし）',
      desc: '持ち点の増減だけで計算します。',
      start: 35000, ret: 35000, uma: [0, 0, 0], tobiPt: 0, chipPt: 0, rate: 0,
    },
  ];

  // マイルールを作るときの選択肢
  const OPTIONS = {
    base: {
      4: [[25000, 30000], [25000, 25000], [30000, 30000]],
      3: [[35000, 40000], [35000, 35000], [40000, 40000]],
    },
    uma: {
      4: [[10, 5, -5, -10], [20, 10, -10, -20], [30, 10, -10, -30], [30, 20, -20, -30], [0, 0, 0, 0]],
      3: [[10, 0, -10], [15, 0, -15], [20, 0, -20], [0, 0, 0]],
    },
    tobiPt: [0, 5, 10, 20],
    chipPt: [0, 1, 2, 5, 10],
    // チップを「収支で決める」ときの1枚あたりの数（レートはかけずに収支へ足す）
    chipSet: [0, 10, 20, 30, 50, 100],
    rate: [0, 30, 50, 100, 200],
  };

  function baseLabel([start, ret]) {
    return `${start.toLocaleString('ja-JP')}点持ち ${ret.toLocaleString('ja-JP')}点返し`;
  }
  function umaLabel(uma) {
    if (uma.every((u) => u === 0)) return 'なし';
    if (uma.length === 3) return `±${uma[0]}`;
    return `${Math.abs(uma[1])}-${Math.abs(uma[0])}`;
  }
  function tobiLabel(pt) { return pt ? `${pt}pt` : 'なし'; }
  function chipLabel(pt, unit) { return !pt ? 'なし' : unit === 'settle' ? `1枚 収支${pt}` : `1枚${pt}pt`; }
  // チップを「収支で決める」か（chipUnit: 'settle'）。レートがあるときだけ有効
  function chipBySettle(rule) { return rule.chipUnit === 'settle' && rule.rate > 0; }
  // レートは収支ptの倍率（金額は扱わない）。1pt＝1,000点あたりの数で、テンピン（1,000点100）なら ×100
  function rateLabel(rate) {
    // 倍率（×100 など）は画面に出さない。「その他」で入れた数字は「その他（7.5）」
    return { 0: 'なし', 30: 'テンサン', 50: 'テンゴ', 100: 'テンピン', 200: 'テンリャンピン' }[rate] || `その他（${rate}）`;
  }

  function ruleSummary(rule) {
    return [
      baseLabel([rule.start, rule.ret]),
      `ウマ${umaLabel(rule.uma)}`,
      `飛び賞${tobiLabel(rule.tobiPt)}`,
      `チップ${chipLabel(rule.chipPt, rule.chipUnit)}`,
      ...(rule.rate ? [`レート ${rateLabel(rule.rate)}`] : []),
    ].join('・');
  }

  // 半荘の合計点数（4人×25000 = 100000 など）
  function expectedTotal(rule, n) {
    return rule.start * n;
  }

  // オカ（トップ取り）。(返し - 持ち点) × 人数
  function okaPt10(rule, n) {
    return ((rule.ret - rule.start) * n) / 100;
  }

  // seats: [{ pid, score }]。同点のときは並びが先の人を上位にする（起家に近い順に並べておく）
  // tobiBy: 飛ばした人の pid（いなければ null）
  // 戻り値: 順位順の配列 [{ pid, score, seat, rank, pt10, busted, tobi10 }]
  function calcGame(seats, rule, tobiBy) {
    const n = seats.length;
    const oka10 = okaPt10(rule, n);
    const results = seats
      .map((s, seat) => ({ pid: s.pid, score: s.score, seat }))
      // 同点は起家に近い人が上位（上家取り）
      .sort((a, b) => b.score - a.score || a.seat - b.seat)
      .map((s, i) => ({
        ...s,
        rank: i + 1,
        pt10: (s.score - rule.ret) / 100 + Math.round(rule.uma[i] * 10) + (i === 0 ? oka10 : 0),
        busted: s.score < 0,
        tobi10: 0,
      }));

    const buster = rule.tobiPt ? results.find((r) => r.pid === tobiBy && !r.busted) : null;
    if (buster) {
      const tobi10 = Math.round(rule.tobiPt * 10);
      for (const r of results) {
        if (!r.busted) continue;
        r.pt10 -= tobi10;
        r.tobi10 -= tobi10;
        buster.pt10 += tobi10;
        buster.tobi10 += tobi10;
      }
    }
    return results;
  }

  // その日（セッション）の集計
  function summarizeSession(session) {
    const rule = session.rule;
    const rows = {};
    for (const pid of session.playerIds) {
      rows[pid] = { pid, pt10: 0, games: 0, ranks: [0, 0, 0, 0], chips: 0 };
    }
    for (const g of session.games) {
      for (const r of calcGame(g.seats, rule, g.tobiBy)) {
        const row = rows[r.pid];
        if (!row) continue;
        row.pt10 += r.pt10;
        row.games += 1;
        row.ranks[r.rank - 1] += 1;
      }
    }
    for (const pid of session.playerIds) {
      const row = rows[pid];
      row.chips = rule.chipPt ? Number((session.chips || {})[pid]) || 0 : 0;
      const bySettle = chipBySettle(rule);
      row.total10 = row.pt10 + (bySettle ? 0 : Math.round(row.chips * rule.chipPt * 10));
      // レートなしの対局は ×1 として扱う。端数（×7.5 などのとき）はプラスもマイナスも同じく四捨五入する
      // チップを収支で決めているときは、チップの分はレートをかけずに収支へそのまま足す
      const raw = row.total10 * (rule.rate || 1);
      row.chipSettle10 = bySettle ? Math.round(row.chips * rule.chipPt * 10) : 0; // 収支のうち「収支で決める」チップの分
      row.settle10 = Math.sign(raw) * Math.round(Math.abs(raw)) + row.chipSettle10;
    }
    return session.playerIds.map((pid) => rows[pid]);
  }

  // 個人成績。sessions は対象の対局（人数・期間で絞り込み済み）を日付順に渡す
  // 戻り値: { [pid]: { games, ranks, pt10, chip10, total10, settle10, hasSettle, busted, busts, maxScore, maxPt10, history } }
  function playerStats(sessions) {
    const stats = {};
    const get = (pid) => stats[pid] || (stats[pid] = {
      pid, games: 0, ranks: [0, 0, 0, 0], pt10: 0, chip10: 0, settle10: 0, hasSettle: false,
      busted: 0, busts: 0, maxScore: null, maxPt10: null, history: [],
    });
    for (const s of sessions) {
      for (const g of s.games) {
        for (const r of calcGame(g.seats, s.rule, g.tobiBy)) {
          const st = get(r.pid);
          st.games += 1;
          st.ranks[r.rank - 1] += 1;
          st.pt10 += r.pt10;
          if (r.busted) st.busted += 1;
          if (r.tobi10 > 0) st.busts += Math.round(r.tobi10 / (s.rule.tobiPt * 10));
          if (st.maxScore === null || r.score > st.maxScore) st.maxScore = r.score;
          if (st.maxPt10 === null || r.pt10 > st.maxPt10) st.maxPt10 = r.pt10;
          st.history.push({ date: s.date, pt10: r.pt10 });
        }
      }
      // チップと金額は対局（その日）単位
      for (const row of summarizeSession(s)) {
        if (!row.games) continue;
        const st = get(row.pid);
        st.chip10 += row.total10 - row.pt10;
        st.settle10 += row.settle10;
        if (s.rule.rate > 0) st.hasSettle = true;
      }
    }
    for (const st of Object.values(stats)) {
      st.total10 = st.pt10 + st.chip10;
      const n = st.games || 1;
      st.avgRank = st.ranks.reduce((a, c, i) => a + c * (i + 1), 0) / n;
    }
    return stats;
  }

  // ---------- 和了点の計算（四麻） ----------
  // 基準（basis）は2つ。違いは次のとおり（2026-10 時点の各公式ルールより）
  //   jantama（雀魂）  : 切り上げ満貫なし。13翻以上は数え役満
  //   mleague（Mリーグ）: 30符4翻・60符3翻は満貫（切り上げ満貫）。役満以外は三倍満まで（数え役満なし）
  // どちらも役満の複合（ダブル役満・トリプル役満）はあり、1本場は300点
  const BASES = {
    jantama: { name: '雀魂', kiriage: false, kazoe: true },
    mleague: { name: 'Mリーグ', kiriage: true, kazoe: false },
  };
  const YAKUMAN_NAMES = ['', '役満', 'ダブル役満', 'トリプル役満'];
  const ceil100 = (v) => Math.ceil(v / 100) * 100;

  // 存在しない符・翻の組み合わせなら理由を返す
  function handInvalid(fu, han, tsumo) {
    if (han >= 5) return null; // 満貫以上は符に関係ない
    if (fu === 20 && !tsumo) return '20符のロンはありません（ロンの平和は30符）';
    if (fu === 20 && han === 1) return '20符1翻はありません（平和ツモは2翻から）';
    if (fu === 25 && han === 1) return '25符1翻はありません（七対子は2翻から）';
    return null;
  }

  // 翻と符から、満貫以上の名前と基本点を決める
  function handBase(fu, han, basis, yakuman) {
    if (yakuman) return { name: YAKUMAN_NAMES[yakuman], base: 8000 * yakuman };
    const b = BASES[basis] || BASES.jantama;
    if (han >= 13 && b.kazoe) return { name: '数え役満', base: 8000 };
    if (han >= 11) return { name: '三倍満', base: 6000 };
    if (han >= 8) return { name: '倍満', base: 4000 };
    if (han >= 6) return { name: '跳満', base: 3000 };
    if (han >= 5) return { name: '満貫', base: 2000 };
    if (b.kiriage && ((han === 4 && fu >= 30) || (han === 3 && fu >= 60))) return { name: '満貫（切り上げ）', base: 2000 };
    const base = fu * 2 ** (han + 2);
    return base > 2000 ? { name: '満貫', base: 2000 } : { name: '', base }; // 4翻40符・3翻70符など
  }

  // fu: 符、han: 翻、dealer: 親か、tsumo: ツモか、honba: 本場、basis: 'jantama' | 'mleague'
  // yakuman: 役満の役で和了ったときの倍数（1=役満, 2=ダブル役満, 3=トリプル役満。0なら翻で計算）
  // 戻り値: { name, base, total, ron | (tsumoDealer, tsumoChild | tsumoAll) }
  function handPoints({ fu, han, dealer, tsumo, honba = 0, basis = 'jantama', yakuman = 0 }) {
    const { name, base } = handBase(fu, han, basis, yakuman);
    if (!tsumo) {
      const ron = ceil100(base * (dealer ? 6 : 4)) + honba * 300;
      return { name, base, ron, total: ron };
    }
    if (dealer) {
      const all = ceil100(base * 2) + honba * 100;
      return { name, base, tsumoAll: all, total: all * 3 };
    }
    const fromDealer = ceil100(base * 2) + honba * 100;
    const fromChild = ceil100(base) + honba * 100;
    return { name, base, tsumoDealer: fromDealer, tsumoChild: fromChild, total: fromDealer + fromChild * 2 };
  }

  function formatPct(v) {
    return (v * 100).toFixed(1) + '%';
  }

  function formatPt(pt10) {
    const sign = pt10 > 0 ? '+' : pt10 < 0 ? '−' : '±';
    return sign + (Math.abs(pt10) / 10).toFixed(1);
  }

  // 収支：3桁ごとにカンマを付け、単位 pt を付ける。整数になるときは「.0」を付けない（例: +25,000pt）
  // withUnit=false は表のマスの中（幅が狭いので単位は行の説明に書く）
  function formatSettle(pt10, withUnit = true) {
    const sign = pt10 > 0 ? '+' : pt10 < 0 ? '−' : '±';
    const v = Math.abs(pt10) / 10;
    return sign + v.toLocaleString('ja-JP', { minimumFractionDigits: pt10 % 10 ? 1 : 0, maximumFractionDigits: 1 }) + (withUnit ? 'pt' : '');
  }

  function formatScore(score) {
    return score.toLocaleString('ja-JP');
  }

  // 名前の文字数（絵文字なども1文字として数える）
  function nameLength(name) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(name)].length;
    }
    return Array.from(name).length;
  }

  // ---------- 友達に送る（対局をリンク・QRコード用の短い文字にする） ----------
  // 中身：{ v:1, i:元の対局ID, d:日付, n:名前, m:3|4, r:ルール名, u:ルール, k:点数の単位,
  //        p:[[送った人の端末のID, 名前, アイコン]], g:[[[席の人の番号, 点数/k], ...], 飛ばした人の番号|-1],
  //        c:[人ごとのチップ枚数] }
  // 写真は送らない。リンクの「#」より後ろに入れるので、Web版を開いてもサーバーには送られない。
  const SHARE_VERSION = 1;
  const SHARE_RULE_KEYS = ['start', 'ret', 'uma', 'tobiPt', 'chipPt', 'chipUnit', 'rate'];
  const toB64url = (bytes) => {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (str) => {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  };

  // session：対局、players：その対局のメンバー（{id, name, icon}。写真は使わない）
  function encodeShare(session, players) {
    const index = new Map(session.playerIds.map((pid, i) => [pid, i]));
    const scores = session.games.flatMap((g) => g.seats.map((x) => x.score));
    const k = scores.every((v) => v % 100 === 0) ? 100 : 1;
    const data = {
      v: SHARE_VERSION,
      i: session.origin || session.id,
      d: session.date,
      n: session.name || '',
      m: session.mode,
      r: session.ruleName || '',
      u: Object.fromEntries(SHARE_RULE_KEYS.filter((key) => session.rule[key] !== undefined).map((key) => [key, session.rule[key]])),
      k,
      p: session.playerIds.map((pid) => {
        const p = players.find((x) => x.id === pid) || { name: '?', icon: null };
        return [pid, p.name, p.icon || null];
      }),
      g: session.games.map((g) => [g.seats.map((x) => [index.get(x.pid), x.score / k]), g.tobiBy && index.has(g.tobiBy) ? index.get(g.tobiBy) : -1]),
      c: session.playerIds.map((pid) => (session.chips && session.chips[pid]) || 0),
    };
    return toB64url(new TextEncoder().encode(JSON.stringify(data)));
  }

  // 戻す。おかしなデータ（壊れたリンク・手で書き換えたリンク）は null を返す
  function decodeShare(str) {
    let d;
    try {
      if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str) || str.length > 20000) return null;
      d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(str)));
    } catch (e) {
      return null;
    }
    const isInt = (v) => Number.isInteger(v);
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const isStr = (v, max) => typeof v === 'string' && v.length <= max;
    if (!d || typeof d !== 'object' || d.v !== SHARE_VERSION) return null;
    if (!isStr(d.i, 40) || !d.i || !/^\d{4}-\d{2}-\d{2}$/.test(d.d || '') || !isStr(d.n, 40) || !isStr(d.r, 40)) return null;
    if (d.m !== 3 && d.m !== 4) return null;
    if (d.k !== 1 && d.k !== 100) return null;
    // ルール：知っている項目だけを、決まった形で受け取る
    const u = d.u || {};
    if (![u.start, u.ret, u.tobiPt, u.chipPt, u.rate].every(isNum)) return null;
    if (!Array.isArray(u.uma) || u.uma.length !== d.m || !u.uma.every(isNum)) return null;
    if (u.chipUnit !== undefined && u.chipUnit !== 'pt' && u.chipUnit !== 'settle') return null;
    const rule = { start: u.start, ret: u.ret, uma: [...u.uma], tobiPt: u.tobiPt, chipPt: u.chipPt, chipUnit: u.chipUnit || 'pt', rate: u.rate };
    // メンバー：対局の人数〜8人。名前は空でなく、10文字まで・重ならない
    if (!Array.isArray(d.p) || d.p.length < d.m || d.p.length > 8) return null;
    const players = [];
    for (const x of d.p) {
      if (!Array.isArray(x) || !isStr(x[0], 40) || !x[0] || !isStr(x[1], 40)) return null;
      const name = x[1].trim();
      if (!name || nameLength(name) > NAME_MAX || players.some((p) => p.name === name || p.key === x[0])) return null;
      if (x[2] !== null && !isStr(x[2], 20)) return null;
      players.push({ key: x[0], name, icon: x[2] });
    }
    // 半荘：席の数は対局の人数ちょうど。同じ人が2回座らない
    if (!Array.isArray(d.g) || d.g.length > 200) return null;
    const games = [];
    for (const g of d.g) {
      if (!Array.isArray(g) || !Array.isArray(g[0]) || g[0].length !== d.m) return null;
      const seats = [];
      for (const s of g[0]) {
        if (!Array.isArray(s) || !isInt(s[0]) || s[0] < 0 || s[0] >= players.length || !isInt(s[1])) return null;
        if (seats.some((x) => x.i === s[0])) return null;
        const score = s[1] * d.k;
        if (Math.abs(score) > 10000000) return null;
        seats.push({ i: s[0], score });
      }
      if (!isInt(g[1]) || g[1] < -1 || g[1] >= players.length || (g[1] >= 0 && !seats.some((x) => x.i === g[1]))) return null;
      games.push({ seats, tobi: g[1] });
    }
    if (!Array.isArray(d.c) || d.c.length !== players.length || !d.c.every((v) => isInt(v) && Math.abs(v) <= 100000)) return null;
    return { origin: d.i, date: d.d, name: d.n.trim(), mode: d.m, ruleName: d.r.trim(), rule, players, games, chips: [...d.c] };
  }

  // 圧縮してリンクを短くする（QRコードを読み取りやすくするため）。先頭の「z」が圧縮の印。
  // 圧縮していない文字は必ず「eyJ」（{" の形）で始まるので見分けられる。
  // 圧縮が使えない古い端末では、圧縮せずに送る
  async function streamBytes(bytes, Stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function packShare(session, players) {
    const plain = encodeShare(session, players);
    if (typeof CompressionStream === 'undefined') return plain;
    try {
      return `z${toB64url(await streamBytes(fromB64url(plain), CompressionStream))}`;
    } catch (e) {
      return plain;
    }
  }
  // 戻り値：データ、読めないときは null、圧縮を戻せない古い端末では 'old'
  async function unpackShare(code) {
    if (typeof code !== 'string' || !code.startsWith('z')) return decodeShare(code);
    if (typeof DecompressionStream === 'undefined') return 'old';
    try {
      const body = code.slice(1);
      if (!/^[A-Za-z0-9_-]+$/.test(body) || body.length > 20000) return null;
      return decodeShare(toB64url(await streamBytes(fromB64url(body), DecompressionStream)));
    } catch (e) {
      return null;
    }
  }

  const MJ = {
    encodeShare, decodeShare, packShare, unpackShare,
    SEAT_NAMES, NAME_MAX, PRESETS, OPTIONS, expectedTotal, okaPt10, calcGame, summarizeSession,
    formatPt, formatSettle, formatScore, formatPct, nameLength, playerStats, handPoints, handInvalid, BASES,
    baseLabel, umaLabel, tobiLabel, chipLabel, chipBySettle, rateLabel, ruleSummary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  else root.MJ = MJ;
})(this);

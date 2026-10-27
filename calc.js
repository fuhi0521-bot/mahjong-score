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
    rate: [0, 3, 5, 10, 20],
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
  function chipLabel(pt) { return pt ? `1枚${pt}pt` : 'なし'; }
  // レートは精算ptの倍率（金額は扱わない）
  function rateLabel(rate) {
    return { 0: 'なし', 3: 'テンサン ×3', 5: 'テンゴ ×5', 10: 'テンピン ×10', 20: 'テンリャンピン ×20' }[rate] || `×${rate}`;
  }

  function ruleSummary(rule) {
    return [
      baseLabel([rule.start, rule.ret]),
      `ウマ${umaLabel(rule.uma)}`,
      `飛び賞${tobiLabel(rule.tobiPt)}`,
      `チップ${chipLabel(rule.chipPt)}`,
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
      row.total10 = row.pt10 + Math.round(row.chips * rule.chipPt * 10);
      // レートなしの対局は ×1 として扱う
      row.settle10 = Math.round(row.total10 * (rule.rate || 1));
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

  // 精算pt：整数になるとき（×10 など）は「.0」を付けない
  function formatSettle(pt10) {
    if (pt10 % 10 !== 0) return formatPt(pt10);
    const sign = pt10 > 0 ? '+' : pt10 < 0 ? '−' : '±';
    return sign + Math.abs(pt10 / 10);
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

  const MJ = {
    SEAT_NAMES, NAME_MAX, PRESETS, OPTIONS, expectedTotal, okaPt10, calcGame, summarizeSession,
    formatPt, formatSettle, formatScore, formatPct, nameLength, playerStats, handPoints, handInvalid, BASES,
    baseLabel, umaLabel, tobiLabel, chipLabel, rateLabel, ruleSummary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  else root.MJ = MJ;
})(this);

// 画面の描画と操作
(function () {
  const { SEAT_NAMES, NAME_MAX, PRESETS, OPTIONS, expectedTotal, calcGame, summarizeSession,
    formatPt, formatSettle, formatScore, formatPct, nameLength, playerStats, handPoints, handInvalid, BASES,
    baseLabel, umaLabel, tobiLabel, chipLabel, rateLabel, ruleSummary } = MJ;

  // 初期アイコン（icons/*.svg、このアプリ用に作成）
  const ICONS = [
    ['boy1', '男の子（黒髪）'], ['girl1', '女の子（ロング）'], ['boy2', '男の子（茶髪）'], ['girl2', '女の子（ツインテール）'],
    ['cat', '猫'], ['dog', '犬'], ['rabbit', 'ウサギ'], ['bear', 'クマ'],
  ];
  const ICON_KEYS = ICONS.map(([k]) => k);
  // iPhoneアプリ版では画像をアプリの中に埋め込んでいる（window.ICON_DATA）。Web版は icons/ フォルダから読む
  const iconSrc = (key) => (window.ICON_DATA && window.ICON_DATA[key]) || `icons/${key}.svg`;
  const RULE_NAME_MAX = 12;
  const MEMBER_MAX = 8;
  const SESSION_NAME_MAX = 12; // 一番小さいiPhone（幅320px）でも見出しに1行で収まる長さ

  // ---------- データ保存 ----------
  const STORE_KEY = 'mjscore.v1';
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* 壊れていたら初期状態から */ }
    d = { players: [], sessions: [], myRules: [], lastRule: {}, lastMembers: {}, ...(d || {}) };
    delete d.rules; // 旧バージョンの設定形式
    if ((d.version || 1) < 2) {
      // v1 のレートは「1ptあたりの円」。v2 は精算ptの倍率（100円 → ×10）
      const conv = (r) => { if (r && r.rate) r.rate = r.rate / 10; };
      d.sessions.forEach((s) => conv(s.rule));
      d.myRules.forEach(conv);
      d.migrated = true;
    }
    d.version = 2;
    // 以前のアイコン（いらすとや）を使っていた人は新しいアイコンに置き換える
    const usedIcons = new Set(d.players.map((p) => p.icon).filter((k) => ICON_KEYS.includes(k)));
    d.players.forEach((p, i) => {
      if (ICON_KEYS.includes(p.icon)) return;
      p.icon = ICON_KEYS.find((k) => !usedIcons.has(k)) || ICON_KEYS[i % ICON_KEYS.length];
      usedIcons.add(p.icon);
    });
    return d;
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      alert('保存できませんでした。端末の保存容量がいっぱいの可能性があります（写真を減らすと保存できる場合があります）。');
      return false;
    }
  }
  const db = load();
  if (db.migrated) { delete db.migrated; save(); }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getPlayer = (pid) => db.players.find((p) => p.id === pid) || { id: pid, name: '(削除済み)', icon: null };
  const playerName = (pid) => getPlayer(pid).name;
  const ptClass = (v) => (v > 0 ? 'plus' : v < 0 ? 'minus' : '');
  const fmtDate = (s) => {
    const d = new Date(s + 'T00:00:00');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
  };
  // 今年なら年を省く（一覧の小見出しを短くするため）
  const fmtDateShort = (str) => (str.slice(0, 4) === today().slice(0, 4) ? fmtDate(str).replace(/^\d+\//, '') : fmtDate(str));
  const findSession = (id) => db.sessions.find((s) => s.id === id);
  const usedPlayerIds = () => new Set(db.sessions.flatMap((s) => s.playerIds));
  const sameArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function rulesFor(mode) {
    return [
      ...db.myRules.filter((r) => r.mode === mode).map((r) => ({ ...r, mine: true })),
      ...PRESETS.filter((r) => r.mode === mode),
    ];
  }
  const findRule = (id) => db.myRules.find((r) => r.id === id) || PRESETS.find((r) => r.id === id);

  // ---------- 共通パーツ ----------
  const app = document.getElementById('app');
  const $ = (sel) => app.querySelector(sel);
  const $$ = (sel) => [...app.querySelectorAll(sel)];

  function header(title, back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 戻る</a>` : ''}<h1>${esc(title)}</h1></header>`;
  }
  function nav(current) {
    const items = [['#/', '🀄', 'ホーム', 'home'], ['#/stats', '📊', '成績', 'stats'], ['#/calc', '🧮', '点数計算', 'calc'], ['#/players', '👥', 'プレイヤー', 'players'], ['#/rules', '📋', 'ルール', 'rules']];
    return `<nav class="nav">${items.map(([href, ico, label, key]) =>
      `<a href="${href}" class="${key === current ? 'on' : ''}"><span class="ico">${ico}</span>${label}</a>`).join('')}</nav>`;
  }
  // アイコンの大きさは3段階だけ：小（表・対局の記録）28px／中（一覧・タイル）40px／大（プロフィール）80px
  const AVATAR_SIZES = [28, 40, 80];
  function avatar(p, size = 40) {
    const src = p.photo || (p.icon ? iconSrc(p.icon) : '');
    const px = size <= 30 ? AVATAR_SIZES[0] : size <= 50 ? AVATAR_SIZES[1] : AVATAR_SIZES[2];
    const style = `width:${px}px;height:${px}px`;
    if (src) return `<img class="avatar" style="${style}" src="${src}" alt="">`;
    return `<span class="avatar blank" style="${style}"></span>`;
  }
  function nextIcon() {
    const used = new Set(db.players.map((p) => p.icon));
    return (ICONS.find(([k]) => !used.has(k)) || ICONS[db.players.length % ICONS.length])[0];
  }
  // 一覧の右側の数字欄：「ラベル  数字」を、どの行でもラベルは左端・数字は右端にそろえて並べる
  // rows: [[ラベル, 数字のHTML, 大きく出すか]]
  function numCol(rows) {
    return `<div class="num-col">${rows.map(([label, value, big]) => `<div class="kv ${big ? 'big' : ''}"><span class="k">${label}</span><span class="v">${value}</span></div>`).join('')}</div>`;
  }

  // 人を選ぶタイル（4列で並べる。どの画面でも同じ見た目）
  // items: [{ p: プレイヤー, attr: 'data-xxx="id"', on: 選択中か, badge: 右上の小さな文字 }]。attr が無いと押せない表示だけ
  function playerTiles(items) {
    return `<div class="tiles-grid">${items.map(({ p, attr, on, badge }) => {
      const tag = attr ? 'button' : 'div';
      return `<${tag} ${attr ? `type="button" ${attr}` : ''} class="ptile ${on ? 'on' : ''} ${attr ? '' : 'static'}">
        ${badge ? `<span class="ptile-badge">${badge}</span>` : ''}${avatar(p, 36)}<span class="ptile-name">${esc(p.name)}</span></${tag}>`;
    }).join('')}</div>`;
  }

  // 選択肢のボタン群
  // custom: { unit, before } を渡すと「その他（数字を入力）」が付く
  const customOpen = new Set();
  function optButtons(key, list, current, label, sub, custom) {
    const isCustom = custom && (customOpen.has(key) || !list.some((v) => sameArr(v, current)));
    return `<div class="opts">${list.map((v, i) => `<button type="button" class="opt ${!isCustom && sameArr(v, current) ? 'on' : ''}" data-opt="${key}" data-i="${i}">
      ${esc(label(v))}${sub ? `<small>${esc(sub(v))}</small>` : ''}</button>`).join('')}
      ${custom ? `<button type="button" class="opt ${isCustom ? 'on' : ''}" data-opt="${key}" data-i="custom">その他<small>数字を入力</small></button>` : ''}</div>
      ${isCustom ? `<div class="custom-in">${custom.before}<input class="input" type="number" inputmode="decimal" min="0.1" max="100" step="any" data-custom="${key}" value="${current || ''}" aria-label="数字を入力">${custom.unit}</div>
        <div class="muted custom-msg" data-custom-msg="${key}">0.1〜100 の数字を入れてください</div>` : ''}`;
  }
  const CHIP_CUSTOM = { before: '1枚', unit: 'pt' };
  const RATE_CUSTOM = { before: '精算ptを ×', unit: '倍' };

  // 選択肢ボタンの操作を target（ルールの値）に反映する
  function bindOpts(target, n, rerender) {
    $$('[data-opt]').forEach((b) => b.onclick = () => {
      const k = b.dataset.opt;
      if (b.dataset.i === 'custom') { customOpen.add(k); rerender(); return; }
      customOpen.delete(k);
      const i = Number(b.dataset.i);
      if (k === 'base') [target.start, target.ret] = OPTIONS.base[n][i];
      else if (k === 'uma') target.uma = [...OPTIONS.uma[n][i]];
      else target[k] = OPTIONS[k][i];
      rerender();
    });
    $$('[data-custom]').forEach((inp) => {
      const k = inp.dataset.custom;
      const valid = () => { const v = Number(inp.value); return inp.value !== '' && v >= 0.1 && v <= 100 ? Math.round(v * 10) / 10 : null; };
      inp.oninput = () => {
        const v = valid();
        $(`[data-custom-msg="${k}"]`).classList.toggle('error', v === null);
        if (v !== null) target[k] = v;
      };
      inp.onchange = () => { if (valid() !== null) rerender(); };
    });
  }

  // ---------- ルールの項目と用語の説明 ----------
  const TERMS = {
    base: ['持ち点・返し', '「持ち点」は最初に配られる点数。「返し」は精算の基準になる点数です。返しが持ち点より多いと、その差（例: 5,000点×4人＝20pt）がトップの人のボーナス「オカ」になります。'],
    uma: ['ウマ', '順位に応じてやりとりするptです。例えば「10-30」なら 1位+30、2位+10、3位−10、4位−30pt。数字が大きいほど順位の差がはっきり出ます。'],
    tobiPt: ['飛び賞', '誰かの点数が0点未満（飛び）になったとき、飛ばした人が飛んだ人からもらうptです。'],
    chipPt: ['チップ', '一発や裏ドラなどでやりとりするチップです。精算のときに1枚あたりのptで換算します。使わないなら「なし」。'],
    rate: ['レート', '精算ptにかける倍率です。例えばテンピン（×10）なら、総合+10.0ptは精算+100.0ptになります。なしなら総合ptのまま精算します。'],
  };
  // ラベルをタップすると説明が開く
  function termLabel(key, tag = 'div') {
    const [title, text] = TERMS[key];
    return `<details class="help"><summary><${tag} class="help-title">${title}</${tag}><span class="q" aria-label="説明">？</span></summary><p>${text}</p></details>`;
  }
  function ruleOptions(n, v, tag) {
    return `${termLabel('base', tag)}${optButtons('base', OPTIONS.base[n], [v.start, v.ret], baseLabel)}
      ${termLabel('uma', tag)}${optButtons('uma', OPTIONS.uma[n], v.uma, umaLabel, (u) => u.every((x) => x === 0) ? '' : u.map((x) => (x > 0 ? '+' : '') + x).join(' / '))}
      ${termLabel('tobiPt', tag)}${optButtons('tobiPt', OPTIONS.tobiPt, v.tobiPt, tobiLabel)}
      ${termLabel('chipPt', tag)}${optButtons('chipPt', OPTIONS.chipPt, v.chipPt, chipLabel, null, CHIP_CUSTOM)}
      ${termLabel('rate', tag)}${optButtons('rate', OPTIONS.rate, v.rate, rateLabel, null, RATE_CUSTOM)}`;
  }
  // おすすめのルールの「内容を読み込む」部品。選んでいる状態（緑）にはしない＝どのルールを編集中か紛らわしくしない
  let presetLoadedMsg = '';
  function presetLoader(n) {
    return `<details class="help preset-loader"><summary><div class="help-title">おすすめのルールの内容を読み込む</div><span class="q">▼</span></summary>
      <p>選んだおすすめの内容で、下の項目をまとめて置き換えます。ルールの名前は変わりません。</p>
      <div class="opts cols2">${PRESETS.filter((r) => r.mode === n).map((r) => `<button type="button" class="opt" data-load-preset="${r.id}">${esc(r.name)}</button>`).join('')}</div>
    </details>`;
  }
  function bindPresetLoader(target, rerender) {
    $$('[data-load-preset]').forEach((b) => b.onclick = () => {
      const p = PRESETS.find((r) => r.id === b.dataset.loadPreset);
      if (!confirm(`「${p.name}」の内容で、今の設定を置き換えますか？`)) return;
      Object.assign(target, { start: p.start, ret: p.ret, uma: [...p.uma], tobiPt: p.tobiPt, chipPt: p.chipPt, rate: p.rate });
      customOpen.clear();
      presetLoadedMsg = `「${p.name}」の内容を読み込みました（名前は変わっていません）`;
      rerender();
    });
  }
  function takeLoadedMsg() {
    const m = presetLoadedMsg;
    presetLoadedMsg = '';
    return m ? `<div class="sum-check ok">${esc(m)}</div>` : '';
  }

  // 初めての人向けの「迷ったらこれ」
  const RECOMMENDED = { 4: 'mleague', 3: 'sanma' };

  // ---------- ホーム ----------
  // 対局の記録の一覧に出す結果：1位から順に、アイコン・名前・数字（レートありは精算、なしは合計pt）。
  // 1人分の幅は対局画面の表と同じ考え方で「対局人数（四麻4人・三麻3人）でカードいっぱい」。5人以上は横スクロール
  function sessionResults(s) {
    const rows = summarizeSession(s).filter((r) => r.games > 0);
    if (!rows.length) return '<div class="s-results empty-results">まだ半荘の記録がありません</div>';
    const useSettle = s.rule.rate > 0;
    rows.sort((a, b) => b.total10 - a.total10);
    return `<div class="s-scroll"><div class="s-results" style="--per:${s.mode}">${rows.map((r) => {
      const v = useSettle ? r.settle10 : r.total10;
      return `<div class="s-res">${avatar(getPlayer(r.pid), 26)}<span class="s-name">${esc(playerName(r.pid))}</span><span class="s-val ${ptClass(v)}">${useSettle ? formatSettle(v) : formatPt(v)}</span></div>`;
    }).join('')}</div></div>`;
  }

  function viewHome() {
    // ホームに戻ったら、作りかけのルールは破棄して次回は通常の選択から始める
    if (newState.creating) Object.assign(newState, { creating: false, open: false, rule: null, saveRule: false, saveName: '' });
    const sessions = [...db.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    app.innerHTML = `${header('麻雀スコア')}
    <main>
      <a class="btn primary big" href="#/new">＋ 新しい対局を始める</a>
      <h2>対局の記録</h2>
      ${sessions.length ? `<ul class="list">${sessions.map((s) => `
        <li><a class="session-item" href="#/session/${s.id}">
          <div class="row-main"><span class="s-title line1">${esc(s.name || fmtDate(s.date))}</span><span class="sub" style="margin-left:auto;flex-shrink:0">${s.games.length}半荘</span></div>
          <div class="line1 sub">${s.name ? `${fmtDateShort(s.date)}・` : ''}${s.mode === 4 ? '四麻' : '三麻'}・${s.playerIds.length}人・${esc(s.ruleName || 'カスタム')}</div>
          ${sessionResults(s)}
        </a></li>`).join('')}</ul>`
        : '<p class="empty">まだ記録がありません</p>'}
      <p style="text-align:center;margin-top:24px"><a class="muted" href="#/help" style="text-decoration:underline">使い方・用語の説明</a></p>
    </main>${nav('home')}`;
    $$('.s-scroll').forEach((sc) => {
      const mark = () => sc.classList.toggle('more', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
      sc.addEventListener('scroll', mark, { passive: true });
      new ResizeObserver(mark).observe(sc);
      mark();
    });
  }

  // ---------- 点数計算 ----------
  // 翻のボタン。y があるものは「役満の役で和了った」（y倍の役満）
  const hanOptions = (basis) => [
    { han: 1, label: '1翻' }, { han: 2, label: '2翻' }, { han: 3, label: '3翻' }, { han: 4, label: '4翻' },
    { han: 5, label: '満貫', small: '5翻' }, { han: 6, label: '跳満', small: '6〜7翻' }, { han: 8, label: '倍満', small: '8〜10翻' },
    { han: 11, label: '三倍満', small: BASES[basis].kazoe ? '11〜12翻' : '11翻〜' },
    ...(BASES[basis].kazoe ? [{ han: 13, label: '数え役満', small: '13翻〜' }] : []),
    { y: 1, label: '役満', small: '役満の役' }, { y: 2, label: 'ダブル', small: '役満×2', full: 'ダブル役満' }, { y: 3, label: 'トリプル', small: '役満×3', full: 'トリプル役満' },
  ];
  const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  const loadBasis = () => { try { return localStorage.getItem('mjscore.calcBasis') === 'mleague' ? 'mleague' : 'jantama'; } catch (e) { return 'jantama'; } };
  const calcState = { dealer: false, tsumo: false, han: 3, fu: 30, honba: 0, yakuman: 0, basis: loadBasis() };
  const yen = (v) => `${v.toLocaleString('ja-JP')}点`;
  const BASIS_HELP = '雀魂基準：30符4翻・60符3翻は7,700点（切り上げ満貫なし）。13翻以上は数え役満。<br>Mリーグ基準：30符4翻・60符3翻は満貫（切り上げ満貫）。13翻以上も三倍満まで（数え役満なし）。<br>どちらも、役満の役が重なったときはダブル役満・トリプル役満になり、1本場は300点です。';

  function viewCalc() {
    const c = calcState;
    const opts = hanOptions(c.basis);
    const fuFree = c.yakuman > 0 || c.han >= 5; // 符に関係ない
    const invalid = c.yakuman ? null : handInvalid(c.fu, c.han, c.tsumo);
    const r = handPoints(c);
    const who = c.dealer ? '親' : '子';
    const sel = opts.find((o) => (c.yakuman ? o.y === c.yakuman : !o.y && o.han === c.han));
    const cond = `${BASES[c.basis].name}基準・${who}・${fuFree ? sel.full || sel.label : `${c.fu}符${c.han}翻`}・${c.tsumo ? 'ツモ' : 'ロン'}${c.honba ? `・${c.honba}本場` : ''}`;
    let main = '', sub = '';
    if (!c.tsumo) {
      main = yen(r.ron);
      sub = '放銃した人が払います';
    } else if (c.dealer) {
      main = `${yen(r.tsumoAll)}オール`;
      sub = `子3人がそれぞれ払う（合計 ${yen(r.total)}）`;
    } else {
      main = `<div class="calc-split"><div><span class="calc-who">子から</span>${yen(r.tsumoChild)}</div><div><span class="calc-who">親から</span>${yen(r.tsumoDealer)}</div></div>`;
      sub = `合計 ${yen(r.total)}`;
    }
    const seg = (key, a, b) => `<div class="seg"><button data-seg="${key}" data-v="0" class="${!c[key] ? 'on' : ''}">${a}</button><button data-seg="${key}" data-v="1" class="${c[key] ? 'on' : ''}">${b}</button></div>`;

    app.innerHTML = `${header('点数計算')}
    <main>
      <div class="calc-result card">
        <div class="muted">${cond}</div>
        ${invalid ? `<div class="calc-main muted">―</div><div class="notice" style="margin:4px 0 0">${invalid}</div>`
          : `<div class="calc-main">${main}</div><div class="calc-sub">${sub}</div>${r.name ? `<span class="badge">${r.name}</span>` : ''}${c.honba ? `<div class="muted small">${c.honba}本場ぶん（${c.tsumo ? `1人 +${c.honba * 100}点` : `+${c.honba * 300}点`}）を含みます</div>` : ''}`}
      </div>

      <details class="help calc-help"><summary><div class="help-title">点数の基準</div><span class="q" aria-label="説明">？</span></summary><p>${BASIS_HELP}</p></details>
      <div class="seg"><button data-basis="jantama" class="${c.basis === 'jantama' ? 'on' : ''}">雀魂基準</button><button data-basis="mleague" class="${c.basis === 'mleague' ? 'on' : ''}">Mリーグ基準</button></div>

      <div class="calc-row">${seg('dealer', '子', '親')}${seg('tsumo', 'ロン', 'ツモ')}</div>

      <div class="label calc-label">翻</div>
      <div class="opts grid4">${opts.map((o) => `<button type="button" class="opt ${o === sel ? 'on' : ''}" ${o.y ? `data-yakuman="${o.y}"` : `data-han="${o.han}"`}>${o.label}${o.small ? `<small>${o.small}</small>` : ''}</button>`).join('')}</div>

      <details class="help calc-help"><summary><div class="help-title">符</div><span class="q" aria-label="説明">？</span>${fuFree ? '<span class="muted small">満貫以上は符に関係ありません</span>' : ''}</summary>
        <p>${FU_HELP}</p></details>
      <div class="opts grid4 ${fuFree ? 'disabled' : ''}">${FU_OPTIONS.map((v) => `<button type="button" class="opt ${!fuFree && c.fu === v ? 'on' : ''}" data-fu="${v}" ${fuFree ? 'disabled' : ''}>${v}符</button>`).join('')}</div>

      <div class="label calc-label">本場</div>
      <div class="card person-row honba-row"><span class="nm">積み棒（本場）</span>
        <div class="chip-ctl"><button data-honba="-1" aria-label="減らす">−</button><span>${c.honba}</span><button data-honba="1" aria-label="増やす">＋</button></div></div>
    </main>${nav('calc')}`;

    const rerender = () => { const y = window.scrollY; viewCalc(); window.scrollTo(0, y); };
    $$('[data-seg]').forEach((b) => b.onclick = () => { c[b.dataset.seg] = b.dataset.v === '1'; rerender(); });
    $$('[data-basis]').forEach((b) => b.onclick = () => {
      c.basis = b.dataset.basis;
      if (!BASES[c.basis].kazoe && !c.yakuman && c.han >= 13) c.han = 11; // Mリーグには数え役満がない
      try { localStorage.setItem('mjscore.calcBasis', c.basis); } catch (e) { /* 保存できなくても計算はできる */ }
      rerender();
    });
    $$('[data-han]').forEach((b) => b.onclick = () => { c.han = Number(b.dataset.han); c.yakuman = 0; rerender(); });
    $$('[data-yakuman]').forEach((b) => b.onclick = () => { c.yakuman = Number(b.dataset.yakuman); rerender(); });
    $$('[data-fu]').forEach((b) => b.onclick = () => { c.fu = Number(b.dataset.fu); rerender(); });
    $$('[data-honba]').forEach((b) => b.onclick = () => { c.honba = Math.max(0, c.honba + Number(b.dataset.honba)); rerender(); });
  }

  const FU_HELP = [
    '基本は20符。そこに次を足して、最後に10符単位に切り上げます（例: 32符→40符）。',
    '・門前でロン：+10符／ツモ：+2符（平和ツモは付かない）',
    '・待ち：カンチャン・ペンチャン・単騎 +2符',
    '・雀頭：役牌（三元牌・自風・場風） +2符',
    '・明刻：中張牌 2符／么九牌 4符、暗刻：中張牌 4符／么九牌 8符',
    '・明槓：中張牌 8符／么九牌 16符、暗槓：中張牌 16符／么九牌 32符',
    '・例外：平和ツモは20符、平和ロンは30符、七対子は25符で固定',
  ].join('<br>');

  // ---------- 使い方 ----------
  function viewHelp() {
    const steps = [
      ['プレイヤーを登録', '下の「プレイヤー」から、一緒に打つ人の名前を登録します。アイコンや写真も付けられます。'],
      ['対局を始める', 'ホームの「新しい対局を始める」で、メンバーとルールを選びます。5人以上選ぶと、半荘ごとに交代しながら打てます。'],
      ['点数を入力', '半荘が終わったら、各自の最終点数を100点単位で入力します（42,300点なら 423）。最後の1人は「自動計算」ボタンで入れられます。全員の合計が合っているかも確認できます。'],
      ['精算・成績を見る', '対局画面の下に精算が出ます。「成績」では、これまでの順位率やptの推移が見られます。'],
    ];
    app.innerHTML = `${header('使い方', '#/')}
    <main>
      <ol class="steps">${steps.map(([t, d]) => `<li><b>${t}</b><p>${d}</p></li>`).join('')}</ol>
      <h2>用語の説明</h2>
      <div class="card">${Object.values(TERMS).map(([t, d]) => `<p class="term"><b>${t}</b><br>${d}</p>`).join('')}</div>
      <p class="muted">データはこの端末（ブラウザ）の中に保存されます。</p>
    </main>${nav('home')}`;
  }

  // ---------- 新しい対局 ----------
  const RULE_KEYS = ['start', 'ret', 'uma', 'tobiPt', 'chipPt', 'rate'];
  const ruleValues = (r) => clone(Object.fromEntries(RULE_KEYS.map((k) => [k, r[k]])));
  const ruleEquals = (a, b) => RULE_KEYS.every((k) => sameArr(a[k], b[k]));

  const newState = { mode: 4, selected: [], date: today(), name: '', ruleId: null, rule: null, ruleMode: null, open: false, saveRule: false, saveName: '' };

  function pickRule(r) {
    newState.ruleId = r.id;
    newState.rule = ruleValues(r);
    newState.ruleMode = r.mode;
    newState.saveRule = false;
    newState.saveName = '';
    newState.creating = false;
  }

  function viewNew() {
    const n = newState.mode;
    newState.selected = newState.selected.filter((id) => db.players.some((p) => p.id === id));
    const rules = rulesFor(n);
    if (!newState.rule || newState.ruleMode !== n) {
      pickRule(rules.find((r) => r.id === newState.ruleId) || rules.find((r) => r.id === db.lastRule[n]) || rules[0]);
    }
    const rv = newState.rule;
    // 今の設定と同じ内容のルール（なければ「カスタム」）
    const matched = rules.find((r) => r.id === newState.ruleId && ruleEquals(r, rv)) || rules.find((r) => ruleEquals(r, rv));
    const last = (db.lastMembers[n] || []).filter((id) => db.players.some((p) => p.id === id));
    const canUseLast = last.length >= n && !sameArr(last, newState.selected);
    const count = newState.selected.length;
    const ready = count >= n;
    const defaultSaveName = `マイルール${db.myRules.length + 1}`;
    const pastNames = [...new Set([...db.sessions].sort((a, b) => b.createdAt - a.createdAt).map((x) => x.name).filter(Boolean))].slice(0, 6);
    const mineRules = rules.filter((r) => r.mine);
    const presets = rules.filter((r) => !r.mine);
    // マイルールがある人はマイルールだけ。おすすめは「おすすめから選ぶ」で開く
    const showPresets = !mineRules.length || newState.showPresets || (matched && !matched.mine);
    const ruleBtn = (r) => `<button type="button" class="opt ${!newState.creating && matched && matched.id === r.id ? 'on' : ''}" data-rule="${r.id}">
      ${r.mine ? '★ ' : ''}${esc(r.name)}${!mineRules.length && r.id === RECOMMENDED[n] ? '<small>迷ったらこれ</small>' : ''}</button>`;

    app.innerHTML = `${header('新しい対局', '#/')}
    <main>
      <div class="field"><span class="label">人数</span>
        <div class="seg"><button data-mode="4" class="${n === 4 ? 'on' : ''}">四麻</button><button data-mode="3" class="${n === 3 ? 'on' : ''}">三麻</button></div>
      </div>
      <div class="field"><label for="date">日付</label><input id="date" class="input" type="date" value="${newState.date}"></div>
      <div class="field"><label for="sname">対局の名前（任意・${SESSION_NAME_MAX}文字まで）</label>
        <input id="sname" class="input" value="${esc(newState.name)}" placeholder="例: 会社の麻雀会" autocomplete="off">
        ${pastNames.length ? `<div class="name-suggest">${pastNames.map((nm) => `<button type="button" class="chip small-chip" data-sname="${esc(nm)}">${esc(nm)}</button>`).join('')}</div>` : ''}
      </div>

      <h2>メンバー（${count}人）</h2>
      <p class="muted" style="margin:0 0 8px">${n + 1}人以上（最大${MEMBER_MAX}人）選ぶと、半荘ごとに交代しながら打てます。最初の半荘は、先にタップした${n}人が打ちます。</p>
      ${canUseLast ? '<button id="use-last" class="btn small" style="margin-bottom:8px">前回と同じメンバー</button>' : ''}
      ${db.players.length ? playerTiles(db.players.map((p) => {
        const i = newState.selected.indexOf(p.id);
        return { p, attr: `data-pid="${p.id}"`, on: i >= 0, badge: i < 0 ? '' : i < n ? '✓' : '交代' };
      })) : '<p class="muted">プレイヤーが未登録です。下のボタンから登録してください。</p>'}
      <button type="button" id="new-player" class="btn add-player-btn">＋ 新しいプレイヤーを登録</button>

      <h2>ルール</h2>
      ${newState.creating ? `<div class="card creating-note">新しいルールを作っています。今あるルールを使うときは「作成をやめる」を押してください。
        <button type="button" id="cancel-create" class="btn" style="width:100%;margin-top:8px">作成をやめる</button></div>` : `
      ${mineRules.length ? `<div class="opts cols2">${mineRules.map(ruleBtn).join('')}</div>` : ''}
      ${showPresets ? `${mineRules.length ? '<div class="label" style="margin-top:10px">おすすめ</div>' : ''}
        <div class="opts cols2">${presets.map(ruleBtn).join('')}</div>`
        : '<button type="button" id="show-presets" class="btn small" style="margin-top:8px">おすすめから選ぶ ▼</button>'}`}
      <div class="card rule-now">
        <div class="muted small">${newState.creating ? '作成中のルール' : '使うルール'}</div>
        <div class="rule-name" id="now-name">${newState.creating ? esc(newState.saveName.trim() || defaultSaveName) : matched ? esc(matched.name) : 'カスタム（変更あり）'}</div>
        ${matched && matched.desc && !newState.creating ? `<div class="rule-desc">${esc(matched.desc)}</div>` : ''}
        <div class="rule-sum">${esc(ruleSummary(rv))}</div>
      </div>
      ${takeLoadedMsg()}
      <div class="inline">
        <button type="button" id="toggle-detail" class="btn small">${newState.open ? '▲ 閉じる' : '▼ 細かく変える'}</button>
        ${newState.creating ? '' : '<button type="button" id="create-rule" class="btn small">＋ 新しいルールを作る</button>'}
      </div>

      ${newState.open ? `<div class="detail">
        ${newState.creating ? `<p class="hint" style="margin:0 0 6px">今のルールをもとに、各項目を選んでください。下で名前を付けて保存できます。</p>${presetLoader(n)}` : ''}
        ${ruleOptions(n, rv)}
      </div>` : ''}

      ${matched && !newState.creating ? '' : `<div class="card save-rule">
        <label class="check"><input type="checkbox" id="save-rule" ${newState.saveRule ? 'checked' : ''}> このルールを保存して次回も使う</label>
        ${newState.saveRule ? `<input id="save-name" class="input" style="margin-top:8px" value="${esc(newState.saveName)}" placeholder="名前（例: いつものメンツ）" autocomplete="off">
          <div class="muted" style="margin-top:4px">空欄なら「${defaultSaveName}」になります（${RULE_NAME_MAX}文字まで）</div>` : ''}
      </div>`}

      <div id="msg"></div>
      <button id="start" class="btn primary big sticky-bottom" ${ready ? '' : 'disabled'}>${ready ? (count > n ? `${count}人で交代しながら始める` : '対局を始める') : `あと${n - count}人選んでください`}</button>
    </main>`;

    const rerender = () => { const y = window.scrollY; viewNew(); window.scrollTo(0, y); };
    $$('[data-mode]').forEach((b) => b.onclick = () => {
      newState.mode = Number(b.dataset.mode);
      newState.ruleId = null;
      newState.rule = null;
      viewNew();
    });
    $('#date').onchange = (e) => { newState.date = e.target.value || today(); };
    $('#sname').oninput = (e) => { newState.name = e.target.value; };
    $$('[data-sname]').forEach((b) => b.onclick = () => { newState.name = b.dataset.sname; rerender(); });
    if (canUseLast) $('#use-last').onclick = () => { newState.selected = [...last]; rerender(); };
    $$('[data-pid]').forEach((b) => b.onclick = () => {
      const id = b.dataset.pid;
      const i = newState.selected.indexOf(id);
      if (i >= 0) newState.selected.splice(i, 1);
      else if (newState.selected.length < MEMBER_MAX) newState.selected.push(id);
      rerender();
    });
    $('#new-player').onclick = () => openPlayerCreate('#/new', (pid) => {
      if (newState.selected.length < MEMBER_MAX) newState.selected.push(pid);
    });
    $$('[data-rule]').forEach((b) => b.onclick = () => { pickRule(findRule(b.dataset.rule)); rerender(); });
    $('#toggle-detail').onclick = () => { newState.open = !newState.open; rerender(); };
    bindOpts(rv, n, rerender);
    const showBtn = $('#show-presets');
    if (showBtn) showBtn.onclick = () => { newState.showPresets = true; rerender(); };
    const cancelBtn = $('#cancel-create');
    if (cancelBtn) cancelBtn.onclick = () => { pickRule(rules.find((r) => r.id === newState.ruleId) || rules[0]); newState.open = false; rerender(); };
    bindPresetLoader(rv, rerender);
    const createBtn = $('#create-rule');
    if (createBtn) createBtn.onclick = () => {
      Object.assign(newState, { creating: true, open: true, saveRule: true, saveName: '' });
      rerender();
    };
    if (!matched || newState.creating) {
      $('#save-rule').onchange = (e) => { newState.saveRule = e.target.checked; rerender(); };
      if (newState.saveRule) $('#save-name').oninput = (e) => {
        newState.saveName = e.target.value;
        if (newState.creating) $('#now-name').textContent = newState.saveName.trim() || defaultSaveName;
      };
    }
    $('#start').onclick = () => {
      const sessionName = newState.name.trim();
      if (nameLength(sessionName) > SESSION_NAME_MAX) {
        $('#msg').innerHTML = `<div class="notice">対局の名前は${SESSION_NAME_MAX}文字までです</div>`;
        return;
      }
      let ruleId = matched ? matched.id : null;
      let ruleName = matched ? matched.name : 'カスタム';
      if ((!matched || newState.creating) && newState.saveRule) {
        const name = newState.saveName.trim() || defaultSaveName;
        if (nameLength(name) > RULE_NAME_MAX) {
          $('#msg').innerHTML = `<div class="notice">ルールの名前は${RULE_NAME_MAX}文字までです</div>`;
          return;
        }
        const mine = { id: uid(), mode: n, name, ...clone(rv) };
        db.myRules.push(mine);
        ruleId = mine.id;
        ruleName = name;
      }
      const s = {
        id: uid(), date: newState.date, name: sessionName, mode: n, ruleName, rule: clone(rv),
        playerIds: [...newState.selected], games: [], chips: {}, createdAt: Date.now(),
      };
      db.sessions.push(s);
      if (ruleId) db.lastRule[n] = ruleId;
      db.lastMembers[n] = [...newState.selected];
      save();
      Object.assign(newState, { selected: [], date: today(), name: '', ruleId: null, rule: null, open: false, creating: false, showPresets: false });
      location.hash = `#/session/${s.id}`;
    };
  }

  // ---------- 対局（セッション）画面 ----------
  // 順位バッジ（色だけに頼らず「1位」の文字も出す）。最下位はグレー
  function rankBadge(rank, n) {
    const cls = rank === n ? 'last' : `r${rank}`;
    return `<span class="rank-badge ${cls}">${rank}位</span>`;
  }

  function viewSession(id) {
    const s = findSession(id);
    if (!s) return (location.hash = '#/');
    const n = s.mode;
    const summary = summarizeSession(s);
    const useChips = s.rule.chipPt > 0;
    const showSettle = s.rule.rate > 0;
    const chipEntered = summary.some((r) => r.chips !== 0);
    const ranking = [...summary].filter((r) => r.games > 0 || r.chips !== 0).sort((a, b) => b.total10 - a.total10);

    // 結果の内訳：左に「半荘・チップ」、右に「合計（×レート）」と最終の数字
    const breakdown = (r) => `<span>${r.games}半荘 ${formatPt(r.pt10)}</span>${useChips ? `<span>チップ ${formatPt(r.total10 - r.pt10)}</span>` : ''}`;

    // 半荘の表：マスは pt（上）と素点（下）。行の高さはそろえる（飛びはマスの角の印で示し、高さを変えない）
    const gameRows = s.games.map((g, gi) => {
      const byPid = {};
      for (const r of calcGame(g.seats, s.rule, g.tobiBy)) byPid[r.pid] = r;
      return `<tr class="click" data-gid="${g.id}"><td class="num">${gi + 1}</td>${s.playerIds.map((pid) => {
        const r = byPid[pid];
        if (!r) return '<td class="absent">―</td>';
        return `<td class="cell">${r.busted ? '<span class="tobi-mark" title="飛び" aria-label="飛び"></span>' : ''}<div class="c-pt ${ptClass(r.pt10)}">${formatPt(r.pt10)}</div><div class="c-sc">${formatScore(r.score)}</div></td>`;
      }).join('')}</tr>`;
    }).join('');
    const foot = (label, cells, cls = '') => `<tr class="foot ${cls}"><td class="num">${label}</td>${cells.join('')}</tr>`;
    const ptCell = (v, has = true) => `<td class="${has ? ptClass(v) : 'absent'}">${has ? formatPt(v) : '―'}</td>`;
    const footRows = [
      foot('計', summary.map((r) => ptCell(r.pt10, r.games > 0)), 'first'),
      useChips ? foot('チップ', summary.map((r) => ptCell(r.total10 - r.pt10))) : '',
      useChips ? foot('合計', summary.map((r) => ptCell(r.total10)), 'strong') : '',
      showSettle ? foot('精算', summary.map((r) => `<td class="${ptClass(r.settle10)}">${formatSettle(r.settle10)}</td>`), 'strong') : '',
      foot('順位', summary.map((r) => `<td class="ranks">${r.games ? r.ranks.slice(0, n).join('-') : '―'}</td>`)),
    ].join('');
    const gameTable = `<div class="table-outer"><div class="table-scroll">
      <table class="score-table">
        <thead><tr><th class="num">半荘</th>${s.playerIds.map((pid) => `<th>${avatar(getPlayer(pid), 28)}<div class="th-name">${esc(playerName(pid))}</div></th>`).join('')}</tr></thead>
        <tbody>${gameRows}</tbody>
        <tfoot>${footRows}</tfoot></table></div></div>
      <div class="legend"><span class="tobi-sample"></span>＝飛び</div>
      <div class="muted" style="margin-top:4px">上段がpt、下段が素点です。行をタップすると修正・削除できます。${showSettle ? `精算は合計×${s.rule.rate}、` : ''}順位は1位〜${n}位の回数です<span id="scroll-hint" hidden>。表は横にスクロールできます</span></div>`;

    app.innerHTML = `${header(s.name || fmtDate(s.date), '#/')}
    <main>

      <h2>半荘の結果（${s.games.length}回）</h2>
      <div class="card">${s.games.length ? gameTable : '<p class="empty" style="padding:8px 0">まだ半荘の記録がありません</p>'}</div>

      <h2>今日の結果${showSettle ? `（精算 ＝ 合計 × ${esc(rateLabel(s.rule.rate))}）` : ''}</h2>
      <div class="card">
        ${ranking.length ? ranking.map((r, i) => `<div class="person-row result-line">
          <span class="rk">${i + 1}</span>${avatar(getPlayer(r.pid), 36)}
          <div class="nm"><div class="pname">${esc(playerName(r.pid))}</div>
            <div class="cell-sub breakdown">${breakdown(r)}</div></div>
          ${showSettle
            ? numCol([['精算', `<span class="${ptClass(r.settle10)}">${formatSettle(r.settle10)}</span>`, true], ['合計', `${formatPt(r.total10)} ×${s.rule.rate}`]])
            : numCol([['合計', `<span class="${ptClass(r.total10)}">${formatPt(r.total10)}</span>`, true]])}
        </div>`).join('') : '<p class="empty" style="padding:8px 0">半荘の結果を入力すると、ここに順位と精算が出ます</p>'}
        ${useChips ? `<a class="btn chip-link" href="#/session/${s.id}/chips">チップを入力${chipEntered ? '（入力済み）' : ''}</a>
          <p class="muted" style="margin:6px 0 0">チップは最後に手元の枚数を数えて入力します（1枚 = ${s.rule.chipPt}pt）</p>` : ''}
      </div>


      <h2>この対局について</h2>
      <div class="card info-card">
        <div class="info-row"><span class="k">名前</span><span>${s.name ? esc(s.name) : '（なし）'}</span></div>
        <div class="info-row"><span class="k">日付</span><span>${fmtDate(s.date)}</span></div>
        <div class="info-row"><span class="k">ルール</span><span>${esc(s.ruleName || 'カスタム')}（${n === 4 ? '四麻' : '三麻'}）<br><span class="muted small">${esc(ruleSummary(s.rule))}</span></span></div>
        <div class="btn-row">
          <button type="button" id="rename-session" class="btn">名前を${s.name ? '変更' : '付ける'}</button>
          ${s.playerIds.length < MEMBER_MAX ? `<a class="btn" href="#/session/${s.id}/members">メンバーを追加</a>` : ''}
        </div>
      </div>
      <button id="del-session" class="btn danger" style="width:100%;margin-top:16px">この対局を削除</button>
      <a class="btn primary big sticky-bottom" href="#/session/${s.id}/game/new">＋ ${s.games.length + 1}半荘目の結果を入力</a>
    </main>`;

    // 画面に収まらないときだけ横スクロール。右端をぼかして続きがあることを示す
    const scroller = $('.table-scroll');
    if (scroller) {
      // 列の幅は「対局の人数（四麻なら4人）で画面いっぱい」の幅に固定する。
      // 5人以上でも列の幅・アイコン・文字の大きさは変えず、増えた分だけ横スクロールにする。
      // 幅は % で決めるので、回転などで画面幅が変わってもそのまま合う。
      const table = scroller.querySelector('table');
      const cols = table.querySelectorAll('thead th:not(.num)').length;
      const numW = 34;
      table.style.width = `calc(${numW}px + (100% - ${numW}px) * ${cols} / ${n})`;
      // 極端な点数で数字が入りきらないときだけ、列を広げる（最小幅）
      const textW = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
      const need = Math.max(...[...table.querySelectorAll('.c-pt, .c-sc, tfoot td:not(.num)')].map((el) => Math.ceil(textW(el)) + 4)); // ＋4 はマスの左右の余白
      table.style.minWidth = `${numW + need * cols}px`;
      const outer = scroller.parentElement;
      const mark = () => {
        $('#scroll-hint').hidden = scroller.scrollWidth <= scroller.clientWidth + 1;
        outer.classList.toggle('more', scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
      };
      scroller.addEventListener('scroll', mark, { passive: true });
      new ResizeObserver(mark).observe(scroller);
      mark();
    }
    $$('[data-gid]').forEach((tr) => tr.onclick = () => { location.hash = `#/session/${s.id}/game/${tr.dataset.gid}`; });
    $('#rename-session').onclick = () => {
      const v = prompt(`対局の名前（${SESSION_NAME_MAX}文字まで・空欄で日付表示）`, s.name || '');
      if (v === null) return;
      const nm = v.trim();
      if (nameLength(nm) > SESSION_NAME_MAX) { alert(`対局の名前は${SESSION_NAME_MAX}文字までです`); return; }
      s.name = nm;
      save();
      viewSession(id);
    };
    $('#del-session').onclick = () => {
      if (!confirm('この対局（すべての半荘）を削除します。よろしいですか？')) return;
      db.sessions = db.sessions.filter((x) => x.id !== s.id);
      save();
      location.hash = '#/';
    };
  }

  // ---------- メンバー追加（途中参加） ----------
  function viewAddMember(id) {
    const s = findSession(id);
    if (!s) return (location.hash = '#/');
    const others = db.players.filter((p) => !s.playerIds.includes(p.id));
    const full = s.playerIds.length >= MEMBER_MAX;
    app.innerHTML = `${header('メンバーを追加', `#/session/${s.id}`)}
    <main>
      <p class="muted" style="margin-top:0">途中から参加する人を追加します。追加した人は次の半荘から「打つ人」に選べます。これまでの半荘は「―」になります。</p>
      <h2>今のメンバー（${s.playerIds.length}人）</h2>
      ${playerTiles(s.playerIds.map((pid) => ({ p: getPlayer(pid) })))}
      ${full ? `<div class="notice">メンバーは${MEMBER_MAX}人までです</div>` : `
      <h2>追加する人をタップ</h2>
      ${others.length ? playerTiles(others.map((p) => ({ p, attr: `data-add="${p.id}"` })))
        : '<p class="muted">登録済みのプレイヤーは全員参加しています。下のボタンから新しく登録できます。</p>'}
      <button type="button" id="new-player" class="btn add-player-btn">＋ 新しいプレイヤーを登録</button>`}
      <a class="btn primary big" style="margin-top:20px" href="#/session/${s.id}">完了</a>
    </main>`;

    const join = (pid) => {
      if (s.playerIds.includes(pid) || s.playerIds.length >= MEMBER_MAX) return;
      s.playerIds.push(pid);
      save();
      viewAddMember(id);
    };
    $$('[data-add]').forEach((b) => b.onclick = () => join(b.dataset.add));
    const nb = $('#new-player');
    if (nb) nb.onclick = () => openPlayerCreate(`#/session/${s.id}/members`, (pid) => {
      if (!s.playerIds.includes(pid) && s.playerIds.length < MEMBER_MAX) s.playerIds.push(pid);
    });
  }

  // ---------- チップ入力 ----------
  function viewChips(id) {
    const s = findSession(id);
    if (!s || !(s.rule.chipPt > 0)) return (location.hash = id ? `#/session/${id}` : '#/');
    const summary = summarizeSession(s);
    const chipSum = summary.reduce((a, r) => a + r.chips, 0);

    app.innerHTML = `${header('チップを入力', `#/session/${s.id}`)}
    <main>
      <p class="muted" style="margin-top:0">最後に手元に残ったチップを数えて、最初より増えた人は＋、減った人は−の枚数を入れてください（1枚 = ${s.rule.chipPt}pt）。</p>
      <div class="card">
        ${summary.map((r) => `<div class="person-row">${avatar(getPlayer(r.pid), 32)}<div class="nm"><div class="pname">${esc(playerName(r.pid))}</div>
          <div class="cell-sub">${formatPt(Math.round(r.chips * s.rule.chipPt * 10))}</div></div>
          <div class="chip-ctl"><button data-chip="${r.pid}" data-d="-1" aria-label="減らす">−</button><span class="${ptClass(r.chips)}">${r.chips > 0 ? '+' : ''}${r.chips}</span><button data-chip="${r.pid}" data-d="1" aria-label="増やす">＋</button></div></div>`).join('')}
      </div>
      ${chipSum === 0
        ? '<div class="sum-check ok">✓ 全員の合計 0枚（一致しています）</div>'
        : `<div class="sum-check ng">全員の合計が ${chipSum > 0 ? '+' : ''}${chipSum}枚です。<b>合計が0枚になるように</b>直してください</div>`}
      <a class="btn primary big" style="margin-top:16px" href="#/session/${s.id}">${chipSum === 0 ? '完了' : '戻る（あとで直す）'}</a>
    </main>`;

    $$('[data-chip]').forEach((b) => b.onclick = () => {
      const pid = b.dataset.chip;
      s.chips[pid] = (Number(s.chips[pid]) || 0) + Number(b.dataset.d);
      save();
      const y = window.scrollY;
      viewChips(id);
      window.scrollTo(0, y);
    });
  }

  // ---------- 半荘の点数入力 ----------
  // 新しい半荘の打つ人と席順。前の半荘と同じ席順を基本に、
  // 5人以上なら打った回数が少ない人（同じなら前の半荘で抜けた人）を優先して入れる
  function defaultSeats(s) {
    const n = s.mode;
    const last = s.games[s.games.length - 1];
    if (!last) return s.playerIds.slice(0, n);
    const lastIds = last.seats.map((x) => x.pid);
    if (s.playerIds.length <= n) return lastIds;
    const count = {};
    const lastOut = {}; // 最後に抜けた半荘の番号（大きいほど最近抜けた）
    s.playerIds.forEach((pid) => { count[pid] = 0; lastOut[pid] = -1; });
    s.games.forEach((g, gi) => {
      const ids = g.seats.map((x) => x.pid);
      s.playerIds.forEach((pid) => { if (ids.includes(pid)) count[pid] += 1; else lastOut[pid] = gi; });
    });
    const chosen = [...s.playerIds]
      .sort((a, b) => count[a] - count[b] || lastOut[b] - lastOut[a])
      .slice(0, n);
    // 続けて打つ人は同じ席、空いた席に入る人を埋める
    const seats = lastIds.map((pid) => (chosen.includes(pid) ? pid : null));
    const newcomers = chosen.filter((pid) => !lastIds.includes(pid));
    return seats.map((pid) => pid || newcomers.shift());
  }

  // 入力は100点単位（例: 423 → 42,300点）
  let form = null;

  function viewGame(sid, gid) {
    const s = findSession(sid);
    if (!s) return (location.hash = '#/');
    const n = s.mode;
    const existing = gid !== 'new' ? s.games.find((g) => g.id === gid) : null;
    if (gid !== 'new' && !existing) return (location.hash = `#/session/${sid}`);

    const formKey = `${sid}/${gid}`;
    const rotating = s.playerIds.length > n; // 5人以上で交代しながら打つ
    if (!form || form.key !== formKey) {
      const order = existing ? existing.seats.map((x) => x.pid) : defaultSeats(s);
      form = {
        key: formKey,
        seats: order.map((pid) => {
          const sc = existing ? existing.seats.find((x) => x.pid === pid).score : null;
          return { pid, text: sc == null ? '' : String(Math.abs(sc) / 100), neg: sc != null && sc < 0 };
        }),
        tobiBy: existing ? existing.tobiBy : null,
        // 同点のときの順番（起家に近い順）。修正のときは保存済みの並びを使う
        tieOrder: existing ? existing.seats.map((x) => x.pid) : [],
      };
    }

    const title = existing ? `${s.games.indexOf(existing) + 1}半荘目を修正` : `${s.games.length + 1}半荘目`;
    app.innerHTML = `${header(title, `#/session/${sid}`)}
    <main>
      ${rotating ? `<h2 style="margin-top:4px">打つ人（${form.seats.length}/${n}人）</h2>
      ${playerTiles(s.playerIds.map((pid) => {
        const i = form.seats.findIndex((x) => x.pid === pid);
        return { p: getPlayer(pid), attr: `data-play="${pid}"`, on: i >= 0, badge: i >= 0 ? '✓' : '' };
      }))}
      <p class="muted" style="margin:6px 0 0">${existing ? 'タップで入れ替えられます' : '前の半荘で抜けた人を優先して入れています。タップで入れ替えられます'}</p>
      ${form.seats.length < n ? `<div class="notice">あと${n - form.seats.length}人選んでください</div>` : ''}
      <h2>点数</h2>` : ''}
      <div class="muted">最終点数を100点単位で入力します（例: 42,300点 → 423）。マイナスのときは「−」を押してから入力。最後の1人は「自動計算」ボタンで入れられます。</div>
      <div class="card" style="margin-top:8px">
        ${form.seats.map((st, i) => `<div class="seat-row">
          <div class="seat-col">${avatar(getPlayer(st.pid), 40)}</div>
          <div class="seat-who"><span class="pname">${esc(playerName(st.pid))}</span></div>
          <div class="score-box">
            <button class="sign ${st.neg ? 'neg' : ''}" data-sign="${i}" aria-label="マイナス切り替え">−</button>
            <input class="input" data-score="${i}" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(st.text)}" placeholder="0" autocomplete="off" aria-label="${esc(playerName(st.pid))}の点数">
            <span class="suffix">00</span>
          </div>
          <div class="auto" data-auto="${i}"></div>
        </div>`).join('')}
      </div>
      <div id="check"></div>
      <div id="tie"></div>
      <div id="tobi"></div>
      <h2>結果</h2>
      <div class="card" id="preview"></div>
      <button id="save" class="btn primary big">保存する</button>
      ${existing ? '<button id="del-game" class="btn danger" style="width:100%;margin-top:12px">この半荘を削除</button>' : ''}
    </main>`;

    $$('[data-play]').forEach((b) => b.onclick = () => {
      const pid = b.dataset.play;
      const i = form.seats.findIndex((x) => x.pid === pid);
      if (i >= 0) form.seats.splice(i, 1);
      else if (form.seats.length < n) form.seats.push({ pid, text: '', neg: false });
      else { alert(`打つ人は${n}人です。先に誰かをタップして外してください`); return; }
      if (!form.seats.some((x) => x.pid === form.tobiBy)) form.tobiBy = null;
      const y = window.scrollY;
      viewGame(sid, gid);
      window.scrollTo(0, y);
    });
    $$('[data-sign]').forEach((b) => b.onclick = () => {
      const st = form.seats[Number(b.dataset.sign)];
      st.neg = !st.neg;
      viewGame(sid, gid);
    });
    // 日本語入力の全角数字（４２３）や「42,300」のような書き方も受け付ける
    const normalizeScore = (inp) => {
      let v = inp.value.normalize('NFKC').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
      if (v.length >= 5 && v.endsWith('00')) v = v.slice(0, -2); // 42300 と点数そのままで入れた場合
      inp.value = v.slice(0, 4);
      form.seats[Number(inp.dataset.score)].text = inp.value;
      update();
    };
    $$('[data-score]').forEach((inp) => {
      inp.oninput = (e) => { if (!e.isComposing) normalizeScore(inp); };
      inp.addEventListener('compositionend', () => normalizeScore(inp));
    });

    // 同じ点数の人のまとまり（2人以上）を返す。中身は form.seats の番号
    function tieGroups(vals) {
      const by = {};
      vals.forEach((v, i) => { (by[v] = by[v] || []).push(i); });
      return Object.values(by).filter((g) => g.length > 1);
    }
    // 計算・保存に使う並び。同点の人どうしは選んだ順（起家に近い順）にする
    function orderedSeats(vals) {
      const list = form.seats.map((st, i) => ({ pid: st.pid, score: vals[i] }));
      for (const g of tieGroups(vals)) {
        const sorted = g.map((i) => list[i]).sort((a, b) => form.tieOrder.indexOf(a.pid) - form.tieOrder.indexOf(b.pid));
        g.forEach((i, k) => { list[i] = sorted[k]; });
      }
      return list;
    }

    function currentScores() {
      const total = expectedTotal(s.rule, n);
      if (form.seats.length !== n) return { vals: [], autoIndex: -1, autoValue: null, complete: false, diff: 0, total, sum: 0, filled: 0 };
      const vals = form.seats.map((st) => (st.text === '' ? null : Number(st.text) * 100 * (st.neg ? -1 : 1)));
      const empty = vals.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      const sum = vals.reduce((a, v) => a + (v || 0), 0);
      // 残り1人のときは「自動計算」ボタンで入れられる値（勝手には入れない）
      const autoIndex = empty.length === 1 ? empty[0] : -1;
      const autoValue = autoIndex >= 0 ? total - sum : null;
      const complete = empty.length === 0;
      const diff = complete ? sum - total : 0;
      return { vals, autoIndex, autoValue, complete, diff, total, sum, filled: n - empty.length };
    }

    function update() {
      const { vals, autoIndex, autoValue, complete, diff, total, sum, filled } = currentScores();
      $$('[data-auto]').forEach((el) => {
        const i = Number(el.dataset.auto);
        el.innerHTML = i === autoIndex
          ? `<button type="button" class="auto-btn" data-autofill="${i}">自動計算（${formatScore(autoValue)}点）</button>` : '';
      });
      $$('[data-autofill]').forEach((b) => b.onclick = () => {
        const st = form.seats[Number(b.dataset.autofill)];
        st.text = String(Math.abs(autoValue) / 100);
        st.neg = autoValue < 0;
        const y = window.scrollY;
        viewGame(sid, gid);
        window.scrollTo(0, y);
      });
      // 合計点数のチェック（全員の合計が持ち点×人数になるか）
      const sumLine = `合計 <b>${formatScore(sum)}</b>点 ／ 正しい合計 ${formatScore(total)}点`;
      $('#check').innerHTML = !filled ? '' : !complete
        ? `<div class="sum-check">${sumLine}<br><span class="muted">あと${n - filled}人（残りの人の合計 ${formatScore(total - sum)}点）</span></div>`
        : diff === 0
          ? `<div class="sum-check ok">✓ ${sumLine}<br>合計が一致しています</div>`
          : `<div class="sum-check ng">${sumLine}<br><b>${diff > 0 ? '+' : ''}${formatScore(diff)}点ずれています。</b>点数を見直してください</div>`;

      const busted = complete && s.rule.tobiPt ? form.seats.filter((_, i) => vals[i] < 0) : [];
      if (busted.length) {
        const cands = form.seats.filter((_, i) => vals[i] >= 0);
        if (!cands.some((c) => c.pid === form.tobiBy)) form.tobiBy = null;
        $('#tobi').innerHTML = `<div class="card"><div class="label" style="margin-bottom:6px">飛ばした人は？（飛び賞 ${s.rule.tobiPt}pt）</div>
          <div class="opts">${[...cands.map((c) => [c.pid, playerName(c.pid)]), ['', 'なし']].map(([pid, name]) =>
            `<button type="button" class="opt ${(form.tobiBy || '') === pid ? 'on' : ''}" data-tobi="${pid}"><span class="ellipsis">${esc(name)}</span></button>`).join('')}</div></div>`;
        $$('[data-tobi]').forEach((b) => b.onclick = () => { form.tobiBy = b.dataset.tobi || null; update(); });
      } else {
        form.tobiBy = null;
        $('#tobi').innerHTML = '';
      }

      // 同点の人がいるときだけ、起家に近い順を選んでもらう（同点は起家に近い人が上位＝上家取り）
      const groups = complete && diff === 0 ? tieGroups(vals) : [];
      const tieDone = groups.every((g) => g.every((i) => form.tieOrder.includes(form.seats[i].pid)));
      $('#tie').innerHTML = groups.length ? `<div class="card tie-card">${groups.map((g) => {
        const order = form.tieOrder.filter((pid) => g.some((i) => form.seats[i].pid === pid));
        return `<div class="label" style="margin-bottom:6px">${formatScore(vals[g[0]])}点で同点です。<b>起家（東）に近い順</b>にタップしてください</div>
          ${playerTiles(g.map((i) => { const pid = form.seats[i].pid; const k = order.indexOf(pid); return { p: getPlayer(pid), attr: `data-tie="${pid}"`, on: k >= 0, badge: k >= 0 ? String(k + 1) : '' }; }))}`;
      }).join('<div style="height:10px"></div>')}</div>` : '';
      $$('[data-tie]').forEach((b) => b.onclick = () => {
        const pid = b.dataset.tie;
        form.tieOrder = form.tieOrder.includes(pid) ? form.tieOrder.filter((x) => x !== pid) : [...form.tieOrder, pid];
        update();
      });

      const ok = complete && diff === 0 && tieDone;
      $('#save').disabled = !ok;
      if (!ok) {
        $('#preview').innerHTML = `<p class="muted" style="margin:0">${form.seats.length !== n ? `打つ人を${n}人選んでください`
          : !complete ? `${n}人全員の点数を入れると、順位とポイントが表示されます`
          : diff !== 0 ? '合計が合うと、順位とポイントが表示されます' : '同点の人の順番を選ぶと、順位とポイントが表示されます'}</p>`;
        return;
      }
      const results = calcGame(orderedSeats(vals), s.rule, form.tobiBy);
      $('#preview').innerHTML = results.map((r) => `<div class="person-row">
        <span class="rk">${r.rank}位</span>${avatar(getPlayer(r.pid), 32)}
        <div class="nm"><div class="ellipsis">${esc(playerName(r.pid))}</div><div class="cell-sub">${formatScore(r.score)}点${r.tobi10 ? `（飛び賞 ${formatPt(r.tobi10)}）` : ''}</div></div>
        <span class="big-pt ${ptClass(r.pt10)}">${formatPt(r.pt10)}</span></div>`).join('');
    }
    update();

    $('#save').onclick = () => {
      const { vals } = currentScores();
      const game = {
        id: existing ? existing.id : uid(),
        seats: orderedSeats(vals), // 並び順＝同点のときの優先順
        tobiBy: form.tobiBy,
        createdAt: existing ? existing.createdAt : Date.now(),
      };
      if (existing) s.games[s.games.indexOf(existing)] = game;
      else s.games.push(game);
      save();
      form = null;
      location.hash = `#/session/${sid}`;
    };
    if (existing) {
      $('#del-game').onclick = () => {
        if (!confirm('この半荘を削除します。よろしいですか？')) return;
        s.games = s.games.filter((g) => g.id !== existing.id);
        save();
        form = null;
        location.hash = `#/session/${sid}`;
      };
    }
  }

  // ---------- 成績 ----------
  const statsState = { mode: 4, period: 'all' };
  const PERIODS = [['all', '全期間'], ['year', '今年'], ['month', '今月']];

  function statsSessions() {
    const t = today();
    const prefix = { all: '', year: t.slice(0, 4), month: t.slice(0, 7) }[statsState.period];
    return db.sessions
      .filter((s) => s.mode === statsState.mode && s.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  }
  function rankedStats() {
    return Object.values(playerStats(statsSessions()))
      .filter((st) => st.games > 0)
      .sort((a, b) => b.total10 - a.total10);
  }
  function statsFilters() {
    const m = statsState.mode;
    return `<div class="seg" style="margin-bottom:8px"><button data-smode="4" class="${m === 4 ? 'on' : ''}">四麻</button><button data-smode="3" class="${m === 3 ? 'on' : ''}">三麻</button></div>
      <div class="seg">${PERIODS.map(([k, label]) => `<button type="button" class="${statsState.period === k ? 'on' : ''}" data-period="${k}">${label}</button>`).join('')}</div>`;
  }
  function bindStatsFilters(rerender) {
    $$('[data-smode]').forEach((b) => b.onclick = () => { statsState.mode = Number(b.dataset.smode); rerender(); });
    $$('[data-period]').forEach((b) => b.onclick = () => { statsState.period = b.dataset.period; rerender(); });
  }
  const lastRankRate = (st, n) => st.ranks[n - 1] / st.games;

  function viewStats() {
    const n = statsState.mode;
    const list = rankedStats();
    app.innerHTML = `${header('成績')}
    <main>
      ${statsFilters()}
      <h2>ランキング（総合pt順）</h2>
      ${list.length ? `<ul class="list">${list.map((st, i) => `<li><a class="person-row" href="#/stats/${st.pid}">
        <span class="rk">${i + 1}</span>${avatar(getPlayer(st.pid), 40)}
        <div class="nm"><div class="ellipsis">${esc(playerName(st.pid))}</div>
          <div class="cell-sub nowrap-parts"><span>${st.games}半荘・平均${st.avgRank.toFixed(2)}位</span> <span>トップ${formatPct(st.ranks[0] / st.games)}・ラス${formatPct(lastRankRate(st, n))}</span></div></div>
        ${numCol([['総合', `<span class="${ptClass(st.total10)}">${formatPt(st.total10)}</span>`, true], ...(st.hasSettle ? [['精算', `<span class="${ptClass(st.settle10)}">${formatSettle(st.settle10)}</span>`]] : [])])}
      </a></li>`).join('')}</ul>
      <p class="muted">総合pt ＝ 半荘のpt（飛び賞込み）＋ チップ。名前をタップすると詳しい成績が見られます。</p>`
        : `<p class="empty">この条件の${n === 4 ? '四麻' : '三麻'}の記録はまだありません</p>`}
    </main>${nav('stats')}`;
    bindStatsFilters(viewStats);
  }

  // 累計ptの推移（1本の折れ線。0のラインが基準）
  function trendChart(history) {
    const W = 320, H = 170, L = 40, R = 10, T = 12, B = 22;
    const cum = [0];
    history.forEach((h) => cum.push(cum[cum.length - 1] + h.pt10));
    const max = Math.max(0, ...cum), min = Math.min(0, ...cum);
    const span = max - min || 10;
    const x = (i) => L + ((W - L - R) * i) / (cum.length - 1);
    const y = (v) => T + ((H - T - B) * (max - v)) / span;
    const pts = cum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    // 0のラインと近すぎる目盛りは文字が重なるので出さない
    const ticks = [0, ...[max, min].filter((v) => v !== 0 && Math.abs(y(v) - y(0)) >= 14)];
    return `<div class="chart">
      <div class="chart-read" id="chart-read">最新: ${history.length}半荘目 累計 <b>${formatPt(cum[cum.length - 1])}</b></div>
      <svg viewBox="0 0 ${W} ${H}" id="chart-svg" role="img" aria-label="累計ポイントの推移">
        ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : 'grid'}"/>
          <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${formatPt(v)}</text>`).join('')}
        <text x="${L}" y="${H - 4}" class="tick">0</text>
        <text x="${W - R}" y="${H - 4}" text-anchor="end" class="tick">${history.length}半荘</text>
        <polyline points="${pts}" class="line"/>
        <line id="chart-cursor" y1="${T}" y2="${H - B}" class="cursor" visibility="hidden"/>
        <circle id="chart-dot" r="5" class="dot" cx="${x(cum.length - 1)}" cy="${y(cum[cum.length - 1])}"/>
        <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" id="chart-hit"/>
      </svg></div>`;
    }

  function bindTrendChart(history) {
    const svg = $('#chart-svg');
    if (!svg) return;
    const W = 320, L = 40, R = 10;
    const cum = [0];
    history.forEach((h) => cum.push(cum[cum.length - 1] + h.pt10));
    const dot = $('#chart-dot'), cur = $('#chart-cursor');
    const show = (e) => {
      const box = svg.getBoundingClientRect();
      const vx = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(1, Math.min(cum.length - 1, Math.round(((vx - L) / (W - L - R)) * (cum.length - 1))));
      const cx = L + ((W - L - R) * i) / (cum.length - 1);
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', $('#chart-svg polyline').points.getItem(i).y);
      cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('visibility', 'visible');
      const h = history[i - 1];
      $('#chart-read').innerHTML = `${i}半荘目（${Number(h.date.slice(5, 7))}/${Number(h.date.slice(8))}）この半荘 ${formatPt(h.pt10)} ／ 累計 <b>${formatPt(cum[i])}</b>`;
    };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', show);
  }

  function viewStatsDetail(pid) {
    const n = statsState.mode;
    const list = rankedStats();
    const pos = list.findIndex((x) => x.pid === pid);
    const st = list[pos];
    const p = getPlayer(pid);
    const tile = (label, value, cls = '') => `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value ${cls}">${value}</div></div>`;

    app.innerHTML = `${header('成績', '#/stats')}
    <main>
      ${statsFilters()}
      <div class="person-row" style="margin:12px 0 4px">${avatar(p, 56)}
        <div class="nm"><div class="ellipsis" style="font-size:20px;font-weight:700">${esc(p.name)}</div>
        ${st ? `<div class="muted">${list.length}人中 ${pos + 1}位</div>` : ''}</div></div>
      ${!st ? `<p class="empty">この条件の${n === 4 ? '四麻' : '三麻'}の記録はありません</p>` : `
      <div class="tiles">
        ${tile('総合pt', formatPt(st.total10), ptClass(st.total10))}
        ${tile('半荘数', `${st.games}`)}
        ${tile('平均順位', `${st.avgRank.toFixed(2)}位`)}
        ${st.hasSettle ? tile('精算pt（レート込み）', formatSettle(st.settle10), ptClass(st.settle10)) : tile('チップ', formatPt(st.chip10), ptClass(st.chip10))}
      </div>

      <h2>順位率</h2>
      <div class="card">
        ${st.ranks.slice(0, n).map((c, i) => `<div class="rate-row"><span class="rate-label">${i + 1}位</span>
          <div class="rate-bar"><span style="width:${(c / st.games) * 100}%"></span></div>
          <span class="rate-val">${formatPct(c / st.games)}<small>${c}回</small></span></div>`).join('')}
        <div class="rate-foot">連対率（2位以内）<b>${formatPct((st.ranks[0] + st.ranks[1]) / st.games)}</b></div>
      </div>

      <h2>飛び・最高記録</h2>
      <div class="tiles">
        ${tile('飛び率', `${formatPct(st.busted / st.games)}<small>${st.busted}回</small>`)}
        ${tile('飛ばした回数', `${st.busts}回`)}
        ${tile('最高点数', `${formatScore(st.maxScore)}点`)}
        ${tile('最高pt（1半荘）', formatPt(st.maxPt10), ptClass(st.maxPt10))}
      </div>

      <h2>累計ptの推移（チップを除く）</h2>
      <div class="card">${st.games >= 2 ? trendChart(st.history) : '<p class="muted" style="margin:0">2半荘以上打つとグラフが表示されます</p>'}
        ${st.games >= 2 ? '<p class="muted" style="margin:4px 0 0">グラフをタップ（なぞる）と、その時点の点数が見られます</p>' : ''}</div>`}
    </main>${nav('stats')}`;
    bindStatsFilters(() => viewStatsDetail(pid));
    if (st && st.games >= 2) bindTrendChart(st.history);
  }

  // ---------- プレイヤー ----------
  function validateName(name, selfId) {
    if (!name) return '名前を入力してください';
    if (nameLength(name) > NAME_MAX) return `名前は${NAME_MAX}文字までです`;
    if (db.players.some((p) => p.name === name && p.id !== selfId)) return `「${name}」はすでに登録されています`;
    return null;
  }

  // プレイヤーの登録はどこからでも同じ画面で行う。登録が終わったら元の画面に戻り、onCreate で選択などを反映する
  let playerReturn = null; // { back: 戻る画面, onCreate(pid) }
  function openPlayerCreate(back, onCreate) {
    playerReturn = { back, onCreate };
    location.hash = '#/players/new';
  }

  function viewPlayers() {
    app.innerHTML = `${header('プレイヤー')}
    <main>
      <a class="btn primary big" href="#/players/new">＋ プレイヤーを追加</a>
      <h2>登録済み（${db.players.length}人）</h2>
      ${db.players.length ? `<ul class="list">${db.players.map((p) => `<li><a class="person-row" href="#/players/${p.id}">
        ${avatar(p, 40)}<span class="nm ellipsis">${esc(p.name)}</span><span class="muted">編集 ›</span>
      </a></li>`).join('')}</ul>` : '<p class="empty">まだ登録されていません</p>'}
    </main>${nav('players')}`;
  }

  // 写真を正方形に切り抜いて小さくする（保存容量を抑えるため）
  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
      img.src = url;
    });
  }

  let playerDraft = null;

  function viewPlayerEdit(pid) {
    const isNew = pid === 'new';
    const p = isNew ? null : db.players.find((x) => x.id === pid);
    if (!isNew && !p) return (location.hash = '#/players');
    if (!playerDraft || playerDraft.pid !== pid) {
      playerDraft = { pid, name: p ? p.name : '', icon: p ? p.icon : nextIcon(), photo: p ? p.photo : null };
    }
    const d = playerDraft;
    const used = !isNew && usedPlayerIds().has(pid);

    const backTo = isNew && playerReturn ? playerReturn.back : '#/players';
    app.innerHTML = `${header(isNew ? 'プレイヤーを追加' : 'プレイヤーを編集', backTo)}
    <main>
      <div class="profile">${avatar(d, 96)}</div>
      <div class="field">
        <label for="pname">名前（${NAME_MAX}文字まで）</label>
        <input id="pname" class="input" value="${esc(d.name)}" autocomplete="off" placeholder="例: たろう">
        <div class="counter" id="counter"></div>
      </div>

      <h2>写真</h2>
      <div class="inline">
        <label class="btn" style="flex:1">📷 写真を選ぶ<input id="photo" type="file" accept="image/*" hidden></label>
        ${d.photo ? '<button id="no-photo" class="btn" style="flex:1">写真をやめる</button>' : ''}
      </div>

      <h2>アイコン${d.photo ? '（写真をやめると使われます）' : ''}</h2>
      <div class="icon-grid">${ICONS.map(([key, label]) => `<button class="icon-btn ${d.icon === key ? 'on' : ''}" data-icon="${key}" aria-label="${label}"><img src="${iconSrc(key)}" alt=""></button>`).join('')}</div>

      <div id="msg"></div>
      <button id="save" class="btn primary big">${isNew ? '追加する' : '保存する'}</button>
      ${isNew ? '' : used
        ? '<p class="muted" style="text-align:center">対局記録があるため削除できません</p>'
        : '<button id="del" class="btn danger" style="width:100%;margin-top:12px">このプレイヤーを削除</button>'}
    </main>`;

    const nameInput = $('#pname');
    const showCount = () => {
      const len = nameLength(nameInput.value.trim());
      $('#counter').textContent = `${len}/${NAME_MAX}`;
      $('#counter').classList.toggle('over', len > NAME_MAX);
    };
    showCount();
    nameInput.oninput = () => { d.name = nameInput.value; showCount(); };
    $('#photo').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        d.photo = await loadPhoto(file);
        viewPlayerEdit(pid);
      } catch (err) {
        alert('この写真は読み込めませんでした。別の写真を選んでください。');
      }
    };
    if (d.photo) $('#no-photo').onclick = () => { d.photo = null; viewPlayerEdit(pid); };
    $$('[data-icon]').forEach((b) => b.onclick = () => { d.icon = b.dataset.icon; d.photo = null; viewPlayerEdit(pid); });

    $('#save').onclick = () => {
      const name = d.name.trim();
      const err = validateName(name, isNew ? null : pid);
      if (err) { $('#msg').innerHTML = `<div class="notice">${esc(err)}</div>`; return; }
      const newId = uid();
      if (isNew) db.players.push({ id: newId, name, icon: d.icon, photo: d.photo });
      else Object.assign(p, { name, icon: d.icon, photo: d.photo });
      const ret = isNew ? playerReturn : null;
      if (ret) ret.onCreate(newId);
      if (!save()) return;
      playerDraft = null;
      playerReturn = null;
      location.hash = ret ? ret.back : '#/players';
    };
    if (!isNew && !used) {
      $('#del').onclick = () => {
        if (!confirm(`「${p.name}」を削除しますか？`)) return;
        db.players = db.players.filter((x) => x.id !== p.id);
        save();
        playerDraft = null;
        location.hash = '#/players';
      };
    }
  }

  // ---------- ルール ----------
  let ruleReturn = null; // ルール作成後に戻る画面（対局作成から来た場合など）

  function viewRules() {
    ruleReturn = null;
    const card = (r, mine) => `<div class="card">
      <div class="rule-name"><span class="badge">${r.mode === 4 ? '四麻' : '三麻'}</span> ${esc(r.name)}</div>
      ${r.desc ? `<div class="rule-desc">${esc(r.desc)}</div>` : ''}
      <div class="rule-sum">${esc(ruleSummary(r))}</div>
      <a class="btn small" style="margin-top:8px" href="#/rules/${mine ? r.id : 'new/' + r.id}">${mine ? '編集する' : 'これを元にマイルールを作る'}</a>
    </div>`;
    app.innerHTML = `${header('ルール')}
    <main>
      <a class="btn primary big" href="#/rules/new">＋ マイルールを作る</a>
      <h2>マイルール（いつも使うルール）</h2>
      ${db.myRules.length ? db.myRules.map((r) => card(r, true)).join('') : '<p class="muted">まだありません。よく使うルールを保存しておくと、対局を始めるときにタップするだけで選べます。</p>'}
      <h2>おすすめルール</h2>
      ${PRESETS.map((r) => card(r, false)).join('')}
    </main>${nav('rules')}`;
  }

  let ruleDraft = null;

  function viewRuleEdit(id, fromId) {
    const isNew = id === 'new';
    const mine = isNew ? null : db.myRules.find((r) => r.id === id);
    if (!isNew && !mine) return (location.hash = '#/rules');
    const key = `${id}/${fromId || ''}`;
    if (!ruleDraft || ruleDraft.key !== key) {
      const base = mine || findRule(fromId) || PRESETS.find((r) => r.mode === newState.mode);
      ruleDraft = { key, ...clone(base), name: mine ? mine.name : '' };
      delete ruleDraft.desc;
    }
    const d = ruleDraft;
    const n = d.mode;
    const back = ruleReturn || '#/rules';

    const defaultName = isNew ? `マイルール${db.myRules.length + 1}` : mine.name;
    app.innerHTML = `${header(isNew ? 'マイルールを作る' : 'マイルールを編集', back)}
    <main>
      <div class="card editing-card">
        <div class="muted small">${isNew ? '作成中のマイルール' : '編集中のマイルール'}（${n === 4 ? '四麻' : '三麻'}）</div>
        <div class="rule-name" id="editing-name">${esc(d.name.trim() || defaultName)}</div>
        <div class="rule-sum">${esc(ruleSummary(d))}</div>
      </div>
      ${takeLoadedMsg()}

      <div class="field" style="margin-top:12px"><label for="rname">ルールの名前（${RULE_NAME_MAX}文字まで）</label>
        <input id="rname" class="input" value="${esc(d.name)}" maxlength="${RULE_NAME_MAX}" placeholder="${esc(defaultName)}" autocomplete="off"></div>
      ${isNew ? `<div class="field"><span class="label">人数</span>
        <div class="seg"><button data-mode="4" class="${n === 4 ? 'on' : ''}">四麻</button><button data-mode="3" class="${n === 3 ? 'on' : ''}">三麻</button></div></div>` : ''}

      ${presetLoader(n)}
      <div class="detail">${ruleOptions(n, d, 'h2')}</div>

      <div id="msg"></div>
      <button id="save" class="btn primary big">保存する</button>
      ${isNew ? '' : '<button id="del" class="btn danger" style="width:100%;margin-top:12px">このマイルールを削除</button>'}
    </main>`;

    const rerender = () => { const y = window.scrollY; viewRuleEdit(id, fromId); window.scrollTo(0, y); };
    $('#rname').oninput = (e) => { d.name = e.target.value; $('#editing-name').textContent = d.name.trim() || defaultName; };
    $$('[data-mode]').forEach((b) => b.onclick = () => {
      const m = Number(b.dataset.mode);
      if (m === d.mode) return;
      Object.assign(d, clone(PRESETS.find((r) => r.mode === m)), { key: d.key, name: d.name });
      delete d.desc;
      rerender();
    });
    bindPresetLoader(d, rerender);
    bindOpts(d, n, rerender);
    $('#save').onclick = () => {
      const name = d.name.trim() || defaultName;
      if (nameLength(name) > RULE_NAME_MAX) {
        $('#msg').innerHTML = `<div class="notice">名前は${RULE_NAME_MAX}文字までです</div>`;
        return;
      }
      const rule = { id: mine ? mine.id : uid(), mode: d.mode, name, start: d.start, ret: d.ret, uma: [...d.uma], tobiPt: d.tobiPt, chipPt: d.chipPt, rate: d.rate };
      if (mine) Object.assign(mine, rule);
      else db.myRules.push(rule);
      if (ruleReturn === '#/new' && rule.mode === newState.mode) pickRule(rule);
      save();
      ruleDraft = null;
      location.hash = back;
    };
    if (!isNew) {
      $('#del').onclick = () => {
        if (!confirm(`「${mine.name}」を削除しますか？（記録済みの対局には影響しません）`)) return;
        db.myRules = db.myRules.filter((r) => r.id !== mine.id);
        save();
        ruleDraft = null;
        location.hash = '#/rules';
      };
    }
  }

  // ---------- ルーティング ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    window.scrollTo(0, 0);
    customOpen.clear();
    if (parts[0] !== 'session' || parts[2] !== 'game') form = null;
    if (parts[0] !== 'players' || !parts[1]) { playerDraft = null; playerReturn = null; }
    if (parts[0] !== 'rules' || !parts[1]) ruleDraft = null;
    if (parts[0] === 'stats' && parts[1]) return viewStatsDetail(parts[1]);
    if (parts[0] === 'stats') return viewStats();
    if (parts[0] === 'help') return viewHelp();
    if (parts[0] === 'calc') return viewCalc();
    if (parts[0] === 'new') return viewNew();
    if (parts[0] === 'players' && parts[1]) return viewPlayerEdit(parts[1]);
    if (parts[0] === 'players') return viewPlayers();
    if (parts[0] === 'rules' && parts[1] === 'new') return viewRuleEdit('new', parts[2]);
    if (parts[0] === 'rules' && parts[1]) return viewRuleEdit(parts[1]);
    if (parts[0] === 'rules') return viewRules();
    if (parts[0] === 'session' && parts[2] === 'game') return viewGame(parts[1], parts[3]);
    if (parts[0] === 'session' && parts[2] === 'chips') return viewChips(parts[1]);
    if (parts[0] === 'session' && parts[2] === 'members') return viewAddMember(parts[1]);
    if (parts[0] === 'session') return viewSession(parts[1]);
    return viewHome();
  }
  window.addEventListener('hashchange', route);
  route();
})();

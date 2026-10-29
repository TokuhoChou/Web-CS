const ROOM_TTL = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW = 32_000;
const HEARTBEAT_WRITE_INTERVAL = 3_500;
const MAX_ATTEMPTS = 5;

const other = (color) => (color === "r" ? "b" : "r");
const clone = (board) => board.map((row) => row.slice());
const inside = (x, y) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x < 9 &&
  y >= 0 &&
  y < 10;
const inPalace = (x, y, color) =>
  x >= 3 && x <= 5 && (color === "r" ? y >= 7 : y <= 2);

function initialBoard() {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  const back = ["R", "H", "E", "A", "K", "A", "E", "H", "R"];
  for (const [color, y] of [
    ["b", 0],
    ["r", 9],
  ]) {
    back.forEach((piece, x) => {
      board[y][x] = color + piece;
    });
    const cannonY = color === "b" ? 2 : 7;
    const pawnY = color === "b" ? 3 : 6;
    for (const x of [1, 7]) board[cannonY][x] = color + "C";
    for (const x of [0, 2, 4, 6, 8]) board[pawnY][x] = color + "P";
  }
  return board;
}

function pseudoMove(board, fx, fy, tx, ty) {
  if (!inside(fx, fy) || !inside(tx, ty) || (fx === tx && fy === ty)) {
    return false;
  }
  const piece = board[fy][fx];
  const target = board[ty][tx];
  if (!piece || target?.[0] === piece[0]) return false;

  const [color, type] = piece;
  const dx = tx - fx;
  const dy = ty - fy;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (type === "R" || type === "C" || type === "K") {
    if (dx === 0 || dy === 0) {
      let blockers = 0;
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      let x = fx + sx;
      let y = fy + sy;
      while (x !== tx || y !== ty) {
        if (board[y][x]) blockers += 1;
        x += sx;
        y += sy;
      }
      if (type === "R") return blockers === 0;
      if (type === "C") return target ? blockers === 1 : blockers === 0;
      if (type === "K" && target?.[1] === "K" && dx === 0 && blockers === 0) {
        return true;
      }
    }
    if (type !== "K") return false;
  }

  if (type === "K") {
    return ax + ay === 1 && inPalace(tx, ty, color);
  }
  if (type === "A") {
    return ax === 1 && ay === 1 && inPalace(tx, ty, color);
  }
  if (type === "E") {
    return (
      ax === 2 &&
      ay === 2 &&
      !board[fy + dy / 2][fx + dx / 2] &&
      (color === "r" ? ty >= 5 : ty <= 4)
    );
  }
  if (type === "H") {
    return (
      (ax === 2 && ay === 1 && !board[fy][fx + dx / 2]) ||
      (ax === 1 && ay === 2 && !board[fy + dy / 2][fx])
    );
  }
  if (type === "P") {
    return (
      (dx === 0 && dy === (color === "r" ? -1 : 1)) ||
      (ay === 0 && ax === 1 && (color === "r" ? fy <= 4 : fy >= 5))
    );
  }
  return false;
}

function isChecked(board, color) {
  let king;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (board[y][x] === color + "K") king = [x, y];
    }
  }
  if (!king) return true;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = board[y][x];
      if (piece?.[0] === other(color) && pseudoMove(board, x, y, ...king)) {
        return true;
      }
    }
  }
  return false;
}

function isLegal(board, color, fx, fy, tx, ty) {
  if (
    !inside(fx, fy) ||
    !inside(tx, ty) ||
    board[fy][fx]?.[0] !== color ||
    !pseudoMove(board, fx, fy, tx, ty)
  ) {
    return false;
  }
  const next = clone(board);
  next[ty][tx] = next[fy][fx];
  next[fy][fx] = null;
  return !isChecked(next, color);
}

function hasLegalMove(board, color) {
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (board[y][x]?.[0] !== color) continue;
      for (let yy = 0; yy < 10; yy += 1) {
        for (let xx = 0; xx < 9; xx += 1) {
          if (isLegal(board, color, x, y, xx, yy)) return true;
        }
      }
    }
  }
  return false;
}

const positionKey = (board, turn) => JSON.stringify([board, turn]);

function newGame() {
  const board = initialBoard();
  return {
    board,
    turn: "r",
    history: [],
    positions: [positionKey(board, "r")],
    result: null,
  };
}

function playMove(game, color, fx, fy, tx, ty) {
  if (
    game.result ||
    game.turn !== color ||
    !isLegal(game.board, color, fx, fy, tx, ty)
  ) {
    return false;
  }
  const before = clone(game.board);
  const piece = game.board[fy][fx];
  const captured = game.board[ty][tx];
  game.board[ty][tx] = piece;
  game.board[fy][fx] = null;
  game.history.push({ before, turn: color, fx, fy, tx, ty, piece, captured });
  game.turn = other(color);
  const key = positionKey(game.board, game.turn);
  game.positions.push(key);
  if (!hasLegalMove(game.board, game.turn)) {
    game.result = {
      winner: color,
      reason: isChecked(game.board, game.turn) ? "将死" : "困毙",
    };
  } else if (game.positions.filter((value) => value === key).length >= 3) {
    game.result = { winner: null, reason: "相同局面三次重复" };
  }
  return true;
}

function undoMove(game) {
  const last = game.history.pop();
  if (!last) return false;
  game.board = last.before;
  game.turn = last.turn;
  game.positions.pop();
  game.result = null;
  return true;
}

const page = "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <meta name=\"theme-color\" content=\"#f3eee3\">\n  <meta name=\"description\" content=\"创建房间，邀请朋友，在线下一局中国象棋。\">\n  <title>楚河棋社 · 双人中国象棋</title>\n  <style>\n    :root{color:#302a21;background:#f3eee3;font-family:\"Noto Serif SC\",\"Songti SC\",\"STSong\",SimSun,serif;font-synthesis:none}\n    *{box-sizing:border-box}\n    body{margin:0;background:radial-gradient(circle at 14% 10%,#fffdf7 0,transparent 34%),linear-gradient(145deg,#f8f4eb,#eee8dc);min-height:100vh}\n    button,input{font:inherit}\n    button{cursor:pointer}\n    button:disabled{opacity:.38;cursor:not-allowed}\n    [hidden]{display:none!important}\n    .page{max-width:1440px;margin:auto;padding:0 5%}\n    .top{height:84px;border-bottom:1px solid #dbd2c3;display:flex;align-items:center;justify-content:space-between}\n    .brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit}\n    .brand-mark{display:grid;place-items:center;width:42px;height:42px;background:#9f3d2c;color:#fff9ec;font-size:25px;box-shadow:0 5px 13px #8e3a2d30}\n    .brand b{display:block;font-size:18px;letter-spacing:.16em}\n    .brand small{display:block;font:9px Arial;letter-spacing:.19em;color:#9c8e7b;margin-top:5px}\n    .top-actions{display:flex;align-items:center;gap:18px}\n    .top-note{font-size:12px;color:#837865;letter-spacing:.08em}\n    .top-note i,.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#788c67;margin-right:8px;box-shadow:0 0 0 3px #788c6719}\n    .text-button{border:0;background:none;color:#964632;font-size:12px;padding:8px}\n    .back-button{border:1px solid #ccb59f;padding:8px 12px}\n    .intro{padding:54px 0 38px;display:flex;justify-content:space-between;align-items:center}\n    .eyebrow,.label{font:600 10px Arial,sans-serif;letter-spacing:.19em;color:#a17a55}\n    .eyebrow span{display:inline-block;width:28px;height:1px;background:#aa7858;vertical-align:middle;margin-right:8px}\n    .intro h1{font-size:clamp(29px,3vw,43px);font-weight:600;letter-spacing:.07em;margin:16px 0}\n    .intro h1 em{font-style:normal;color:#a6412e}\n    .intro p{font-size:14px;color:#8b806f;letter-spacing:.07em;margin:0}\n    .seal{border:1px solid #b96550;color:#ad5947;line-height:1.2;font-size:15px;padding:8px;transform:rotate(7deg);opacity:.8}\n    .lobby{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ded4c4;background:#faf8f2;margin-bottom:70px;box-shadow:0 18px 45px #6e4e2b0d}\n    .lobby-copy,.join{padding:54px 9%}\n    .lobby-copy{background:linear-gradient(155deg,#e9e0d0,#e2d7c5)}\n    .lobby h2{font-size:30px;line-height:1.5;margin:20px 0}\n    .lobby p{font-size:13px;line-height:2;color:#857a6a}\n    .join{display:flex;flex-direction:column;justify-content:center}\n    .join h3{font-size:22px;margin:18px 0 28px}\n    .join label{font-size:12px;color:#857a6a}\n    .join-row{display:flex;gap:10px;margin-top:10px}\n    .join-row input{min-width:0;flex:1;border:1px solid #d9cebc;background:#fffdf9;padding:14px;font:14px Arial;letter-spacing:.16em;outline-color:#a6412e}\n    .primary,.dark,.outline{border:0;padding:14px 19px;font-size:13px;letter-spacing:.05em;transition:transform .15s,filter .15s}\n    .primary:hover,.dark:hover,.outline:hover{filter:brightness(.96)}\n    .primary:active,.dark:active,.outline:active{transform:translateY(1px)}\n    .primary{background:#9d3d2d;color:#fffaf0}\n    .primary span{margin-left:30px}\n    .dark{background:#37332b;color:#fffaf0}\n    .outline{background:transparent;border:1px solid #d9cebc;color:#62584b}\n    .lobby-copy .primary{margin-top:18px}\n    .hint{font-size:11px!important}\n    .game-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:38px;align-items:start}\n    .board-heading,.record-title{display:flex;justify-content:space-between;align-items:end;margin-bottom:16px;gap:20px}\n    .board-heading h2,.record-title h3{margin:7px 0 0;font-size:21px}\n    .board-heading h2 span{font:12px Arial;color:#a09380;margin-left:10px;white-space:nowrap}\n    .board-frame{padding:14px;background:#90633f;border:1px solid #795033;box-shadow:0 16px 32px #59402224,inset 0 0 0 2px #bb8a59}\n    .board-inner{background:repeating-linear-gradient(2deg,#e3b77c,#e3b77c 7px,#e0b278 8px,#e9c28d 18px);border:2px solid #6c452e;padding:8px}\n    #board{display:block;width:100%;max-height:690px;touch-action:manipulation;user-select:none}\n    #board [role=button]{cursor:pointer;outline:none}\n    #board [role=button]:focus-visible circle{stroke:#a63125;stroke-width:5}\n    .board-foot{display:flex;justify-content:space-between;color:#a99b87;font-size:11px;letter-spacing:.08em;margin-top:13px}\n    .status-card,.record-card{background:#fbf9f4;border:1px solid #e4dbcd;padding:23px;box-shadow:0 7px 20px #69503408}\n    .status-card .label{display:flex;justify-content:space-between}\n    .live-dot{animation:breathe 1.8s infinite}\n    @keyframes breathe{50%{opacity:.35}}\n    .status{font-size:21px;margin:19px 0 7px}\n    .substatus{font-size:12px;color:#988b79;min-height:19px;line-height:1.6}\n    .divider{height:1px;background:#e8e0d4;margin:21px 0}\n    .players{display:flex;align-items:center;justify-content:space-between}\n    .player{display:flex;align-items:center;gap:8px}\n    .player-piece{width:36px;height:36px;border-radius:50%;border:2px solid #a8784e;display:grid;place-items:center;background:#e8c896;font-size:20px;flex:none}\n    .red{color:#aa382d}\n    .black{color:#292c27}\n    .player b,.player small{display:block;font-size:12px}\n    .player small{color:#a69a88;font-size:10px;margin-top:4px}\n    .player i{width:6px;height:6px;background:#c8bdae;border-radius:50%;margin-left:3px}\n    .player.online i{background:#778c68;box-shadow:0 0 0 3px #778c681c}\n    .vs{font:italic 11px Georgia;color:#b7aa99}\n    .actions{display:flex;gap:8px;margin-top:23px}\n    .actions button{flex:1;padding:12px 5px}\n    .pending{background:#f2ebdc;padding:12px;margin-top:20px;font-size:12px}\n    .pending p{margin:0 0 10px;line-height:1.6}\n    .pending button{padding:8px 14px}\n    .record-card{margin-top:14px}\n    .record-title h3{font-size:16px}\n    .record-title>span{font-size:11px;color:#a69b8b;white-space:nowrap}\n    .history{max-height:190px;overflow:auto;border-top:1px solid #eee6da;padding-top:10px;font-size:12px;color:#756958}\n    .history p{margin:8px 0;line-height:1.5}\n    .history .empty{color:#b0a493;text-align:center;padding:20px 0}\n    .rule-note{font-size:11px;color:#aa9f90;line-height:1.8;margin-top:15px}\n    footer{display:flex;justify-content:space-between;border-top:1px solid #ded6c8;margin-top:70px;padding:25px 0;color:#aa9e8d;font-size:11px;letter-spacing:.08em}\n    footer span:last-child{font:9px Arial;letter-spacing:.16em}\n    footer b{color:#b64b36}\n    #toast{position:fixed;bottom:28px;left:50%;transform:translate(-50%,12px);background:#352f28;color:#fff8ec;padding:12px 20px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:5;max-width:88vw;text-align:center}\n    #toast.show{opacity:1;transform:translate(-50%,0)}\n    .conn-bar{height:2px;position:fixed;top:0;left:0;right:0;background:#9a7560;transform:scaleX(0);transform-origin:left;transition:transform .25s;z-index:6}\n    .conn-bar.show{transform:scaleX(1)}\n    @media(max-width:900px){.game-layout{grid-template-columns:1fr;gap:24px}.side{display:grid;grid-template-columns:1fr 1fr;gap:12px}.record-card{margin:0}.rule-note{grid-column:1/-1;margin:0}}\n    @media(max-width:680px){.page{padding:0 4%}.top{height:70px}.top-note{display:none}.intro{padding:34px 0 27px}.intro h1{font-size:26px}.lobby{grid-template-columns:1fr}.lobby-copy,.join{padding:34px 7%}.lobby h2{font-size:24px}.join h3{margin-bottom:20px}.board-frame{padding:7px}.board-inner{padding:3px}.board-heading{align-items:center}.board-heading h2{font-size:18px}.board-heading h2 span{display:block;margin:6px 0 0}.board-foot{font-size:9px}.side{display:block}.record-card{margin-top:12px}.rule-note{margin-top:12px}footer{margin-top:42px}footer span:last-child{display:none}.join-row{flex-direction:column}.join-row .dark{width:100%}.back-button{font-size:13px;min-height:44px;padding:10px 12px}}\n    .lobby-copy,.join{min-width:0}.room-row>div{min-width:0;overflow-wrap:anywhere}.room-list{max-height:330px;overflow:auto;margin:12px 0 22px}.room-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;border-bottom:1px solid #e4dbcd}.room-row h4{margin:0 0 6px;font-size:15px}.room-row p{margin:0;font:12px/1.8 Arial,sans-serif;color:#857a6a}.room-row button{min-height:44px;white-space:nowrap}.room-list-head{display:flex;justify-content:space-between;align-items:center}.room-list-head h3{margin:16px 0}.settings-fields label{display:block;font-size:12px;color:#756958;margin-top:12px}.settings-fields input,.settings-fields select{display:block;width:100%;min-height:44px;padding:10px;border:1px solid #d9cebc;background:#fffdf9;color:#302a21;margin-top:7px;border-radius:0;font:14px Arial,sans-serif}.setting-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.clock-panel{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.clock-panel div{border:1px solid #e2d8c8;padding:10px;text-align:center}.clock-panel span{display:block;font-size:11px;color:#857a6a;margin-bottom:5px}.clock-panel b{font:28px monospace;font-variant-numeric:tabular-nums}.clock-panel .ticking{border-color:#9d3d2d;background:#f6e9df}.room-config-note{font-size:11px;line-height:1.8;color:#8b806f}.lobby .join{justify-content:flex-start;padding:30px 7%}.settings-editor{border-top:1px solid #ded4c4;padding-top:12px;margin-top:12px}.settings-editor .actions{margin-top:14px}\n    .chat-card{margin-top:14px;min-width:0}.chat-log{height:240px;overflow-y:auto;overscroll-behavior:contain;padding:12px 0;border-top:1px solid #eee6da;margin-top:15px}.chat-message{margin:0 0 14px;overflow-wrap:anywhere}.chat-message small{display:block;color:#9a8b77;font:11px Arial,sans-serif;margin-bottom:5px}.chat-message p{margin:0;padding:9px 11px;background:#f0e9dd;color:#554b3e;font-size:13px;line-height:1.6;white-space:pre-wrap}.chat-message.mine p{background:#eee0cd}.chat-message.mine small{color:#9d3d2d}.chat-form{display:flex;gap:8px;margin-top:12px;align-items:stretch}.chat-form textarea{flex:1;min-width:0;width:100%;resize:vertical;max-height:140px;border:1px solid #d9cebc;background:#fffdf9;padding:10px;font:14px/1.5 Arial,sans-serif;border-radius:0}.chat-form button{min-height:44px;padding:10px 14px;white-space:nowrap}@media(min-width:681px) and (max-width:900px){.chat-card{grid-column:1/-1}}\n    .board-frame{position:relative}.board-chat-alert{position:absolute;top:24px;left:50%;transform:translateX(-50%);z-index:3;max-width:85%;width:max-content;max-height:120px;overflow:hidden;box-sizing:border-box;padding:12px 16px;background:rgba(53,47,40,.95);border:2px solid #e6b877;color:#fff8ea;box-shadow:0 5px 18px #0006;border-radius:8px;font:14px/1.5 Arial,sans-serif;text-align:center;overflow-wrap:anywhere;white-space:pre-wrap;pointer-events:none}@media(max-width:680px){.board-chat-alert{top:15px;font-size:14px;max-width:90%}}\n  </style>\n</head>\n<body>\n  <div id=\"connection-bar\" class=\"conn-bar\"></div>\n  <div class=\"page\">\n    <header class=\"top\">\n      <a class=\"brand\" href=\"./\" aria-label=\"楚河棋社首页\"><span class=\"brand-mark\">棋</span><span><b>楚河棋社</b><small>XIANGQI CLUB</small></span></a>\n      <div class=\"top-actions\">\n        <button id=\"back\" class=\"text-button back-button\" hidden>返回大厅</button>\n        <span class=\"top-note\"><i></i> 公网双人对弈 · 无需登录</span>\n      </div>\n    </header>\n    <main>\n      <section class=\"intro\">\n        <div><div class=\"eyebrow\"><span></span> 以棋会友，落子有声</div><h1>一方棋盘，<em>两人对弈。</em></h1><p>邀一位朋友，在楚河汉界间，慢慢下一局。</p></div>\n        <div class=\"seal\" aria-hidden=\"true\">对<br>弈</div>\n      </section>\n      <section id=\"lobby\" class=\"lobby\">\n        <div class=\"lobby-copy\">\n          <div class=\"label\">开始一局</div>\n          <h2>棋逢知己，<br>请君入座。</h2>\n          <p>创建房间后，把 6 位房间号或邀请链接发给朋友。无需安装，也不用登录。</p>\n          <details class=\"settings-fields\"><summary>房间设置 · 名称与计时</summary><label>房间名称<input id=\"create-name\" maxlength=\"24\" placeholder=\"例如：朋友切磋局\" autocomplete=\"off\"></label><div class=\"setting-grid\"><label>每方用时<select id=\"create-minutes\"><option value=\"0\">不限时</option><option value=\"1\">1 分钟</option><option value=\"3\">3 分钟</option><option value=\"5\">5 分钟</option><option value=\"10\">10 分钟</option><option value=\"15\">15 分钟</option><option value=\"30\">30 分钟</option><option value=\"60\">60 分钟</option></select></label><label>每步加秒<select id=\"create-increment\"><option value=\"0\">不加秒</option><option value=\"3\">加 3 秒</option><option value=\"5\">加 5 秒</option><option value=\"10\">加 10 秒</option><option value=\"30\">加 30 秒</option></select></label></div><p class=\"room-config-note\">双方入座开始计时，空位时暂停，断线仍计时。超时判负；悔棋不返还已用时间。</p></details>\n          <button id=\"create\" class=\"primary\">创建房间 <span>→</span></button>\n        </div>\n        <div class=\"join\">\n          <div class=\"label\">ROOMS · 房间大厅</div>\n          <div class=\"room-list-head\"><h3>正在进行的棋局</h3><button id=\"refresh-rooms\" class=\"text-button\">刷新列表</button></div>\n          <p id=\"rooms-message\" class=\"hint\" role=\"status\">正在加载房间…</p>\n          <div id=\"rooms-list\" class=\"room-list\"></div>\n          <label>也可以输入房间号加入</label>\n          <label for=\"room-input\">输入 6 位房间号</label>\n          <div class=\"join-row\"><input id=\"room-input\" maxlength=\"6\" inputmode=\"numeric\" autocomplete=\"one-time-code\" placeholder=\"例如 123456\"><button id=\"join\" class=\"dark\">加入对局</button></div>\n          <p class=\"hint\">满员自动进入观战 · 空位可入座 · 无活动 24 小时后过期</p>\n        </div>\n      </section>\n      <section id=\"game\" class=\"game-layout\" hidden>\n        <div class=\"board-column\">\n          <div class=\"board-heading\"><div><span class=\"label\">THE BOARD</span><h2>对弈棋局 <span id=\"room-title\"></span></h2></div><button id=\"copy\" class=\"text-button\">复制邀请链接 ↗</button></div>\n          <div class=\"board-frame\"><div id=\"board-chat-alert\" class=\"board-chat-alert\" role=\"status\" aria-live=\"polite\" hidden></div><div class=\"board-inner\"><svg id=\"board\" viewBox=\"0 0 800 890\" role=\"img\" aria-label=\"中国象棋棋盘\"></svg></div></div>\n          <div class=\"board-foot\"><span>楚河为界，汉界为营</span><span>点击棋子，再点击目标位置</span></div>\n        </div>\n        <aside class=\"side\">\n          <div class=\"status-card\">\n            <div class=\"label\">CURRENT GAME <span class=\"live-dot\"></span></div>\n            <div id=\"status\" class=\"status\">正在连接</div>\n            <div id=\"substatus\" class=\"substatus\"></div>\n            <div class=\"divider\"></div>\n            <div class=\"players\">\n              <div id=\"red-player\" class=\"player\"><span class=\"player-piece red\">帅</span><span><b>红方</b><small>等待中</small></span><i></i></div>\n              <div class=\"vs\">VS</div>\n              <div id=\"black-player\" class=\"player\"><span class=\"player-piece black\">将</span><span><b>黑方</b><small>等待中</small></span><i></i></div>\n            </div>\n            <p id=\"room-config-label\" class=\"room-config-note\"></p>\n            <div id=\"clock-panel\" class=\"clock-panel\" hidden><div id=\"clock-r-box\"><span>红方剩余</span><b id=\"clock-r\">--:--</b></div><div id=\"clock-b-box\"><span>黑方剩余</span><b id=\"clock-b\">--:--</b></div></div>\n            <button id=\"edit-settings\" class=\"text-button\" hidden>房间设置</button>\n            <section id=\"settings-editor\" class=\"settings-editor settings-fields\" hidden><label>房间名称<input id=\"room-name\" maxlength=\"24\" placeholder=\"例如：朋友切磋局\" autocomplete=\"off\"></label><div class=\"setting-grid\"><label>每方用时<select id=\"room-minutes\"><option value=\"0\">不限时</option><option value=\"1\">1 分钟</option><option value=\"3\">3 分钟</option><option value=\"5\">5 分钟</option><option value=\"10\">10 分钟</option><option value=\"15\">15 分钟</option><option value=\"30\">30 分钟</option><option value=\"60\">60 分钟</option></select></label><label>每步加秒<select id=\"room-increment\"><option value=\"0\">不加秒</option><option value=\"3\">加 3 秒</option><option value=\"5\">加 5 秒</option><option value=\"10\">加 10 秒</option><option value=\"30\">加 30 秒</option></select></label></div><p class=\"room-config-note\">仅创建者可在首步落子前修改；保存计时设置将重置双方用时。</p><div class=\"actions\"><button id=\"save-settings\" class=\"primary\">保存设置</button><button id=\"cancel-settings\" class=\"outline\">取消</button></div></section>\n            <div id=\"pending\" class=\"pending\" hidden><p id=\"pending-text\"></p><div id=\"pending-actions\"><button id=\"accept\" class=\"dark\">同意</button><button id=\"decline\" class=\"outline\">拒绝</button></div></div>\n            <div class=\"actions\"><button id=\"undo\" class=\"outline\">申请悔棋</button><button id=\"resign\" class=\"outline\">认输</button><button id=\"restart\" class=\"primary\" hidden>再来一局 <span>→</span></button></div>\n          </div>\n          <div class=\"status-card\" style=\"margin-top:14px\">\n            <div class=\"label\">房间席位 · <span id=\"spectator-count\">0 人观战</span></div>\n            <p id=\"role-label\" class=\"substatus\"></p>\n            <div id=\"spectator-controls\">\n              <div class=\"actions\"><button id=\"sit-r\" class=\"outline\">执红入座</button><button id=\"sit-b\" class=\"outline\">执黑入座</button></div>\n              <div class=\"actions\"><button id=\"demote-r\" class=\"outline\">红方移至观战</button><button id=\"demote-b\" class=\"outline\">黑方移至观战</button></div>\n              <p class=\"substatus\">观战者可调整席位；空位可入座，保留当前棋局。</p>\n            </div>\n            <button id=\"watch\" class=\"outline\" style=\"min-height:44px\">转为观战</button>\n          </div>\n          <section class=\"status-card chat-card\" aria-label=\"房间聊天\">\n            <div class=\"label\">ROOM CHAT · 房间聊天</div>\n            <div id=\"chat-log\" class=\"chat-log\" role=\"log\" aria-live=\"polite\" aria-label=\"聊天记录\"><p class=\"room-config-note\">还没有消息，和大家打个招呼吧。</p></div>\n            <form id=\"chat-form\" class=\"chat-form\"><textarea id=\"chat-input\" rows=\"2\" maxlength=\"200\" placeholder=\"说点什么（最多 200 字）\" aria-label=\"聊天消息\"></textarea><button id=\"chat-send\" type=\"submit\" class=\"dark\">发送</button></form>\n            <p class=\"room-config-note\">棋手、观战者均可发言 · 保留最近 100 条</p>\n          </section>\n          <div class=\"record-card\">\n            <div class=\"record-title\"><div><span class=\"label\">MOVE HISTORY</span><h3>对局记录</h3></div><span id=\"move-count\">0 步</span></div>\n            <div id=\"history\" class=\"history\"><p class=\"empty\">棋局未动，静待落子。</p></div>\n          </div>\n          <div class=\"rule-note\">双方同意可悔棋 · 将死或困毙判负 · 相同局面及行棋方第三次重复判和 · 暂不裁决长将长捉</div>\n        </aside>\n      </section>\n    </main>\n    <footer><span>楚河棋社 <b>·</b> 一局好棋，慢慢下</span><span>CHU HE CHESS CLUB</span></footer>\n  </div>\n  <div id=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n  <script>\n    const $ = (id) => document.getElementById(id);\n    const socketNames = {\n      r: {K:\"帅\",A:\"仕\",E:\"相\",H:\"傌\",R:\"俥\",C:\"炮\",P:\"兵\"},\n      b: {K:\"将\",A:\"士\",E:\"象\",H:\"马\",R:\"车\",C:\"炮\",P:\"卒\"}\n    };\n    let seat = readSeat();\n    let current = null;\n    let selected = null;\n    let busy = false;\n    let pollTimer = null;\n    let requestInFlight = false;\n    let sessionVersion = 0;\n    let clockReceivedAt = Date.now();\n    let listInFlight = false;\n    let chatSending = false;\n    let chatRenderKey = \"\";\n    let chatLastSeq = 0;\n    let chatAlertTimer = null;\n    let pendingChat = null;\n\n    function readSeat() {\n      try { return JSON.parse(localStorage.getItem(\"chuhe-chess-seat\") || \"null\"); }\n      catch { return null; }\n    }\n    function saveSeat(value) {\n      seat = value;\n      try {\n        if (value) localStorage.setItem(\"chuhe-chess-seat\", JSON.stringify(value));\n        else localStorage.removeItem(\"chuhe-chess-seat\");\n      } catch { /* Keep this session playable when browser storage is unavailable. */ }\n    }\n    function toast(message) {\n      const element = $(\"toast\");\n      element.textContent = message;\n      element.classList.add(\"show\");\n      clearTimeout(element.timer);\n      element.timer = setTimeout(() => element.classList.remove(\"show\"), 2800);\n    }\n    function setConnecting(connecting) {\n      $(\"connection-bar\").classList.toggle(\"show\", connecting);\n    }\n    async function fetchWithTimeout(url, options) {\n      const controller = new AbortController();\n      const timer = setTimeout(() => controller.abort(), 12000);\n      try {\n        return await fetch(url, {...options, signal: controller.signal});\n      } catch (error) {\n        if (error.name === \"AbortError\") throw new Error(\"连接对弈服务器超时，请切换 Wi-Fi／移动流量后重试\");\n        throw new Error(\"无法连接对弈服务器，请检查网络，或使用系统浏览器打开\");\n      } finally {\n        clearTimeout(timer);\n      }\n    }\n    async function api(type, data = {}) {\n      setConnecting(true);\n      try {\n        const response = await fetchWithTimeout(\"https://chuhe-chess-online.pages.dev/api/action\", {\n          method: \"POST\",\n          headers: {\"content-type\":\"application/json\"},\n          body: JSON.stringify({\n            type,\n            code: data.code || seat?.code,\n            token: data.token || seat?.token,\n            data\n          }),\n          cache: \"no-store\"\n        });\n        const result = await response.json().catch(() => ({error:\"服务器返回了无法识别的内容\"}));\n        if (!response.ok || !result.ok) throw new Error(result.error || \"请求失败，请重试\");\n        return result;\n      } finally {\n        setConnecting(false);\n      }\n    }\n    function renderChat() {\n      const messages = current.messages || [];\n      const key = current.code + \":\" + (messages.at(-1)?.id || \"empty\");\n      if (key === chatRenderKey) return;\n      const log = $(\"chat-log\"), nearBottom = log.scrollHeight-log.scrollTop-log.clientHeight < 50;\n      const newRoom = !chatRenderKey.startsWith(current.code+\":\");\n      if (!newRoom) {\n        const fresh = messages.filter(message => message.seq > chatLastSeq && !message.mine);\n        if (fresh.length) {\n          const latest = fresh[fresh.length-1];\n          const alert = $(\"board-chat-alert\");\n          alert.textContent = (fresh.length > 1 ? fresh.length + \" 条新消息 · \" : \"新消息 · \") + latest.sender + \"：\" + latest.text;\n          alert.hidden = false;\n          clearTimeout(chatAlertTimer);\n          chatAlertTimer = setTimeout(() => { alert.hidden = true; }, 6000);\n        }\n      }\n      chatLastSeq = messages.length ? messages[messages.length-1].seq : 0;\n      chatRenderKey = key;\n      log.replaceChildren();\n      if (!messages.length) {\n        const empty=document.createElement(\"p\");empty.className=\"room-config-note\";empty.textContent=\"还没有消息，和大家打个招呼吧。\";log.appendChild(empty);\n      }\n      for (const message of messages) {\n        const row=document.createElement(\"div\"),meta=document.createElement(\"small\"),text=document.createElement(\"p\");\n        row.className=\"chat-message\"+(message.mine ? \" mine\" : \"\");\n        meta.textContent=message.sender+(message.mine ? \"（你）\" : \"\")+\" · \"+new Date(message.at).toLocaleTimeString(\"zh-CN\",{hour:\"2-digit\",minute:\"2-digit\"});\n        text.textContent=message.text;\n        row.append(meta,text);log.appendChild(row);\n      }\n      if (newRoom || nearBottom || messages.at(-1)?.mine) log.scrollTop=log.scrollHeight;\n    }\n    async function sendChat(event) {\n      event?.preventDefault();\n      if (!seat || !current || chatSending) return;\n      const text=$(\"chat-input\").value.trim();\n      if (!text) return;\n      if (!pendingChat || pendingChat.text !== text) pendingChat={text,id:globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)};\n      const message=pendingChat, version=sessionVersion, roomCode=current.code;\n      chatSending=true;$(\"chat-send\").disabled=true;$(\"chat-send\").textContent=\"发送中\";\n      try {\n        const result=await api(\"chat\",message);\n        if (version !== sessionVersion || current?.code !== roomCode) return;\n        if ($(\"chat-input\").value.trim() === text) $(\"chat-input\").value=\"\";\n        pendingChat=null;\n        if ((result.state.messages.at(-1)?.seq || 0) >= (current.messages?.at(-1)?.seq || 0)) current.messages=result.state.messages;\n        renderChat();schedulePoll(0);\n      } catch(error) {if (version === sessionVersion) toast(error.message);}\n      finally {chatSending=false;$(\"chat-send\").disabled=false;$(\"chat-send\").textContent=\"发送\";}\n    }\n    function getSettings(prefix) {\n      return {name:$(prefix+\"-name\").value.trim(),minutes:Number($(prefix+\"-minutes\").value),increment:Number($(prefix+\"-increment\").value)};\n    }\n    function clockText(ms) {\n      const seconds = Math.ceil(Math.max(0,ms)/1000);\n      return String(Math.floor(seconds/60)).padStart(2,\"0\")+\":\"+String(seconds%60).padStart(2,\"0\");\n    }\n    function renderClock() {\n      if (!current?.clock) return;\n      for (const color of [\"r\",\"b\"]) {\n        const running = current.clock.running === color && !current.result;\n        $(\"clock-\"+color).textContent = clockText(current.clock.remaining[color]-(running ? Date.now()-clockReceivedAt : 0));\n        $(\"clock-\"+color+\"-box\").classList.toggle(\"ticking\",running);\n      }\n    }\n    async function loadRooms() {\n      if (current || listInFlight || document.hidden) return;\n      listInFlight = true;\n      $(\"refresh-rooms\").disabled = true;\n      try {\n        const response = await fetchWithTimeout(\"https://chuhe-chess-online.pages.dev/api/rooms\",{cache:\"no-store\"});\n        const result = await response.json();\n        if (!response.ok || !result.ok) throw Error(result.error || \"房间列表暂不可用\");\n        $(\"rooms-list\").replaceChildren();\n        $(\"rooms-message\").textContent = result.rooms.length ? \"显示最近活跃的 \"+result.rooms.length+\" 个房间 · 每 10 秒更新\" : \"还没有房间，创建一局邀请朋友吧。\";\n        const statuses={waiting:\"等待入座\",playing:\"对弈中\",offline:\"等待重连\",ended:\"已结束\"};\n        for (const room of result.rooms) {\n          const row=document.createElement(\"div\");row.className=\"room-row\";\n          const text=document.createElement(\"div\"),title=document.createElement(\"h4\"),meta=document.createElement(\"p\"),button=document.createElement(\"button\");\n          title.textContent=room.name+\" · \"+room.code;\n          meta.textContent=statuses[room.status]+\" · 棋手 \"+room.playerCount+\"/2（在线 \"+room.onlinePlayers+\"） · \"+room.spectatorCount+\" 人观战 · \"+(room.settings.minutes ? room.settings.minutes+\" 分钟 + \"+room.settings.increment+\" 秒\" : \"不限时\");\n          button.className=\"dark\";button.textContent=room.playerCount>=2 || room.status===\"ended\" ? \"加入观战\" : \"加入\";\n          button.onclick=()=>action(\"join\",{code:room.code},{enter:true});\n          text.append(title,meta);row.append(text,button);$(\"rooms-list\").appendChild(row);\n        }\n      } catch (error) { $(\"rooms-message\").textContent=error.message+\"，可点击刷新重试。\"; }\n      finally {listInFlight=false;$(\"refresh-rooms\").disabled=false;}\n    }\n    function enter(result) {\n      sessionVersion += 1;\n      if (result.seat) saveSeat(result.seat);\n      current = result.state;\n      clockReceivedAt = Date.now();\n      selected = null;\n      const base = location.pathname;\n      history.replaceState(null, \"\", base + \"?room=\" + current.code);\n      render();\n      schedulePoll(0);\n    }\n    function clearRoom(message) {\n      sessionVersion += 1;\n      busy = false;\n      saveSeat(null);\n      chatRenderKey=\"\";chatLastSeq=0;clearTimeout(chatAlertTimer);$(\"board-chat-alert\").hidden=true;pendingChat=null;$(\"chat-input\").value=\"\";\n      current = null;\n      selected = null;\n      clearTimeout(pollTimer);\n      history.replaceState(null, \"\", location.pathname);\n      $(\"room-input\").value = \"\";\n      $(\"settings-editor\").hidden = true;\n      render();\n      loadRooms();\n      if (message) toast(message);\n    }\n    function schedulePoll(delay = 780) {\n      clearTimeout(pollTimer);\n      if (!seat) return;\n      pollTimer = setTimeout(poll, delay);\n    }\n    async function poll() {\n      if (!seat || requestInFlight) return schedulePoll();\n      requestInFlight = true;\n      const version = sessionVersion;\n      try {\n        const response = await fetchWithTimeout(\"https://chuhe-chess-online.pages.dev/api/state\", {\n          method:\"POST\",\n          headers:{\"content-type\":\"application/json\"},\n          body:JSON.stringify({code:seat.code, token:seat.token}),\n          cache:\"no-store\"\n        });\n        const result = await response.json().catch(() => ({}));\n        if (version !== sessionVersion) return;\n        if (response.status === 401 || response.status === 404) {\n          clearRoom(result.error || \"房间已结束，请重新入座\");\n          return;\n        }\n        if (!response.ok || !result.ok) throw new Error(result.error || \"网络连接中断\");\n        if (current?.you.color && !result.state.you.color) toast(\"你已进入观战区\");\n        if (result.seat) saveSeat(result.seat);\n        current = result.state;\n      clockReceivedAt = Date.now();\n      } catch {\n        if (version !== sessionVersion) return;\n        $(\"status\").textContent = \"连接暂时中断\";\n        $(\"substatus\").textContent = \"正在自动重试，请保持页面打开。\";\n      } finally {\n        requestInFlight = false;\n        render();\n        schedulePoll();\n      }\n    }\n    async function action(type, data = {}, options = {}) {\n      if (busy) return;\n      busy = true;\n      const version = sessionVersion;\n      const entryButton = type === \"create\" ? $(\"create\") : type === \"join\" ? $(\"join\") : null;\n      const entryLabel = entryButton?.innerHTML;\n      if (entryButton) { entryButton.disabled = true; entryButton.textContent = type === \"create\" ? \"正在创建房间…\" : \"正在加入…\"; }\n      try {\n        const result = await api(type, data);\n        if (version !== sessionVersion) return;\n        if (options.enter) enter(result);\n        else {\n          sessionVersion += 1;\n          if (result.seat) saveSeat(result.seat);\n          current = result.state;\n      clockReceivedAt = Date.now();\n          selected = null;\n          render();\n          schedulePoll(120);\n        }\n        return result;\n      } catch (error) {\n        toast(error.message);\n      } finally {\n        busy = false;\n        if (entryButton) { entryButton.disabled = false; entryButton.innerHTML = entryLabel; }\n      }\n    }\n\n    $(\"chat-form\").onsubmit = sendChat;\n    $(\"chat-input\").addEventListener(\"keydown\",event=>{\n      if (event.key === \"Enter\" && !event.shiftKey && !event.isComposing) sendChat(event);\n    });\n    $(\"create\").onclick = () => action(\"create\", getSettings(\"create\"), {enter:true});\n    $(\"refresh-rooms\").onclick = loadRooms;\n    $(\"edit-settings\").onclick = () => {\n      for (const key of [\"name\",\"minutes\",\"increment\"]) $(\"room-\"+key).value=current.settings[key];\n      $(\"settings-editor\").hidden=false;\n    };\n    $(\"cancel-settings\").onclick = () => {$(\"settings-editor\").hidden=true;};\n    $(\"save-settings\").onclick = async () => {\n      const result=await action(\"settings\",getSettings(\"room\"));\n      if (result) {$(\"settings-editor\").hidden=true;toast(\"房间设置已保存\");}\n    };\n    $(\"join\").onclick = () => {\n      const code = $(\"room-input\").value.trim();\n      if (!/^\\d{6}$/.test(code)) return toast(\"请输入 6 位房间号\");\n      action(\"join\", {code}, {enter:true});\n    };\n    $(\"room-input\").addEventListener(\"keydown\", (event) => {\n      if (event.key === \"Enter\") $(\"join\").click();\n    });\n    $(\"back\").onclick = async () => {\n      if (current?.you.color && current.players.length === 2 && !current.result && !confirm(\"返回大厅将空出你的席位，确定离开吗？\")) return;\n      const leaving = seat;\n      clearRoom();\n      if (leaving) {\n        try { await api(\"leave\", leaving); } catch {}\n      }\n    };\n    $(\"watch\").onclick = () => action(\"watch\");\n    for (const color of [\"r\", \"b\"]) {\n      $(\"sit-\" + color).onclick = () => action(\"sit\", {color});\n      $(\"demote-\" + color).onclick = () => {\n        if (confirm(\"将\" + (color === \"r\" ? \"红方\" : \"黑方\") + \"棋手移至观战区？当前棋局会保留。\")) action(\"demote\", {color});\n      };\n    }\n    $(\"undo\").onclick = () => action(\"request\", {kind:\"undo\"});\n    $(\"restart\").onclick = () => action(\"request\", {kind:\"restart\"});\n    $(\"accept\").onclick = () => action(\"respond\", {accept:true});\n    $(\"decline\").onclick = () => action(\"respond\", {accept:false});\n    $(\"resign\").onclick = () => {\n      if (confirm(\"确定认输吗？\")) action(\"resign\");\n    };\n    $(\"copy\").onclick = async () => {\n      const url = location.origin + location.pathname + \"?room=\" + current.code;\n      try {\n        await navigator.clipboard.writeText(url);\n        toast(\"邀请链接已复制\");\n      } catch {\n        window.prompt(\"复制邀请链接发送给朋友\", url);\n      }\n    };\n    function svgElement(tag, attributes, parent) {\n      const element = document.createElementNS(\"http://www.w3.org/2000/svg\", tag);\n      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);\n      parent.appendChild(element);\n      return element;\n    }\n    function drawBoard() {\n      const svg = $(\"board\");\n      svg.replaceChildren();\n      if (!current) return;\n      const flip = current.you.color === \"b\";\n      const X = (x) => 50 + (flip ? 8 - x : x) * 87.5;\n      const Y = (y) => 50 + (flip ? 9 - y : y) * 87.5;\n      const lines = svgElement(\"g\", {stroke:\"#765035\",\"stroke-width\":\"2\",fill:\"none\"}, svg);\n      for (let y = 0; y < 10; y += 1) svgElement(\"line\", {x1:50,y1:Y(y),x2:750,y2:Y(y)}, lines);\n      for (let x = 0; x < 9; x += 1) {\n        if (x === 0 || x === 8) svgElement(\"line\", {x1:X(x),y1:50,x2:X(x),y2:837.5}, lines);\n        else {\n          svgElement(\"line\", {x1:X(x),y1:50,x2:X(x),y2:Y(flip ? 5 : 4)}, lines);\n          svgElement(\"line\", {x1:X(x),y1:Y(flip ? 4 : 5),x2:X(x),y2:837.5}, lines);\n        }\n      }\n      for (const top of [0, 7]) {\n        svgElement(\"line\", {x1:X(3),y1:Y(top),x2:X(5),y2:Y(top + 2)}, lines);\n        svgElement(\"line\", {x1:X(5),y1:Y(top),x2:X(3),y2:Y(top + 2)}, lines);\n      }\n      for (const [x, text] of [[2,\"楚 河\"],[6,\"汉 界\"]]) {\n        const label = svgElement(\"text\", {x:X(x),y:455,\"text-anchor\":\"middle\",\"font-size\":31,fill:\"#80583a\",\"letter-spacing\":8}, svg);\n        label.textContent = text;\n      }\n      for (let y = 0; y < 10; y += 1) {\n        for (let x = 0; x < 9; x += 1) {\n          const piece = current.board[y][x];\n          const cx = X(x);\n          const cy = Y(y);\n          const group = svgElement(\"g\", {\"data-x\":x,\"data-y\":y,role:\"button\",tabindex:\"0\",\"aria-label\":piece ? (piece[0] === \"r\" ? \"红\" : \"黑\") + socketNames[piece[0]][piece[1]] + \"，第\" + (x + 1) + \"列第\" + (y + 1) + \"行\" : \"空位，第\" + (x + 1) + \"列第\" + (y + 1) + \"行\"}, svg);\n          if (piece) {\n            svgElement(\"circle\", {cx:cx + 2,cy:cy + 4,r:35,fill:\"#6f492c\",opacity:\".25\"}, group);\n            svgElement(\"circle\", {cx,cy,r:35,fill:\"#f2d5a5\",stroke:selected?.x === x && selected?.y === y ? \"#b23b2d\" : \"#9b6a42\",\"stroke-width\":selected?.x === x && selected?.y === y ? \"5\" : \"2\"}, group);\n            svgElement(\"circle\", {cx,cy,r:28,fill:\"none\",stroke:\"#b98a5c\",\"stroke-width\":\"1.5\"}, group);\n            const label = svgElement(\"text\", {x:cx,y:cy + 13,\"text-anchor\":\"middle\",\"font-size\":\"38\",\"font-weight\":\"bold\",fill:piece[0] === \"r\" ? \"#ae3c2d\" : \"#302b24\",\"pointer-events\":\"none\"}, group);\n            label.textContent = socketNames[piece[0]][piece[1]];\n          } else {\n            svgElement(\"circle\", {cx,cy,r:35,fill:\"transparent\"}, group);\n          }\n          group.onclick = () => chooseSquare(x, y);\n          group.onkeydown = (event) => {\n            if (event.key === \"Enter\" || event.key === \" \") {\n              event.preventDefault();\n              chooseSquare(x, y);\n            }\n          };\n        }\n      }\n    }\n    function chooseSquare(x, y) {\n      if (!current || busy || !current.you.color) return;\n      const piece = current.board[y][x];\n      if (piece?.[0] === current.you.color) {\n        selected = {x, y};\n        drawBoard();\n        return;\n      }\n      if (!selected) return;\n      const from = selected;\n      selected = null;\n      drawBoard();\n      const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + \"-\" + Math.random().toString(36).slice(2);\n      action(\"move\", {id,fx:from.x,fy:from.y,tx:x,ty:y});\n    }\n    function render() {\n      const active = Boolean(current && seat);\n      $(\"lobby\").hidden = active;\n      $(\"game\").hidden = !active;\n      $(\"back\").hidden = !active;\n      if (!active) return;\n      renderChat();\n      $(\"room-title\").textContent = current.name + \" · \" + current.code;\n      const settings = current.settings || {minutes:0,increment:0};\n      $(\"room-config-label\").textContent=settings.minutes ? \"每方 \"+settings.minutes+\" 分钟 · 每步加 \"+settings.increment+\" 秒 · 空位时暂停，断线继续计时\" : \"不限时对弈\";\n      $(\"clock-panel\").hidden=!current.clock;\n      renderClock();\n      const canConfigure=current.you.isOwner && !current.history.length && !current.result;\n      $(\"edit-settings\").hidden=!canConfigure;\n      if (!canConfigure) $(\"settings-editor\").hidden=true;\n      const ready = current.players.length === 2 && current.players.every((player) => player.connected);\n      const watching = !current.you.color;\n      const canPlay = ready && !watching;\n      const myName = current.you.color === \"r\" ? \"红方\" : \"黑方\";\n      $(\"spectator-count\").textContent = (current.spectatorCount || 0) + \" 人观战\";\n      $(\"role-label\").textContent = watching ? \"你正在观战\" : \"你执\" + myName;\n      $(\"spectator-controls\").hidden = !watching;\n      $(\"watch\").hidden = watching;\n      for (const color of [\"r\", \"b\"]) {\n        const occupied = current.players.some(p => p.color === color);\n        $(\"sit-\" + color).hidden = occupied;\n        $(\"demote-\" + color).hidden = !occupied;\n      }\n      let status;\n      let substatus;\n      if (current.result) {\n        status = current.result.winner ? (current.result.winner === \"r\" ? \"红方获胜\" : \"黑方获胜\") : \"本局结束\";\n        substatus = current.result.reason;\n      } else if (!ready) {\n        status = \"等待对手入座\";\n        substatus = current.players.length < 2 ? \"把房间号或邀请链接分享给朋友。\" : \"玩家暂时离线，请保持页面打开以自动重连。\";\n      } else {\n        status = current.turn === \"r\" ? \"红方行棋\" : \"黑方行棋\";\n        substatus = (watching ? \"正在观看对弈\" : \"你执\" + myName + \" · \" + (current.turn === current.you.color ? \"轮到你走棋\" : \"等待对方走棋\")) + (current.check ? \" · 将军！\" : \"\");\n      }\n      $(\"status\").textContent = (watching ? \"观战中 · \" : \"\") + status;\n      $(\"substatus\").textContent = substatus;\n      for (const [color, id] of [[\"r\",\"red-player\"],[\"b\",\"black-player\"]]) {\n        const player = current.players.find((value) => value.color === color);\n        $(id).classList.toggle(\"online\", Boolean(player?.connected));\n        $(id).querySelector(\"small\").textContent = color === current.you.color ? \"你\" : player?.connected ? \"对手\" : \"等待中\";\n      }\n      $(\"undo\").disabled = !canPlay || Boolean(current.result) || !current.history.length || Boolean(current.pending);\n      $(\"resign\").disabled = !canPlay || Boolean(current.result);\n      $(\"restart\").hidden = !current.result;\n      $(\"restart\").disabled = !canPlay || Boolean(current.pending);\n      $(\"pending\").hidden = !current.pending;\n      if (current.pending) {\n        const mine = current.pending.from === current.you.color;\n        $(\"pending-text\").textContent = mine ? \"等待对方回应\" + (current.pending.kind === \"undo\" ? \"悔棋\" : \"再来一局\") + \"请求\" : \"对方请求\" + (current.pending.kind === \"undo\" ? \"悔棋\" : \"再来一局\");\n        $(\"pending-actions\").hidden = mine || watching;\n      }\n      $(\"move-count\").textContent = current.history.length + \" 步\";\n      const historyElement = $(\"history\");\n      historyElement.replaceChildren();\n      if (!current.history.length) {\n        const empty = document.createElement(\"p\");\n        empty.className = \"empty\";\n        empty.textContent = \"棋局未动，静待落子。\";\n        historyElement.appendChild(empty);\n      } else {\n        current.history.forEach((move, index) => {\n          const row = document.createElement(\"p\");\n          row.textContent = String(index + 1).padStart(2, \"0\") + \"　\" + (move.piece[0] === \"r\" ? \"红\" : \"黑\") + socketNames[move.piece[0]][move.piece[1]] + \"　\" + (move.fx + 1) + \",\" + (move.fy + 1) + \" → \" + (move.tx + 1) + \",\" + (move.ty + 1) + (move.captured ? \"　吃 \" + socketNames[move.captured[0]][move.captured[1]] : \"\");\n          historyElement.appendChild(row);\n        });\n      }\n      drawBoard();\n    }\n    async function boot() {\n      $(\"room-input\").value = new URLSearchParams(location.search).get(\"room\") || \"\";\n      if (seat) {\n        try {\n          const result = await api(\"restore\");\n          enter(result);\n          return;\n        } catch (error) {\n          saveSeat(null);\n          toast(error.message);\n        }\n      }\n      render();\n    }\n    document.addEventListener(\"visibilitychange\", () => {\n      if (!document.hidden && seat) schedulePoll(0);\n    });\n    window.addEventListener(\"online\", () => {\n      if (seat) schedulePoll(0);\n    });\n    boot();\n    loadRooms();\n    setInterval(loadRooms,10000);\n    setInterval(renderClock,200);\n  </script>\n</body>\n</html>\r\n\r\n";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function randomHex(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function roomCode() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (values[0] % 900000));
}

function roomSettings(data = {}) {
  const minutes = Number(data.minutes ?? 0), increment = Number(data.increment ?? 0);
  if (![0,1,3,5,10,15,30,60].includes(minutes) || ![0,3,5,10,30].includes(increment)) throw new Error("计时设置无效");
  return { name: String(data.name || "楚河棋局").trim().slice(0,24) || "楚河棋局", minutes, increment: minutes ? increment : 0 };
}
function newClock(settings) {
  return settings.minutes ? {remaining:{r:settings.minutes*60000,b:settings.minutes*60000},since:null} : null;
}
function settleClock(room, now) {
  const clock = room.clock;
  if (!clock || room.game.result || clock.since === null) return;
  const color = room.game.turn;
  clock.remaining[color] = Math.max(0, clock.remaining[color] - Math.max(0,now-clock.since));
  clock.since = now;
  if (clock.remaining[color] === 0) {
    room.game.result = {winner:other(color),reason:(color === "r" ? "红方" : "黑方") + "超时"};
    room.pending = null;
    clock.since = null;
  }
}
function syncClock(room, now) {
  if (room.clock) room.clock.since = !room.game.result && room.players.length === 2 ? now : null;
}
function onlineSpectators(room,now) {
  return (room.spectators || []).filter(p => now-(p.seenAt||0) < ONLINE_WINDOW).length;
}
async function listRooms(db) {
  const now = Date.now();
  const rows = await db.prepare("SELECT code, state, version, seen_r, seen_b, created_at, updated_at, expires_at FROM rooms WHERE expires_at > ?1 ORDER BY updated_at DESC LIMIT 30").bind(now).all();
  return (rows.results || []).map(row => {
    const room = parseRoom(row); settleClock(room,now);
    const onlinePlayers = room.players.filter(p => now-(p.color === "r" ? room.seenR : room.seenB) < ONLINE_WINDOW).length;
    return {code:room.code,name:room.settings.name,playerCount:room.players.length,onlinePlayers,spectatorCount:onlineSpectators(room,now),settings:room.settings,status:room.game.result ? "ended" : room.players.length < 2 ? "waiting" : onlinePlayers < 2 ? "offline" : "playing"};
  });
}

function roomState(room, color, now, token) {
  const game = room.game;
  return {
    code: room.code,
    name: room.settings?.name || "楚河棋局",
    settings: room.settings || roomSettings(),
    clock: room.clock ? {remaining:{...room.clock.remaining},running:room.clock.since !== null ? room.game.turn : null} : null,
    serverNow: now,
    board: game.board,
    turn: game.turn,
    result: game.result,
    check: isChecked(game.board, game.turn),
    history: game.history.map(({ fx, fy, tx, ty, piece, captured }) => ({
      fx,
      fy,
      tx,
      ty,
      piece,
      captured,
    })),
    players: room.players.map((player) => ({
      color: player.color,
      connected:
        now - (player.color === "r" ? room.seenR : room.seenB) < ONLINE_WINDOW,
    })),
    pending: room.pending,
    messages: (room.messages || []).map(message => ({...message,mine:message.senderId === findPlayer(room,token)?.chatId})),
    spectatorCount: onlineSpectators(room,now),
    you: { color, role: color ? "player" : "spectator", isOwner: token === room.ownerToken },
  };
}

function findPlayer(room, token) {
  if (typeof token !== "string" || token.length !== 48) return null;
  return [...room.players, ...(room.spectators || [])].find((player) => player.token === token) || null;
}

function parseRoom(row) {
  if (!row) return null;
  return {
    spectators: [],
    messages: [],
    settings: roomSettings(),
    clock: null,
    ownerToken: JSON.parse(row.state).players?.[0]?.token,
    ...JSON.parse(row.state),
    code: row.code,
    seenR: row.seen_r,
    seenB: row.seen_b,
  };
}

async function readRoom(db, code) {
  const row = await db
    .prepare(
      "SELECT code, state, version, seen_r, seen_b, created_at, updated_at, expires_at FROM rooms WHERE code = ?1",
    )
    .bind(code)
    .first();
  if (row && row.expires_at < Date.now()) {
    await db.prepare("DELETE FROM rooms WHERE code = ?1").bind(code).run();
    return null;
  }
  return row;
}

async function writeRoom(db, room, version, now) {
  const state = JSON.stringify({
    settings: room.settings,
    clock: room.clock,
    ownerToken: room.ownerToken,
    players: room.players,
    spectators: room.spectators || [],
    messages: (room.messages || []).slice(-100),
    game: room.game,
    pending: room.pending,
    seen: (room.seen || []).slice(-160),
  });
  const result = await db
    .prepare(
      "UPDATE rooms SET state = ?1, version = version + 1, seen_r = ?2, seen_b = ?3, updated_at = ?4, expires_at = ?5 WHERE code = ?6 AND version = ?7",
    )
    .bind(
      state,
      room.seenR || 0,
      room.seenB || 0,
      now,
      now + ROOM_TTL,
      room.code,
      version,
    )
    .run();
  return (result.meta?.changes ?? result.changes ?? 0) === 1;
}

async function mutateRoom(db, code, token, callback) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readRoom(db, code);
    if (!row) {
      const error = new Error("房间不存在或已结束");
      error.status = 404;
      throw error;
    }
    const room = parseRoom(row);
    const player = findPlayer(room, token);
    if (!player) {
      const error = new Error("席位已失效，请重新创建或加入房间");
      error.status = 401;
      throw error;
    }
    const now = Date.now();
    if (player.color === "r") room.seenR = now;
    else if (player.color === "b") room.seenB = now;
    player.seenAt = now;
    settleClock(room, now);
    const outcome = await callback(room, player, now);
    syncClock(room, now);
    if (!(await writeRoom(db, room, row.version, now))) continue;
    return {
      room,
      player,
      outcome: outcome || {},
      now,
    };
  }
  const error = new Error("棋局刚被另一端更新，请重试");
  error.status = 409;
  throw error;
}

function requireReady(room, now) {
  if (room.players.length < 2) throw new Error("等待对手入座");
  if (
    now - room.seenR >= ONLINE_WINDOW ||
    now - room.seenB >= ONLINE_WINDOW
  ) {
    throw new Error("等待双方在线");
  }
}

async function createRoom(db, now, data = {}) {
  const settings = roomSettings(data);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = roomCode();
    const token = randomHex();
    const room = {
      code,
      settings,
      ownerToken: token,
      clock: newClock(settings),
      players: [{ color: "r", token }],
      game: newGame(),
      pending: null,
      seen: [],
    };
    const state = JSON.stringify({
      settings: room.settings,
    clock: room.clock,
    ownerToken: room.ownerToken,
    players: room.players,
    spectators: room.spectators || [],
    messages: (room.messages || []).slice(-100),
      game: room.game,
      pending: null,
      seen: [],
    });
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO rooms (code, state, version, seen_r, seen_b, created_at, updated_at, expires_at) VALUES (?1, ?2, 1, ?3, 0, ?4, ?4, ?5)",
      )
      .bind(code, state, now, now, now + ROOM_TTL)
      .run();
    if ((result.meta?.changes ?? result.changes ?? 0) === 1) {
      room.seenR = now;
      room.seenB = 0;
      return { room, color: "r", token };
    }
  }
  throw new Error("暂时无法创建房间，请稍后再试");
}

async function joinRoom(db, code, now) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readRoom(db, code);
    if (!row) throw new Error("房间不存在或已结束");
    const room = parseRoom(row);
    settleClock(room, now);
    const token = randomHex();
    const color = !room.game.result ? ["r", "b"].find(c => !room.players.some(p => p.color === c)) || null : null;
    if (color) {
      room.players.push({ color, token });
      if (color === "r") room.seenR = now; else room.seenB = now;
    } else room.spectators.push({ color: null, token, seenAt: now });
    syncClock(room, now);
    if (await writeRoom(db, room, row.version, now)) {
      return { room, color, token };
    }
  }
  throw new Error("入座时发生冲突，请重试");
}

async function handleAction(db, body, ctx) {
  const type = body.type;
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const now = Date.now();

  if (type === "create") {
    const created = await createRoom(db, now, data);
    return {
      seat: { code: created.room.code, token: created.token },
      state: roomState(created.room, created.color, now, created.token),
    };
  }

  const code = String(body.code || "").trim();
  if (!/^\d{6}$/.test(code)) throw new Error("房间号无效");

  if (type === "join") {
    const joined = await joinRoom(db, code, now);
    return {
      seat: { code: joined.room.code, token: joined.token },
      state: roomState(joined.room, joined.color, now, joined.token),
    };
  }

  const token = body.token;
  if (type === "restore") {
    const response = await handleState(db, {code,token});
    const result = await response.json();
    if (!result.ok) {const error = new Error(result.error); error.status=response.status; throw error;}
    return {seat:result.seat,state:result.state};
  }

  const result = await mutateRoom(db, code, token, async (room, player) => {
    if (type === "chat") {
      if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 200) throw new Error("请输入 1–200 字的消息");
      if (typeof data.id !== "string" || !data.id || data.id.length > 100) throw new Error("消息请求无效");
      if (player.lastChatId === data.id) return {};
      if (now - (player.lastChatAt || 0) < 1000) throw new Error("发送太快，请稍等一秒");
      player.chatId ||= randomHex(6);
      const messages = room.messages || [];
      messages.push({id:randomHex(12),seq:(messages.at(-1)?.seq || 0)+1,senderId:player.chatId,sender:player.color === "r" ? "红方" : player.color === "b" ? "黑方" : "观战者 " + player.chatId.slice(-4).toUpperCase(),text:data.text.trim(),at:now});
      room.messages = messages.slice(-100);
      player.lastChatAt = now; player.lastChatId = data.id;
      return {};
    }
    if (type === "settings") {
      if (player.token !== room.ownerToken) throw new Error("只有创建者可以修改房间设置");
      if (room.game.history.length || room.game.result) throw new Error("落子前才能修改设置");
      room.settings = roomSettings(data); room.clock = newClock(room.settings); return {};
    }
    if (type === "leave") {
      room.players = room.players.filter(value => value.token !== player.token);
      room.spectators = room.spectators.filter(value => value.token !== player.token);
      if (player.color) room.pending = null;
      return { deleted: room.players.length === 0 && room.spectators.length === 0 };
    }
    if (type === "demote") {
      if (player.color) throw new Error("请先进入观战区再调整席位");
      if (!["r", "b"].includes(data.color)) throw new Error("席位无效");
      const target = room.players.find(p => p.color === data.color);
      if (!target) throw new Error("该席位已空出");
      room.players = room.players.filter(p => p.token !== target.token);
      room.spectators.push({ ...target, color: null });
      if (data.color === "r") room.seenR = 0; else room.seenB = 0;
      room.pending = null;
      return {};
    }
    if (type === "sit") {
      if (player.color) throw new Error("你已经在棋手席位");
      if (!["r", "b"].includes(data.color)) throw new Error("席位无效");
      if (room.players.some(p => p.color === data.color)) throw new Error("该席位已有棋手");
      room.spectators = room.spectators.filter(p => p.token !== player.token);
      player.color = data.color;
      room.players.push(player);
      if (player.color === "r") room.seenR = now; else room.seenB = now;
      return {};
    }
    if (type === "watch") {
      if (!player.color) return {};
      room.players = room.players.filter(p => p.token !== player.token);
      room.spectators.push({ ...player, color: null });
      if (player.color === "r") room.seenR = 0; else room.seenB = 0;
      room.pending = null;
      return {};
    }
    if (!player.color) throw new Error("观战者不能操作棋局，请先入座");

    if (type === "move") {
      requireReady(room, now);
      if (typeof data.id !== "string" || !data.id || data.id.length > 100) {
        throw new Error("请求无效");
      }
      if (room.seen.includes(data.id)) return {};
      if (room.pending) throw new Error("请先处理当前请求");
      if (room.game.result) throw new Error("本局已经结束");
      if (room.game.turn !== player.color) throw new Error("还没有轮到你");
      if (
        !playMove(
          room.game,
          player.color,
          Number(data.fx),
          Number(data.fy),
          Number(data.tx),
          Number(data.ty),
        )
      ) {
        throw new Error("不符合走棋规则");
      }
      if (room.clock) room.clock.remaining[player.color] += room.settings.increment * 1000;
      room.seen.push(data.id);
      return {};
    }

    if (type === "request") {
      requireReady(room, now);
      if (room.pending) throw new Error("已有请求等待处理");
      if (data.kind === "undo") {
        if (room.game.result || !room.game.history.length) {
          throw new Error("当前无法悔棋");
        }
      } else if (data.kind === "restart") {
        if (!room.game.result) throw new Error("本局结束后才能再来一局");
      } else {
        throw new Error("请求无效");
      }
      room.pending = { kind: data.kind, from: player.color };
      return {};
    }

    if (type === "respond") {
      requireReady(room, now);
      if (!room.pending || room.pending.from === player.color) {
        throw new Error("没有需要你处理的请求");
      }
      if (data.accept === true) {
        if (room.pending.kind === "undo") undoMove(room.game);
        else {
          room.game = newGame();
          room.clock = newClock(room.settings);
          room.players = room.players.map((value) => ({
            ...value,
            color: other(value.color),
          }));
          room.seen = [];
        }
      }
      room.pending = null;
      return {};
    }

    if (type === "resign") {
      requireReady(room, now);
      if (room.game.result) throw new Error("当前无法认输");
      room.game.result = {
        winner: other(player.color),
        reason: "对方认输",
      };
      room.pending = null;
      return {};
    }

    throw new Error("未知操作");
  });

  if (result.outcome.deleted) {
    await db.prepare("DELETE FROM rooms WHERE code = ?1").bind(code).run();
  }
  if (type === "leave") return { seat: null, state: null };
  const latestPlayer = findPlayer(result.room, token);
  return {
    seat: { code, token },
    state: roomState(result.room, latestPlayer.color, result.now, token),
  };
}

async function handleState(db, body) {
  const code = String(body.code || "").trim(), token = body.token;
  for (let attempt=0; attempt<MAX_ATTEMPTS; attempt++) {
    const row = await readRoom(db, code);
    if (!row) return json({ok:false,error:"房间不存在或已结束"},404);
    const room = parseRoom(row), player = findPlayer(room,token);
    if (!player) return json({ok:false,error:"席位已失效，请重新加入"},401);
    const now = Date.now(), wasEnded = Boolean(room.game.result);
    settleClock(room,now);
    const previousSeen = player.color === "r" ? room.seenR : player.color === "b" ? room.seenB : player.seenAt || 0;
    if (player.color === "r") room.seenR=now; else if (player.color === "b") room.seenB=now;
    player.seenAt=now;
    if ((!wasEnded && room.game.result) || now-previousSeen >= (player.color ? HEARTBEAT_WRITE_INTERVAL : 15000)) {
      if (!(await writeRoom(db,room,row.version,now))) continue;
    }
    return json({ok:true,seat:{code,token},state:roomState(room,player.color,now,token)});
  }
  return json({ok:false,error:"棋局正在更新，请重试"},409);
}

const app = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=60",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "no-referrer",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
          "content-security-policy":
            "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        },
      });
    }

    if (!env.DB) return json({ ok: false, error: "数据库暂不可用" }, 503);

    try {
      if (request.method === "GET" && url.pathname === "/api/rooms") return json({ok:true,rooms:await listRooms(env.DB)});
      if (
        request.method === "POST" &&
        (url.pathname === "/api/action" || url.pathname === "/api/state")
      ) {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 8192) return json({ ok: false, error: "请求过大" }, 413);
        const text = await request.text();
        if (text.length > 8192) return json({ ok: false, error: "请求过大" }, 413);
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ ok: false, error: "请求格式无效" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json({ ok: false, error: "请求格式无效" }, 400);
        }
        if (url.pathname === "/api/state") {
          return await handleState(env.DB, body);
        }
        const result = await handleAction(env.DB, body, ctx);
        return json({ ok: true, ...result });
      }
      return json({ ok: false, error: "页面不存在" }, 404);
    } catch (error) {
      return json(
        { ok: false, error: error?.message || "服务器暂时无法处理请求" },
        error?.status || 400,
      );
    }
  },
};

export const __test = {
  roomSettings, newClock, settleClock, syncClock, listRooms,
  initialBoard,
  isLegal,
  isChecked,
  hasLegalMove,
  newGame,
  playMove,
  undoMove,
  handleAction,
  handleState,
};

const FRONTEND_ORIGIN = 'https://tokuhochou.github.io';
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const allowed = origin === FRONTEND_ORIGIN || origin === new URL(request.url).origin;
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, {status:403});
      return new Response(null, {status:204, headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}});
    }
    const response = await app.fetch(request,env,ctx);
    const headers = new Headers(response.headers);
    if (allowed) headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Vary','Origin');
    return new Response(response.body,{status:response.status,headers});
  }
};
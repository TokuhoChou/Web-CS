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

export const page = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f3eee3">
  <meta name="description" content="创建房间，邀请朋友，在线下一局中国象棋。">
  <title>楚河棋社 · 双人中国象棋</title>
  <style>
    :root{color:#302a21;background:#f3eee3;font-family:"Noto Serif SC","Songti SC","STSong",SimSun,serif;font-synthesis:none}
    *{box-sizing:border-box}
    body{margin:0;background:radial-gradient(circle at 14% 10%,#fffdf7 0,transparent 34%),linear-gradient(145deg,#f8f4eb,#eee8dc);min-height:100vh}
    button,input{font:inherit}
    button{cursor:pointer}
    button:disabled{opacity:.38;cursor:not-allowed}
    [hidden]{display:none!important}
    .page{max-width:1440px;margin:auto;padding:0 5%}
    .top{height:84px;border-bottom:1px solid #dbd2c3;display:flex;align-items:center;justify-content:space-between}
    .brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit}
    .brand-mark{display:grid;place-items:center;width:42px;height:42px;background:#9f3d2c;color:#fff9ec;font-size:25px;box-shadow:0 5px 13px #8e3a2d30}
    .brand b{display:block;font-size:18px;letter-spacing:.16em}
    .brand small{display:block;font:9px Arial;letter-spacing:.19em;color:#9c8e7b;margin-top:5px}
    .top-actions{display:flex;align-items:center;gap:18px}
    .top-note{font-size:12px;color:#837865;letter-spacing:.08em}
    .top-note i,.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#788c67;margin-right:8px;box-shadow:0 0 0 3px #788c6719}
    .text-button{border:0;background:none;color:#964632;font-size:12px;padding:8px}
    .back-button{border:1px solid #ccb59f;padding:8px 12px}
    .intro{padding:54px 0 38px;display:flex;justify-content:space-between;align-items:center}
    .eyebrow,.label{font:600 10px Arial,sans-serif;letter-spacing:.19em;color:#a17a55}
    .eyebrow span{display:inline-block;width:28px;height:1px;background:#aa7858;vertical-align:middle;margin-right:8px}
    .intro h1{font-size:clamp(29px,3vw,43px);font-weight:600;letter-spacing:.07em;margin:16px 0}
    .intro h1 em{font-style:normal;color:#a6412e}
    .intro p{font-size:14px;color:#8b806f;letter-spacing:.07em;margin:0}
    .seal{border:1px solid #b96550;color:#ad5947;line-height:1.2;font-size:15px;padding:8px;transform:rotate(7deg);opacity:.8}
    .lobby{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ded4c4;background:#faf8f2;margin-bottom:70px;box-shadow:0 18px 45px #6e4e2b0d}
    .lobby-copy,.join{padding:54px 9%}
    .lobby-copy{background:linear-gradient(155deg,#e9e0d0,#e2d7c5)}
    .lobby h2{font-size:30px;line-height:1.5;margin:20px 0}
    .lobby p{font-size:13px;line-height:2;color:#857a6a}
    .join{display:flex;flex-direction:column;justify-content:center}
    .join h3{font-size:22px;margin:18px 0 28px}
    .join label{font-size:12px;color:#857a6a}
    .join-row{display:flex;gap:10px;margin-top:10px}
    .join-row input{min-width:0;flex:1;border:1px solid #d9cebc;background:#fffdf9;padding:14px;font:14px Arial;letter-spacing:.16em;outline-color:#a6412e}
    .primary,.dark,.outline{border:0;padding:14px 19px;font-size:13px;letter-spacing:.05em;transition:transform .15s,filter .15s}
    .primary:hover,.dark:hover,.outline:hover{filter:brightness(.96)}
    .primary:active,.dark:active,.outline:active{transform:translateY(1px)}
    .primary{background:#9d3d2d;color:#fffaf0}
    .primary span{margin-left:30px}
    .dark{background:#37332b;color:#fffaf0}
    .outline{background:transparent;border:1px solid #d9cebc;color:#62584b}
    .lobby-copy .primary{margin-top:18px}
    .hint{font-size:11px!important}
    .game-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:38px;align-items:start}
    .board-heading,.record-title{display:flex;justify-content:space-between;align-items:end;margin-bottom:16px;gap:20px}
    .board-heading h2,.record-title h3{margin:7px 0 0;font-size:21px}
    .board-heading h2 span{font:12px Arial;color:#a09380;margin-left:10px;white-space:nowrap}
    .board-frame{padding:14px;background:#90633f;border:1px solid #795033;box-shadow:0 16px 32px #59402224,inset 0 0 0 2px #bb8a59}
    .board-inner{background:repeating-linear-gradient(2deg,#e3b77c,#e3b77c 7px,#e0b278 8px,#e9c28d 18px);border:2px solid #6c452e;padding:8px}
    #board{display:block;width:100%;max-height:690px;touch-action:manipulation;user-select:none}
    #board [role=button]{cursor:pointer;outline:none}
    #board [role=button]:focus-visible circle{stroke:#a63125;stroke-width:5}
    .board-foot{display:flex;justify-content:space-between;color:#a99b87;font-size:11px;letter-spacing:.08em;margin-top:13px}
    .status-card,.record-card{background:#fbf9f4;border:1px solid #e4dbcd;padding:23px;box-shadow:0 7px 20px #69503408}
    .status-card .label{display:flex;justify-content:space-between}
    .live-dot{animation:breathe 1.8s infinite}
    @keyframes breathe{50%{opacity:.35}}
    .status{font-size:21px;margin:19px 0 7px}
    .substatus{font-size:12px;color:#988b79;min-height:19px;line-height:1.6}
    .divider{height:1px;background:#e8e0d4;margin:21px 0}
    .players{display:flex;align-items:center;justify-content:space-between}
    .player{display:flex;align-items:center;gap:8px}
    .player-piece{width:36px;height:36px;border-radius:50%;border:2px solid #a8784e;display:grid;place-items:center;background:#e8c896;font-size:20px;flex:none}
    .red{color:#aa382d}
    .black{color:#292c27}
    .player b,.player small{display:block;font-size:12px}
    .player small{color:#a69a88;font-size:10px;margin-top:4px}
    .player i{width:6px;height:6px;background:#c8bdae;border-radius:50%;margin-left:3px}
    .player.online i{background:#778c68;box-shadow:0 0 0 3px #778c681c}
    .vs{font:italic 11px Georgia;color:#b7aa99}
    .actions{display:flex;gap:8px;margin-top:23px}
    .actions button{flex:1;padding:12px 5px}
    .pending{background:#f2ebdc;padding:12px;margin-top:20px;font-size:12px}
    .pending p{margin:0 0 10px;line-height:1.6}
    .pending button{padding:8px 14px}
    .record-card{margin-top:14px}
    .record-title h3{font-size:16px}
    .record-title>span{font-size:11px;color:#a69b8b;white-space:nowrap}
    .history{max-height:190px;overflow:auto;border-top:1px solid #eee6da;padding-top:10px;font-size:12px;color:#756958}
    .history p{margin:8px 0;line-height:1.5}
    .history .empty{color:#b0a493;text-align:center;padding:20px 0}
    .rule-note{font-size:11px;color:#aa9f90;line-height:1.8;margin-top:15px}
    footer{display:flex;justify-content:space-between;border-top:1px solid #ded6c8;margin-top:70px;padding:25px 0;color:#aa9e8d;font-size:11px;letter-spacing:.08em}
    footer span:last-child{font:9px Arial;letter-spacing:.16em}
    footer b{color:#b64b36}
    #toast{position:fixed;bottom:28px;left:50%;transform:translate(-50%,12px);background:#352f28;color:#fff8ec;padding:12px 20px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:5;max-width:88vw;text-align:center}
    #toast.show{opacity:1;transform:translate(-50%,0)}
    .conn-bar{height:2px;position:fixed;top:0;left:0;right:0;background:#9a7560;transform:scaleX(0);transform-origin:left;transition:transform .25s;z-index:6}
    .conn-bar.show{transform:scaleX(1)}
    @media(max-width:900px){.game-layout{grid-template-columns:1fr;gap:24px}.side{display:grid;grid-template-columns:1fr 1fr;gap:12px}.record-card{margin:0}.rule-note{grid-column:1/-1;margin:0}}
    @media(max-width:680px){.page{padding:0 4%}.top{height:70px}.top-note{display:none}.intro{padding:34px 0 27px}.intro h1{font-size:26px}.lobby{grid-template-columns:1fr}.lobby-copy,.join{padding:34px 7%}.lobby h2{font-size:24px}.join h3{margin-bottom:20px}.board-frame{padding:7px}.board-inner{padding:3px}.board-heading{align-items:center}.board-heading h2{font-size:18px}.board-heading h2 span{display:block;margin:6px 0 0}.board-foot{font-size:9px}.side{display:block}.record-card{margin-top:12px}.rule-note{margin-top:12px}footer{margin-top:42px}footer span:last-child{display:none}.join-row{flex-direction:column}.join-row .dark{width:100%}.back-button{font-size:0;padding:8px 9px}.back-button:after{content:"←";font-size:15px}}
  </style>
</head>
<body>
  <div id="connection-bar" class="conn-bar"></div>
  <div class="page">
    <header class="top">
      <a class="brand" href="/" aria-label="楚河棋社首页"><span class="brand-mark">棋</span><span><b>楚河棋社</b><small>XIANGQI CLUB</small></span></a>
      <div class="top-actions">
        <button id="back" class="text-button back-button" hidden>返回大厅</button>
        <span class="top-note"><i></i> 公网双人对弈 · 无需登录</span>
      </div>
    </header>
    <main>
      <section class="intro">
        <div><div class="eyebrow"><span></span> 以棋会友，落子有声</div><h1>一方棋盘，<em>两人对弈。</em></h1><p>邀一位朋友，在楚河汉界间，慢慢下一局。</p></div>
        <div class="seal" aria-hidden="true">对<br>弈</div>
      </section>
      <section id="lobby" class="lobby">
        <div class="lobby-copy">
          <div class="label">开始一局</div>
          <h2>棋逢知己，<br>请君入座。</h2>
          <p>创建房间后，把 6 位房间号或邀请链接发给朋友。无需安装，也不用登录。</p>
          <button id="create" class="primary">创建房间 <span>→</span></button>
        </div>
        <div class="join">
          <div class="label">已有房间？</div>
          <h3>加入朋友的棋局</h3>
          <label for="room-input">输入 6 位房间号</label>
          <div class="join-row"><input id="room-input" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="例如 123456"><button id="join" class="dark">加入对局</button></div>
          <p class="hint">房间和棋局会保存 24 小时，刷新页面后可自动回到席位</p>
        </div>
      </section>
      <section id="game" class="game-layout" hidden>
        <div class="board-column">
          <div class="board-heading"><div><span class="label">THE BOARD</span><h2>对弈棋局 <span id="room-title"></span></h2></div><button id="copy" class="text-button">复制邀请链接 ↗</button></div>
          <div class="board-frame"><div class="board-inner"><svg id="board" viewBox="0 0 800 890" role="img" aria-label="中国象棋棋盘"></svg></div></div>
          <div class="board-foot"><span>楚河为界，汉界为营</span><span>点击棋子，再点击目标位置</span></div>
        </div>
        <aside class="side">
          <div class="status-card">
            <div class="label">CURRENT GAME <span class="live-dot"></span></div>
            <div id="status" class="status">正在连接</div>
            <div id="substatus" class="substatus"></div>
            <div class="divider"></div>
            <div class="players">
              <div id="red-player" class="player"><span class="player-piece red">帅</span><span><b>红方</b><small>等待中</small></span><i></i></div>
              <div class="vs">VS</div>
              <div id="black-player" class="player"><span class="player-piece black">将</span><span><b>黑方</b><small>等待中</small></span><i></i></div>
            </div>
            <div id="pending" class="pending" hidden><p id="pending-text"></p><div id="pending-actions"><button id="accept" class="dark">同意</button><button id="decline" class="outline">拒绝</button></div></div>
            <div class="actions"><button id="undo" class="outline">申请悔棋</button><button id="resign" class="outline">认输</button><button id="restart" class="primary" hidden>再来一局 <span>→</span></button></div>
          </div>
          <div class="record-card">
            <div class="record-title"><div><span class="label">MOVE HISTORY</span><h3>对局记录</h3></div><span id="move-count">0 步</span></div>
            <div id="history" class="history"><p class="empty">棋局未动，静待落子。</p></div>
          </div>
          <div class="rule-note">双方同意可悔棋 · 将死或困毙判负 · 相同局面及行棋方第三次重复判和 · 暂不裁决长将长捉</div>
        </aside>
      </section>
    </main>
    <footer><span>楚河棋社 <b>·</b> 一局好棋，慢慢下</span><span>CHU HE CHESS CLUB</span></footer>
  </div>
  <div id="toast" role="status" aria-live="polite"></div>
  <script>
    const $ = (id) => document.getElementById(id);
    const socketNames = {
      r: {K:"帅",A:"仕",E:"相",H:"傌",R:"俥",C:"炮",P:"兵"},
      b: {K:"将",A:"士",E:"象",H:"马",R:"车",C:"炮",P:"卒"}
    };
    let seat = readSeat();
    let current = null;
    let selected = null;
    let busy = false;
    let pollTimer = null;
    let requestInFlight = false;

    function readSeat() {
      try { return JSON.parse(localStorage.getItem("chuhe-chess-seat") || "null"); }
      catch { return null; }
    }
    function saveSeat(value) {
      seat = value;
      if (value) localStorage.setItem("chuhe-chess-seat", JSON.stringify(value));
      else localStorage.removeItem("chuhe-chess-seat");
    }
    function toast(message) {
      const element = $("toast");
      element.textContent = message;
      element.classList.add("show");
      clearTimeout(element.timer);
      element.timer = setTimeout(() => element.classList.remove("show"), 2800);
    }
    function setConnecting(connecting) {
      $("connection-bar").classList.toggle("show", connecting);
    }
    async function api(type, data = {}) {
      setConnecting(true);
      try {
        const response = await fetch("/api/action", {
          method: "POST",
          headers: {"content-type":"application/json"},
          body: JSON.stringify({
            type,
            code: data.code || seat?.code,
            token: data.token || seat?.token,
            data
          }),
          cache: "no-store"
        });
        const result = await response.json().catch(() => ({error:"服务器返回了无法识别的内容"}));
        if (!response.ok || !result.ok) throw new Error(result.error || "请求失败，请重试");
        return result;
      } finally {
        setConnecting(false);
      }
    }
    function enter(result) {
      if (result.seat) saveSeat(result.seat);
      current = result.state;
      selected = null;
      const base = location.pathname;
      history.replaceState(null, "", base + "?room=" + current.code);
      render();
      schedulePoll(0);
    }
    function clearRoom(message) {
      saveSeat(null);
      current = null;
      selected = null;
      clearTimeout(pollTimer);
      history.replaceState(null, "", location.pathname);
      $("room-input").value = "";
      render();
      if (message) toast(message);
    }
    function schedulePoll(delay = 780) {
      clearTimeout(pollTimer);
      if (!seat) return;
      pollTimer = setTimeout(poll, delay);
    }
    async function poll() {
      if (!seat || requestInFlight) return schedulePoll();
      requestInFlight = true;
      try {
        const response = await fetch("/api/state", {
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({code:seat.code, token:seat.token}),
          cache:"no-store"
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 404) {
          clearRoom(result.error || "房间已结束，请重新入座");
          return;
        }
        if (!response.ok || !result.ok) throw new Error(result.error || "网络连接中断");
        if (result.seat) saveSeat(result.seat);
        current = result.state;
      } catch {
        $("status").textContent = "连接暂时中断";
        $("substatus").textContent = "正在自动重试，请保持页面打开。";
      } finally {
        requestInFlight = false;
        render();
        schedulePoll();
      }
    }
    async function action(type, data = {}, options = {}) {
      if (busy) return;
      busy = true;
      try {
        const result = await api(type, data);
        if (options.enter) enter(result);
        else {
          if (result.seat) saveSeat(result.seat);
          current = result.state;
          selected = null;
          render();
          schedulePoll(120);
        }
        return result;
      } catch (error) {
        toast(error.message);
      } finally {
        busy = false;
      }
    }

    $("create").onclick = () => action("create", {}, {enter:true});
    $("join").onclick = () => {
      const code = $("room-input").value.trim();
      if (!/^\d{6}$/.test(code)) return toast("请输入 6 位房间号");
      action("join", {code}, {enter:true});
    };
    $("room-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") $("join").click();
    });
    $("back").onclick = async () => {
      if (current?.players.length === 2 && !current.result && !confirm("返回大厅将结束当前对局，确定离开吗？")) return;
      if (seat) {
        try { await api("leave"); } catch {}
      }
      clearRoom();
    };
    $("undo").onclick = () => action("request", {kind:"undo"});
    $("restart").onclick = () => action("request", {kind:"restart"});
    $("accept").onclick = () => action("respond", {accept:true});
    $("decline").onclick = () => action("respond", {accept:false});
    $("resign").onclick = () => {
      if (confirm("确定认输吗？")) action("resign");
    };
    $("copy").onclick = async () => {
      const url = location.origin + "/?room=" + current.code;
      try {
        await navigator.clipboard.writeText(url);
        toast("邀请链接已复制");
      } catch {
        window.prompt("复制邀请链接发送给朋友", url);
      }
    };
    function svgElement(tag, attributes, parent) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      parent.appendChild(element);
      return element;
    }
    function drawBoard() {
      const svg = $("board");
      svg.replaceChildren();
      if (!current) return;
      const flip = current.you.color === "b";
      const X = (x) => 50 + (flip ? 8 - x : x) * 87.5;
      const Y = (y) => 50 + (flip ? 9 - y : y) * 87.5;
      const lines = svgElement("g", {stroke:"#765035","stroke-width":"2",fill:"none"}, svg);
      for (let y = 0; y < 10; y += 1) svgElement("line", {x1:50,y1:Y(y),x2:750,y2:Y(y)}, lines);
      for (let x = 0; x < 9; x += 1) {
        if (x === 0 || x === 8) svgElement("line", {x1:X(x),y1:50,x2:X(x),y2:837.5}, lines);
        else {
          svgElement("line", {x1:X(x),y1:50,x2:X(x),y2:Y(flip ? 5 : 4)}, lines);
          svgElement("line", {x1:X(x),y1:Y(flip ? 4 : 5),x2:X(x),y2:837.5}, lines);
        }
      }
      for (const top of [0, 7]) {
        svgElement("line", {x1:X(3),y1:Y(top),x2:X(5),y2:Y(top + 2)}, lines);
        svgElement("line", {x1:X(5),y1:Y(top),x2:X(3),y2:Y(top + 2)}, lines);
      }
      for (const [x, text] of [[2,"楚 河"],[6,"汉 界"]]) {
        const label = svgElement("text", {x:X(x),y:455,"text-anchor":"middle","font-size":31,fill:"#80583a","letter-spacing":8}, svg);
        label.textContent = text;
      }
      for (let y = 0; y < 10; y += 1) {
        for (let x = 0; x < 9; x += 1) {
          const piece = current.board[y][x];
          const cx = X(x);
          const cy = Y(y);
          const group = svgElement("g", {"data-x":x,"data-y":y,role:"button",tabindex:"0","aria-label":piece ? (piece[0] === "r" ? "红" : "黑") + socketNames[piece[0]][piece[1]] + "，第" + (x + 1) + "列第" + (y + 1) + "行" : "空位，第" + (x + 1) + "列第" + (y + 1) + "行"}, svg);
          if (piece) {
            svgElement("circle", {cx:cx + 2,cy:cy + 4,r:35,fill:"#6f492c",opacity:".25"}, group);
            svgElement("circle", {cx,cy,r:35,fill:"#f2d5a5",stroke:selected?.x === x && selected?.y === y ? "#b23b2d" : "#9b6a42","stroke-width":selected?.x === x && selected?.y === y ? "5" : "2"}, group);
            svgElement("circle", {cx,cy,r:28,fill:"none",stroke:"#b98a5c","stroke-width":"1.5"}, group);
            const label = svgElement("text", {x:cx,y:cy + 13,"text-anchor":"middle","font-size":"38","font-weight":"bold",fill:piece[0] === "r" ? "#ae3c2d" : "#302b24","pointer-events":"none"}, group);
            label.textContent = socketNames[piece[0]][piece[1]];
          } else {
            svgElement("circle", {cx,cy,r:35,fill:"transparent"}, group);
          }
          group.onclick = () => chooseSquare(x, y);
          group.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              chooseSquare(x, y);
            }
          };
        }
      }
    }
    function chooseSquare(x, y) {
      if (!current || busy) return;
      const piece = current.board[y][x];
      if (piece?.[0] === current.you.color) {
        selected = {x, y};
        drawBoard();
        return;
      }
      if (!selected) return;
      const from = selected;
      selected = null;
      drawBoard();
      const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      action("move", {id,fx:from.x,fy:from.y,tx:x,ty:y});
    }
    function render() {
      const active = Boolean(current && seat);
      $("lobby").hidden = active;
      $("game").hidden = !active;
      $("back").hidden = !active;
      if (!active) return;
      $("room-title").textContent = "房间 " + current.code;
      const ready = current.players.length === 2 && current.players.every((player) => player.connected);
      const myName = current.you.color === "r" ? "红方" : "黑方";
      let status;
      let substatus;
      if (current.result) {
        status = current.result.winner ? (current.result.winner === "r" ? "红方获胜" : "黑方获胜") : "本局结束";
        substatus = current.result.reason;
      } else if (!ready) {
        status = "等待对手入座";
        substatus = current.players.length < 2 ? "把房间号或邀请链接分享给朋友。" : "玩家暂时离线，请保持页面打开以自动重连。";
      } else {
        status = current.turn === "r" ? "红方行棋" : "黑方行棋";
        substatus = "你执" + myName + " · " + (current.turn === current.you.color ? "轮到你走棋" : "等待对方走棋") + (current.check ? " · 将军！" : "");
      }
      $("status").textContent = status;
      $("substatus").textContent = substatus;
      for (const [color, id] of [["r","red-player"],["b","black-player"]]) {
        const player = current.players.find((value) => value.color === color);
        $(id).classList.toggle("online", Boolean(player?.connected));
        $(id).querySelector("small").textContent = color === current.you.color ? "你" : player?.connected ? "对手" : "等待中";
      }
      $("undo").disabled = !ready || Boolean(current.result) || !current.history.length || Boolean(current.pending);
      $("resign").disabled = !ready || Boolean(current.result);
      $("restart").hidden = !current.result;
      $("restart").disabled = !ready || Boolean(current.pending);
      $("pending").hidden = !current.pending;
      if (current.pending) {
        const mine = current.pending.from === current.you.color;
        $("pending-text").textContent = mine ? "等待对方回应" + (current.pending.kind === "undo" ? "悔棋" : "再来一局") + "请求" : "对方请求" + (current.pending.kind === "undo" ? "悔棋" : "再来一局");
        $("pending-actions").hidden = mine;
      }
      $("move-count").textContent = current.history.length + " 步";
      const historyElement = $("history");
      historyElement.replaceChildren();
      if (!current.history.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "棋局未动，静待落子。";
        historyElement.appendChild(empty);
      } else {
        current.history.forEach((move, index) => {
          const row = document.createElement("p");
          row.textContent = String(index + 1).padStart(2, "0") + "　" + (move.piece[0] === "r" ? "红" : "黑") + socketNames[move.piece[0]][move.piece[1]] + "　" + (move.fx + 1) + "," + (move.fy + 1) + " → " + (move.tx + 1) + "," + (move.ty + 1) + (move.captured ? "　吃 " + socketNames[move.captured[0]][move.captured[1]] : "");
          historyElement.appendChild(row);
        });
      }
      drawBoard();
    }
    async function boot() {
      $("room-input").value = new URLSearchParams(location.search).get("room") || "";
      if (seat) {
        try {
          const result = await api("restore");
          enter(result);
          return;
        } catch (error) {
          saveSeat(null);
          toast(error.message);
        }
      }
      render();
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && seat) schedulePoll(0);
    });
    window.addEventListener("online", () => {
      if (seat) schedulePoll(0);
    });
    boot();
  </script>
</body>
</html>`;

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

function roomState(room, color, now) {
  const game = room.game;
  return {
    code: room.code,
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
    you: { color },
  };
}

function findPlayer(room, token) {
  if (typeof token !== "string" || token.length !== 48) return null;
  return room.players.find((player) => player.token === token) || null;
}

function parseRoom(row) {
  if (!row) return null;
  return {
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
    players: room.players,
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
    else room.seenB = now;
    const outcome = await callback(room, player, now);
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

async function createRoom(db, now) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = roomCode();
    const token = randomHex();
    const room = {
      code,
      players: [{ color: "r", token }],
      game: newGame(),
      pending: null,
      seen: [],
    };
    const state = JSON.stringify({
      players: room.players,
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
    if (room.players.length >= 2) throw new Error("房间已满");
    if (room.game.result) throw new Error("房间已结束");
    const token = randomHex();
    room.players.push({ color: "b", token });
    room.seenB = now;
    if (await writeRoom(db, room, row.version, now)) {
      return { room, color: "b", token };
    }
  }
  throw new Error("入座时发生冲突，请重试");
}

async function handleAction(db, body, ctx) {
  const type = body.type;
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const now = Date.now();

  if (type === "create") {
    const created = await createRoom(db, now);
    return {
      seat: { code: created.room.code, token: created.token },
      state: roomState(created.room, created.color, now),
    };
  }

  const code = String(body.code || "").trim();
  if (!/^\d{6}$/.test(code)) throw new Error("房间号无效");

  if (type === "join") {
    const joined = await joinRoom(db, code, now);
    return {
      seat: { code: joined.room.code, token: joined.token },
      state: roomState(joined.room, joined.color, now),
    };
  }

  const token = body.token;
  if (type === "restore") {
    const row = await readRoom(db, code);
    if (!row) {
      const error = new Error("房间已结束，请重新创建或加入");
      error.status = 404;
      throw error;
    }
    const room = parseRoom(row);
    const player = findPlayer(room, token);
    if (!player) {
      const error = new Error("席位已失效，请重新创建或加入");
      error.status = 401;
      throw error;
    }
    if (player.color === "r") room.seenR = now;
    else room.seenB = now;
    await db
      .prepare(
        "UPDATE rooms SET seen_r = ?1, seen_b = ?2, expires_at = ?3 WHERE code = ?4",
      )
      .bind(room.seenR, room.seenB, now + ROOM_TTL, code)
      .run();
    return {
      seat: { code, token },
      state: roomState(room, player.color, now),
    };
  }

  const result = await mutateRoom(db, code, token, async (room, player) => {
    if (type === "leave") {
      room.players = room.players.filter((value) => value.token !== player.token);
      if (room.players.length && !room.game.result) {
        room.game.result = { winner: null, reason: "对方已离开房间" };
      }
      room.pending = null;
      return { deleted: room.players.length === 0 };
    }

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
  const latestPlayer = findPlayer(result.room, token);
  return {
    seat: { code, token },
    state: roomState(result.room, latestPlayer.color, result.now),
  };
}

async function handleState(db, body) {
  const code = String(body.code || "").trim();
  const token = body.token;
  const row = await readRoom(db, code);
  if (!row) return json({ ok: false, error: "房间不存在或已结束" }, 404);
  const room = parseRoom(row);
  const player = findPlayer(room, token);
  if (!player) return json({ ok: false, error: "席位已失效，请重新加入" }, 401);
  const now = Date.now();
  const previousSeen = player.color === "r" ? room.seenR : room.seenB;
  if (player.color === "r") room.seenR = now;
  else room.seenB = now;
  if (now - previousSeen >= HEARTBEAT_WRITE_INTERVAL) {
    await db
      .prepare(
        "UPDATE rooms SET seen_r = ?1, seen_b = ?2, expires_at = ?3 WHERE code = ?4",
      )
      .bind(room.seenR, room.seenB, now + ROOM_TTL, code)
      .run();
  }
  return json({
    ok: true,
    seat: { code, token },
    state: roomState(room, player.color, now),
  });
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

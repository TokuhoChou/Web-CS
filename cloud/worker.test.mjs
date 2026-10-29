import assert from "node:assert/strict";
import test from "node:test";
import worker, { __test } from "./worker.mjs";

class MemoryDatabase {
  rooms = new Map();

  prepare(sql) {
    let values = [];
    const statement = {
      bind: (...args) => {
        values = args;
        return statement;
      },
      first: async () => {
        const row = this.rooms.get(values[0]);
        return row ? structuredClone(row) : null;
      },
      all: async () => ({results:[...this.rooms.values()].filter(r=>r.expires_at>values[0]).sort((a,b)=>b.updated_at-a.updated_at).slice(0,30).map(r=>structuredClone(r))}),
      run: async () => {
        if (sql.includes("INSERT OR IGNORE")) {
          const [code, state, seenR, created, expires] = values;
          if (this.rooms.has(code)) return { meta: { changes: 0 } };
          this.rooms.set(code, {
            code,
            state,
            version: 1,
            seen_r: seenR,
            seen_b: 0,
            created_at: created,
            updated_at: created,
            expires_at: expires,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE rooms SET state")) {
          const [state, seenR, seenB, updated, expires, code, version] = values;
          const row = this.rooms.get(code);
          if (!row || row.version !== version) return { meta: { changes: 0 } };
          Object.assign(row, {
            state,
            version: row.version + 1,
            seen_r: seenR,
            seen_b: seenB,
            updated_at: updated,
            expires_at: expires,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE rooms SET seen_r")) {
          const [seenR, seenB, expires, code] = values;
          const row = this.rooms.get(code);
          if (!row) return { meta: { changes: 0 } };
          Object.assign(row, { seen_r: seenR, seen_b: seenB, expires_at: expires });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM rooms")) {
          return { meta: { changes: this.rooms.delete(values[0]) ? 1 : 0 } };
        }
        throw new Error("Unhandled SQL in test database: " + sql);
      },
    };
    return statement;
  }
}

async function request(db, path, body) {
  const response = await worker.fetch(
    new Request("https://example.test" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    { DB: db },
    { waitUntil() {} },
  );
  return { status: response.status, body: await response.json() };
}

test("初始布局与将帅照面", () => {
  const board = __test.initialBoard();
  assert.equal(board[9][4], "rK");
  assert.equal(__test.isLegal(board, "r", 0, 6, 0, 5), true);
  assert.equal(__test.isLegal(board, "r", 0, 6, 1, 6), false);

  const empty = Array.from({ length: 10 }, () => Array(9).fill(null));
  empty[9][4] = "rK";
  empty[0][4] = "bK";
  assert.equal(__test.isChecked(empty, "r"), true);
  assert.equal(__test.isChecked(empty, "b"), true);
});

test("相同局面第三次出现判和", () => {
  const game = __test.newGame();
  for (let round = 0; round < 2; round += 1) {
    for (const [color, fx, fy, tx, ty] of [
      ["r", 1, 9, 2, 7],
      ["b", 1, 0, 2, 2],
      ["r", 2, 7, 1, 9],
      ["b", 2, 2, 1, 0],
    ]) {
      assert.equal(__test.playMove(game, color, fx, fy, tx, ty), true);
    }
  }
  assert.equal(game.result.reason, "相同局面三次重复");
  assert.equal(game.result.winner, null);
});

test("公网房间接口：入座、走棋去重、悔棋、认输和换边", async () => {
  const db = new MemoryDatabase();
  const created = await request(db, "/api/action", { type: "create", data: {} });
  assert.equal(created.status, 200);
  assert.equal(created.body.state.you.color, "r");

  const code = created.body.seat.code;
  const red = { code, token: created.body.seat.token };
  const joined = await request(db, "/api/action", { type: "join", code, data: {} });
  assert.equal(joined.status, 200);
  const black = { code, token: joined.body.seat.token };

  const firstMove = { id: "first-move", fx: 0, fy: 6, tx: 0, ty: 5 };
  assert.equal(
    (await request(db, "/api/action", { type: "move", ...red, data: firstMove })).status,
    200,
  );
  assert.equal(
    (await request(db, "/api/action", { type: "move", ...red, data: firstMove })).status,
    200,
  );
  const state = await request(db, "/api/state", red);
  assert.equal(state.body.state.history.length, 1);

  assert.equal(
    (await request(db, "/api/action", { type: "request", ...red, data: { kind: "undo" } })).status,
    200,
  );
  assert.equal(
    (await request(db, "/api/action", { type: "respond", ...black, data: { accept: true } })).status,
    200,
  );
  assert.equal(
    (await request(db, "/api/action", { type: "resign", ...red, data: {} })).status,
    200,
  );
  assert.equal(
    (await request(db, "/api/action", { type: "request", ...red, data: { kind: "restart" } })).status,
    200,
  );
  const restarted = await request(
    db,
    "/api/action",
    { type: "respond", ...black, data: { accept: true } },
  );
  assert.equal(restarted.status, 200);
  assert.equal(restarted.body.state.you.color, "r");
  assert.equal(
    (await request(db, "/api/state", red)).body.state.you.color,
    "b",
  );
  assert.equal((await request(db, "/api/action", {type:"leave", ...red})).status, 200);
  assert.equal((await request(db, "/api/action", {type:"leave", ...black})).status, 200);
});



test('满员观战、移出棋手、入座与观战权限', async () => {
  const db=new MemoryDatabase();
  const post=body=>request(db,'/api/action',body);
  const made=await post({type:'create'});const red=made.body.seat;
  const black=(await post({type:'join',code:red.code})).body.seat;
  const watched=await post({type:'join',code:red.code});const watcher=watched.body.seat;
  assert.equal(watched.body.state.you.role,'spectator');assert.equal(watched.body.state.you.color,null);
  const watcher2=(await post({type:'join',code:red.code})).body.seat;
  assert.equal((await request(db,'/api/state',watcher)).body.state.spectatorCount,2);
  for(const type of ['move','request','respond','resign'])assert.notEqual((await post({type,...watcher,data:{}})).status,200);
  assert.notEqual((await post({type:'demote',...red,data:{color:'b'}})).status,200);
  assert.notEqual((await post({type:'sit',...watcher,data:{color:'b'}})).status,200);
  assert.equal((await post({type:'move',...red,data:{id:'watch-test',fx:0,fy:6,tx:0,ty:5}})).status,200);
  const demoted=await post({type:'demote',...watcher,data:{color:'b'}});assert.equal(demoted.status,200);
  assert.equal(demoted.body.state.history.length,1);
  assert.equal((await post({type:'restore',...black})).body.state.you.color,null);
  assert.notEqual((await post({type:'move',...black,data:{id:'kicked',fx:0,fy:3,tx:0,ty:4}})).status,200);
  assert.equal((await post({type:'sit',...watcher,data:{color:'b'}})).body.state.you.color,'b');
  assert.notEqual((await post({type:'sit',...watcher2,data:{color:'b'}})).status,200);
  assert.equal((await post({type:'move',...watcher,data:{id:'replacement',fx:0,fy:3,tx:0,ty:4}})).status,200);
  assert.equal((await post({type:'resign',...watcher})).status,200);
  assert.equal((await post({type:'request',...red,data:{kind:'restart'}})).status,200);
  assert.equal((await post({type:'respond',...watcher,data:{accept:true}})).status,200);
  assert.equal((await request(db,'/api/state',black)).body.state.you.color,null);
  assert.equal((await request(db,'/api/state',watcher)).body.state.you.color,'r');
  assert.equal((await post({type:'watch',...watcher})).body.state.you.color,null);
  const third=await post({type:'join',code:red.code});assert.equal(third.body.state.you.color,'r');
  await post({type:'leave',...black});
  assert.equal((await request(db,'/api/state',red)).body.state.result,null);
  assert.equal((await request(db,'/api/state',watcher2)).status,200);
  for(const member of [red,watcher,watcher2,third.body.seat])await post({type:'leave',...member});
  assert.equal((await request(db,'/api/state',watcher2)).status,404);
});

test('大厅人数、设置权限、加秒和超时结果持久化', async () => {
  const db=new MemoryDatabase();const post=body=>request(db,'/api/action',body);
  assert.equal((await post({type:'create',data:{minutes:-1}})).status,400);
  const made=await post({type:'create',data:{name:'好友切磋',minutes:1,increment:3}});const red=made.body.seat;
  assert.equal(made.body.state.you.isOwner,true);assert.equal(made.body.state.clock.running,null);
  const black=(await post({type:'join',code:red.code})).body.seat;
  const watcher=(await post({type:'join',code:red.code})).body.seat;
  assert.equal((await post({type:'settings',...watcher,data:{minutes:10}})).status,400);
  const configured=await post({type:'settings',...red,data:{name:'快棋局',minutes:1,increment:3}});
  assert.equal(configured.body.state.clock.running,'r');
  const listed=await request(db,'/api/rooms');assert.equal(listed.status,200);
  const room=listed.body.rooms.find(r=>r.code===red.code);assert.equal(room.name,'快棋局');assert.equal(room.playerCount,2);assert.equal(room.onlinePlayers,2);assert.equal(room.spectatorCount,1);assert.equal(room.status,'playing');
  assert(!JSON.stringify(listed.body).includes(red.token));assert(!JSON.stringify(listed.body).includes(watcher.token));
  const row=db.rooms.get(red.code),stored=JSON.parse(row.state);stored.clock.since=Date.now()-2000;row.state=JSON.stringify(stored);
  const moved=await post({type:'move',...red,data:{id:'clock-move',fx:0,fy:6,tx:0,ty:5}});
  assert.equal(moved.status,200);assert.equal(moved.body.state.clock.running,'b');assert(moved.body.state.clock.remaining.r>60000 && moved.body.state.clock.remaining.r<=61000);
  assert.equal((await post({type:'settings',...red,data:{minutes:0}})).status,400);
  const paused=await post({type:'demote',...watcher,data:{color:'b'}});assert.equal(paused.body.state.clock.running,null);
  const frozen=paused.body.state.clock.remaining.b;
  const resumed=await post({type:'sit',...watcher,data:{color:'b'}});assert.equal(resumed.body.state.clock.running,'b');assert.equal(resumed.body.state.clock.remaining.b,frozen);
  const expired=JSON.parse(row.state);expired.clock.remaining.b=1;expired.clock.since=Date.now()-100;row.state=JSON.stringify(expired);
  const timedOut=await request(db,'/api/state',red);assert.equal(timedOut.body.state.result.winner,'r');assert.equal(timedOut.body.state.result.reason,'黑方超时');assert.equal(timedOut.body.state.clock.running,null);
  assert.equal(JSON.parse(db.rooms.get(red.code).state).game.result.winner,'r');
  assert.equal((await post({type:'move',...watcher,data:{id:'late',fx:0,fy:3,tx:0,ty:4}})).status,400);
  assert.equal((await post({type:'request',...red,data:{kind:'restart'}})).status,200);
  const restart=await post({type:'respond',...watcher,data:{accept:true}});assert.equal(restart.body.state.clock.remaining.r,60000);assert.equal(restart.body.state.clock.remaining.b,60000);assert.equal(restart.body.state.clock.running,'r');
});

test('服务器时钟：等待不扣时、空位暂停、超时判负', () => {
  const settings=__test.roomSettings({minutes:1});const room={settings,clock:__test.newClock(settings),game:__test.newGame(),players:[{color:'r'}],pending:null};
  __test.syncClock(room,1000);__test.settleClock(room,9000);assert.equal(room.clock.remaining.r,60000);
  room.players.push({color:'b'});__test.syncClock(room,10000);__test.settleClock(room,13000);assert.equal(room.clock.remaining.r,57000);
  room.players.pop();__test.syncClock(room,13000);__test.settleClock(room,90000);assert.equal(room.clock.remaining.r,57000);
  room.players.push({color:'b'});__test.syncClock(room,90000);__test.settleClock(room,147000);assert.equal(room.game.result.winner,'b');assert.equal(room.clock.remaining.r,0);
});
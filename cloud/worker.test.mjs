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
});


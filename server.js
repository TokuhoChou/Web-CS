const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const os=require('os');
const game=require('./game');
const app=express(); app.use(express.static('public'));
app.get('/api/network',(req,res)=>{const addresses=Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>n.address);res.json({addresses});});
const server=http.createServer(app); const io=new Server(server); const rooms=new Map();
const GRACE=Number(process.env.GRACE_MS)||600000;
const token=()=>crypto.randomBytes(24).toString('hex');
function code(){let c;do{c=String(crypto.randomInt(100000,1000000));}while(rooms.has(c));return c;}
function state(r){return {code:r.code,board:r.g.board,turn:r.g.turn,result:r.g.result,check:game.checked(r.g.board,r.g.turn),history:r.g.history.map(({fx,fy,tx,ty,piece,captured})=>({fx,fy,tx,ty,piece,captured})),players:r.players.map(p=>({color:p.color,connected:!!p.socket})),pending:r.pending};}
function broadcast(r){io.to(r.code).emit('state',state(r));}
function cleanup(r){if(r.players.every(p=>!p.socket)){clearTimeout(r.cleanup);r.cleanup=setTimeout(()=>rooms.delete(r.code),GRACE);r.cleanup.unref();}}
function attach(socket,r,p){clearTimeout(r.cleanup);clearTimeout(p.timer);if(p.socket&&p.socket!==socket.id){const old=io.sockets.sockets.get(p.socket);if(old){old.leave(r.code);old.data.seat=null;old.emit('replaced');}}p.socket=socket.id;socket.data.seat={code:r.code,token:p.token};socket.join(r.code);broadcast(r);}
function lookup(socket){const s=socket.data.seat,r=s&&rooms.get(s.code),p=r?.players.find(v=>v.token===s.token&&v.socket===socket.id);return p?{r,p}:null;}
function wrap(socket,event,fn){socket.on(event,(data,ack)=>{if(typeof data==='function'){ack=data;data={};}try{const value=fn(data||{});if(typeof ack==='function')ack({ok:true,...value});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.message});}});}
const fail=s=>{throw Error(s)};
io.on('connection',socket=>{
 wrap(socket,'create',()=>{if(socket.data.seat)fail('请先离开当前房间');const r={code:code(),players:[],g:game.newGame(),pending:null,seen:new Set()};const p={token:token(),color:'r',socket:null};r.players.push(p);rooms.set(r.code,r);attach(socket,r,p);return {code:r.code,token:p.token,color:p.color,state:state(r)};});
 wrap(socket,'join',d=>{if(socket.data.seat)fail('请先离开当前房间');const r=rooms.get(String(d.code||'').trim());if(!r)fail('房间不存在或已结束');if(r.players.length>=2)fail('房间已满');const p={token:token(),color:'b',socket:null};r.players.push(p);attach(socket,r,p);return {code:r.code,token:p.token,color:p.color,state:state(r)};});
 wrap(socket,'restore',d=>{const r=rooms.get(String(d.code||'')),p=r?.players.find(v=>v.token===d.token);if(!p)fail('房间已结束，请重新创建或加入');if(socket.data.seat&&socket.data.seat.code!==r.code)fail('请先离开当前房间');attach(socket,r,p);return {code:r.code,token:p.token,color:p.color,state:state(r)};});
 wrap(socket,'leave',()=>{const a=lookup(socket);if(!a)fail('请先加入房间');const {r,p}=a;socket.leave(r.code);socket.data.seat=null;p.socket=null;clearTimeout(p.timer);r.pending=null;r.g.result={winner:null,reason:'对方已离开房间'};broadcast(r);cleanup(r);return {};});
 wrap(socket,'move',d=>{const a=lookup(socket);if(!a)fail('请先加入房间');const {r,p}=a;if(typeof d.id!=='string'||d.id.length>100||!d.id)fail('请求无效');if(r.seen.has(d.id))return {};if(r.players.length<2||r.players.some(x=>!x.socket))fail('等待双方在线');if(r.pending)fail('请先处理当前请求');if(r.g.result)fail('本局已经结束');if(r.g.turn!==p.color)fail('还没有轮到你');if(!game.move(r.g,p.color,d.fx,d.fy,d.tx,d.ty))fail('不符合走棋规则');r.seen.add(d.id);broadcast(r);return {};});
 wrap(socket,'request',d=>{const a=lookup(socket);if(!a)fail('请先加入房间');const {r,p}=a;if(r.players.length<2||r.players.some(x=>!x.socket))fail('等待双方在线');if(r.pending)fail('已有请求等待处理');if(d.kind==='undo'){if(r.g.result||!r.g.history.length)fail('当前无法悔棋');}else if(d.kind==='restart'){if(!r.g.result)fail('本局结束后才能再来一局');}else fail('请求无效');r.pending={kind:d.kind,from:p.color};broadcast(r);return {};});
 wrap(socket,'respond',d=>{const a=lookup(socket);if(!a)fail('请先加入房间');const {r,p}=a;if(!r.pending||r.pending.from===p.color)fail('没有需要你处理的请求');if(r.players.some(x=>!x.socket))fail('等待双方在线');if(d.accept===true){if(r.pending.kind==='undo')game.undo(r.g);else {r.g=game.newGame();for(const player of r.players){player.color=game.other(player.color);io.to(player.socket).emit('seat',{color:player.color});}r.seen.clear();}}r.pending=null;broadcast(r);return {};});
 wrap(socket,'resign',()=>{const a=lookup(socket);if(!a)fail('请先加入房间');const {r,p}=a;if(r.players.length<2||r.players.some(x=>!x.socket)||r.g.result)fail('当前无法认输');r.g.result={winner:game.other(p.color),reason:'对方认输'};r.pending=null;broadcast(r);return {};});
 socket.on('disconnect',()=>{const a=lookup(socket);if(!a)return;const {r,p}=a;p.socket=null;r.pending=null;p.timer=setTimeout(()=>{if(!p.socket&&rooms.has(r.code)){r.g.result={winner:null,reason:'玩家断线超时，对局结束'};r.pending=null;broadcast(r);cleanup(r);}},GRACE);p.timer.unref();broadcast(r);cleanup(r);});
});
if(require.main===module){const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>{console.log(`本机访问：http://localhost:${port}`);for(const list of Object.values(os.networkInterfaces()))for(const n of list)if(n.family==='IPv4'&&!n.internal)console.log(`局域网访问：http://${n.address}:${port}`);console.log('双方请连接同一 Wi-Fi；按 Ctrl+C 停止服务。');});}
module.exports={server,io,rooms};




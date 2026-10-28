const $=id=>document.getElementById(id), socket=io();
let seat;try{seat=JSON.parse(localStorage.getItem('xiangqi-seat')||'null')}catch{seat=null}
let current=null, selected=null, busy=false;
const names={r:{K:'帅',A:'仕',E:'相',H:'傌',R:'俥',C:'炮',P:'兵'},b:{K:'将',A:'士',E:'象',H:'马',R:'车',C:'炮',P:'卒'}};
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(e.timer);e.timer=setTimeout(()=>e.classList.remove('show'),2800)}
function send(event,data={},cb){socket.emit(event,data,res=>{if(!res?.ok){toast(res?.error||'连接失败，请重试');return}cb?.(res)});}
function enter(res){seat={code:res.code,token:res.token};localStorage.setItem('xiangqi-seat',JSON.stringify(seat));history.replaceState(null,'',location.pathname+'?room='+res.code);current=res.state;render()}
$('back').onclick=()=>{if(current?.players.length===2&&!current.result&&!confirm('返回大厅将结束当前对局，确定离开吗？'))return;const finish=()=>{if(seat)sessionStorage.removeItem('xiangqi-color-'+seat.token);localStorage.removeItem('xiangqi-seat');seat=null;current=null;selected=null;seatColor=null;history.replaceState(null,'',location.pathname);$('room-input').value='';render()};if(socket.connected){socket.timeout(1500).emit('leave',{},(err,res)=>{if(err||!res?.ok){socket.disconnect();finish();socket.connect()}else finish()})}else finish()};
$('create').onclick=()=>send('create',{},enter);
$('join').onclick=()=>{const code=$('room-input').value.trim();if(!/^\d{6}$/.test(code))return toast('请输入 6 位房间号');send('join',{code},enter)};
$('room-input').value=new URLSearchParams(location.search).get('room')||'';
socket.on('connect',()=>{if(seat)send('restore',seat,enter)});
socket.on('state',s=>{current=s;selected=null;render()});
socket.on('disconnect',()=>{if(current){$('status').textContent='连接已断开';$('substatus').textContent='正在重新连接，请保持页面打开。'}});
socket.on('replaced',()=>{localStorage.removeItem('xiangqi-seat');seat=null;current=null;render();toast('此席位已在另一个页面打开')});
function myColor(){return current?.players.find(p=>p.color===seatColor)?.color}
let seatColor=null;
// The server sends private seat colour on join and restore; swap it when a new game starts.
function syncColor(){if(!current||!seat)return;const marker=sessionStorage.getItem('xiangqi-color-'+seat.token);if(marker)seatColor=marker;}
const oldEnter=enter;enter=function(res){seatColor=res.color;sessionStorage.setItem('xiangqi-color-'+res.token,res.color);oldEnter(res)};
// A restart swaps colours; infer the change from the server's private colour event.
socket.on('seat',data=>{seatColor=data.color;if(seat)sessionStorage.setItem('xiangqi-color-'+seat.token,data.color);render()});
function el(tag,attrs,parent){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.appendChild(e);return e}
function draw(){const svg=$('board');svg.replaceChildren();const flip=seatColor==='b';const X=x=>50+(flip?8-x:x)*87.5,Y=y=>50+(flip?9-y:y)*87.5;
 const lines=el('g',{stroke:'#765035','stroke-width':'2',fill:'none'},svg);
 for(let y=0;y<10;y++)el('line',{x1:50,y1:Y(y),x2:750,y2:Y(y)},lines);
 for(let x=0;x<9;x++){if(x===0||x===8)el('line',{x1:X(x),y1:50,x2:X(x),y2:837.5},lines);else{el('line',{x1:X(x),y1:50,x2:X(x),y2:Y(flip?5:4)},lines);el('line',{x1:X(x),y1:Y(flip?4:5),x2:X(x),y2:837.5},lines)}}
 for(const top of [0,7]){el('line',{x1:X(3),y1:Y(top),x2:X(5),y2:Y(top+2)},lines);el('line',{x1:X(5),y1:Y(top),x2:X(3),y2:Y(top+2)},lines)}
 for(const [x,t] of [[2,'楚 河'],[6,'汉 界']]){let txt=el('text',{x:X(x),y:455,'text-anchor':'middle','font-size':31,fill:'#80583a','letter-spacing':8},svg);txt.textContent=t}
 for(let y=0;y<10;y++)for(let x=0;x<9;x++){const p=current.board[y][x],cx=X(x),cy=Y(y);const g=el('g',{'data-x':x,'data-y':y,role:'button',tabindex:'0','aria-label':p?`${p[0]==='r'?'红':'黑'}${names[p[0]][p[1]]}，第 ${x+1} 列第 ${y+1} 行`:`空位，第 ${x+1} 列第 ${y+1} 行`},svg);if(p){el('circle',{cx:cx+2,cy:cy+4,r:35,fill:'#6f492c',opacity:'.25'},g);el('circle',{cx,cy,r:35,fill:'#f2d5a5',stroke:selected?.x===x&&selected?.y===y?'#b23b2d':'#9b6a42','stroke-width':selected?.x===x&&selected?.y===y?'5':'2'},g);el('circle',{cx,cy,r:28,fill:'none',stroke:'#b98a5c','stroke-width':'1.5'},g);let t=el('text',{x:cx,y:cy+13,'text-anchor':'middle','font-size':'38','font-weight':'bold',fill:p[0]==='r'?'#ae3c2d':'#302b24','pointer-events':'none'},g);t.textContent=names[p[0]][p[1]]}else el('circle',{cx,cy,r:35,fill:'transparent'},g);g.onclick=()=>choose(x,y);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(x,y)}};}
}
function choose(x,y){if(!current||!seatColor)return;const p=current.board[y][x];if(p?.[0]===seatColor){selected={x,y};draw();return}if(!selected)return;if(busy)return;busy=true;const from=selected;selected=null;draw();send('move',{id:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),fx:from.x,fy:from.y,tx:x,ty:y},()=>{});setTimeout(()=>busy=false,300)}
function render(){const active=!!current&&!!seat;$('lobby').hidden=active;$('game').hidden=!active;$('back').hidden=!active;if(!active)return;syncColor();$('room-title').textContent='房间 '+current.code;const me=seatColor==='r'?'红方':'黑方';const ready=current.players.length===2&&current.players.every(p=>p.connected);let status,sub;if(current.result){status=current.result.winner?(current.result.winner==='r'?'红方获胜':'黑方获胜'):'本局结束';sub=current.result.reason}else if(!ready){status='等待对手入座';sub=current.players.length<2?'把房间号分享给朋友，一起开始。':'玩家暂时离线，等待重新连接（最多 10 分钟）。'}else{status=current.turn==='r'?'红方行棋':'黑方行棋';sub=`你执${me} · ${current.turn===seatColor?'轮到你走棋':'等待对方走棋'}${current.check?' · 将军！':''}`}$('status').textContent=status;$('substatus').textContent=sub;
 for(const [c,id] of [['r','red-player'],['b','black-player']]){const p=current.players.find(v=>v.color===c);$(id).classList.toggle('online',!!p?.connected);$(id).querySelector('small').textContent=c===seatColor?'你':p?.connected?'对手':'等待中'}
 $('undo').disabled=!ready||!!current.result||!current.history.length||!!current.pending;$('resign').disabled=!ready||!!current.result;$('restart').hidden=!current.result;$('restart').disabled=!ready||!!current.pending;$('pending').hidden=!current.pending;if(current.pending){const mine=current.pending.from===seatColor;$('pending-text').textContent=mine?'等待对方回应'+(current.pending.kind==='undo'?'悔棋':'再来一局')+'请求':`对方请求${current.pending.kind==='undo'?'悔棋':'再来一局'}`;$('pending-actions').hidden=mine}
 $('move-count').textContent=current.history.length+' 步';$('history').replaceChildren();if(!current.history.length){const p=document.createElement('p');p.className='empty';p.textContent='棋局未动，静待落子。';$('history').append(p)}else current.history.forEach((h,i)=>{const p=document.createElement('p');p.textContent=`${String(i+1).padStart(2,'0')}　${h.piece[0]==='r'?'红':'黑'}${names[h.piece[0]][h.piece[1]]}　${h.fx+1},${h.fy+1} → ${h.tx+1},${h.ty+1}${h.captured?'　吃 '+names[h.captured[0]][h.captured[1]]:''}`;$('history').append(p)});draw()}
$('undo').onclick=()=>send('request',{kind:'undo'});$('restart').onclick=()=>send('request',{kind:'restart'});$('accept').onclick=()=>send('respond',{accept:true});$('decline').onclick=()=>send('respond',{accept:false});$('resign').onclick=()=>{if(confirm('确定认输吗？'))send('resign')};$('copy').onclick=async()=>{let origin=location.origin;if(['localhost','127.0.0.1','::1'].includes(location.hostname)){try{const network=await (await fetch('/api/network')).json();if(network.addresses.length)origin=location.protocol+'//'+network.addresses[0]+(location.port?':'+location.port:'')}catch{}}const url=origin+'/?room='+current.code;try{await navigator.clipboard.writeText(url);toast('邀请链接已复制')}catch{window.prompt('复制邀请链接发送给朋友',url)}};






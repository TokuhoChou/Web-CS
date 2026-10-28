const other = c => c === 'r' ? 'b' : 'r';
const initial = () => {
  const b = Array.from({length:10},()=>Array(9).fill(null));
  const back=['R','H','E','A','K','A','E','H','R'];
  for (const [c,y] of [['b',0],['r',9]]) { back.forEach((p,x)=>b[y][x]=c+p); const cy=c==='b'?2:7, py=c==='b'?3:6; for(const x of [1,7]) b[cy][x]=c+'C'; for(const x of [0,2,4,6,8]) b[py][x]=c+'P'; }
  return b;
};
const clone = b => b.map(row=>row.slice());
const inside = (x,y) => Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<9&&y>=0&&y<10;
const palace = (x,y,c) => x>=3&&x<=5&&(c==='r'?y>=7:y<=2);
function pseudo(b,fx,fy,tx,ty) {
  if(!inside(fx,fy)||!inside(tx,ty)||(fx===tx&&fy===ty)) return false;
  const p=b[fy][fx], target=b[ty][tx]; if(!p || target?.[0]===p[0]) return false;
  const [c,t]=p, dx=tx-fx,dy=ty-fy, ax=Math.abs(dx),ay=Math.abs(dy);
  if(t==='R'||t==='C'||t==='K') {
    if(dx===0||dy===0) { let n=0, sx=Math.sign(dx),sy=Math.sign(dy),x=fx+sx,y=fy+sy; while(x!==tx||y!==ty){if(b[y][x])n++;x+=sx;y+=sy;}
      if(t==='R') return n===0;
      if(t==='C') return target ? n===1 : n===0;
      if(t==='K'&&target?.[1]==='K'&&dx===0&&n===0) return true;
    }
    if(t!=='K') return false;
  }
  if(t==='K') return ax+ay===1&&palace(tx,ty,c);
  if(t==='A') return ax===1&&ay===1&&palace(tx,ty,c);
  if(t==='E') return ax===2&&ay===2&&!b[fy+dy/2][fx+dx/2]&&(c==='r'?ty>=5:ty<=4);
  if(t==='H') return ((ax===2&&ay===1&&!b[fy][fx+dx/2])||(ax===1&&ay===2&&!b[fy+dy/2][fx]));
  if(t==='P') return (dx===0&&dy===(c==='r'?-1:1)) || (ay===0&&ax===1&&(c==='r'?fy<=4:fy>=5));
  return false;
}
function checked(b,c){ let king; for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(b[y][x]===c+'K')king=[x,y]; if(!king)return true; for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(b[y][x]?.[0]===other(c)&&pseudo(b,x,y,...king))return true; return false; }
function legal(b,c,fx,fy,tx,ty){ if(!inside(fx,fy)||!inside(tx,ty)||b[fy][fx]?.[0]!==c||!pseudo(b,fx,fy,tx,ty))return false; const n=clone(b); n[ty][tx]=n[fy][fx]; n[fy][fx]=null; return !checked(n,c); }
function hasMove(b,c){for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(b[y][x]?.[0]===c)for(let yy=0;yy<10;yy++)for(let xx=0;xx<9;xx++)if(legal(b,c,x,y,xx,yy))return true;return false;}
const key=(b,turn)=>JSON.stringify([b,turn]);
function newGame(){const board=initial();return {board,turn:'r',history:[],positions:[key(board,'r')],result:null};}
function move(g,c,fx,fy,tx,ty){if(g.result||g.turn!==c||!legal(g.board,c,fx,fy,tx,ty))return false; const before=clone(g.board),piece=g.board[fy][fx],captured=g.board[ty][tx];g.board[ty][tx]=piece;g.board[fy][fx]=null;g.history.push({before,turn:c,fx,fy,tx,ty,piece,captured});g.turn=other(c);const k=key(g.board,g.turn);g.positions.push(k);if(!hasMove(g.board,g.turn))g.result={winner:c,reason:checked(g.board,g.turn)?'将死':'困毙'};else if(g.positions.filter(v=>v===k).length>=3)g.result={winner:null,reason:'相同局面三次重复'};return true;}
function undo(g){const h=g.history.pop();if(!h)return false;g.board=h.before;g.turn=h.turn;g.positions.pop();g.result=null;return true;}
module.exports={initial,clone,pseudo,legal,checked,hasMove,key,newGame,move,undo,other};

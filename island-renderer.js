import {BUILDINGS as B,canBuild} from './game-model.js';
export function createIslandRenderer(canvas,{island,selection,placement}){
let c=canvas.getContext('2d'),hits=[];
const N=12,W=64,H=32,OX=400,OY=120,HQ={x:4,y:4},HW=24;
const P=(x,y)=>[OX+(x-y)*W/2,OY+(x+y)*H/2];
const inv=(lx,ly)=>{const u=(lx-OX)/(W/2),v=(ly-OY)/(H/2);return[(u+v)/2,(v-u)/2]};
const tl=ms=>{const s=Math.max(1,Math.ceil(ms/1000));return s<60?s+'s':s<3600?Math.ceil(s/60)+'m':Math.floor(s/3600)+'h '+Math.ceil(s%3600/60)+'m'};
const free=(x,y)=>canBuild(island(),x,y);
function sh(h,f){const n=parseInt(h.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,m=f<0?0:255,k=Math.abs(f),q=v=>Math.round(v+(m-v)*k);return`rgb(${q(r)},${q(g)},${q(b)})`}
function poly(p,fill,st,lw=2){c.beginPath();p.forEach((v,i)=>c[i?'lineTo':'moveTo'](v[0],v[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(st){c.strokeStyle=st;c.lineWidth=lw;c.lineJoin='round';c.stroke()}}
const lp=(a,b,f)=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
function quad(a,b,f0,f1,z0,z1,col){const p=lp(a,b,f0),q=lp(a,b,f1);poly([[p[0],p[1]-z0],[q[0],q[1]-z0],[q[0],q[1]-z1],[p[0],p[1]-z1]],col)}
const shadow=(p,rx,ry)=>{c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(p[0]+6,p[1]+5,rx,ry,0,0,7);c.fill()};
const foot=(x,y,s=2)=>[P(x,y),P(x+s,y),P(x+s,y+s),P(x,y+s)];
const rnd=j=>{const s=Math.sin(j*127.1+311.7)*43758.5;return s-Math.floor(s)};

function tree(x,y){
  const p=P(x+.5,y+.5),s=.9+rnd(x*9+y)*.35;
  shadow([p[0],p[1]],14*s,6*s);c.fillStyle='#2a2118';c.fillRect(p[0]-2*s,p[1]-8*s,4*s,10*s);
  [['#1f3a2e',16,-8,26],['#274a39',13,-20,22],['#2f5844',9,-31,18]].forEach(([col,w,dy,h])=>poly([[p[0]-w*s,p[1]+dy*s],[p[0]+w*s,p[1]+dy*s],[p[0],p[1]+(dy-h)*s]],col));
}
function hall(t){
  const x=HQ.x,y=HQ.y,s=3,i=.08,h=46,A=P(x+i,y+i),Bp=P(x+s-i,y+i),C=P(x+s-i,y+s-i),D=P(x+i,y+s-i),u=(p,z=h)=>[p[0],p[1]-z],ct=P(x+1.5,y+1.5);
  shadow(ct,100,44);
  poly([D,C,u(C),u(D)],'#6b665a');poly([C,Bp,u(Bp),u(C)],'#8a8473');
  [.16,.68].forEach(f=>{quad(D,C,f,f+.16,22,38,'#4a3320');quad(D,C,f+.02,f+.14,24,36,'#f2c879')});
  quad(C,Bp,.34,.66,0,28,'#4a3320');quad(C,Bp,.38,.62,0,25,'#6b4423');
  quad(D,C,0,1,h-5,h,'#7a6238');quad(C,Bp,0,1,h-5,h,'#9a7d45');
  const e=.32,ap=[ct[0],ct[1]-h-54],D2=P(x-e,y+s+e),C2=P(x+s+e,y+s+e),B2=P(x+s+e,y-e);
  poly([u(D2),u(C2),ap],'#3e4a56','#222b33',2);poly([u(C2),u(B2),ap],'#53626f','#222b33',2);
  c.strokeStyle='#4a3320';c.lineWidth=3;c.beginPath();c.moveTo(ap[0],ap[1]);c.lineTo(ap[0],ap[1]-36);c.stroke();
  const w=Math.sin(t/170)*3;poly([[ap[0],ap[1]-36],[ap[0]+26,ap[1]-30+w],[ap[0],ap[1]-20]],'#c9a45c','rgba(0,0,0,.35)',1.5);
}
function worker(p,t,run){
  const s=run?Math.sin(t/110):0;
  c.fillStyle='#f4c27a';c.beginPath();c.arc(p[0],p[1]-17,5,0,7);c.fill();
  c.fillStyle='#d9822b';c.fillRect(p[0]-5,p[1]-12,10,12);c.fillStyle='#e8e2d4';c.fillRect(p[0]-6,p[1]-24,12,4);
  c.strokeStyle='#6b4423';c.lineWidth=3;c.beginPath();c.moveTo(p[0]+5,p[1]-8);c.lineTo(p[0]+5+10*Math.cos(s),p[1]-12-10*Math.abs(Math.sin(s)));c.stroke();
}
function bld(x,y,k,pr,t,run,ok){
  const tp=B[k],i=.1,h=ok?HW:HW*(.2+.8*pr),A=P(x+i,y+i),Bp=P(x+2-i,y+i),C=P(x+2-i,y+2-i),D=P(x+i,y+2-i),u=(p,z=h)=>[p[0],p[1]-z],ct=P(x+1,y+1);
  shadow(ct,66,28);
  poly([D,C,u(C),u(D)],sh(tp.w,-.25));poly([C,Bp,u(Bp),u(C)],sh(tp.w,-.05));
  if(ok){
    quad(D,C,.2,.4,8,19,'#f2c879');quad(D,C,.6,.8,8,19,'#f2c879');quad(C,Bp,.38,.62,0,17,'#3b2410');
    const ap=[ct[0],ct[1]-h-30];
    if(k==='observatory'){c.fillStyle=tp.r;c.beginPath();c.arc(ct[0],ct[1]-h,32,Math.PI,0);c.fill();c.strokeStyle='rgba(0,0,0,.3)';c.lineWidth=2;c.stroke()}
    else{poly([u(D),u(C),ap],tp.r,'rgba(0,0,0,.3)',1.5);poly([u(C),u(Bp),ap],sh(tp.r,.2),'rgba(0,0,0,.3)',1.5)}
    if(k==='mill'){c.strokeStyle='#f4efe4';c.lineWidth=4;for(let j=0;j<4;j++){const a=t/700+j*Math.PI/2;c.beginPath();c.moveTo(ap[0],ap[1]);c.lineTo(ap[0]+Math.cos(a)*34,ap[1]+Math.sin(a)*34);c.stroke()}}
    if(k==='lighthouse'){c.fillStyle=`rgba(255,240,150,${.55+.3*Math.sin(t/250)})`;c.beginPath();c.arc(ap[0],ap[1],10,0,7);c.fill()}
  }else{
    poly([u(A),u(Bp),u(C),u(D)],sh(tp.w,.2),'rgba(0,0,0,.25)');
    const top=HW+16;c.strokeStyle='#8a7556';c.lineWidth=3;
    [D,C,Bp].forEach(p=>{c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[1]-top);c.stroke()});
    [top*.5,top].forEach(z=>{c.beginPath();c.moveTo(D[0],D[1]-z);c.lineTo(C[0],C[1]-z);c.lineTo(Bp[0],Bp[1]-z);c.stroke()});
    worker(P(x+1.2,y+1.7),t,run);
  }
}
function chest(x,y){
  const g=c.createRadialGradient(x,y,2,x,y,34);g.addColorStop(0,'rgba(242,200,121,.45)');g.addColorStop(1,'rgba(242,200,121,0)');c.fillStyle=g;c.fillRect(x-40,y-40,80,80);
  c.fillStyle='#3b2c1f';c.fillRect(x-15,y-6,30,18);poly([[x-15,y-6],[x+15,y-6],[x+12,y-14],[x-12,y-14]],'#4d3a29');
  c.fillStyle='#c9a45c';c.fillRect(x-2,y-14,4,26);c.fillRect(x-15,y-2,30,2);
}
function drawB(b,t){
  const G=island(),sel=selection();
  const ct=P(b.x+1,b.y+1),Cc=P(b.x+2,b.y+2),run=!b.ok;
  if(sel===b)poly(foot(b.x,b.y),'rgba(255,255,255,.3)','#fff',3+Math.sin(t/150)*1.5);
  bld(b.x,b.y,b.t,b.p/b.d,t,run,b.ok);
  if(!b.ok){
    c.fillStyle='rgba(0,0,0,.55)';c.beginPath();c.roundRect(Cc[0]-34,Cc[1]+4,68,15,7);c.fill();
    c.fillStyle=run?'#c9a45c':'#6b7785';c.beginPath();c.roundRect(Cc[0]-32,Cc[1]+6,64*b.p/b.d,11,5);c.fill();
    c.fillStyle='#fff';c.font='600 10px Sora,sans-serif';c.fillText(run?tl(b.d-b.p):'Paused',Cc[0],Cc[1]+12);
  }else if(b.ch){const by=ct[1]-HW-62+Math.sin(t/300+b.x)*4;hits.push({b,x:ct[0],y:by});chest(ct[0],by)}
}

function draw(t){
  const G=island(),sel=selection(),{type:mode,ghost}=placement();
  c.clearRect(0,0,800,560);
  const g=c.createLinearGradient(0,0,0,560);g.addColorStop(0,G.theme==='coast'?'#204b5d':G.theme==='night'?'#151c38':'#12293a');g.addColorStop(1,G.theme==='coast'?'#0b2739':'#070e15');c.fillStyle=g;c.fillRect(0,0,800,560);
  c.strokeStyle='rgba(255,255,255,.06)';c.lineWidth=3;
  for(let k=0;k<7;k++){const x=(k*151+t/60)%900-50,y=36+k*76;c.beginPath();c.arc(x,y,16,Math.PI*1.1,Math.PI*1.9);c.stroke()}
  poly([P(-.5,-.5),P(N+.5,-.5),P(N+.5,N+.5),P(-.5,N+.5)],`rgba(160,190,210,${.07+.03*Math.sin(t/500)})`);
  const L=P(0,N),Bt=P(N,N),R=P(N,0),d=28;
  poly([L,Bt,[Bt[0],Bt[1]+d],[L[0],L[1]+d]],'#26241f');poly([R,Bt,[Bt[0],Bt[1]+d],[R[0],R[1]+d]],'#302d26');
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const pz=x>=HQ.x-1&&x<=HQ.x+3&&y>=HQ.y-1&&y<=HQ.y+3,a=(x+y)%2;
    poly([P(x,y),P(x+1,y),P(x+1,y+1),P(x,y+1)],pz?(a?'#8c8068':'#857a63'):(G.theme==='coast'?(a?'#7b8860':'#737f59'):G.theme==='night'?(a?'#354b56':'#30464f'):(a?'#40604d':'#3c5b49')));
  }
  if(mode)for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++)poly([P(x,y),P(x+1,y),P(x+1,y+1),P(x,y+1)],0,'rgba(255,255,255,.22)',1);
  c.textAlign='center';c.textBaseline='middle';
  const items=[{k:0,d:HQ.x+HQ.y+3}];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)if((x==0||y==0||x==N-1||y==N-1)&&(x*31+y*17)%5<3)items.push({k:1,x,y,d:x+y+1});
  G.b.forEach(b=>items.push({k:2,b,d:b.x+b.y+2}));
  (G.decorations||[]).forEach(decoration=>items.push({k:4,decoration,d:decoration.x+decoration.y+1}));
  if(mode&&ghost)items.push({k:3,d:ghost.x+ghost.y+2});
  items.sort((a,b)=>a.d-b.d);hits=[];
  for(const it of items){
    if(it.k==1)tree(it.x,it.y);else if(it.k==0){hall(t)}else if(it.k==2)drawB(it.b,t);else if(it.k==4)drawDecoration(it.decoration,t);
    else{const ok=free(ghost.x,ghost.y);c.globalAlpha=.8;bld(ghost.x,ghost.y,mode,1,t,0,1);c.globalAlpha=1;poly(foot(ghost.x,ghost.y),ok?'rgba(34,197,94,.45)':'rgba(239,68,68,.5)',ok?'#bbf7d0':'#fecaca',3)}
  }
  for(let k=0,n=Math.min(40,8+G.b.length*3);k<n;k++){const p=P(1+rnd(k*3)*(N-2),1+rnd(k*7+1)*(N-2)),a=.5+.5*Math.sin(t/400+k*2);c.fillStyle=`rgba(242,200,121,${a*.9})`;c.fillRect(p[0]-1.5,p[1]-12-8*a,3,3)}
}

function drawDecoration(d,t){
 const p=P(d.x+.5,d.y+.5);c.save();
 if(d.kind==='tree')tree(d.x,d.y);
 else if(d.kind==='lantern'){c.strokeStyle='#806b4a';c.lineWidth=3;c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[1]-25);c.stroke();const glow=c.createRadialGradient(p[0],p[1]-28,1,p[0],p[1]-28,24);glow.addColorStop(0,'rgba(255,219,136,.6)');glow.addColorStop(1,'rgba(255,219,136,0)');c.fillStyle=glow;c.fillRect(p[0]-24,p[1]-52,48,48);c.fillStyle='#f6cf80';c.fillRect(p[0]-4,p[1]-32,8,8)}
 else{for(let i=0;i<4;i++){const x=p[0]+(i%2)*8-4,y=p[1]-Math.floor(i/2)*6;c.fillStyle='#7baa73';c.fillRect(x,y-6,2,7);c.fillStyle=['#f3c1ab','#e8d5a3','#baa0d1','#d0e2bc'][i];c.beginPath();c.arc(x+1,y-7,3,0,7);c.fill()}}
 c.restore();
}
const local=e=>{const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*800/r.width,(e.clientY-r.top)*560/r.height]};
return {draw,free,spot(e){const[lx,ly]=local(e),[x,y]=inv(lx,ly+HW);return{x:Math.round(x-1),y:Math.round(y-1)}},tile(e){const[x,y]=inv(...local(e));return{x:Math.floor(x),y:Math.floor(y)}},hit(e){const[lx,ly]=local(e);for(const h of hits)if(Math.hypot(lx-h.x,ly-h.y)<28)return{building:h.b,chest:true};for(const b of [...island().b].sort((a,b)=>b.x+b.y-a.x-a.y)){const[x,y]=inv(lx,ly+HW/2+4);if(x>=b.x&&x<b.x+2&&y>=b.y&&y<b.y+2)return{building:b,chest:false}}return null},preview(cn,type){const old=c,o=P(1,1);c=cn.getContext('2d');c.textAlign='center';c.save();c.scale(.6,.6);c.translate(80-o[0],110-o[1]);bld(0,0,type,1,0,0,1);c.restore();c=old}};
}

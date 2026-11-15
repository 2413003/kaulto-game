import {BUILDINGS as B,THEMES,DECORATIONS,LESSONS,makeGame,hydrateGame,advanceGame,buildingCost,canBuild,addBuilding,collectBuilding,completeLesson,setGoal,goalProgress,decorate} from './game-model.js';
import {createIslandRenderer} from './island-renderer.js';

const $=selector=>document.querySelector(selector),dlg=$('#dlg'),cv=$('#cv');
const KEY='hf_island_v2',META='hf_island_notes_v2',PENDING='hf_payment_pending_v2',RECEIPT='hf_payment_receipt_v2',CONNECTION='hf_bank_connection_pending_v1';
const DAY=86400000,ST=[1,5,10,15,20,25,30,40,50,75,100,150,200,250,300,400,500,750,1000];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const gbp=pence=>'£'+(pence/100).toLocaleString('en-GB',{minimumFractionDigits:pence%100?2:0,maximumFractionDigits:2});
const fmt=value=>Number(value).toLocaleString('en-GB',{maximumFractionDigits:0});
const duration=ms=>ms<60000?Math.max(1,Math.ceil(ms/1000))+'s':ms<3600000?Math.ceil(ms/60000)+'m':Math.ceil(ms/3600000)+'h';
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const closeButton='<button class="x" data-a="close" aria-label="Close">×</button>';
const goldIcon='<i class="coin" aria-hidden="true"></i>';
const storedNotes=read(META,{});
let notes=storedNotes&&typeof storedNotes==='object'&&!Array.isArray(storedNotes)?storedNotes:{},saved=read(KEY),legacy=read('hf_guest');
let G=hydrateGame(saved||legacy,Date.now()),mode=null,ghost=null,sel=null,decorating=null,visiting=null;
let wallet=null,walletOnline=false,busy=false,apiBusy=false,started=!!saved||!!legacy,pending=read(PENDING);
let paymentReceipt=read(RECEIPT),bankAction=null,walletError={code:'BANKING_NOT_CONFIGURED',message:'Bank connection is being prepared. Your island is ready to play.'};
let pendingSurprises=[],lastWalletCheck=0,lastSave=Date.now(),walletQueue=Promise.resolve(),storageFailed=false;
const offline=advanceGame(G,Date.now());
if(!Array.isArray(notes.seenAwards))notes.seenAwards=[];
if(!Number.isFinite(notes.weekStarted)||notes.weekStarted<0)notes.weekStarted=Date.now();
if(!notes.weekBaseline||typeof notes.weekBaseline!=='object'||!Number.isSafeInteger(notes.weekBaseline.buildings)||!Number.isSafeInteger(notes.weekBaseline.lessons))notes.weekBaseline={buildings:G.b.filter(b=>b.ok).length,lessons:G.lessons.length};
if(pending&&(!['/api/deposit','/api/withdraw'].includes(pending.path)||!pending.bodyWithoutKey||!Number.isSafeInteger(pending.bodyWithoutKey.amountPence)||typeof pending.idempotencyKey!=='string')){pending=null;write(PENDING,null)}

const renderer=createIslandRenderer(cv,{island:()=>visiting||G,selection:()=>visiting?null:sel,placement:()=>({type:mode,ghost})});

function save(){
  const okay=write(KEY,G)&&write(META,notes);
  storageFailed=!okay;
  if(!okay)$('#service-note').textContent='Your browser could not save this island. Keep this tab open or export a postcard.';
}
function toast(message){const element=$('#toast');element.textContent=message;element.style.opacity=1;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.style.opacity=0,3500)}
function beep(frequency=650){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;try{const ac=beep.context??=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.045,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.18);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+.18)}catch{}}
function sparkle(text){toast(text);beep();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<12;i++){const dot=document.createElement('i');dot.className='star pa';dot.style.left=innerWidth/2+'px';dot.style.top=innerHeight*.45+'px';dot.style.setProperty('--x',(Math.random()*220-110)+'px');dot.style.setProperty('--y',(-40-Math.random()*170)+'px');dot.style.setProperty('--r',Math.random()*360+'deg');document.body.append(dot);setTimeout(()=>dot.remove(),1000)}}
function modal(title,content,{sheet=true,celebration=false}={}){
  dlg.className=sheet?'sheet':'';
  dlg.innerHTML=closeButton+`<div class="${celebration?'celebration':''}"><h2 id="dialog-title">${esc(title)}</h2>${content}</div>`;
  if(!dlg.open)dlg.showModal();
  dlg.scrollTop=0;
}
function localError(error){toast(error.message||'That action could not be completed.')}
function returnHome(){visiting=null;$('#visit-banner').hidden=true;update()}
function showGame(){started=true;$('#login').hidden=true;$('#game').hidden=false;$('#bot').hidden=false;update();save()}

function api(path,body){
  const request=walletQueue.then(async()=>{
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:'Your wallet returned an unreadable response.'}));
  if(!response.ok){const error=new Error(data.error||'Your wallet could not complete that action.');error.status=response.status;error.code=data.code;throw error}
  if(data.mode!=='live'||data.currency!=='GBP'||data.providerConfirmed!==true||typeof data.walletId!=='string'||!data.walletId||!Number.isSafeInteger(data.balancePence)||data.balancePence<0||!Number.isSafeInteger(data.rewardsPence)||data.rewardsPence<0)throw new Error('The wallet response could not be verified.');
    return data;
  });
  walletQueue=request.catch(()=>{});
  return request;
}
function acceptWallet(data){
  wallet=data;walletOnline=true;
  walletError=null;
  if(notes.walletId!==data.walletId){
    notes.walletId=data.walletId;notes.seenAwards=[];notes.weekBaseline.cashAwardedPence=data.totalAwardedPence||0;notes.celebratedGoal=null;pendingSurprises=[];
    if(paymentReceipt?.walletId!==data.walletId){paymentReceipt=null;write(RECEIPT,null)}
  }
  if(!Number.isSafeInteger(notes.weekBaseline.cashAwardedPence)){
    const recent=(data.awarded||[]).filter(item=>item.createdAt>=notes.weekStarted).reduce((sum,item)=>sum+item.amountPence,0);
    notes.weekBaseline.cashAwardedPence=Math.max(0,(data.totalAwardedPence||0)-recent);
  }
  const awards=[...(data.awarded||[])].reverse();
  for(const award of awards){if(!notes.seenAwards.includes(award.id)&&Number.isSafeInteger(award.amountPence)&&award.amountPence>0&&!pendingSurprises.some(item=>item.id===award.id))pendingSurprises.push(award)}
  save();update();
}
async function refreshWallet(check=false){
  if(apiBusy)return;
  apiBusy=true;
  try{
    acceptWallet(await api(check?'/api/rewards/check':'/api/wallet',check?{}:undefined));lastWalletCheck=Date.now();
    if(paymentReceipt&&['pending','requires_action'].includes(paymentReceipt.status)){
      const data=await api('/api/payments/'+encodeURIComponent(paymentReceipt.id));acceptWallet(data);
      if(data.payment){paymentReceipt={...data.payment,walletId:data.walletId};write(RECEIPT,paymentReceipt)}
    }
  }
  catch(error){walletOnline=false;walletError={code:error.code||'CONNECTION_UNAVAILABLE',message:error.status?error.message:'Your wallet is temporarily unavailable. Your island is ready to play.'};update()}
  finally{apiBusy=false}
}
async function mutateWallet(path,body){
  if(busy)return false;
  if(!walletOnline){toast('Your wallet is unavailable. Your island is still ready to play.');return false}
  if(pending&&pending.walletId!==wallet.walletId){toast('This pending payment belongs to another account. Sign in to that account to check it.');return false}
  if(pending&&(pending.path!==path||JSON.stringify(pending.bodyWithoutKey)!==JSON.stringify(body))){openWallet();toast('Finish the pending wallet action before starting another.');return false}
  busy=true;
  const operation=pending||{path,bodyWithoutKey:body,idempotencyKey:crypto.randomUUID(),walletId:wallet.walletId};
  pending=operation;
  if(!write(PENDING,pending)){pending=null;busy=false;toast('Your browser could not save the transaction reference. Allow local storage before using your wallet.');return false}
  dlg.querySelectorAll('[data-a="go"],[data-a="wgo"],[data-a="retry-wallet"]').forEach(button=>button.disabled=true);
  try{
    const data=await api(path,{...body,idempotencyKey:operation.idempotencyKey});
    if(!data.payment||typeof data.payment.id!=='string'||!['pending','requires_action','completed','failed'].includes(data.payment.status))throw new Error('The payment confirmation could not be verified.');
    pending=null;write(PENDING,null);acceptWallet(data);
    if(data.payment){paymentReceipt={...data.payment,walletId:data.walletId};write(RECEIPT,paymentReceipt)}
    return data;
  }catch(error){
    if(error.status&&error.status<500){pending=null;write(PENDING,null)}
    else{walletOnline=false;walletError={code:error.code||'PAYMENT_UNCONFIRMED',message:'Your payment result needs confirmation. Reconnect from your wallet to check it.'}}
    toast(error.status?error.message:'The wallet result is unconfirmed. Reconnect and retry the same action safely.');
    update();return false;
  }finally{busy=false;dlg.querySelectorAll('[data-a="retry-wallet"]').forEach(button=>button.disabled=false);if($('#cu'))syncDeposit();if($('#wu'))syncWithdrawal()}
}
async function retryWallet(){
  if(!pending)return;
  await refreshWallet();
  const operation=pending;
  const data=await mutateWallet(operation.path,operation.bodyWithoutKey);
  if(data){if(data.payment?.status==='completed'){dlg.close();toast('Your payment is confirmed.');maybeCelebrate()}else openPaymentStatus(data.payment)}
}

function openOnboarding(){
  modal('Your own little corner',`<p>Give your island a name. Your first cabin is free, and your island keeps growing at your pace.</p><form data-form="onboarding"><label class="field"><span>Island name</span><input id="new-name" maxlength="48" value="${esc(G.islandName==='My island'?'':G.islandName)}" placeholder="e.g. Willow Bay" autocomplete="off"></label><button class="b g cta" type="submit">Build my first cabin</button></form><p class="sub">No deposit or bank details needed.</p>`);
  $('#new-name').focus();
}
function startBuilding(type){
  returnHome();dlg.close();decorating=null;sel=null;mode=type;ghost=null;
  for(let y=7;y<=9&&!ghost;y++)for(let x=1;x<=9;x++)if(canBuild(G,x,y)){ghost={x,y};break}
  if(!ghost)for(let y=1;y<=9&&!ghost;y++)for(let x=1;x<=9;x++)if(canBuild(G,x,y)){ghost={x,y};break}
  if(!ghost){mode=null;toast('Your island is full. Try a decoration in a smaller space.')}update();
}
function placeBuilding(){
  if(!mode||!ghost)return;
  try{const building=addBuilding(G,mode,ghost.x,ghost.y);mode=null;ghost=null;sel=building;save();update();sparkle(building.starter?'Your first cabin is taking shape.':'Construction started.')}catch(error){localError(error)}
}
function cancelPlacement(){mode=null;ghost=null;decorating=null;update()}
function collectSelected(){
  if(!sel||visiting)return;
  const result=collectBuilding(G,G.b.indexOf(sel));
  if(!result)return;
  save();update();sparkle('+'+fmt(result.gold)+' game gold');
  modal(B[sel.t].n+' complete',`<div class="gift" aria-hidden="true">✧</div><p>A new piece of your island, all yours.</p><div class="reward-amount" style="font-size:42px">${goldIcon} +${fmt(result.gold)}</div><p class="sub">Game gold · for building and decorating</p><div class="stack"><button class="b g" data-a="${sel.starter&&!G.goal?'goal':'shop'}">${sel.starter&&!G.goal?'Choose a savings goal':'Choose what to build next'}</button><button class="b" data-a="close">Enjoy my island</button></div>`);
}

function openShop(){
  if(visiting)returnHome();
  modal('Make it yours',`<p class="sub">Build with game gold. Your island makes gold over time, even with £0 saved.</p>${Object.entries(B).map(([type,item])=>{const price=buildingCost(G,type);return `<div class="opt"><canvas width="96" height="80" data-preview="${type}" aria-hidden="true"></canvas><div class="copy"><b>${item.n}</b><small>${price===0?'Your free starter · 15s':duration(item.s*1000)+' to build'}</small></div><button class="b ${price===0?'g':''}" data-a="pick" data-type="${type}" ${G.coins<price?'disabled':''}>${price===0?'Free':goldIcon+' '+fmt(price)}</button></div>`}).join('')}<p class="sub">1 game gold per minute · up to 7 days of progress between visits.</p>`);
  dlg.querySelectorAll('[data-preview]').forEach(canvas=>renderer.preview(canvas,canvas.dataset.preview));
}
function openGoal(){
  const goal=G.goal,progress=goalProgress(G,wallet?.balancePence||0),remaining=goal?Math.max(0,goal.targetPence-(wallet?.balancePence||0)):0;
  modal(goal?'Your next chapter':'Make room for a goal',`${goal?`<div class="card"><b>${esc(goal.name)}</b><p>${walletOnline?gbp(progress.savedPence)+' of '+gbp(goal.targetPence)+' in savings':'Reconnect your wallet to see current savings.'}</p>${goal.weeklyPence&&remaining?`<p class="sub">At your planned ${gbp(goal.weeklyPence)} a week, approximately ${Math.ceil(remaining/goal.weeklyPence)} weeks to go. This estimate excludes rewards.</p>`:''}</div>`:'<p>Choose something that matters to you, and an amount that leaves room for everyday life.</p>'}<form data-form="goal"><label class="field"><span>What are you saving for?</span><input id="goal-title" maxlength="48" value="${esc(goal?.name||'') }" placeholder="e.g. A little breathing room" required></label><label class="field"><span>Target (£)</span><input id="goal-target" type="number" min="1" max="10000000" step="0.01" inputmode="decimal" value="${goal?goal.targetPence/100:100}" required></label><label class="field"><span>Weekly plan (£, optional)</span><input id="goal-weekly" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" value="${goal?goal.weeklyPence/100:0}"></label><p class="sub">This is your personal plan. It does not move money or set up a transfer. Change or pause it whenever you like.</p><p class="err" id="form-error" role="alert"></p><button class="b g cta" type="submit">${goal?'Save my plan':'Set my goal'}</button></form>${goal?'<div class="row"><button class="link" data-a="pause-plan">Pause weekly plan</button><button class="link" data-a="clear-goal">Put this goal aside</button></div>':''}`);
}
function openLearn(){
  modal('Small lessons, useful ideas',`<p>Take a moment to explore money at your own pace. Each completed lesson adds something to your island.</p>${LESSONS.map(lesson=>`<button class="choice" data-a="lesson" data-id="${lesson.id}"><b>${esc(lesson.title)}</b><p class="sub">${G.lessons.includes(lesson.id)?'Completed · revisit anytime':'+ '+lesson.gold+' game gold'+(lesson.unlock?' · a new decoration':'')}</p></button>`).join('')}`);
}
function openLesson(id){
  const lesson=LESSONS.find(item=>item.id===id);if(!lesson)return;
  modal(lesson.title,`<p>${esc(lesson.prompt)}</p>${lesson.answers.map((answer,index)=>`<button class="choice" data-a="answer" data-id="${id}" data-answer="${index}">${esc(answer)}</button>`).join('')}<p class="err" id="lesson-feedback" role="status"></p>`);
}
function answerLesson(id,index){
  const lesson=LESSONS.find(item=>item.id===id);if(!lesson)return;
  if(index!==lesson.correct){$('#lesson-feedback').textContent='Have another think. There is no rush, and nothing to lose.';return}
  const result=completeLesson(G,id);save();update();
  modal('A useful little idea',`<p>${esc(lesson.explanation)}</p>${result?`<div class="card"><b>${goldIcon} +${result.gold} game gold</b>${result.unlock?`<p>${esc(DECORATIONS[result.unlock].name)} added to your decoration collection.</p>`:''}</div>`:'<p class="sub">You have already collected this lesson’s game gold.</p>'}<div class="stack"><button class="b g" data-a="design">Make something with it</button><button class="b" data-a="learn">Explore another idea</button></div>`);
}
function openDesign(){
  modal('Your island, your way',`<p class="sub">Choose a mood, then add a few finishing touches.</p><div class="theme-options">${Object.entries(THEMES).map(([id,theme])=>`<button class="theme-option" data-a="theme" data-id="${id}" aria-pressed="${G.theme===id}"><div class="theme-swatch ${id}" aria-hidden="true"></div>${esc(theme.name)}</button>`).join('')}</div>${Object.entries(DECORATIONS).map(([kind,item])=>{const locked=item.lesson&&!G.lessons.includes(item.lesson);return `<div class="opt"><div class="copy"><b>${esc(item.name)}</b><small>${locked?'Discover it in Learn':'Place on a clear tile'}</small></div><button class="b" data-a="${locked?'learn':'decorate'}" data-kind="${kind}" ${!locked&&G.coins<item.cost?'disabled':''}>${locked?'Explore':goldIcon+' '+item.cost}</button></div>`}).join('')}<p class="sub">Your buildings and decorations stay yours when you withdraw.</p>`);
}
function startDecoration(kind){returnHome();mode=null;ghost=null;sel=null;decorating=kind;dlg.close();update()}
function openProfile(){modal('A name to come home to',`<form data-form="profile"><label class="field"><span>Island name</span><input id="profile-name" maxlength="48" value="${esc(G.islandName)}" required></label><button class="b g cta" type="submit">Save name</button></form>`)}

function fit(input){input.style.width=Math.min(9,String(input.value).length+.5)+'ch'}
function syncDeposit(move=true){
  const input=$('#cu');if(!input)return;const amount=Number(input.value),okay=input.value.trim()!==''&&Number.isFinite(amount)&&amount>=1&&amount<=10000&&Math.abs(amount*100-Math.round(amount*100))<1e-6;fit(input);
  const slider=$('#sl');if(okay&&move)slider.value=ST.reduce((best,value,index)=>Math.abs(value-amount)<Math.abs(ST[best]-amount)?index:best,0);
  slider.style.setProperty('--p',slider.value/(ST.length-1)*100+'%');$('#go').disabled=!okay||!walletOnline||busy||!!pending;
  $('#amount-error').textContent=!input.value?'':okay?'':amount<1?'Enter at least £1.':amount>10000?'The limit is £10,000 per deposit.':'Use no more than two decimal places.';
}
function openDeposit(){
  if(visiting)returnHome();
  modal('Deposit',`<div class="sup">Savings</div><div class="ap"><span>£</span><input id="cu" type="number" min="1" max="10000" step="0.01" inputmode="decimal" value="10" aria-label="Deposit amount"></div><input id="sl" class="sl" type="range" min="0" max="${ST.length-1}" step="1" value="2" aria-label="Choose a deposit amount"><div class="se"><span>£1</span><span>£1,000</span></div><p class="err" id="amount-error" role="status"></p><button class="b g cta" id="go" data-a="go">Deposit</button><p class="sub">Your balance updates after your deposit is confirmed.</p>${!walletOnline?'<p class="err">'+esc(walletError?.message||'Connect your account to make a deposit.')+'</p>':''}${pending?'<p class="err">A previous wallet action needs confirmation. Open your wallet to retry it.</p>':''}`);syncDeposit();
}
async function deposit(){
  const input=$('#cu');if(!input||$('#go').disabled)return;
  const data=await mutateWallet('/api/deposit',{amountPence:Math.round(Number(input.value)*100)});
  if(!data)return;
  if(data.payment.status!=='completed'){openPaymentStatus(data.payment,'deposit');return}
  dlg.close();toast('Your deposit is confirmed.');maybeCelebrate();
}
function syncWithdrawal(){
  const input=$('#wu');if(!input)return;fit(input);const amount=Number(input.value),available=input.dataset.source==='rewards'?(wallet?.rewardsPence||0):(wallet?.balancePence||0);$('#withdraw-go').disabled=busy||!!pending||!walletOnline||input.value.trim()===''||!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>available||Math.abs(amount*100-Math.round(amount*100))>1e-6;
}
function openWithdrawal(source='savings'){
  const amount=source==='rewards'?(wallet?.rewardsPence||0):(wallet?.balancePence||0);
  modal(source==='rewards'?'Your awarded rewards':'Withdraw',`<p class="sup">${source==='rewards'?'Cash rewards':'Savings'}</p><div class="ap"><span>£</span><input id="wu" data-source="${source}" type="number" min="0.01" max="${amount/100}" step="0.01" inputmode="decimal" value="${amount/100}" aria-label="Withdrawal amount"></div><p class="sub">Available ${gbp(amount)}. Your island and everything you have built stay yours.</p><button class="b g cta" id="withdraw-go" data-a="wgo">Withdraw</button><p class="sub">Your withdrawal is confirmed by your banking provider.</p>`);syncWithdrawal();
}
async function withdraw(){
  if($('#withdraw-go').disabled)return;const input=$('#wu'),source=input.dataset.source,amountPence=Math.round(Number(input.value)*100),goalWasComplete=source==='savings'&&goalProgress(G,wallet.balancePence)?.complete;
  const data=await mutateWallet('/api/withdraw',{amountPence,source});
  if(!data)return;
  if(data.payment.status!=='completed'){openPaymentStatus(data.payment,'withdrawal');return}
  notes.withdrawals=(notes.withdrawals||0)+1;save();
  modal(goalWasComplete?'A goal, brought to life':'Made room for real life',`<div class="sigil" aria-hidden="true">✧</div><div class="reward-amount" style="font-size:46px">${gbp(amountPence)}</div><p>Your withdrawal is confirmed. Your island keeps growing, and everything you have built is still yours.</p><div class="stack"><button class="b g" data-a="close">Back to my island</button>${goalWasComplete?'<button class="b" data-a="goal">Choose my next goal</button>':''}</div>`,{celebration:true});
}
function openPaymentStatus(receipt=paymentReceipt,kind){
  if(!receipt){toast('No payment confirmation is available yet.');return}
  bankAction=null;
  const action=kind||receipt.kind||'payment',label=action==='withdrawal'?'Withdrawal':action==='deposit'?'Deposit':action==='connection'?'Account connection':'Payment';
  let title=label+' in progress',message='We are waiting for your banking provider to confirm this payment. Your displayed balance includes confirmed funds only.';
  if(receipt.status==='requires_action'){title='Continue with your bank';message='Your bank needs your approval before this payment can continue.'}
  else if(receipt.status==='failed'){title=label+' could not be completed';message='Your banking provider did not confirm this payment. Check your wallet before trying again.'}
  else if(receipt.status==='completed'){title=label+' confirmed';message='Your banking provider has confirmed this payment. Your wallet shows the latest confirmed balance.'}
  modal(title,`<p>${message}</p>${receipt.status==='requires_action'&&receipt.action?.type==='redirect'?'<button class="b g full cta" data-a="bank-auth">Continue with your bank</button>':''}<div class="stack"><button class="b" data-a="check-payment">Check payment status</button><button class="b" data-a="wallet">Back to wallet</button></div>`);
}
async function connectBank(){
  if(busy)return;
  const previous=read(CONNECTION),reference=typeof previous?.idempotencyKey==='string'?previous:{idempotencyKey:crypto.randomUUID()};
  if(!write(CONNECTION,reference)){toast('Your browser could not save the connection reference. Allow local storage to continue.');return}
  busy=true;
  try{
    const data=await api('/api/payout/connect',reference);acceptWallet(data);
    if(!data.payment||data.payment.kind!=='connection')throw new Error('The account connection could not be verified.');
    if(data.payment.status==='completed'){write(CONNECTION,null);openWallet()}
    else if(data.payment.status==='requires_action'&&data.payment.action?.type==='redirect'){bankAction=data.payment.action;modal('Connect your account','<p>Continue securely with your banking provider to connect your account.</p><button class="b g full cta" data-a="bank-auth">Continue with your bank</button>')}
    else openPaymentStatus(data.payment,'connection');
  }
  catch(error){if(error.status&&error.status<500)write(CONNECTION,null);toast(error.message)}
  finally{busy=false}
}
function continueWithBank(){
  const action=bankAction||paymentReceipt?.action;if(action?.type!=='redirect')return;
  const url=new URL(action.url);if(url.protocol!=='https:'||url.username||url.password){toast('The bank approval link could not be verified.');return}
  location.assign(url.href);
}
function openWallet(){
  modal('Your wallet',`<p class="sub">Your savings and awarded cash rewards. Game gold is separate and cannot be withdrawn.</p><div class="summary-grid"><div class="card"><small>Savings</small><strong>${walletOnline?gbp(wallet.balancePence):'Unavailable'}</strong></div><div class="card"><small>Already awarded</small><strong>${walletOnline?gbp(wallet.rewardsPence):'Unavailable'}</strong></div></div>${pending?'<div class="card"><b>One action needs confirmation</b><p>Retrying uses the same request reference, so it will not be applied twice.</p><button class="b full" data-a="retry-wallet">Reconnect and retry</button></div>':''}<div class="stack"><button class="b g" data-a="dep">Deposit</button><button class="b" data-a="withdraw-savings" ${!walletOnline||!wallet?.balancePence?'disabled':''}>Withdraw savings</button><button class="b" data-a="withdraw-rewards" ${!walletOnline||!wallet?.rewardsPence?'disabled':''}>Withdraw awarded rewards</button></div>${paymentReceipt?'<button class="b full cta" data-a="payment-status">View latest payment</button>':''}<div class="row"><button class="link" data-a="bank">Bank connection</button><button class="link" data-a="reconnect">Reconnect</button></div><div class="card"><p>Any cash gifts are discretionary and may vary or stop. There is no promised return or future reward. Amounts shown as awarded are already credited to this wallet.</p></div><h3 style="margin-top:22px">Recent activity</h3>${(wallet?.transactions||[]).slice(0,10).map(item=>`<div class="receipt"><div>${item.type==='deposit'?'Added to savings':item.type==='reward'?'A gift from Holdfast':'Withdrawal'}<small>${new Date(item.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · ${item.source==='rewards'?'Rewards':'Savings'}</small></div><b>${item.type==='withdrawal'?'−':'+'}${gbp(item.amountPence)}</b></div>`).join('')||'<p class="sub">Your wallet activity will appear here.</p>'}`);
}
function openBank(){modal('Your bank connection',`<p>Use your bank connection to add to savings, withdraw money and receive cash rewards.</p><div class="card"><b>Connection pending</b><p>The existing banking partner has not been connected to this app yet. Payments will become available once the connection is complete.</p></div><button class="b g full cta" data-a="bank-connect">Connect bank account</button><button class="b full cta" data-a="wallet">Back to wallet</button>`)}
function openMenu(){modal('A little space for everything',`<div class="menu-list"><button class="b" data-a="wallet">Your wallet <span class="sp"></span>${walletOnline?gbp(wallet.rewardsPence)+' awarded':''}</button><button class="b" data-a="goal">Your savings goal & weekly plan</button><button class="b" data-a="recap">Your island journal</button><button class="b" data-a="learn">Learn something useful</button><button class="b" data-a="design">Themes & decorations</button><button class="b" data-a="postcards">Share & visit islands</button><button class="b" data-a="bank">Bank connection</button></div><p class="sub">Your weekly savings plan is a personal target. Transfers need your separate authorisation.</p>`)}

function maybeCelebrate(){
  if(!started||dlg.open||mode||decorating||visiting)return;
  if(walletOnline&&pendingSurprises.length){
    const awards=pendingSurprises.splice(0),amount=awards.reduce((sum,item)=>sum+item.amountPence,0);
    notes.seenAwards=[...new Set([...notes.seenAwards,...awards.map(item=>item.id)])].slice(-500);save();
    modal('A little something for you',`<div class="eyebrow">A gift from Holdfast</div><div class="reward-amount">${gbp(amount)}</div><p>Added to your cash rewards. Already yours.</p><p class="sub">A little thank-you, with no extra deposit needed. Your future gifts may vary or stop.</p><div class="stack"><button class="b g" data-a="wallet">View my rewards</button><button class="b" data-a="close">Enjoy my island</button></div>`,{celebration:true});beep(800);return;
  }
  const progress=walletOnline?goalProgress(G,wallet?.balancePence||0):null;
  const goalKey=G.goal?G.goal.name+':'+G.goal.targetPence:null;
  if(progress?.complete&&notes.celebratedGoal!==goalKey){notes.celebratedGoal=goalKey;save();modal('Look how far you have come',`<div class="sigil" aria-hidden="true">✧</div><p>You have reached <b>${esc(progress.name)}</b> in your savings. Take a moment to enjoy it.</p><div class="stack"><button class="b g" data-a="withdraw-savings">Use my savings</button><button class="b" data-a="goal">Choose what comes next</button></div>`,{celebration:true})}
  else if(Date.now()-Math.max(notes.weekStarted,notes.journalSeen||0)>=7*DAY)openRecap();
}
function openRecap(){
  const since=notes.weekStarted,buildings=Math.max(0,G.b.filter(b=>b.ok).length-notes.weekBaseline.buildings),lessons=Math.max(0,G.lessons.length-notes.weekBaseline.lessons),awarded=Math.max(0,(wallet?.totalAwardedPence||0)-(notes.weekBaseline.cashAwardedPence||0));
  modal('A page in your island journal',`<p>Since ${new Date(since).toLocaleDateString('en-GB',{day:'numeric',month:'long'})}, you have made this corner a little more yours.</p><div class="summary-grid"><div class="card"><small>Buildings completed</small><strong>${buildings}</strong></div><div class="card"><small>Ideas explored</small><strong>${lessons}</strong></div></div><div class="card"><b>${walletOnline?gbp(awarded):'Wallet unavailable'}</b><p>Cash rewards already awarded in this journal period. Game gold and future gifts are not included.</p></div><p class="sub">No daily streak to protect. Your island will be here when you are.</p><button class="b full cta" data-a="new-journal">Start a new journal page</button>`);
  notes.journalSeen=Date.now();save();
}
function openPostcards(){
  modal('A little island postcard',`<p>Share your creation, or open a friend’s island for a look around.</p><div class="card"><b>Your island, with the money left out</b><p>A postcard contains the island name, buildings, decorations and theme. Savings, goals, wallet activity and personal plans are not included.</p></div><button class="b g full cta" data-a="export">Save my island postcard</button><label class="field"><span>Visit a friend’s postcard (.json)</span><input id="postcard-file" type="file" accept=".json,application/json"></label><p class="err" id="postcard-error" role="alert"></p><p class="sub">Visits are read-only. Opening a postcard never replaces your island.</p>`);
}
function exportPostcard(){
  const postcard={format:'holdfast-postcard',version:1,island:{islandName:G.islandName,theme:G.theme,b:G.b.map(({t,x,y,p,d,ok})=>({t,x,y,p,d,ok,ch:0,rewardClaimed:true})),decorations:G.decorations.map(({kind,x,y})=>({kind,x,y}))}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(postcard,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='holdfast-island-postcard.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Your postcard is ready to share.');
}
async function importPostcard(file){
  if(!file)return;
  try{
    if(file.size>100000)throw new Error('Choose a Holdfast postcard smaller than 100 KB.');
    const data=JSON.parse(await file.text());if(data.format!=='holdfast-postcard'||data.version!==1||!data.island||!Array.isArray(data.island.b)||!Array.isArray(data.island.decorations))throw new Error('This is not a Holdfast island postcard.');
    // Only cosmetic fields can enter the visitor renderer. Imported data never touches the wallet or home island.
    visiting=hydrateGame({islandName:data.island.islandName,theme:data.island.theme,b:data.island.b,decorations:data.island.decorations},Date.now());
    mode=null;decorating=null;sel=null;dlg.close();$('#visit-banner').hidden=false;$('#visit-name').textContent='Visiting '+visiting.islandName+' · read-only';update();
  }catch(error){$('#postcard-error').textContent=error.message||'That postcard could not be opened.'}
}

function update(){
  $('#sv').textContent=walletOnline?gbp(wallet.balancePence).slice(1):'—';$('#coins').textContent=fmt(G.coins);$('#island-name').textContent=visiting?.islandName||G.islandName;
  $('#island-caption').textContent=visiting?'A little window into someone else’s world.':G.b.length?'A little more yours, every day.':'A clear space. A new beginning.';
  $('#cancel').hidden=!(mode||decorating);document.querySelectorAll('.balance-action').forEach(button=>button.hidden=!!(mode||decorating));
  const progress=walletOnline?goalProgress(G,wallet.balancePence):null;
  $('#goal-name').textContent=G.goal?.name||'What are you making room for?';$('#goal-copy').textContent=G.goal?(walletOnline?gbp(progress.savedPence)+' of '+gbp(progress.targetPence)+' in savings':'Reconnect to see your savings'):'Choose a savings goal, at your own pace.';
  $('#goal-number').textContent=progress?(progress.complete?'You made it ✧':Math.round(progress.ratio*100)+'%'):'Set a goal ↗';$('#goal-progress').hidden=!progress;$('#goal-fill').style.width=(progress?progress.ratio*100:0)+'%';
  const message=visiting?'You are visiting a read-only island. Your own island is safe at home.':mode?'Choose a clear space. '+(matchMedia('(pointer:fine)').matches?'Click to build · Esc to cancel':'Tap a spot, then tap again to build'):decorating?'Tap a clear tile to place your '+DECORATIONS[decorating].name.toLowerCase()+'.':!G.b.length?'Your first cabin is free. Open the Shop to choose its spot.':G.b.some(building=>building.ch)?'Something you built is ready. Tap its little chest.':!G.goal?'What would you like to make room for? Choose your first savings goal.':'';
  $('#msg').textContent=message;$('#msg').hidden=!message;
  $('#sel').hidden=!sel||!!mode||!!decorating||!!visiting;
  if(sel&&!visiting){$('#sn').textContent=B[sel.t].n;$('#si').textContent=sel.ok?(sel.ch?'Complete · game gold ready':'A permanent part of your island'):'Taking shape · '+duration(sel.d-sel.p)+' left';$('#su').hidden=!sel.ch;$('#su').textContent='Collect game gold'}
  $('#service-note').textContent=storageFailed?'Your browser could not save this island. Keep this tab open or export a postcard.':walletOnline?'Wallet connected · savings and cash rewards stay separate from game gold.':walletError.message;
  if($('#cu'))syncDeposit(false);if($('#wu'))syncWithdrawal();
}

cv.addEventListener('pointermove',event=>{if(mode&&event.pointerType==='mouse'){ghost=renderer.spot(event)}});
cv.addEventListener('contextmenu',event=>{event.preventDefault();cancelPlacement()});
cv.addEventListener('pointerdown',event=>{
  if(event.button===2||visiting)return;
  if(decorating){try{const tile=renderer.tile(event);decorate(G,decorating,tile.x,tile.y);decorating=null;save();update();sparkle('A little finishing touch.')}catch(error){localError(error)}return}
  if(mode){const spot=renderer.spot(event);if(event.pointerType==='mouse'){ghost=spot;placeBuilding()}else if(ghost&&spot.x===ghost.x&&spot.y===ghost.y)placeBuilding();else{ghost=spot;update()}return}
  const hit=renderer.hit(event);sel=hit?.building||null;if(hit?.chest)collectSelected();update();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')cancelPlacement()});
document.addEventListener('input',event=>{if(event.target.id==='cu')syncDeposit();else if(event.target.id==='sl'){$('#cu').value=ST[event.target.value];syncDeposit(false)}else if(event.target.id==='wu')syncWithdrawal()});
document.addEventListener('change',event=>{if(event.target.id==='postcard-file')importPostcard(event.target.files[0])});
document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();
  try{
    if(form.dataset.form==='onboarding'){G.islandName=$('#new-name').value.trim().slice(0,48)||'My island';showGame();startBuilding('cabin')}
    else if(form.dataset.form==='profile'){G.islandName=$('#profile-name').value.trim().slice(0,48)||'My island';save();update();dlg.close()}
    else if(form.dataset.form==='goal'){
      const target=Number($('#goal-target').value),weekly=Number($('#goal-weekly').value||0);
      if(!Number.isFinite(target)||!Number.isFinite(weekly)||Math.abs(target*100-Math.round(target*100))>1e-6||Math.abs(weekly*100-Math.round(weekly*100))>1e-6)throw new Error('Use pounds and pence, with no more than two decimal places.');
      setGoal(G,{name:$('#goal-title').value,targetPence:Math.round(target*100),weeklyPence:Math.round(weekly*100)});save();update();dlg.close();toast('Your plan, at your own pace.');maybeCelebrate();
    }
  }catch(error){if($('#form-error'))$('#form-error').textContent=error.message;else localError(error)}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-a]');if(!button||button.disabled)return;
  const action=button.dataset.a;
  try{
    if(action==='begin')openOnboarding();
    else if(action==='dep')openDeposit();
    else if(action==='go')await deposit();
    else if(action==='shop')openShop();
    else if(action==='pick')startBuilding(button.dataset.type);
    else if(action==='pcancel')cancelPlacement();
    else if(action==='selu')collectSelected();
    else if(action==='menu')openMenu();
    else if(action==='goal')openGoal();
    else if(action==='profile')openProfile();
    else if(action==='pause-plan'){if(G.goal)G.goal.weeklyPence=0;save();openGoal();update()}
    else if(action==='clear-goal'){G.goal=null;save();dlg.close();update()}
    else if(action==='learn')openLearn();
    else if(action==='lesson')openLesson(button.dataset.id);
    else if(action==='answer')answerLesson(button.dataset.id,Number(button.dataset.answer));
    else if(action==='design')openDesign();
    else if(action==='theme'){if(Object.hasOwn(THEMES,button.dataset.id))G.theme=button.dataset.id;save();openDesign()}
    else if(action==='decorate')startDecoration(button.dataset.kind);
    else if(action==='wallet')openWallet();
    else if(action==='withdraw-savings')openWithdrawal('savings');
    else if(action==='withdraw-rewards')openWithdrawal('rewards');
    else if(action==='wgo')await withdraw();
    else if(action==='retry-wallet')await retryWallet();
    else if(action==='reconnect'){await refreshWallet();if(walletOnline)await refreshWallet(true);openWallet()}
    else if(action==='bank')openBank();
    else if(action==='bank-connect')await connectBank();
    else if(action==='bank-auth')continueWithBank();
    else if(action==='payment-status')openPaymentStatus();
    else if(action==='check-payment'){await refreshWallet();openPaymentStatus()}
    else if(action==='recap')openRecap();
    else if(action==='new-journal'){notes.weekStarted=Date.now();notes.weekBaseline={buildings:G.b.filter(building=>building.ok).length,lessons:G.lessons.length,cashAwardedPence:wallet?.totalAwardedPence||0};save();dlg.close();toast('A fresh page, whenever you are ready.')}
    else if(action==='postcards')openPostcards();
    else if(action==='export')exportPostcard();
    else if(action==='leave-visit')returnHome();
    else if(action==='close')dlg.close();
  }catch(error){localError(error)}
});
dlg.addEventListener('close',()=>{setTimeout(maybeCelebrate,180)});
document.addEventListener('visibilitychange',()=>{if(document.hidden){advanceGame(G);save()}else{const progress=advanceGame(G);save();update();if(progress.completed.length)toast('Your island has been busy. A building is ready.');refreshWallet(true).then(maybeCelebrate)}});
addEventListener('beforeunload',()=>{advanceGame(G);save()});
setInterval(()=>{if(!started)return;const progress=advanceGame(G);if(progress.completed.length){beep();toast('A new piece of your island is ready.');save()}update();if(Date.now()-lastSave>=10000){save();lastSave=Date.now()}if(Date.now()-lastWalletCheck>=60000&&!document.hidden)refreshWallet(true).then(maybeCelebrate)},1000);
const animate=time=>{if(started&&!document.hidden)renderer.draw(matchMedia('(prefers-reduced-motion: reduce)').matches?0:time);requestAnimationFrame(animate)};requestAnimationFrame(animate);

if(started){showGame();if(offline.offlineMs>=60000){modal('A little more island to come home to',`<p>While you were away, your island made <b>${fmt(offline.goldEarned)} game gold</b>${offline.completed.length?' and finished '+offline.completed.length+' building'+(offline.completed.length===1?'':'s'):''}.</p><p class="sub">${offline.capped?'Up to 7 days of island progress is kept between visits. ':''}Game gold is for building and decorating. Cash gifts appear separately, only after they have been awarded.</p><button class="b g full cta" data-a="close">Have a look around</button>`)}}
await refreshWallet();if(walletOnline)await refreshWallet(true);maybeCelebrate();

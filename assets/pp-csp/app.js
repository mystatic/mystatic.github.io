(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const slider = $('time'), play = $('play'), replay = $('replay'), chart = $('position-chart');
  const ns = 'http://www.w3.org/2000/svg';
  let t = 0, playing = false, frame = 0, last = null, chartCursor, chartDot, chartLabel, geom;
  // Symmetric trapezoidal velocity: 120 deg/s² for 0.5 s, 60 deg/s for 1 s, then deceleration.
  function position(seconds) {
    const s = Math.max(0, Math.min(2, seconds));
    if (s < 0.5) return 60 * s * s;
    if (s <= 1.5) return 15 + 60 * (s - 0.5);
    return 90 - 60 * (2 - s) * (2 - s);
  }
  function el(tag, attrs, text) {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, value));
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function drawChart() {
    const w = Math.max(220, chart.getBoundingClientRect().width), h = 235;
    chart.setAttribute('viewBox', `0 0 ${w} ${h}`);
    chart.replaceChildren();
    chart.append(el('title', {}, 'PP 内部参考与 CSP 下发参考可以完全相同'));
    chart.append(el('desc', {}, '位置从零度逐渐增加到九十度。PP 最终目标为九十度，驱动器生成中间位置；CSP 由上位机发送同样的中间位置。'));
    const l = 42, r = 12, top = 30, b = 35;
    const x = s => l + s / 2 * (w - l - r), y = q => h - b - q / 90 * (h - b - top);
    geom = { x, y, top, bottom: h - b };
    for (const q of [0, 45, 90]) {
      chart.append(el('line', {x1:l, x2:w-r, y1:y(q), y2:y(q), stroke:'var(--rule)', 'stroke-width':1}));
      chart.append(el('text', {x:l-8, y:y(q)+4, 'text-anchor':'end', fill:'var(--muted)', 'font-size':12}, `${q}°`));
    }
    const ticks = w < 420 ? [0, 1, 2] : [0, .5, 1, 1.5, 2];
    for (const s of ticks) chart.append(el('text', {x:x(s), y:h-12, 'text-anchor':'middle', fill:'var(--muted)', 'font-size':12}, `${s} s`));
    chart.append(el('text', {x:l, y:14, fill:'var(--muted)', 'font-size':12}, w < 420 ? 'PP 最终目标：90°' : 'PP 最终目标保持 90°；下方曲线是中间参考位置'));
    let path = '';
    for (let i=0;i<=200;i++) {const s=i/100;path+=`${i?'L':'M'}${x(s).toFixed(2)},${y(position(s)).toFixed(2)} `;}
    chart.append(el('path', {d:path, fill:'none', stroke:'var(--pp)', 'stroke-width':2.5}));
    for (let i=0;i<=20;i++) {const s=i/10;chart.append(el('circle', {cx:x(s),cy:y(position(s)),r:3.3,fill:'var(--csp)',stroke:'var(--surface)','stroke-width':1}));}
    chartCursor=el('line',{x1:0,x2:0,y1:top,y2:h-b,stroke:'var(--muted)','stroke-width':1,'stroke-dasharray':'3 4'});
    chartDot=el('circle',{r:5,fill:'var(--ink)',stroke:'var(--surface)','stroke-width':2});
    chartLabel=el('text',{y:h-b+16,fill:'var(--ink)','font-size':12,'font-weight':600});
    chart.append(chartCursor, chartDot, chartLabel);
    update();
  }
  function update() {
    // UI time is quantized to the illustrative 1 ms command cycle.
    t = Math.max(0, Math.min(2,t));
    const sampleTime = Math.round(t*1000)/1000;
    const q = position(sampleTime), angle = `${q.toFixed(2)}°`;
    slider.value=String(sampleTime);$('clock').textContent=`${sampleTime.toFixed(3)} s`;
    for(const id of ['pp-ref','pp-angle','host-ref','csp-packet','csp-ref','csp-angle']) $(id).textContent=angle;
    for(const id of ['pp-arm','csp-arm']) $(id).setAttribute('transform',`rotate(${-q} 50 50)`);
    const packetWidth = $('packet-dot').ownerSVGElement.getBoundingClientRect().width;
    $('packet-dot').setAttribute('cx',String(Math.max(0,packetWidth-5)*((t*5)%1)));
    document.querySelectorAll('.packet .across path').forEach(p=>p.setAttribute('transform',`translate(${p.ownerSVGElement.getBoundingClientRect().width-1} 16)`));
    if(geom){const xx=geom.x(sampleTime),yy=geom.y(q);chartCursor.setAttribute('x1',xx);chartCursor.setAttribute('x2',xx);chartDot.setAttribute('cx',xx);chartDot.setAttribute('cy',yy);chartLabel.setAttribute('x',xx);chartLabel.setAttribute('y',yy+(q>75?21:-12));chartLabel.setAttribute('text-anchor',t<.4?'start':t>1.6?'end':'middle');chartLabel.textContent=angle;}
  }
  function announce() {
    let stage = t === 0 ? '起点' : t < .5 ? '加速段' : t <= 1.5 ? '匀速段' : t < 2 ? '减速段' : '参考轨迹结束';
    $('status').textContent=`${stage}：PP 最终目标仍为 90°；PP 内部参考与 CSP 当前下发位置均为 ${position(t).toFixed(2)}°。`;
  }
  function stop() {playing=false;last=null;cancelAnimationFrame(frame);play.textContent=t>=2?'重新播放':'播放演示';play.setAttribute('aria-pressed','false');}
  function tick(now) {
    if(!playing)return;
    if(last!==null)t=Math.min(2,t+(now-last)/1000*.4);
    last=now;update();
    if(t>=2){stop();announce();return;}
    frame=requestAnimationFrame(tick);
  }
  play.addEventListener('click',()=>{
    if(playing){stop();announce();return;}
    if(t>=2)t=0;
    playing=true;last=null;play.textContent='暂停';play.setAttribute('aria-pressed','true');frame=requestAnimationFrame(tick);
  });
  replay.addEventListener('click',()=>{stop();t=0;play.textContent='播放演示';update();announce();});
  slider.addEventListener('input',()=>{t=Number(slider.value);stop();update();});
  slider.addEventListener('change',announce);
  window.addEventListener('pagehide',stop);
  new ResizeObserver(drawChart).observe(chart);
  drawChart();
})();

document.getElementById('print-page').addEventListener('click', () => window.print());
const chapterLinks = [...document.querySelectorAll('aside nav a')];
const chapterObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
  if (!visible.length) return;
  const target = '#' + visible[0].target.id;
  chapterLinks.forEach(link => {
    const active = link.getAttribute('href') === target;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-5% 0px -65% 0px', threshold: 0 });
document.querySelectorAll('article section[id]').forEach(section => chapterObserver.observe(section));

// Algebra and static mechanics, shared by the UI and the numerical checks.
const MotorMath = Object.freeze({
  radians: degrees => degrees * Math.PI / 180,
  mit({qd,q,vd,v,kp,kd,ff}) {
    const position = kp * (qd-q) * Math.PI / 180;
    const velocity = kd * (vd-v);
    return {position, velocity, feedforward:ff, total:position+velocity+ff};
  },
  gravity(m,r,q) { return m*9.81*r*Math.cos(q); },
  equilibrium({m,r,kp,mode,fixed}) {
    const desired = Math.PI/6;
    const gravity = q => this.gravity(m,r,q);
    const feedforward = q => mode==='model' ? gravity(q) : mode==='fixed' ? fixed : 0;
    const residual = q => kp*(desired-q)+feedforward(q)-gravity(q);
    let lo=-Math.PI/2, hi=Math.PI/2;
    if (residual(lo)<0 || residual(hi)>0) throw new RangeError('No equilibrium in the teaching range');
    // For fixed/no compensation f'(q) <= -10 + 7.848 < 0; model f'(q)=-Kp.
    for(let i=0;i<64;i++) {const mid=(lo+hi)/2;if(residual(mid)>0)lo=mid;else hi=mid;}
    const q=(lo+hi)/2, error=desired-q;
    return {q,error,feedback:kp*error,feedforward:feedforward(q),gravity:gravity(q),residual:residual(q)};
  },
  estimate(state) { return state.feedforward+state.feedback; }
});

// Radians internally. A bounded, illustrative single-joint plant, not a motor model.
const MotorDynamics = Object.freeze({
  inertia: .25, drag: .1, torqueLimit: 8, angleLimit: 150*Math.PI/180, stepSize: .002,
  torque(state, command) {
    const terms=MotorMath.mit({...command,q:state.q*180/Math.PI,v:state.v});
    const applied=Math.max(-this.torqueLimit,Math.min(this.torqueLimit,terms.total));
    return {...terms,applied,acceleration:(applied-this.drag*state.v-command.load)/this.inertia};
  },
  step(state,command,h=this.stepSize) {
    // RK4 recomputes PD feedback and torque saturation at every stage.
    const f=(q,v)=>({q:v,v:this.torque({q,v},command).acceleration});
    const a=f(state.q,state.v),b=f(state.q+h*a.q/2,state.v+h*a.v/2);
    const c=f(state.q+h*b.q/2,state.v+h*b.v/2),d=f(state.q+h*c.q,state.v+h*c.v);
    let q=state.q+h*(a.q+2*b.q+2*c.q+d.q)/6;
    let v=state.v+h*(a.v+2*b.v+2*c.v+d.v)/6;
    const hitLimit=Math.abs(q)>=this.angleLimit;
    if(hitLimit){q=Math.max(-this.angleLimit,Math.min(this.angleLimit,q));v=0;}
    return {q,v,time:state.time+h,hitLimit};
  }
});

(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const signed=(n,d=3)=>(Math.abs(n)<.5*10**(-d)?0:n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d,signDisplay:'exceptZero',useGrouping:false});
  const value=id=>Number($(id).value);
  const mitIds=['mit-qd','mit-vd','mit-kp','mit-kd','mit-ff','mit-load'];
  function controlReadout(id) {
    const input=$(id), digits=id==='load-fixed'?3:id==='load-radius'||id==='load-mass'?2:['mit-vd','mit-kd','mit-ff','mit-load'].includes(id)?1:0;
    $(id+'-value').textContent=value(id).toFixed(digits)+' '+input.dataset.unit;
  }
  let joint={q:0,v:0,time:0,hitLimit:false},running=false,animation=0,last=null,accumulator=0,steps=0;
  let history=[];
  const command=()=>({qd:value('mit-qd'),vd:value('mit-vd'),kp:value('mit-kp'),kd:value('mit-kd'),ff:value('mit-ff'),load:value('mit-load')});
  function sample() {
    const target=value('mit-qd'),actual=joint.q*180/Math.PI;
    history.push({time:joint.time,target,actual,error:target-actual});
    while(history.length>1 && history[0].time<joint.time-8)history.shift();
    if(history.length>500)history.splice(0,history.length-500);
  }
  function drawHistory() {
    const svg=$('mit-history'),w=Math.max(240,svg.getBoundingClientRect().width),h=245,left=42,right=w-12;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.replaceChildren();
    const el=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
    const end=Math.max(8,joint.time),start=end-8,x=t=>left+(t-start)/8*(right-left);
    const maxAngle=Math.max(45,...history.flatMap(s=>[Math.abs(s.target),Math.abs(s.actual)]))*1.1;
    const maxError=Math.max(5,...history.map(s=>Math.abs(s.error)))*1.1;
    svg.append(el('title',{},'MIT 动态响应：角度和误差随仿真时间变化'));
    for(const [center,span,label] of [[66,maxAngle,'角度 °'],[177,maxError,'误差 °']]) {
      svg.append(el('text',{x:0,y:center-43},label));
      for(const factor of [-1,0,1]) {
        const y=center-factor*33;
        svg.append(el('line',{x1:left,x2:right,y1:y,y2:y,stroke:'var(--line)','stroke-dasharray':factor===0?'':'3 4'}));
        svg.append(el('text',{x:left-5,y:y+4,'text-anchor':'end'},(factor*span).toFixed(0)));
      }
    }
    for(const [key,center,scale,color,dash] of [['target',66,maxAngle,'var(--orange)','5 4'],['actual',66,maxAngle,'var(--green)',''],['error',177,maxError,'var(--orange)','']]) {
      const points=history.map(s=>`${x(s.time).toFixed(1)},${(center-s[key]/scale*33).toFixed(1)}`).join(' ');
      svg.append(el('polyline',{points,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':dash}));
    }
    for(const t of [start,start+4,end])svg.append(el('text',{x:x(t),y:239,'text-anchor':t===start?'start':t===end?'end':'middle'},t.toFixed(1)+' s'));
  }
  function updateMit() {
    mitIds.forEach(controlReadout);
    const cmd=command(),q=joint.q*180/Math.PI,t=MotorDynamics.torque(joint,cmd);
    const scale=Math.max(1,...[t.position,t.velocity,t.feedforward,t.total].map(Math.abs))*1.15;
    [['torque-p',t.position],['torque-d',t.velocity],['torque-ff',t.feedforward],['torque-total',t.total]].forEach(([id,n])=>{
      $(id+'-number').textContent=signed(n)+' N·m';
      const width=Math.abs(n)/scale*50,bar=$(id+'-bar');
      bar.style.width=width+'%';bar.style.left=(n<0?50-width:50)+'%';bar.classList.toggle('negative',n<0);
    });
    $('bar-scale').textContent='单侧满量程 '+scale.toFixed(2)+' N·m';
    $('mit-target-arm').setAttribute('transform',`rotate(${-cmd.qd} 160 160)`);
    $('mit-actual-arm').setAttribute('transform',`rotate(${-q} 160 160)`);
    $('mit-target-readout').textContent=cmd.qd.toFixed(1)+'°';$('mit-actual-readout').textContent=q.toFixed(2)+'°';
    $('mit-error').textContent=signed(cmd.qd-q,2)+'°';$('mit-speed').textContent=signed(joint.v)+' rad/s';
    $('mit-applied').textContent=signed(t.applied)+' N·m';$('mit-clock').textContent=joint.time.toFixed(2)+' s';
    $('mit-limit').textContent=Math.abs(t.total)>MotorDynamics.torqueLimit?'指令超过 ±8 N·m，执行力矩已限幅。':'执行力矩未限幅；角度限位 ±150°。';
    $('mit-result').textContent=`当前误差 ${signed(cmd.qd-q,2)}°，实际速度 ${signed(joint.v)} rad/s。执行力矩 ${signed(t.applied)}、物理阻尼力矩 ${signed(-MotorDynamics.drag*joint.v)}、外力矩 ${signed(-cmd.load)} N·m 共同决定加速度。`;
    drawHistory();
  }
  function stopMit(message) {
    running=false;last=null;accumulator=0;cancelAnimationFrame(animation);
    $('mit-play').textContent='继续运行';$('mit-play').setAttribute('aria-pressed','false');
    if(message)$('mit-status').textContent=message;
  }
  function tickMit(now) {
    if(!running)return;
    if(last!==null)accumulator+=Math.min(.1,Math.max(0,(now-last)/1000));
    last=now;
    const cmd=command();
    while(accumulator+1e-12>=MotorDynamics.stepSize){
      joint=MotorDynamics.step(joint,cmd);accumulator-=MotorDynamics.stepSize;steps++;
      if(steps%10===0)sample();
      if(joint.hitLimit){sample();stopMit('已到 ±150° 演示限位，自动暂停并清零速度。请复位，或改变指令使连杆向内运动。');break;}
    }
    updateMit();if(running)animation=requestAnimationFrame(tickMit);
  }
  function runMit(message) {
    if(message)$('mit-status').textContent=message;
    if(running)return;
    running=true;last=null;accumulator=0;$('mit-play').textContent='暂停';$('mit-play').setAttribute('aria-pressed','true');
    animation=requestAnimationFrame(tickMit);
  }
  function resetMit(initialVelocity=0) {
    stopMit();joint={q:0,v:initialVelocity,time:0,hitLimit:false};steps=0;history=[];sample();updateMit();
  }
  const presets={hold:[30,0,20,2,1,1],oscillate:[30,0,20,.1,1,1],damping:[30,0,0,2,0,0],torque:[30,0,0,0,1,0]};
  for(const [name,values] of Object.entries(presets)) $('preset-'+name).addEventListener('click',()=>{
    mitIds.forEach((id,i)=>$(id).value=values[i]);resetMit(name==='damping'?1:0);
    runMit(name==='damping'?'纯阻尼：初始速度 +1 rad/s，观察速度衰减；位置不受约束。':name==='torque'?'纯力矩：没有位置反馈，持续出力会使连杆运动，直至演示限位。':'运行中；调参立即生效。稳态后可点“轻推一下”比较阻尼。');
  });
  mitIds.forEach(id=>$(id).addEventListener('input',()=>{sample();updateMit();runMit('参数已更新，继续闭环运动；历史曲线保留。');}));
  $('mit-play').addEventListener('click',()=>running?stopMit('已暂停，可检查瞬时力矩。再次运行或调参将继续。'):runMit('运行中；实时计算力矩、速度和角度。'));
  $('mit-reset').addEventListener('click',()=>{resetMit();$('mit-status').textContent='已复位到 0°、0 rad/s；参数保留。点击运行或调参开始。';});
  $('mit-push').addEventListener('click',()=>{joint.v+=1;sample();updateMit();runMit('已施加瞬时 +1 rad/s 速度扰动，观察误差恢复与振荡衰减。');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stopMit('页面进入后台，仿真已暂停；点击继续运行。');});
  window.addEventListener('pagehide',()=>stopMit());window.addEventListener('beforeprint',()=>stopMit('打印当前仿真快照；已暂停。'));
  new ResizeObserver(drawHistory).observe($('mit-history'));
  sample();
  let state;
  const loadIds=['load-mass','load-radius','load-kp','load-fixed'];
  function updateLoad() {
    loadIds.forEach(controlReadout);
    const m=value('load-mass'),r=value('load-radius'),kp=value('load-kp'),fixed=value('load-fixed'),mode=$('load-mode').value;
    state=MotorMath.equilibrium({m,r,kp,fixed,mode});
    $('load-angle').textContent=(state.q*180/Math.PI).toFixed(3)+'°';
    $('load-error').textContent=signed(state.error*180/Math.PI)+'°';
    $('load-feedback').textContent=signed(state.feedback)+' N·m';
    $('load-feedforward').textContent=signed(state.feedforward)+' N·m';
    $('load-gravity').textContent=state.gravity.toFixed(3)+' N·m';
    $('load-residual').textContent=Math.abs(state.residual)<1e-9?'< 10⁻⁹ N·m':signed(state.residual,9)+' N·m';
    $('load-model-status').textContent=mode==='model'?'理想对照：控制器获知准确负载模型，并按实际角度更新前馈。':mode==='fixed'?'控制器使用一个固定力矩；负载重力矩仍随实际角度变化。':'控制器未使用负载模型；反馈因位置偏差而出力。';
    const length=60+(r-.05)/.35*95;
    $('load-actual-arm').setAttribute('transform',`rotate(${-state.q*180/Math.PI} 55 170)`);
    $('load-link').setAttribute('d',`M55 170 H${55+length}`);$('load-com').setAttribute('cx',55+length);
    const x=55+length*Math.cos(state.q),y=170-length*Math.sin(state.q);
    $('load-gravity-arrow').setAttribute('d',`M${x} ${y} v42 m-5 -7 l5 7 l5 -7`);
    for(const angle of [0,30,60]) $('pose-'+angle).textContent=MotorMath.gravity(m,r,MotorMath.radians(angle)).toFixed(3)+' N·m';
    document.querySelectorAll('.fixed-at-pose').forEach(cell=>cell.textContent=fixed.toFixed(3)+' N·m');
    $('load-fixed-note').textContent=mode==='fixed'?'当前正在施加这个固定值；调整后会立即重新求平衡。':'固定值已保存，但当前模式不施加它。';
  }
  function changed() {updateLoad();$('estimate-message').textContent='参数已更新；可用当前平衡状态重新估计。';}
  loadIds.forEach(id=>$(id).addEventListener('input',changed));
  $('load-mode').addEventListener('change',changed);
  for(const [suffix,m,r] of [['a',1,.2],['b',2,.1]]) $('load-pair-'+suffix).addEventListener('click',()=>{
    $('load-mass').value=m;$('load-radius').value=r;changed();
    $('estimate-message').textContent='仅切换环境质量与重心距离；其乘积相同，控制设置不变，平衡结果相同。';
  });
  $('estimate-load').addEventListener('click',()=>{
    const before=state;
    const estimated=MotorMath.estimate(before);
    // Round only to the actual range input resolution (0.001 N·m).
    // Within the declared domain this estimate is in [0, 7.848] N·m.
    const applied=Math.max(0,Math.min(8,Math.round(estimated*1000)/1000));
    $('load-fixed').value=applied;$('load-mode').value='fixed';updateLoad();
    $('estimate-message').textContent=`已将原前馈 ${signed(before.feedforward)} 与原反馈 ${signed(before.feedback)} N·m 相加，得到估计 ${estimated.toFixed(3)} N·m；以 0.001 N·m 分辨率保存为固定值。新平衡角度 ${(state.q*180/Math.PI).toFixed(3)}°。`;
  });
  updateMit();updateLoad();
})();

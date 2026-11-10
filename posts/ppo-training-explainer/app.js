(() => {
'use strict';
const D = window.PPO_DATA;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (x, n = 3) => Number(x).toFixed(n);
const deg = x => x * 180 / Math.PI;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRAIN = 5, RESULT = 7, L = window.PPO_LESSON, C = window.PPO_COMPARE;
let evalPair = 0, evalRange = 40;
let TRAIN_OFFSET = 6, trainingFrames = [], lessonTrace = null, deriveStep = 0;
const episodeRecords = D.rollouts[0].samples.filter(s => s.env === 0 && s.episode === 0);
const EPISODE_LENGTH = episodeRecords.length;
const chapters = [
  {key:'task',name:'要学会什么',title:'让摆杆在允许角度内，坚持得更久',steps:4,summary:'策略决定动作，仿真器计算结果，PPO 根据经历更新策略。'},
  {key:'episode',name:'看完一次尝试',title:'从开始到结束，认识一个 episode',steps:EPISODE_LENGTH+4,summary:'一个回合包含多个环境步；reset 开始新回合，但不会清空网络参数。'},
  {key:'interaction',name:'放慢一个动作',title:'看状态、选动作、得到反馈',steps:6,summary:'一个 step 形成一次交互；一条样本保存这次真实经历。'},
  {key:'trajectory',name:'每一步都是经历',title:'s0、s1、s2，每一步都参与学习',steps:8,summary:'每个已经执行动作的时间步都有样本；不只用最后一步，也不只用成功回合。'},
  {key:'rollout',name:'把经历收成一批',title:'回合结束了，这批数据还没收满',steps:8,summary:'episode 数一次尝试；rollout 数一批采样。两条边界彼此独立。'},
  {key:'training',name:'这一整批学十遍',title:'先算学习目标，再把整批数据学十遍',steps:TRAIN_OFFSET+161,summary:'每遍 16 个 minibatch，每批 256 条。完整遍历 10 次，每条样本用 10 次，共更新网络 160 次。'},
  {key:'continue',name:'带着新策略再试',title:'继续交互，才能知道有没有进步',steps:5,summary:'用新策略采新数据，重复训练闭环；最终通过固定起点的评估观察表现。'},
  {key:'evaluation',name:'看训练前后效果',title:'训练之后，它真的更稳了吗？',steps:C.maxStep(0)+1,summary:'同一初始状态、同样的确定性评估；训练前后成对比较，失败即停止，最长测试 40 秒。'}
];
let chapter = 0, step = 0, rollout = 0, env = 0, time = 0, playing = false, timer = null, speed = 1, clipSign = 1;
const poseCache = new Map();
function run() { return D.rollouts[rollout]; }
function sample(t=time,e=env) { return run().samples[Math.max(0,Math.min(1023,t))*4+e]; }
function sid(s=sample()) {return `R${rollout+1}·E${s.env+1}·T${String(s.t).padStart(4,'0')}`;}
function terminalSample() {const selected=sample();return selected.done&&!selected.truncated?selected:run().samples.find(s=>s.env===env && s.done && !s.truncated);}
function currentBatch(){return Math.max(-1,Math.min(159,step-TRAIN_OFFSET));}
function go(c,s=0){pause();syncTraining();chapters[RESULT].steps=C.maxStep(evalPair)+1;chapter=c;step=Math.max(0,Math.min(chapters[c].steps-1,s));render();}
function pause(){playing=false;clearTimeout(timer);timer=null;$('play').textContent='▶ 播放';document.querySelectorAll('.flow-arrow.moving').forEach(el=>el.classList.remove('moving'));}
function schedule(){clearTimeout(timer);if(!playing)return;const delay=(chapter===RESULT?40:chapter===TRAIN&&step>=TRAIN_OFFSET?850:1800)/speed;timer=setTimeout(()=>{if(step<chapters[chapter].steps-1){step++;if(chapter===RESULT)renderEvaluationTick();else render();schedule();}else{pause();}},delay);}
function play(){if(playing){pause();return;}if(step===chapters[chapter].steps-1)step=0;playing=true;render();schedule();}
function selectSample(change){
  pause();const oldFrame=trainingFrames[step],oldBatch=step-TRAIN_OFFSET;
  change();syncTraining();
  if(chapter===TRAIN){
    if(oldBatch>=0)step=TRAIN_OFFSET+oldBatch;
    else {const match=trainingFrames.findIndex(x=>x.key===oldFrame?.key);step=match>=0?match:trainingFrames.findIndex(x=>x.kind===oldFrame?.kind);if(step<0)step=0;}
  }
  render();
}
function choose(t,e=env){selectSample(()=>{time=Math.max(0,Math.min(1023,Math.round(Number(t)||0)));env=e;});}
function math(tex,id='equation'){const node=$(id);if(!node)return;node.innerHTML='';if(tex)katex.render(tex,node,{displayMode:true,throwOnError:true,strict:'ignore'});if(id==='equation')$('math-details').hidden=!tex;}
function explain(title,body,takeaway,formula=''){ $('explain-title').textContent=title;$('explain-body').innerHTML=body;$('takeaway').textContent=takeaway;math(formula);}
function setStage(caption,phase,note){$('stage-caption').textContent=caption;$('phase-badge').textContent=phase;$('stage-note').textContent=note;}
function node(label,small='',on=false,old=false){return `<div class="flow-node ${on?'on':''} ${old?'old':''}">${label}${small?`<small>${small}</small>`:''}</div>`;}
function arrow(on=false){return `<span class="flow-arrow ${on&&playing?'moving':''}" aria-hidden="true">→</span>`;}
function flow(items,active=0){return `<div class="flow">${items.map((x,i)=>`${i?arrow(i===active):''}${node(x[0],x[1],i===active)}`).join('')}</div>`;}
function phases(labels,active){return `<div class="phase-strip">${labels.map((l,i)=>`<span class="${active===i?'on':''}">${l}</span>`).join('')}</div>`;}
function pendulum(obs,id,label,ended=false,big=false){
  // Geometry is a readable 2D illustration; x and angle are actual recorded states.
  const x=100+Math.max(-.35,Math.min(.35,obs[0]))*180;
  const angle=deg(obs[1]);
  const prev=poseCache.get(id)||{x,angle};poseCache.set(id,{x,angle});
  return `<div class="sim ${big?'big':''} ${id===`e${env}`?'chosen':''} ${ended?'ended':''}"><div class="sim-label"><strong>${label}</strong><span class="mono">${fmt(angle,2)}°</span></div>
  <svg viewBox="0 0 200 130" role="img" aria-label="${esc(label)}，小车位置 ${fmt(obs[0],4)} 米，摆杆角度 ${fmt(angle,2)} 度"><line x1="8" y1="112" x2="192" y2="112" stroke="#acbfb4"/><line x1="100" y1="15" x2="100" y2="110" stroke="#cbd9d0" stroke-dasharray="3 4"/>
  <g data-pose="translateX" data-from="${prev.x}" data-to="${x}" style="transform:translateX(${x}px)"><rect x="-20" y="95" width="40" height="14" rx="3" fill="${ended?'#be5e28':'#087e72'}"/><circle cx="-12" cy="110" r="3" fill="#25493e"/><circle cx="12" cy="110" r="3" fill="#25493e"/>
  <g transform="translate(0,95)"><g data-pose="rotate" data-from="${prev.angle}" data-to="${angle}" style="transform:rotate(${angle}deg)"><line x1="0" y1="0" x2="0" y2="-76" stroke="#284951" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="-76" r="7" fill="${ended?'#da8b52':'#527bbd'}"/></g><circle cx="0" cy="0" r="4" fill="#f4faf7" stroke="#087e72"/></g></g></svg>
  <div class="sim-value"><span>x ${fmt(obs[0],4)} m</span><span>角速度 ${fmt(obs[3],2)} rad/s</span></div></div>`;
}
function animatePoses(){if(reduced)return;document.querySelectorAll('[data-pose]').forEach(el=>{const fn=el.dataset.pose,unit=fn==='rotate'?'deg':'px';if(el.dataset.from!==el.dataset.to)el.animate([{transform:`${fn}(${el.dataset.from}${unit})`},{transform:`${fn}(${el.dataset.to}${unit})`}],{duration:Math.min(650,650/speed),easing:'cubic-bezier(.2,.7,.3,1)'});});}
function distributionPlot(s,showAction){
  const lo=Math.min(-3,s.mean-3*s.std,s.action-.25),hi=Math.max(3,s.mean+3*s.std,s.action+.25);
  const px=x=>25+(x-lo)/(hi-lo)*350;
  const points=Array.from({length:101},(_,i)=>{const x=lo+(hi-lo)*i/100;return `${fmt(px(x),2)},${fmt(66-48*Math.exp(-.5*((x-s.mean)/s.std)**2),2)}`;}).join(' ');
  return `<svg class="distribution" viewBox="0 0 400 90" role="img" aria-label="真实采样时高斯动作分布，均值 ${fmt(s.mean)}，采样动作 ${fmt(s.action)}"><rect x="${px(-3)}" y="8" width="${px(3)-px(-3)}" height="60" fill="#f0f5ef"/><line x1="25" y1="68" x2="375" y2="68" stroke="#b6c5b9"/><polyline points="${points}" fill="none" stroke="#315dbe" stroke-width="2.5"/><line x1="${px(s.mean)}" y1="15" x2="${px(s.mean)}" y2="68" stroke="#315dbe" stroke-dasharray="3 3"/>${showAction?`<line x1="${px(s.action)}" y1="30" x2="${px(s.action)}" y2="68" stroke="#be5e28" stroke-width="2"/><circle cx="${px(s.action)}" cy="68" r="4" fill="#be5e28"/>`:''}<text x="${px(-3)}" y="84" font-size="10" fill="#62737a" text-anchor="middle">−3</text><text x="${px(3)}" y="84" font-size="10" fill="#62737a" text-anchor="middle">+3</text><text x="30" y="15" font-size="10" fill="#315dbe">蓝线：采样时的动作分布</text>${showAction?'<text x="242" y="15" font-size="10" fill="#be5e28">橙点：这次采样动作</text>':''}</svg>`;
}
function originalCode(needles,active){const lines=D.source.split('\n');$('code-source').textContent='原脚本 · 真实行号';$('code').innerHTML=needles.map((n,i)=>{let k=lines.findIndex(l=>l.includes(n));return `<span class="code-line ${i===active?'active':''}"><span class="line-no">${k+1}</span>${esc(lines[k]?.trimStart()||n)}</span>`;}).join('');$('code-note').textContent='仅抽取相关代码行；省略注释与中间行。';}
function internalCode(lines,active,source){$('code-source').textContent=source;$('code').innerHTML=lines.map((l,i)=>`<span class="code-line ${i===active?'active':''}"><span class="line-no">${i+1}</span>${esc(l)}</span>`).join('');$('code-note').textContent='SB3 内部流程的逻辑摘编；上面的序号不是库源码行号。实际记录由 SB3 原始算法执行。';}
function renderTask(){
  const first=episodeRecords[0],last=episodeRecords.at(-1);
  const states=[
    {title:'目标：在允许角度内坚持更久',body:'<p>小车可以左右移动，摆杆会在重力和运动的影响下倾斜。我们要让电脑学会选择控制输入，让摆杆尽量长时间保持在允许角度内。</p><p>电脑起初不知道怎么推才合适；它也没有“每个姿态该推多大”的标准答案。</p>',lesson:'我们要学的是“看到当前状态后怎样行动”，不是背下某一段固定动作。'},
    {title:'三个角色，各自负责一件事',body:'<p><strong>策略</strong>像控制器：看状态，决定尝试什么动作。它由带参数的神经网络表示。</p><p><strong>环境 / 仿真器</strong>是小车所在的世界：执行控制输入，计算新的运动状态和奖励。这里使用 MuJoCo。</p><p><strong>PPO</strong>是学习算法：用收集到的经历更新网络，让下一轮尝试有机会获得更多累计奖励。</p>',lesson:'选择动作、计算物理运动、更新网络，发生在不同的环节。'},
    {title:'用什么判断一次动作的结果？',body:'<p><strong>奖励 reward</strong>是环境给这一小步的反馈。本任务在每个环境步结束时检查状态：摆角绝对值不超过约 11.46°且数值正常，给 1；越界或数值异常，给 0 并结束本回合。</p><p>这让“更多健康步”带来更多累计奖励。摆杆不必真的倒在地上才算失败。</p>',lesson:'奖励来自任务规则；PPO 用累计奖励的目标指导学习。'},
    {title:'整页要跟着这个循环走',body:'<p>先看一回完整尝试，认识回合的开始与结束；再放慢一个动作，看经历从哪里来。</p><p>接着把许多经历收成一批，完整训练十遍，再用更新后的策略继续尝试。最后才检查它是否坚持得更久。</p><p>本页用两个真实短程 rollout 解释过程；它们不构成“已经学会平衡”的证明。</p>',lesson:'下面先看一回尝试。此时只关注：什么时候开始、走了几步、什么时候结束。'}
  ];
  if(step===2)$('scene').innerHTML=`<div class="sim-grid">${pendulum(first.next_obs,'task-ok','健康的一步 · reward 1')}${pendulum(last.next_obs,'task-end','越界的一步 · reward 0',true)}</div><div class="task-goal">允许摆角：约 −11.46° 到 +11.46°<small>这两个画面来自同一个真实回合；回合过程在下一章完整播放。</small></div>`;
  else if(step===1)$('scene').innerHTML=pendulum(first.obs,'task','真实初始状态',false,true)+`<div class="role-list"><div><b>策略</b><span>观察 → 决定动作</span></div><div><b>MuJoCo 环境</b><span>执行 → 运动与奖励</span></div><div><b>PPO 算法</b><span>读经历 → 更新网络</span></div></div>`;
  else $('scene').innerHTML=pendulum(first.obs,'task','我们要控制的小车与摆杆',false,true)+`<div class="task-goal">让摆杆保持健康的时间更长<small>训练起点在 −10° 到 +10° 内随机，初始速度为零。</small></div>`+flow([['尝试动作','与环境交互'],['收集经历','观察结果'],['更新策略','PPO 学习'],['再试一次','新策略']],step===3?2:0);
  explain(states[step].title,states[step].body,states[step].lesson);
  setStage('先认识任务，再走进训练过程',step===2?'真实状态 · 奖励规则':'学习目标','这是一节机制讲解；动画的移动与箭头用于说明流程，真实记录不等于已训练成功。');
  originalCode(['ENV_ID =','class TenDegreeReset','train_env = make_vec_env','model = PPO(','model.learn(total_timesteps'],step===1?3:0);
}
function renderEpisode(){
  const n=EPISODE_LENGTH,first=episodeRecords[0],last=episodeRecords.at(-1),next=D.rollouts[0].samples[n*4];
  const completed=Math.min(n,step),hasReset=step>n,isNextStep=step>n+1;
  const active=step===0?first:step<=n?episodeRecords[step-1]:next;
  const obs=step===0?first.obs:step<=n?active.next_obs:step===n+1?last.returned_obs:next.next_obs;
  const score=episodeRecords.slice(0,completed).reduce((sum,s)=>sum+s.reward,0);
  const episodeStep=hasReset?(isNextStep?1:0):completed;
  const ended=!hasReset&&step===n;
  const eventLabel=step===0?'reset：第一次尝试开始':ended?'达到终止条件：这一回合结束':step===n+1?'reset：第二次尝试开始':hasReset?'第二回合的第 1 个 step':`第一回合的第 ${step} 个 step`;
  $('scene').innerHTML=pendulum(obs,'episode','Env 1 · '+eventLabel,ended,true)+`<div class="episode-counters"><div><span>当前回合 episode</span><b>${hasReset?2:1}</b></div><div><span>回合内 step</span><b>${episodeStep}</b></div><div><span>本回合累计奖励</span><b>${hasReset?(isNextStep?next.reward:0):score}</b></div></div><div class="episode-track" aria-label="第一回合完整时间线"><span class="episode-boundary">reset</span><div class="episode-steps">${episodeRecords.map((s,i)=>`<span class="episode-tick ${i<completed?'passed':''} ${s.done&&i<completed?'end':''}" aria-label="第 ${i+1} 步，奖励 ${s.reward}">${i+1}</span>`).join('')}</div><span class="episode-boundary ${ended||hasReset?'end':''}">结束</span></div><div class="episode-bracket">这一整段是一个 episode，共 ${n} 个环境步</div><div class="focus-strip ${hasReset?'waiting':''}">${eventLabel}<br>${hasReset?'回合计数重新开始；已采集的经历仍保留，网络参数也保留。':'每个小格是一次动作与反馈；回合内部会连续执行很多次。'}</div>`;
  if(step===0)explain('回合 episode：一次完整尝试','<p><strong>从一次 reset 得到初始状态开始，到任务终止或时间上限截断为止的一整段交互，叫一个 episode（回合）。</strong></p><p>reset 就是把环境重新放到一个起点。这个真实回合从 '+fmt(deg(first.obs[1]),2)+'°开始，两个速度为零。此时还没执行动作，回合步数为 0。</p>','按“播放”看完这个回合。先不用记网络结构与训练参数。');
  else if(step<n)explain(`第 ${step} 步：同一回合还在继续`,`<p><strong>一个环境步 step</strong>：策略根据当前观测选一次动作，仿真器执行并返回新状态、奖励和结束标志。</p><p>这一步控制输入为 ${fmt(active.executed_action)}，奖励为 ${active.reward}。目前累计完成 ${step} 步，尚未达到结束条件，接下来就在新状态上再选动作。</p><p>每一步都会留下经历。这个回合里网络参数还没有更新，PPO 要等收满一批数据后才训练。</p>`,'一个 step 是一次交互；一个 episode 包含从开始到结束的全部交互。');
  else if(step===n)explain('这一次尝试结束了',`<p>第 ${n} 步后，摆角变成 ${fmt(deg(last.next_obs[1]),2)}°，越过健康边界。这一步奖励为 0，<code>terminated = true</code>。</p><p>这个真实 episode 总共 ${n} 步，累计奖励 ${score}。下一章会把其中一步放慢。</p><p>回合也可能在仍健康时达到 1000 步上限，此时是时间截断 <code>truncated</code>；它同样结束这次尝试。</p>`,'episode 长度由结束条件决定，不等于一次动作，也不固定为采样批次的 1024 步。');
  else if(step===n+1)explain('reset 开始下一回合',`<p>训练向量环境自动调用 reset，将角度重新随机为 ${fmt(deg(last.returned_obs[1]),2)}°，两个速度清零。回合计数变为 2，回合内步数从 0 开始。</p><p><strong>刚才收集的经历没有被删除，策略网络也没有重新初始化。</strong>这里只是改变仿真器状态。</p>`,'reset 的对象是环境；它不是“重新训练一遍模型”。');
  else if(step===n+2)explain('看清两个独立的计数',`<p>第二回合已经执行第 1 步；但这个环境在本次采样中已经积累 ${n+1} 条经历。</p><p>回合内步数在 reset 时清零；为训练收集的数据量继续累加。后面会用 <strong>rollout（采样批次）</strong>描述这批经历。</p><p>现在先记住：一次尝试结束，不等于立刻开始网络训练。</p>`,'下一章把一次动作放慢，再看每一步究竟保存了哪些数据。');
  else explain('回顾：一次、一步、重新开始','<p><strong>episode</strong> 是从初始状态到结束的一次完整尝试。<strong>step</strong> 是其中的一次动作与反馈。<strong>reset</strong> 设置下一个回合的初始状态。</p><p>第一回合已经结束，第二回合在继续；策略参数仍保留，采集到的经历也继续累积。接下来把刚才的一个 step 拆开看。</p>','先分清这三个概念，再进入数据和网络更新。');
  setStage('真实回放 · 第 1 批 / Env 1 / 第 1 个完整回合',hasReset?'新回合已开始':ended?'本回合结束':'一次尝试进行中','为了看清边界，动画把“末状态”和“自动 reset”拆开呈现；SB3 实际在同一次向量 step 内完成它们。');
  if(step===0||step===n+1)originalCode(['observation, info = self.env.reset','initial_angle = mujoco_env.np_random.uniform','qpos[1] = initial_angle','qvel[:] = 0.0','mujoco_env.set_state(qpos, qvel)','return mujoco_env._get_obs(), info'],step===0?0:2);
  else internalCode(['action = policy(observation)','next_obs, reward, terminated, truncated, info = env.step(action)','done = terminated or truncated','if done:','    info["terminal_observation"] = next_obs','    next_obs, reset_info = env.reset()'],ended?4:1,'SB3 · 一次交互与自动 reset');
}
function renderStoryContext(){
  const section=chapters[chapter].key;
  const phase=section==='task'?0:['episode','interaction','trajectory'].includes(section)?1:section==='rollout'?2:section==='training'?3:section==='evaluation'?5:4;
  $('story-status').innerHTML=[['看懂任务',0],['尝试与交互',1],['收集一批',4],['更新策略',TRAIN],['用新策略再试',6],['检验训练效果',RESULT]].map(([name,c],i)=>`<button type="button" data-story-target="${c}" class="${i===phase?'active':''}" ${i===phase?'aria-current="step"':''}>${i+1}<span>${name}</span></button>`).join('');
  const concepts={task:['策略 policy','根据观察到的状态决定如何选择动作；PPO 学习的就是这套决策规则。'],episode:['回合 episode','从 reset 的初始状态，到终止或截断的一次完整尝试；里面包含多个环境步。'],interaction:['环境步 step','观察 → 选动作 → 环境执行 → 得到一次反馈。这份脚本每步推进 0.04 秒仿真。'],trajectory:['样本 sample','围绕一次已发生动作保存的经历。每个已执行动作的时间步都有自己的样本。'],rollout:['采样批次 rollout','为下一次训练收集的一批经历。这里共 4096 条，可以跨越多个回合。'],training:['minibatch 与 epoch','256 条是一小批，一小批更新一次网络；16 小批覆盖全部 4096 条才是一遍，完整训练 10 遍。'],continue:['训练与评估','训练更新参数；评估固定参数执行策略，用回合长度与累计奖励观察表现。'],evaluation:['行为变化才是评估结果','固定同一初始状态，比较坚持时间与回合奖励总和；这些评估不会执行梯度更新。']};
  if(section==='training'&&step<TRAIN_OFFSET&&!['split','epoch','reshuffle'].includes(trainingFrames[step].kind))concepts.training=['从经历到学习目标','先沿时间算原始优势和 Return，再打乱分批。旧预测与目标固定，当前网络输出随优化变化。'];
  $('concept-strip').innerHTML=`<span>本章记住</span><strong>${concepts[section][0]}</strong><p>${concepts[section][1]}</p>`;
}
function renderInteraction(){
  const s=sample();const obs=step<3?s.obs:s.next_obs;
  $('scene').innerHTML=phases(['观测','Actor / Critic','采样动作','物理推进','环境返回','存入样本'],step)+pendulum(obs,`e${env}`,`Env ${env+1} · ${step<3?'动作前':'动作后，reset 前'}`,step>=3&&s.done,step!==1&&step!==2)+(step===1||step===2?distributionPlot(s,step===2):'')+flow([['观测','4 个数'],['策略 / 价值','共享策略参数'],['MuJoCo','执行控制输入'],['Rollout','保存经历']],Math.min(3,Math.floor(step/1.5)))+`<div class="value-strip"><span>采样动作<b class="mono">${step>=2?fmt(s.action):'待采样'}</b></span><span>实际输入<b class="mono">${step>=2?fmt(s.executed_action):'—'}</b></span><span>奖励<b class="mono">${step>=4?fmt(s.reward,0):'—'}</b></span><span>value<b class="mono">${step>=1?fmt(s.old_value):'待前向'}</b></span></div>`;
  const content=[
    ['观测是策略的输入',`<p>选中的 ${sid(s)} 从这四个数开始：<strong>[${s.obs.map(x=>fmt(x)).join(', ')}]</strong>。</p><p>依次是小车位置（米）、摆杆角度（弧度）、小车速度（米/秒）、摆杆角速度（弧度/秒），从 MuJoCo 当前状态读取。</p><p>下方随堂问答说明编号、单位，以及 reset 如何生成初始观测。</p>`],
    ['Actor 给分布，Critic 给价值',`<p>Actor 根据观测计算动作均值 ${fmt(s.mean)}，再结合可训练的共享标准差 ${fmt(s.std)}，构造高斯分布。</p><p>Critic 将同一观测输入自己的网络，预测未来折扣回报；当前 value 是 ${fmt(s.old_value)}。初始预测可能很不准，采样后才根据经历训练它。</p><p>下方问答分别解释分布参数和 value 的来源。</p>`],
    ['先采样，再限制实际控制输入',`<p>真实采样动作是 ${fmt(s.action)}，实际执行值为 ${fmt(s.executed_action)}，动作范围为 −3 到 +3。</p><p>缓冲区保留<strong>原始采样动作及其 log probability</strong>；更新时评估同一个原始动作。动作限幅与 PPO clipping 是两种不同操作。</p>`],
    ['一个环境步，两个物理步',`<p>两个物理步都保持控制输入 ${fmt(s.executed_action)}，每步 0.02 秒，共 0.04 秒。第二步从第一步的末状态继续推进，中间不重新选择动作。</p><p>这里是控制输入；执行器按 gear=100 转换为作用于小车关节的力。两个子步结束后，才返回一次观测和 reward。</p><p>动画中间姿态是首末状态的视觉插值；网页播放速度不等于仿真时间。</p>`],
    ['环境返回反馈',`<p>本条 reward = ${s.reward}，结束标志 = ${s.done?'true':'false'}。每个环境步结束后检查最终状态：摆角绝对值不超过 0.2 弧度（约 11.46°）且数值正常时给 1，否则给 0 并终止。</p><p>不必等摆杆真的倒地；两个物理子步合计只发一次奖励。达到 1000 步时会时间截断，健康的最后一步仍可得 1。</p><p>${s.done?'这条已结束：图中是 terminal_observation；向量环境返回给策略的 obs 已经是 reset 后的新观测。':'下一观测将成为下一次动作选择的输入。'}</p>`],
    ['保存一条经历，暂不更新网络','<p>保存动作前观测、原始动作、奖励、回合起始标记、旧 value 与旧 log probability。之后计算优势和 return。</p><p><strong>此时只是收集数据，没有反向传播。</strong>要等 4096 条样本收满，才进入 PPO 更新。</p>']
  ];
  explain(...content[step],step===2?'训练中的随机探索仍然存在；ent_coef=0 只是不给额外熵奖励。':'同一轮 rollout 中，所有动作都由这一轮采样开始时的固定策略产生。',step===1?String.raw`a_t\sim\mathcal{N}(\mu(s_t),\sigma^2),\quad V(s_t)`:'');
  setStage(`跟踪 ${sid(s)}`,step===3?'2 × 0.02 s = 0.04 s':'真实记录 + 流程示意','四维观测依次为 [小车位置 m，摆角 rad，小车速度 m/s，摆杆角速度 rad/s]。');
  internalCode(['obs = last_obs','actions, values, log_probs = policy(obs)','executed = clip(actions, -3, 3)','next_obs, rewards, dones, infos = env.step(executed)','buffer.add(obs, actions, rewards, episode_starts, values, log_probs)','last_obs = next_obs'],step,'SB3 · collect_rollouts');
}
function trajectoryHTML(start,count=3){
  const collected=Math.min(3,Math.floor((step+1)/2));
  return `<div class="trajectory">${Array.from({length:count},(_,i)=>sample(start+i)).map((s,i)=>`<div class="transition-row ${i>=collected?'dim':''}"><span class="state-node">s${s.t}</span><div class="transition-action">${i<collected?`a ${fmt(s.action,2)} · r ${s.reward} → ${s.done?'<strong class="reset-count">终止 → reset</strong>':'下一状态'}`:'等待执行动作 →'}</div><span class="state-node">${s.done?'末状态':`s${s.t+1}`}</span></div>`).join('')}</div><div class="buffer-title"><span>这个三步窗口已收集</span><strong>${collected} / 3 条样本</strong></div><div class="sample-row">${Array.from({length:count},(_,i)=>sample(start+i)).map((s,i)=>`<button type="button" class="sample-token ${s.t===time&&i<collected?'selected':''} ${i===collected-1?'just-collected':''}" data-sample="${s.t}" ${i>=collected?'disabled':''}>${i<collected?`样本 T${s.t}<small>输入 s${s.t} · 动作 a${s.t}</small>`:'待采样<small>尚未形成样本</small>'}</button>`).join('')}</div>`;
}
function renderTrajectory(){
  const base=Math.min(1021,Math.floor(time/3)*3),idx=Math.min(2,Math.floor(step/2)),s=sample(base+idx);
  $('scene').innerHTML=pendulum(step%2?s.next_obs:s.obs,`e${env}`,`Env ${env+1} · 样本 T${s.t}`,step%2&&s.done)+trajectoryHTML(base)+`<div class="boundary-state">${step<6?`现在聚焦 <strong>T${s.t}</strong>：${step%2?'执行完动作，形成一条样本':'用当前状态作为网络输入'}。`:'<strong>边界状态不是额外样本</strong>：最后拿到的下一观测，可用于 bootstrap；没有在它上面执行新动作，就没有新样本。'}</div>`;
  if(step<6)explain(step%2?`s${s.t} 也有自己的训练目标`:`从 s${s.t} 开始这一步`, `<p>样本 T${s.t} 的网络输入是 s${s.t}，保存的动作是 a${s.t}。它保存了当时的状态、动作和奖励 ${s.reward}，之后会得到自己的训练目标。</p><p>前面的 s${base}、后面的 s${base+2} 同样参与训练。不是只用最终一步，也不是只保留成功回合。</p><p>${s.done?'这里结束了一个 episode；下一条动作的输入来自 reset，新 episode 的奖励不会接到这条样本的 GAE 后面。':'采样时先保存经历；收满一批以后，再为每条样本计算学习目标。'}</p>`,'点下面任一“样本 T…”按钮，样本护照与 10 次训练记录会同步切换。');
  else explain('最后一个观测，不一定是一条样本','<p>采样 1024 个动作，会产生 1024 条样本。最后一次 step 还返回一个新观测，但这不自动增加第 1025 条样本。</p><p>如果回合没有结束，价值网络（Critic）对最后观测估计未来奖励；下一轮真正从它执行动作后，才产生新样本。</p><p>若是真实终止，不从终止后继续估值。若是时间截断，则另行用终止前的最后观测 bootstrap。</p>','状态是观测；训练样本是围绕一次已发生动作所记录的经历。');
  setStage('状态编号按本环境 rollout 时间步标记',step<6?'3 个时间步 → 3 条样本':'采样边界','遇到终止时，“末状态”和 reset 后下一条样本的输入是两个不同状态，图中的轨迹在这里断开。');
  internalCode(['# 每个环境的每个采样时间步都执行：','actions, values, log_probs = policy(obs)','next_obs, rewards, dones, infos = env.step(actions)','buffer.add(obs, actions, rewards, episode_starts, values, log_probs)','obs = next_obs','# 采样结束：只有末状态的 value，没有额外动作样本','last_values = policy.predict_values(obs)'],step>=6?6:3,'SB3 · 逻辑样本与 rollout 边界');
}
function lanes(t){return `<div class="timeline-rows">${[0,1,2,3].map(e=>{const ends=run().samples.filter(s=>s.env===e&&s.t<=t&&s.done);return `<div class="lane"><span>Env ${e+1}</span><div class="lane-track"><span class="${e===env?'mark':''}" style="width:${(t+1)/1024*100}%"></span>${ends.filter((_,i)=>i%Math.max(1,Math.ceil(ends.length/70))===0).map(s=>`<i style="left:${(s.t+1)/1024*100}%"></i>`).join('')}</div><span class="lane-label">${ends.length} 次结束</span></div>`;}).join('')}</div>`;}
function meter(t){return `<div><div class="buffer-title"><span>Rollout 缓冲区</span><strong class="mono">${(t+1)*4} / 4096</strong></div><div class="buffer-meter"><div class="buffer-fill" style="width:${(t+1)/1024*100}%"></div></div></div>`;}
function renderReset(){
  const s=terminalSample();const t=step<3?s.t:step===3?Math.min(1023,s.t+1):1023;
  if(step<6){
    $('scene').innerHTML=`<div class="sim-grid">${[0,1,2,3].map(e=>{const r=sample(t,e);return pendulum(step===0?r.obs:step===1?r.next_obs:r.returned_obs,`e${e}`,`Env ${e+1} · ${step===1&&r.done?'末状态':step>=2&&r.done?'已 reset':'当前状态'}`,step===1&&r.done);}).join('')}</div>`+lanes(t)+meter(t);
    const titles=['一个环境即将结束','保留最后观测，再自动 reset','返回的是新 episode 的初始观测','reset 后，继续把样本放进同一批','1024 次向量 step，收满 4096 条','采样边界不是终止边界'];
    const texts=[
      `<p>这里定位到 Env ${env+1} 在 T${s.t} 的真实终止。每个环境都有自己的 episode 长度，只有本步结束的环境会 reset。</p>`,
      `<p>这条末状态的摆角为 ${fmt(deg(s.next_obs[1]),2)}°，越过约 11.46° 的健康边界。SB3 先把它保存到 <code>terminal_observation</code>，随后调用 reset。</p><p>终止奖励仍属于刚刚结束的回合。</p>`,
      `<p>Env ${env+1} 返回给策略的角度已重新随机为 ${fmt(deg(s.returned_obs[1]),2)}°、速度为零（训练范围 −10° 到 +10°）；这不是刚刚动作造成的末状态，而是新回合的起点。</p><p>原来的终止信息仍保留，GAE 不会把新回合接到旧回合后面。</p>`,
      '<p>reset 不会清空 rollout buffer，也不会触发一次 PPO 更新。下一回合的数据继续存入这同一批，直到每个环境都采样满 1024 步。</p>',
      '<p>4 个环境各 1024 条样本，总计 4096 条。一个 rollout 可以含很多短 episode，也可以在某个 episode 中间截止。</p><p>时间线橙色竖线表示 episode 结束；密集标记会抽稀显示，次数按完整数据统计。</p>',
      `<p>这一轮最后四个 done 标记为 <strong>[${run().last_dones.map(x=>x?'true':'false').join(', ')}]</strong>。没有结束的环境保留状态，训练后继续。</p><p>对未终止末状态估值以 bootstrap；不会为了进入网络更新而统一 reset。</p>`
    ];explain(titles[step],texts[step],'reset 改变的是对应环境状态；rollout 是否采满由独立计数器决定。');
  }else{
    const f=D.timeout_fixture[1];
    $('scene').innerHTML=`<span class="tag orange">单独的真实教学案例 · TimeLimit = 2</span>`+pendulum(step===6?f.next_obs:f.returned_obs,'fixture',step===6?'时间到：仍健康的最后状态':'自动 reset 后的新状态',false,true)+flow([['raw reward',fmt(f.reward,0)],['末状态 value',fmt(f.terminal_value)],['buffer reward',fmt(f.buffer_reward)]],step===6?1:2)+`<div class="focus-strip">terminated = false · truncated = true<br>补值后切断跨 episode 的 GAE 链。</div>`;
    explain('时间到了，不等于任务失败',`<p>这个独立案例把上限改为 2 步。摆角仍在健康范围内，却因时间上限结束；原训练环境上限仍为 1000 步。</p><p>SB3 用<strong>截断前末状态</strong>估计后续价值 ${fmt(f.terminal_value)}，把折扣后的值加到奖励，再停止跨回合的优势递推。</p><p>原始奖励 ${fmt(f.reward)}；存入 buffer 的奖励为 ${fmt(f.buffer_reward)}。不会用 reset 后状态补值。</p>`,'真终止不补未来价值；纯时间截断补末状态价值，再切断回合。',String.raw`r_t^{\mathrm{buffer}}=r_t+0.99\,V(s_{\mathrm{terminal}})`);
  }
  setStage('观察 episode 与 rollout 两条时间线',step>=6?'显式修改的 TimeLimit 案例':'真实 episode / reset','橙色表示 episode 边界；绿条表示本轮采样量。两者不是同一个计数器。');
  internalCode(['obs, reward, terminated, truncated, info = env.step(action)','done = terminated or truncated','if done:','    info["terminal_observation"] = obs','    obs, reset_info = env.reset()','if truncated and not terminated:','    reward += gamma * V(info["terminal_observation"])'],step>=6?6:step===1?3:step===2?4:0,'SB3 · DummyVecEnv + collect_rollouts');
}
function clipChart(){const positive=clipSign===1;return `<div class="clip-demo"><div class="clip-options"><button type="button" data-clip="1" class="${positive?'selected':''}">正优势示意</button><button type="button" data-clip="-1" class="${!positive?'selected':''}">负优势示意</button><span class="tag muted">机制示意 · 非真实样本</span></div><svg class="clip-chart" viewBox="0 0 400 115" role="img" aria-label="PPO clipping 的分段目标函数，横轴概率比，纵轴待最大化目标"><rect x="154" y="8" width="96" height="80" fill="#e8f3ed"/><line x1="34" y1="88" x2="372" y2="88" stroke="#aabbaf"/><line x1="34" y1="8" x2="34" y2="88" stroke="#aabbaf"/><path d="${positive?'M 34 75 L 250 21 L 370 21':'M 34 20 L 154 20 L 370 74'}" fill="none" stroke="#087e72" stroke-width="3"/><path d="${positive?'M 250 21 L 370 -9':'M 34 -10 L 154 20'}" stroke="#92aaa0" stroke-dasharray="4 4" fill="none"/><text x="144" y="104" font-size="10" fill="#62737a">0.8</text><text x="193" y="104" font-size="10" fill="#62737a">1.0</text><text x="241" y="104" font-size="10" fill="#62737a">1.2</text><text x="305" y="104" font-size="10" fill="#62737a">概率比 →</text><text x="43" y="16" font-size="10" fill="#62737a">目标 ↑</text></svg><p class="tiny-info">${positive?'正优势：概率比超过 1.2 后，不再奖励继续增大。':'负优势：概率比低于 0.8 后，不再奖励继续减小。'} 这限制的是目标函数激励，并非把实际概率比强制截断。</p></div>`;}
function batchBoard(epoch,active=-1,finished=false){
  const s=sample(),where=s.uses[epoch][0]%16;
  return `<div class="batch-board">${Array.from({length:16},(_,i)=>`<button type="button" data-batch="${epoch*16+i}" class="batch-bin ${i===active?'active':''} ${finished?'finished':''} ${where===i?'selected-bin':''}" aria-label="第 ${epoch+1} 轮，第 ${i+1} 批，256 条样本"><span>第 ${String(i+1).padStart(2,'0')} 批</span><strong>256 条</strong>${where===i?`<small class="tracked-token" data-sample-key="${rollout}-${s.id}">T${s.t} · E${s.env+1}</small>`:'<small>独立的一组样本</small>'}</button>`).join('')}</div>`;
}
function reuseRibbon(activeEpoch=-1){
  const s=sample();return `<div class="reuse-ribbon">${s.uses.map((u,i)=>`<button type="button" data-use="${u[0]}" class="${i===activeEpoch?'active':''}" aria-label="追踪样本第 ${i+1} 遍的使用"><span>第 ${i+1} 遍</span><b>第 ${u[0]%16+1} 批</b><small>用 1 次</small></button>`).join('')}</div>`;
}
function syncTraining(){
  lessonTrace=L.trace(D,rollout,sample());
  trainingFrames=[{key:'dataset',kind:'dataset'},{key:'terms',kind:'terms'},{key:'trace-intro',kind:'trace-intro'},
    ...lessonTrace.rows.map((_,i)=>({key:'trace:'+i,kind:'trace',index:lessonTrace.rows.length-1-i})),
    {key:'compare',kind:'compare'},{key:'derive',kind:'derive'},{key:'roles',kind:'roles'},
    ...Array.from({length:10},(_,i)=>({key:'usage:'+i,kind:'usage',index:i})),
    {key:'split',kind:'split'},{key:'epoch',kind:'epoch'},{key:'reshuffle',kind:'reshuffle'}];
  TRAIN_OFFSET=trainingFrames.length;chapters[TRAIN].steps=TRAIN_OFFSET+161;
}
function learningGo(key){syncTraining();const i=key==='train'?TRAIN_OFFSET:trainingFrames.findIndex(x=>x.key===key);if(i>=0)go(TRAIN,i);}
function renderTrainingNav(){
  $('training-nav').hidden=chapter!==TRAIN;
  if(chapter!==TRAIN)return;
  const k=trainingFrames[step]?.kind;
  const active=['dataset','terms'].includes(k)?0:['trace-intro','trace','compare','derive'].includes(k)?1:['roles','usage'].includes(k)?2:['split','epoch','reshuffle'].includes(k)?3:4;
  $('training-nav').innerHTML=[['认识四个量','terms'],['Return 从哪来','trace-intro'],['分别学什么','roles'],['分批学十遍','split'],['160 次更新','train']].map(([label,key],i)=>`<button type="button" data-lesson-go="${key}" class="${i===active?'active':''}">${label}</button>`).join('');
}
function renderLessonMath(){document.querySelectorAll('[data-lesson-math]').forEach(el=>katex.render(el.dataset.lessonMath,el,{displayMode:true,throwOnError:true}));}
function lessonToolbar(){return `<div class="lesson-toolbar"><span class="tag real">${sid()}</span><button type="button" data-example-return>回到 5.889 示例</button><button type="button" data-select-sample>换一条样本 ↗</button></div>`;}
function traceTable(activeIndex){
  const rows=lessonTrace.rows,n=rows.length;
  const center=activeIndex<0?0:activeIndex,start=Math.max(0,Math.min(n-9,center-4)),end=Math.min(n,start+9);
  return `<p class="mini-label">同一环境、同一回合 · 从所选样本到本次可用边界，共 ${n} 条 · 从下往上倒推${n>9?'（窗口跟随当前行）':''}</p><div class="trace-table-wrap"><table class="trace-table"><thead><tr><th>状态 / 采样步</th><th>reward</th><th>旧 value</th><th>return 目标</th></tr></thead><tbody>${start>0?`<tr><td colspan="4">前面还有 ${start} 条，继续倒推时展开</td></tr>`:''}${rows.slice(start,end).map((r,i)=>{const idx=start+i,known=activeIndex>=0&&idx>=activeIndex;return `<tr data-trace-row="${idx}" class="${idx===activeIndex?'active':known?'computed':''}"><td><button type="button" data-trace-index="${idx}" aria-label="倒推到采样步 ${r.s.t}">s${r.s.t} ${r.s.done?'· 结束':''}</button></td><td>${r.s.reward}</td><td>${fmt(r.s.old_value,5)}</td><td data-return-cell>${known?fmt(r.s.return,5):'待倒推'}</td></tr>`;}).join('')}${end<n?`<tr><td colspan="4">后面还有 ${n-end} 条，点击“从末端开始”查看</td></tr>`:''}</tbody></table></div>`;
}
function renderLearningFrame(frame){
 const s=sample(),tr=lessonTrace,n=tr.rows.length,eq=L.equation;
 let html='',codeActive=0;
 const boundaryText={terminal:'真正终止 · 后续价值为零',timeout:'时间截断 · 用末状态补值',rollout:'rollout 收满 · 回合尚未结束'}[tr.boundary];
 if(frame.kind==='dataset'){
  html=`<div class="dataset-stack"><div class="dataset-total"><strong>4096</strong><span>同一批已采集的经历</span></div><div class="dataset-envs">${[1,2,3,4].map(e=>`<div><b>Env ${e}</b><span>1024 条</span></div>`).join('')}</div></div>`+flow([['固定经历','环境暂停'],['算学习目标','按时间倒推'],['打乱分批','完整学十遍']],0);
  explain('先固定经历，再准备学习目标','<p>现在已有 4096 条交互，仿真器暂停推进。先沿各环境的时间顺序计算优势和 return，遇到回合边界就切断。</p><p>目标算完后，才打乱数据、分成 minibatch 并更新网络。下面先跟着一条样本，弄清它给网络提供什么学习信号。</p>','先算目标，再打乱；同一批数据里的每条样本都有自己的目标。');
  setStage('收满一批后的第一件事','环境暂停','下面的计算与动画只读取已保存的真实记录，不运行仿真或重新训练。');
 }else if(frame.kind==='terms'){
  html=lessonToolbar()+L.terms(s)+`<div class="focus-strip">同一条经历，四种不同的量。<br>先预测、再收集反馈、最后构造训练目标。</div><div class="scene-buttons"><button type="button" data-lesson-go="trace-intro">这个 ${fmt(s.return)} 是怎么算出的？ →</button></div>`;
  explain('先分清：反馈、预测、修正量、目标',`<p><strong>reward</strong> 是环境本步给的 ${s.reward}；<strong>旧 value</strong> 是采样时 Critic 的预测 ${fmt(s.old_value)}。</p><p>收集后续经历后，GAE 算出<strong>原始 Advantage</strong> ${fmt(s.advantage)}；加回旧预测，构成 <strong>Return 目标</strong> ${fmt(s.return)}。</p><p>原始优势提供相对旧预测的修正量；return 明确 Critic 最终应向哪个数值拟合。</p>`,'这些数不必相等。先看它们怎样从真实轨迹中算出来。',String.raw`R_t^{\mathrm{target}}=A_t^{\mathrm{GAE}}+V_{\mathrm{old}}(s_t)`);
  setStage('同一条样本的四个量','真实数据','这里的 Advantage 是标准化之前的值；return 使用原始优势构造。');
 }else if(frame.kind==='trace-intro'||frame.kind==='trace'){
  const idx=frame.kind==='trace' ? frame.index : -1,r=idx>=0?tr.rows[idx]:null;
  html=lessonToolbar()+`<div class="boundary-badge">${boundaryText}${tr.boundary==='rollout'?` · 边界 value ${fmt(tr.bootstrap,5)}`:''}</div>`+traceTable(idx);
  if(r){
   const x=r.s;
   html+=`<div class="calc-heading"><b>正在计算 s${x.t} 的目标</b><span>${n-idx} / ${n} 条已倒推</span></div><div class="calc-inputs"><div><span>${x.truncated?'补值后的 buffer reward':'本步 reward'}</span><b>${fmt(x.buffer_reward,5)}</b></div>${r.mask?`<div><span>下一状态旧 value</span><b>${fmt(r.nextV,5)}</b></div><div><span>${idx===n-1?'边界初始化的 return':'后面已算出的 return'}</span><b>${fmt(r.nextR,5)}</b></div>`:`<div class="no-future"><span>回合边界</span><b>切断后续项</b></div>`}</div><div class="computed-result" data-computed-result="${x.return}"><span>这条样本的 return</span><strong>${fmt(x.return,5)}</strong></div><details class="trace-calculation"><summary>展开本步数字代入</summary>${eq(r.mask?String.raw`R_{${x.t}}=${fmt(x.buffer_reward,5)}+0.99[0.05\times(${fmt(r.nextV,5)})+0.95\times(${fmt(r.nextR,5)})]\approx${fmt(x.return,5)}`:String.raw`R_{${x.t}}=r_{${x.t}}^{\mathrm{buffer}}=${fmt(x.buffer_reward,5)}`)}<p class="tiny-info">显示数值有舍入；原记录由 float32 GAE 计算，倒推重算的末位可能有微小差异。</p></details>`;
   explain(idx===0?`倒推到所选样本：${fmt(s.return)}`:`从末端往前：正在算 s${x.t}`,r.mask?`<p>本步真实奖励是 ${x.reward}。取下一状态的旧预测 ${fmt(r.nextV,5)}，以及后面已经得到的 return ${fmt(r.nextR,5)}。</p><p>按 λ 为 0.95 混合，再乘折扣 0.99，加上本步奖励，得到 ${fmt(x.return,5)}。继续往前，就把后续经历的影响传给更早的样本。</p>`:x.truncated?'<p>这里是时间截断。先用终止前末状态的 value 补入奖励，再把后续项切断。reset 后的新状态和新回合奖励不参与这条目标。</p>':'<p>这一步任务真正终止，后续价值为零。因此本条 return 就是本步奖励。先确定最后一个目标，再逐步向前倒推。</p>',idx===0?'这就是页面上这个 return 的来源；不是把所有奖励直接相加。':'每次向前一格，只使用当前奖励、旧预测和后面已算出的目标。');
  }else{
   html+=`<div class="scene-buttons"><button type="button" data-lesson-go="trace:0">从末端开始倒推 →</button><button type="button" data-lesson-go="compare">直接看结果比较</button></div>`;
   explain('先看后面发生了什么，再往前算',`<p>当前样本来自 ${sid(s)}。从它开始，沿同一个环境向后取 ${n} 条记录，直到${tr.boundary==='rollout'?'rollout 收满':'本回合结束'}。</p><p>每一行都是一次已执行动作的经历。倒推时，从最后一行开始，逐步算出每个状态的 return；点击“播放”或“下一步”查看。</p><p>${tr.boundary==='rollout'?`这里采样批次在回合中途结束，要用末观测的旧 value ${fmt(tr.bootstrap,5)} 补值。`:tr.boundary==='timeout'?'这里是时间截断，要用 reset 前的末状态补值，再切断跨回合递推。':'这里以真正终止结束，最后一步之后的价值为零；不会接到 reset 后的新回合。'}</p>`,'倒推保留时间顺序；此时还没有打乱样本。');
  }
  html+=L.boundaryHTML(D,tr);
  setStage('真实奖励 + 旧预测 → 每步训练目标',boundaryText,'状态编号使用本 rollout 的采样步；只沿同一环境递推，不跨 reset 连接新回合。');
 }else if(frame.kind==='compare'){
  const complete=tr.boundary==='terminal'&&s.episode_step===0;
  html=lessonToolbar()+`<div class="return-comparison"><div><span>${complete?'本回合':'这段已观测经历的'}奖励和</span><b>${fmt(tr.rawSum,0)}</b><small>只加环境 reward</small></div><div><span>已观测奖励的折扣和</span><b>${fmt(tr.discountSum)}</b><small>按 0.99 打折再相加</small></div><div class="target"><span>本次 Return 目标</span><b>${fmt(s.return)}</b><small>GAE 对应的 λ-return</small></div></div><div class="focus-strip">λ 为 0.95，目标混合了多步真实奖励与旧 Critic 估计。<br>${tr.boundary!=='terminal'?'前两个数仅统计已观察的奖励；第三个数还包含边界价值补偿。':'因此 Return 与实际奖励和、单纯折扣奖励和是不同的量。'}</div><div class="scene-buttons"><button type="button" data-lesson-go="derive">与我学过的 GAE 有什么关系？ →</button></div>`;
  explain(`为什么是 ${fmt(s.return)}，而不是 ${fmt(tr.rawSum,0)}？`,`<p>左边只统计${complete?'这个完整回合':'从当前样本到采样边界这段经历'}的环境奖励；中间给越远的奖励乘越多次 0.99。</p><p>右边是本脚本真正用来训练 Critic 的 <strong>λ-return</strong>，由 GAE 优势加回旧 value 得到。λ 为 0.95 时，它还混合沿途旧 Critic 的估计。</p><p>${complete?'在这个完整且真正终止的回合中，若 λ 改为 1，目标才会退化为单纯的折扣奖励和。':'这段不一定是完整回合，不能将已观测奖励和当成完整未来回报。'}</p>`,'三个量回答不同问题。训练 Critic 使用的是右侧这个固定目标。');
  setStage('把容易混淆的三个数放在一起','真实数据比较','截图中的 7、6.793、5.889 来自第一条样本；更换样本后，这里同步显示对应记录。');
 }else if(frame.kind==='derive'){
  html=lessonToolbar()+`<div class="derive-intro"><span class="eyebrow">同一套 GAE，两种递推写法</span><h3>从优势 A，走到目标 R</h3><p>你学过的优势递推没有变。下面把它一步步改写成刚才倒推用的 return 递推。</p></div><details id="derive-details" class="derive-details"><summary>展开逐步公式推导 <span>代入 → 抵消 → 替换 → 合并</span></summary><div id="derive-content">${L.derivationHTML(deriveStep)}</div></details>`+L.boundaryHTML(D,tr);
  explain('0.05 来自哪里？','<p>它就是 <strong>1 − λ</strong>；λ 为 0.95，所以余下权重是 0.05，并没有额外设置一个新参数。</p><p>实现先计算 GAE 优势，再加回旧 value 得到 return；为了看清数字来源，动画使用代数等价的 return 递推。</p><p>展开左侧公式，按 1 → 5 逐步看每一次替换。</p>','这两种写法计算的是同一个目标。');
  setStage('把新公式接回你学过的 GAE','可展开推导','所有 V 都是采样时保存的旧预测；所有 A 都是尚未标准化的原始 GAE。');
 }else if(frame.kind==='roles'||frame.kind==='usage'){
  const i=frame.kind==='usage'?frame.index:0,u=s.uses[i],current=u[2],error=s.return-current;
  html=lessonToolbar()+`<div class="network-input">同一状态分别送入 Actor / Critic</div><div class="learning-branches"><div><span class="branch-name">Actor · 学怎样行动</span><b>相对预期，好多少？</b><p>原始优势 ${fmt(s.advantage)}<br>→ minibatch 内标准化<br>→ 评估保存的动作，用概率比与 clipping 计算损失</p>${frame.kind==='usage'?`<div class="branch-live"><span>本次标准化优势</span><strong>${fmt(u[3],5)}</strong><span>本次动作概率密度比</span><strong>${fmt(u[4],5)}</strong></div>`:''}</div><div><span class="branch-name">Critic · 学怎样预测</span><b>应该预测到多少？</b><p>旧 value ${fmt(s.old_value)}<br>原始优势 ${fmt(s.advantage)}<br>→ 固定 Return ${fmt(s.return)}</p>${frame.kind==='usage'?`<div class="branch-live"><span>本次当前 value</span><strong data-current-value>${fmt(current,5)}</strong><span>目标减去当前预测</span><strong data-current-error>${fmt(error,5)}</strong></div>`:''}</div></div>`;
  if(frame.kind==='usage'){
   const lo=Math.min(0,s.old_value,s.return,...s.uses.map(x=>x[2]))-.1,hi=Math.max(s.old_value,s.return,...s.uses.map(x=>x[2]))+.1,pc=x=>100*(x-lo)/(hi-lo);
   html+=`<div class="prediction-plot" role="img" aria-label="固定目标 ${fmt(s.return,5)}，当前预测 ${fmt(current,5)}"><span class="target-marker" style="left:${pc(s.return)}%"></span><span class="prediction-marker" style="left:${pc(current)}%"></span></div><div class="plot-legend"><span>● 当前预测 ${fmt(current)}</span><span>│ 固定目标 ${fmt(s.return)}</span></div><div class="usage-nav">${s.uses.map((_,j)=>`<button type="button" data-lesson-go="usage:${j}" class="${j===i?'active':''}" aria-label="第 ${j+1} 次使用">${j+1}</button>`).join('')}</div><p class="tiny-info">第 ${i+1} 次使用 · epoch ${i+1} / 第 ${u[0]%16+1} 批 · 真实前向计算，发生在该批优化器更新之前。</p><div class="scene-buttons"><button type="button" data-use="${u[0]}">定位这次使用的 minibatch ↗</button></div>`;
   explain(`第 ${i+1} 次用它训练：目标仍是 ${fmt(s.return)}`,`<p>当前 Critic 对这个状态的预测是 <strong>${fmt(current,5)}</strong>，固定目标为 <strong>${fmt(s.return,5)}</strong>，二者的差是 ${fmt(error,5)}。</p><p>原始 Advantage 仍是 ${fmt(s.advantage,5)}，它描述相对<strong>采样时旧预测</strong>的差异。Actor 使用的标准化优势可能因同批样本变化而改变。</p><p>点击播放，查看这条样本十次参与计算的记录。网络同时拟合许多样本，单条误差不保证每次下降。</p>`,'当前预测会变；采样时旧 value、原始优势与 Return 目标不变。',String.raw`L_V=\left[V_\theta(s_t)-R_t^{\mathrm{target}}\right]^2`);
   setStage('同一条样本 · 十次真实训练使用',`第 ${i+1} / 10 次`,'这里按样本的十次使用跳看；中间还有其他 minibatch 的网络更新，环境始终暂停推进。');
  }else{
   html+=`<details class="why-return"><summary>为什么不直接拿 Advantage 当目标？</summary><p>优势是相对旧预测的修正量。旧预测为 100、优势为 +5 时，价值目标应是 105。Return 没有增加独立新信息，而是把“预测到多少”明确写出来。</p>${eq(String.raw`R_t=A_t+V_{\mathrm{old}}(s_t)`)}<p>也可以用 Advantage 改写 Critic 损失，但仍要保留旧预测作为参照。两种损失完全等价：</p>${eq(String.raw`\begin{aligned}L_V&=[V_\theta(s_t)-R_t]^2\\ &=[V_\theta(s_t)-V_{\mathrm{old}}(s_t)-A_t]^2\end{aligned}`)}<p>原始优势和旧预测在这批更新中都是常量；梯度来自当前预测。只对存好的优势平方，无法让 Critic 得到参数梯度。</p></details><div class="scene-buttons"><button type="button" data-lesson-go="usage:0">看这条样本的十次真实使用 →</button></div>`;
   explain('有了 Advantage，为什么还要 Return？','<p><strong>Actor</strong> 利用相对表现调整动作概率；实际计算前还会对原始优势做 minibatch 标准化。</p><p><strong>Critic</strong> 需要一个绝对预测目标。优势说“在旧预测基础上修正多少”，加回旧预测，才得到“应当预测到多少”。</p><p>Return 没有增加一份独立的新信息，它只是把学习目标写得清楚。展开左侧解释，可以看到两种完全等价的损失写法。</p>','一个提供相对修正量，一个给出绝对预测目标；它们来自同一份经历。');
   setStage('同一条经历，进入两条学习路径','Actor 与 Critic','这里先解释职责；接下来用真实训练记录查看当前输出怎样变化。');
  }
  codeActive=3;
 }else{
  const p=frame.kind==='split'?1:frame.kind==='epoch'?2:3,e=p===3?1:0;
  html=lessonToolbar()+`<span class="tag muted">目标已经算好 · 用真实分组预览规则</span>`+batchBoard(e,-1,p===2)+`<div class="focus-strip"><strong>${sid(s)}</strong>：第 1 遍在第 ${s.uses[0][0]%16+1} 批，第 2 遍在第 ${s.uses[1][0]%16+1} 批。<br>样本、旧预测和目标固定，分组与处理顺序可变。</div>`+(p===3?reuseRibbon(1):flow([['4096 条','完整数据'],['16 个小批','每批 256 条'],['一整遍','一个 epoch']],p===1?1:2));
  const title=p===1?'打乱 4096 条，再切成 16 份':p===2?'16 个小批全用完，才是一遍':'下一遍，重新打乱同一批数据';
  const body=p===1?'<p><strong>minibatch</strong> 是一次梯度更新使用的小份数据。这 4096 条先随机打乱，再按 256 条切成 16 份。</p><p>同一遍中各份互不重复，合起来覆盖所有样本；不是每次独立有放回抽 256 条。每处理一个小批，就更新一次网络。</p>':p===2?'<p><strong>epoch</strong> 是把整批训练数据完整用一遍。16 个 minibatch 依次用完，每条样本就参与了一次计算。</p><p>一个 epoch 有 16 次优化器更新；一个 256 条的小批本身不是一遍。</p>':'<p>第 2 个 epoch 重新打乱的仍是同一批 4096 条，再分成 16 个小批。一直重复到第 10 遍。</p><p><strong>每条样本恰好参与十次，共 160 次优化器更新。</strong>不是固定同一个 256 条小批连续跑十遍。</p><p>GAE 与 return 早已按时间顺序算好，打乱不会改变它们；minibatch 内的优势标准化会重新计算。</p>';
  explain(title,body,p===3?'每条样本用十次，每次面对的网络参数可能不同。':'算目标时保留时间顺序；训练时才打乱分组。');
  setStage('准备完整回放 160 次更新',`第 ${e+1} 遍分组预览`,'格子表示 256 条完整样本；金色标记跟踪当前样本。预览不产生新的网络更新。');codeActive=2;
 }
 $('scene').innerHTML=html;
 internalCode(['advantages = compute_GAE_in_time_order(rollout)','returns = advantages + old_values','for batch in shuffled_minibatches(rollout):','    current_values, log_probs = evaluate_saved_actions(batch)','    actor_loss = PPO_loss(normalize(batch.advantages), log_probs)','    critic_loss = mean((current_values - batch.returns) ** 2)','    optimizer.zero_grad(); loss.backward(); optimizer.step()'],codeActive,'SB3 · 从经历构造目标，再更新网络');
}

function renderTraining(){
  const s=sample(),b=currentBatch(),epoch=b<0?0:Math.floor(b/16),batch=b<0?0:b%16;
  if(step<TRAIN_OFFSET){renderLearningFrame(trainingFrames[step]);return;}
  {
    const batchData=run().batches[b],use=s.uses.find(u=>u[0]===b),previous=s.uses.filter(u=>u[0]<=b).at(-1),used=s.uses.filter(u=>u[0]<=b).length;
    $('scene').innerHTML=`<div class="batch-stats"><span>同一整批数据<b>4096 条</b></span><span>当前完整遍历<b>第 ${epoch+1} / 10 遍</b></span><span>已完成网络更新<b>${b+1} / 160</b></span></div><div class="epoch-row">${Array.from({length:10},(_,i)=>`<button type="button" class="epoch-btn ${i===epoch?'active':i<epoch?'visited':''}" data-epoch="${i}" aria-label="跳到 epoch ${i+1}">${i+1}</button>`).join('')}</div><div class="mini-label">当前第 ${epoch+1} 遍：每格 256 条，16 格合起来是全部 4096 条。金线标出所选样本。</div><div class="batch-grid">${Array.from({length:16},(_,i)=>`<button type="button" data-batch="${epoch*16+i}" class="batch-button ${i===batch?'active':''} ${i<batch?'past':''} ${s.uses[epoch][0]%16===i?'contains':''}" aria-label="第 ${epoch+1} 轮，第 ${i+1} 批">${String(i+1).padStart(2,'0')}</button>`).join('')}</div><div class="focus-strip ${use?'':'waiting'}"><strong>${sid(s)}</strong> · ${use?'本批正在使用这条样本':'所选样本不在当前批次'}<br>已参与 ${used} / 10 次损失计算${previous?` · 最近概率比 ${fmt(previous[4])} · value ${fmt(previous[2])}`:''}</div><div class="scene-buttons"><button type="button" data-open-sample>查看这条样本的十次使用 ↗</button></div><details class="batch-detail"><summary>查看本批损失与 clipping <span>可选的计算细节</span></summary><div class="batch-stats"><span>策略 loss<b>${fmt(batchData.policy_loss)}</b></span><span>value MSE<b>${fmt(batchData.value_loss)}</b></span><span>超出裁剪区间<b>${fmt(batchData.clip_fraction*100,1)}%</b></span></div>${clipChart()}</details>`;
    if(step===TRAIN_OFFSET+160)explain('完整十遍结束，准备换新数据','<p>这一批已经完成 <strong>160 次优化器更新，每条样本各参与 10 次损失计算</strong>。网络参数改变了，保存的采样经历和目标没有被重写。</p><p>接下来清空活动 rollout 缓冲区，用新策略收集新经历。网页保留旧记录用于回看；实际 PPO 不把所有历史批次长期混在一起训练。</p>','下一章让世界重新动起来：更新完网络后，策略要再次与环境交互。');
    else explain(`第 ${epoch+1} 遍 · 第 ${batch+1} 个 minibatch`, `<p>把本批 256 条样本的状态输入当前网络，重新评估<strong>当时已执行的动作</strong>。然后计算损失、反向传播，更新一次参数。</p><p>处理完当前批次再去下一批；第 16 批结束后才完成一个 epoch，然后重新打乱全部数据。</p><p>旧动作与旧 log probability 保留不变；当前网络的动作概率和 value 会改变。网络同时拟合很多样本，单条损失不保证逐次下降。</p>`,use?'同一条样本再次被用到时，面对的已经是更新后的网络。':'这里重复使用经历，不会在仿真器里重复执行当时的动作。',String.raw`\begin{aligned}\rho_t&=\exp(\log\pi_\theta-\log\pi_{\mathrm{old}})\\ L_\pi&=-\operatorname{mean}\!\left[\min\!\left(\rho_t\hat A_t,\operatorname{clip}(\rho_t,0.8,1.2)\hat A_t\right)\right]\end{aligned}`);
    setStage(`Rollout ${rollout+1} · 真实逐批训练记录`,'仿真暂停 · 网络在更新','表中的损失来自本批优化前的前向计算；“已完成网络更新”表示该批优化器 step 已执行。');
  }
  internalCode(['advantages, returns = compute_GAE_in_time_order(rollout)','for epoch in range(10):','    shuffled = shuffle(all_4096_samples)','    for batch in split(shuffled, size=256):','        values, log_probs = evaluate_saved_actions(batch)','        loss = clipped_policy_loss + 0.5 * value_mse','        optimizer.zero_grad(); loss.backward(); optimizer.step()'],6,'SB3 · 训练顺序的逻辑摘编');
}
function renderContinue(){
  const before=D.rollouts[0].last_obs,after=D.rollouts[1].initial_obs;
  const s=D.rollouts[1].samples[env];
  $('scene').innerHTML=flow([['旧 rollout','4096 条 · 已学 10 遍'],['参数已更新','π₀ → π₁'],['新 rollout','重新收集经历']],Math.min(step,2))+`<div class="sim-grid">${[0,1,2,3].map(e=>pendulum(step<2?before[e]:step===2?after[e]:D.rollouts[1].samples[e].next_obs,`e${e}`,`Env ${e+1} · ${step<2?'更新期间保留状态':step===2?'新采样起点':'新策略的第一步'}`,step>=3&&D.rollouts[1].samples[e].done)).join('')}</div><div class="value-strip"><span>旧 buffer<b>${step<2?'4096':'清空'}</b></span><span>新 buffer<b>${step<2?'—':step===2?'0':'4'} 条</b></span><span>网络参数<b>已更新</b></span></div>`;
  const titles=['优化期间，世界停在这里','网络变了，物理状态没有变','新 rollout 从同一个状态接着走','新动作，才产生新样本','评估只执行策略，不更新网络'];
  const texts=[
    '<p>这里展示真实记录中 Rollout 1 最后保存的四个状态。160 次优化器更新期间，MuJoCo 的位置、速度、时间都保持不变。</p>',
    '<p>记录器比较了优化前后的网络参数哈希：参数发生变化；同时比较仿真状态与最后观测：完全一致。</p><p>数据被重复训练，物理动作没有被重复执行。</p>',
    '<p>Rollout 2 的第一条观测与 Rollout 1 结束时返回的观测一致。没有结束的 episode 继续；恰好结束的环境此前已经自动 reset。</p><p>清空的是 rollout buffer，而不是模拟器和网络。</p>',
    `<p>新策略在 Env ${env+1} 的第一条采样动作是 ${fmt(s.action)}，再由环境执行一次。现在才增加新一批样本。</p><p>新 rollout 保存的是新采样策略的 log probability。上轮的数据不再与这轮混在一起优化。</p>`,
    '<p>原脚本 evaluate() 加载已保存模型，在单环境中使用 <code>deterministic=True</code>，连续动作通常取分布均值；不做 PPO 梯度更新。</p><p>评估先从 +10°、再从 −10° 各跑一个完整 episode；每次显式 reset 指定角度，两侧使用相同 seed 保持小车起点一致。<code>time.sleep(delay)</code> 只延迟播放，不改变环境一步的 0.04 秒。</p><p>图中仍是短程训练记录，不是已训练完成模型的评估结果。</p>'
  ];explain(titles[step],texts[step],'采样 → 用同一批学 10 遍 → 换新数据。episode 可以跨越相邻两轮 rollout。');
  setStage('真实连接：Rollout 1 → Rollout 2',step===4?'评估机制说明':'边界状态一致','本章固定比较记录中的第 1、2 个 rollout；下方护照仍可独立查看你选中的样本。');
  if(step===4)originalCode(['model = PPO.load','obs, _ = env.reset(seed=1, options=','action, _ = model.predict','obs, reward, terminated, truncated, _ = env.step','time.sleep(delay)','if terminated or truncated:','for initial_angle in (INITIAL_ANGLE, -INITIAL_ANGLE):'],3);
  else internalCode(['while num_timesteps < total_timesteps:','    rollout_buffer.reset()  # 清空样本，不 reset 环境','    collect_rollouts()     # 用当前策略收新数据','    compute_returns_and_advantage()','    train()                # 同一批数据，10 个 epoch','# last_obs、模拟器状态沿用到下一轮'],step<2?4:step===2?1:2,'SB3 · learn 主循环');
}
function renderEvaluationTick(){
  C.update(evalPair,step,evalRange);
  $('seek').value=step;$('step-label').textContent=step+' / '+C.maxStep(evalPair)+' 步';
  $('prev').disabled=step===0;$('next').disabled=step===chapters[RESULT].steps-1;
}
function renderEvaluation(){
  const p=C.pair(evalPair);C.mount($('scene'),evalPair,evalRange);renderEvaluationTick();
  explain('同样的起点，学到不同的动作',
    '<p>左侧是这次独立训练保存的初始策略，右侧是经过 <strong>'+C.data.meta.actual_steps.toLocaleString('en-US')+' 步</strong>训练的策略。两边都使用确定性动作，评估时不更新网络。</p><p>当前测试从 <strong>'+ (p.angle_deg>0?'+':'')+p.angle_deg+'°</strong>、相同小车位置和零速度出发；测试种子为 '+p.seed+'。一边失败后冻结，另一边继续，彼此不会自动 reset。</p><p>本次配对记录：训练前 '+p.before.steps+' 步、'+fmt(p.before.seconds,2)+' 秒；训练后 '+p.after.steps+' 步、'+fmt(p.after.seconds,2)+' 秒。下方列出全部 20 对测试结果。</p><p>使用“慢看起步”观察最初几次动作；使用“到测试末尾”查看完整结果。</p>',
    'PPO 学习的是怎样选择动作。是否变好，要回到相同条件下的环境交互中检验。');
  setStage('独立完整训练 · 真实配对评估','初始模型 vs 最终模型','SVG 用真实 MuJoCo 状态回放，不是浏览器仿真。每次前进一帧对应一个真实环境步；同一倍速下两侧同步。');
  $('evidence-tag').textContent='真实训练前后 · 同条件对比';
  internalCode(['before = PPO.load("before.zip", device="cpu")','after = PPO.load("after.zip", device="cpu")','obs, _ = env.reset(seed=test_seed, options={"initial_angle": angle})','action, _ = model.predict(obs, deterministic=True)','obs, reward, terminated, truncated, _ = env.step(action)','if terminated or truncated: break'],step===0?2:4,'train_comparison.py · 配对评估逻辑');
  $('code-note').textContent='独立记录脚本的逻辑摘编。训练前后分别运行一次完整回合；网页只同步回放记录。';
}
function chooseEval(i){pause();evalPair=i;step=0;chapter=RESULT;render();}
document.addEventListener('change',e=>{if(e.target.id==='eval-seed'){const p=C.pair(evalPair);chooseEval(C.data.pairs.findIndex(x=>x.angle_deg===p.angle_deg&&x.seed===Number(e.target.value)));}});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.evalAngle!==undefined)chooseEval(C.data.pairs.findIndex(x=>x.seed===C.pair(evalPair).seed&&x.angle_deg===Number(b.dataset.evalAngle)));
  if(b.dataset.evalPair!==undefined)chooseEval(Number(b.dataset.evalPair));
  if(b.dataset.evalJump!==undefined)go(RESULT,Number(b.dataset.evalJump));
  if(b.dataset.evalRange!==undefined){pause();evalRange=Number(b.dataset.evalRange);render();}
  if(b.dataset.evalSlow!==undefined){go(RESULT,0);speed=.1;$('speed').value='0.1';evalRange=1;play();}
});

function renderPassport(){
  const s=sample(),isTrain=chapter===TRAIN&&step>=TRAIN_OFFSET, b=isTrain?currentBatch():-1;
  $('rollout-select').value=rollout;$('env-select').value=env;$('sample-time').value=time;
  const fields=[['观测 s（x, θ, ẋ, θ̇）',s.obs.map(x=>fmt(x,4)).join(' · '),'单位 m / rad / m·s⁻¹ / rad·s⁻¹'],['采样动作 → 执行动作',`${fmt(s.action)} → ${fmt(s.executed_action)}`,'训练仍评估原始采样动作'],['环境 reward → buffer reward',`${fmt(s.reward)} → ${fmt(s.buffer_reward)}`,'纯时间截断时 buffer reward 会补值'],['旧 log probability',fmt(s.old_log_prob,5),'这 10 遍中保持不变'],['采样时 value',fmt(s.old_value,5),'Critic 的旧预测'],['原始 GAE 优势',fmt(s.advantage,5),'固定；每批再单独标准化'],['return 训练目标',fmt(s.return,5),'固定；不是最后一次 reward'],['下一状态角度 → 返回观测角度',`${fmt(deg(s.next_obs[1]),2)}° → ${fmt(deg(s.returned_obs[1]),2)}°`,s.done?'前者是末状态；后者已 reset':'未结束时两者相同']];
  $('passport').innerHTML=`<div class="passport-head"><strong class="passport-id">${sid(s)}</strong><span>episode ${s.episode+1} · 回合内第 ${s.episode_step+1} 步</span><span class="tag ${s.done?'orange':'real'}">${s.done?s.truncated?'时间截断':'任务终止':'继续'}</span><span class="mono">${isTrain?s.uses.filter(u=>u[0]<=b).length+' / ':''}10 次使用记录</span></div><div class="passport-fields">${fields.map(f=>`<div class="field">${f[0]}<b>${f[1]}</b><span>${f[2]}</span></div>`).join('')}</div>`;
  $('use-history').innerHTML=`<div class="history-scroll"><table class="history-table"><thead><tr><th>epoch / 批次</th><th>新 log π</th><th>概率比</th><th>新 value</th><th>标准化 A</th><th>策略 loss</th><th>value 误差²</th><th>裁剪分支生效</th></tr></thead><tbody>${s.uses.map((u,i)=>`<tr class="${isTrain&&u[0]===b?'current':''}"><td><button type="button" data-use="${u[0]}" aria-label="查看第 ${i+1} 次使用">${i+1} / ${u[0]%16+1} ↗</button></td><td>${fmt(u[1],4)}</td><td>${fmt(u[4],4)}</td><td>${fmt(u[2],4)}</td><td>${fmt(u[3],4)}</td><td>${fmt(u[5],4)}</td><td>${fmt(u[6],4)}</td><td>${u[7]?'是':'否'}</td></tr>`).join('')}</tbody></table></div><p class="history-note">完整离线档案，包含播放进度之后的记录。连续动作这里是概率密度比；数值均为该次优化前的前向计算。裁剪分支生效表示该样本的策略目标在对应方向变平，不表示样本被删除或 Critic 停止学习。共享网络同时拟合很多样本，单条损失不保证逐轮下降。</p>`;
}
function render(){
  const evalOpen=[...document.querySelectorAll('.eval-position,.eval-all,.eval-provenance,.history-method')].filter(el=>el.open).map(el=>el.className);
  syncTraining();chapters[RESULT].steps=C.maxStep(evalPair)+1;
  document.querySelector('.lesson-body').classList.toggle('evaluation-layout',chapter===RESULT);
  $('sample-details').hidden=chapter===RESULT;$('questions-details').hidden=chapter===RESULT;
  renderTrainingNav();
  const keepBatchDetailsOpen=Boolean(document.querySelector('.batch-detail')?.open);
  const tokenPositions=new Map([...document.querySelectorAll('[data-sample-key]')].map(el=>[el.dataset.sampleKey,el.getBoundingClientRect()]));
  $('chapters').innerHTML=chapters.map((c,i)=>`<button type="button" class="chapter-button ${i===chapter?'active':''}" data-chapter="${i}" ${i===chapter?'aria-current="step"':''}><span class="n">0${i+1}</span>${c.name}</button>`).join('');
  $('chapter-kicker').textContent=`CHAPTER 0${chapter+1} / 0${chapters.length}`;$('chapter-title').textContent=chapters[chapter].title;
  $('evidence-tag').textContent='真实记录 × 机制动画';
  $('step-label').textContent=`${step+1} / ${chapters[chapter].steps}`;$('seek').max=chapters[chapter].steps-1;$('seek').value=step;
  $('prev').disabled=step===0;$('next').disabled=step===chapters[chapter].steps-1;$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';
  $('chapter-summary').textContent=chapters[chapter].summary;$('next-chapter').textContent=chapter===chapters.length-1?'回到第一章 ↺':'下一章 →';
  [renderTask,renderEpisode,renderInteraction,renderTrajectory,renderReset,renderTraining,renderContinue,renderEvaluation][chapter]();
  evalOpen.forEach(cls=>{const el=document.querySelector('.'+cls);if(el)el.open=true;});
  if(keepBatchDetailsOpen&&document.querySelector('.batch-detail'))document.querySelector('.batch-detail').open=true;
  renderStoryContext();renderPassport();renderLessonQuestions({chapter,section:chapters[chapter].key,step,rollout,sample:sample(),lessonKind:trainingFrames[step]?.kind});
  renderLessonMath();if(chapter!==RESULT)animatePoses();
  if(!reduced)document.querySelectorAll('[data-sample-key]').forEach(el=>{const from=tokenPositions.get(el.dataset.sampleKey);if(from){const to=el.getBoundingClientRect();el.animate([{transform:`translate(${from.x-to.x}px,${from.y-to.y}px)`},{transform:'translate(0,0)'}],{duration:650,easing:'ease-in-out'});}});
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.lessonGo!==undefined)learningGo(b.dataset.lessonGo);
 if(b.dataset.traceIndex!==undefined)learningGo('trace:'+(lessonTrace.rows.length-1-Number(b.dataset.traceIndex)));
 if(b.dataset.exampleReturn!==undefined){selectSample(()=>{rollout=0;env=0;time=0;});learningGo('trace-intro');}
 if(b.dataset.selectSample!==undefined){pause();$('sample-details').open=true;$('sample-title').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});}
 if(b.dataset.derive!==undefined){deriveStep=Number(b.dataset.derive);$('derive-content').innerHTML=L.derivationHTML(deriveStep);renderLessonMath();}
});
$('play').addEventListener('click',play);
$('prev').addEventListener('click',()=>go(chapter,step-1));$('next').addEventListener('click',()=>go(chapter,step+1));$('restart').addEventListener('click',()=>go(chapter));
$('seek').addEventListener('input',e=>go(chapter,Number(e.target.value)));$('speed').addEventListener('change',e=>{speed=Number(e.target.value);schedule();});
$('next-chapter').addEventListener('click',()=>{go((chapter+1)%chapters.length);$('chapter-title').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});});
$('rollout-select').addEventListener('change',e=>selectSample(()=>{rollout=Number(e.target.value);}));$('env-select').addEventListener('change',e=>choose(time,Number(e.target.value)));
$('sample-time').addEventListener('change',e=>choose(e.target.value));$('first-terminal').addEventListener('click',()=>{pause();const s=terminalSample();time=s.t;chapter=4;step=1;render();});$('last-sample').addEventListener('click',()=>{pause();time=1023;chapter=3;step=7;render();});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.storyTarget!==undefined)go(Number(b.dataset.storyTarget));if(b.dataset.openSample!==undefined){$('sample-details').open=true;$('use-details').open=true;$('sample-title').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});}if(b.dataset.chapter!==undefined)go(Number(b.dataset.chapter));if(b.dataset.sample!==undefined)choose(Number(b.dataset.sample));if(b.dataset.use!==undefined){go(TRAIN,TRAIN_OFFSET+Number(b.dataset.use));$('chapter-title').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});}if(b.dataset.epoch!==undefined)go(TRAIN,TRAIN_OFFSET+Number(b.dataset.epoch)*16);if(b.dataset.batch!==undefined)go(TRAIN,TRAIN_OFFSET+Number(b.dataset.batch));if(b.dataset.clip!==undefined){clipSign=Number(b.dataset.clip);render();document.querySelector('.batch-detail').open=true;}});
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,button,summary,a'))return;if(e.code==='Space'){e.preventDefault();play();}else if(e.code==='ArrowRight'){e.preventDefault();go(chapter,step+1);}else if(e.code==='ArrowLeft'){e.preventDefault();go(chapter,step-1);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
let resizeTicket=null;window.addEventListener('resize',()=>{if(chapter===RESULT){cancelAnimationFrame(resizeTicket);resizeTicket=requestAnimationFrame(()=>{if(chapter===RESULT)render();});}});
function showHistoryAnchor(){if(location.hash==='#training-progress')requestAnimationFrame(()=>$('training-history')?.scrollIntoView({behavior:'instant',block:'start'}));}
window.addEventListener('hashchange',()=>{if(['#evaluation','#training-progress'].includes(location.hash)){go(RESULT);showHistoryAnchor();}});
if(['#evaluation','#training-progress'].includes(location.hash))chapter=RESULT;
$('version-info').textContent=`记录版本：SB3 ${D.meta.versions['stable-baselines3']} / Gymnasium ${D.meta.versions.gymnasium} / MuJoCo ${D.meta.versions.mujoco}。策略种子 0，CPU；原脚本完整训练目标为 300,000 步。`;
render();showHistoryAnchor();
// Read-only diagnostics for reproducible browser verification; navigation uses visible controls.
Object.defineProperty(window,'PPO_VIEW',{get:()=>({chapter,step,rollout,env,time,playing,sampleId:sample().id,section:chapters[chapter].key,trainOffset:TRAIN_OFFSET,episodeLength:EPISODE_LENGTH,trainingFrames:trainingFrames.map(x=>({key:x.key,kind:x.kind})),traceBoundary:lessonTrace.boundary,evalPair,evalRange})});
})();

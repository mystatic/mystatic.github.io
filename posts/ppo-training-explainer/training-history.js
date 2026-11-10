/* Existing training logs, independent from the final-model evaluation playback. */
(() => {
'use strict';
const D=window.PPO_TRAINING_HISTORY,es=D.episodes,total=D.meta.actual_steps;
const integer=x=>Number(x).toLocaleString('en-US'),f=(x,n=2)=>Number(x).toFixed(n);
const prefixes={length:[0],reward_sum:[0]};
for(const e of es)for(const k of Object.keys(prefixes))prefixes[k].push(prefixes[k].at(-1)+e[k]);
let selected=D.milestones.find(x=>x.id==='first_full').episode_index,windowSize=100,showRaw=true,viewMax=total;
function average(i,key){const start=Math.max(0,i+1-windowSize);return (prefixes[key][i+1]-prefixes[key][start])/(i+1-start);}
function nearest(x){
 let lo=0,hi=es.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(es[mid].end_step<x)lo=mid+1;else hi=mid;}
 if(lo===0)return 0;if(lo===es.length)return lo-1;
 return x-es[lo-1].end_step<=es[lo].end_step-x?lo-1:lo;
}
function visibleLast(){let i=nearest(viewMax);while(es[i].end_step>viewMax&&i>0)i--;return i;}
function chart(kind){
 const mobile=matchMedia('(max-width:670px)').matches,viewW=mobile?360:900,left=44,top=34,width=viewW-65,height=175;
 const key=kind==='reward'?'reward_sum':'length',color=kind==='reward'?'#315dbe':'#087e72';
 const x=s=>left+width*s/viewMax,y=v=>top+height*(1-v/1000),last=visibleLast();
 const points=es.slice(0,last+1);
 const curve=points.map((e,i)=>`${i?'L':'M'}${f(x(e.end_step))},${f(y(average(i,key)))}`).join(' ');
 const raw=showRaw?points.map(e=>`<circle cx="${f(x(e.end_step))}" cy="${f(y(e[key]))}" r="${mobile?1:1.5}"/>`).join(''):'';
 const ticks=mobile?[0,.5,1]:[0,.2,.4,.6,.8,1];
 const stepLabel=v=>v===0?'0':v>=10000?f(v/10000,v%10000===0?0:1)+'万':integer(v);
 return `<svg class="history-chart" data-history-chart="${kind}" data-left="${left}" data-width="${width}" data-viewwidth="${viewW}" viewBox="0 0 ${viewW} 252" role="img" aria-label="训练${kind==='reward'?'回合奖励总和':'回合长度'}随总交互步数变化，浅色点为单回合，实线为最近 ${windowSize} 个已完成回合的均值"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fbfcfa"/>${[0,250,500,750,1000].map(v=>`<line x1="${left}" x2="${left+width}" y1="${y(v)}" y2="${y(v)}" stroke="#dfe6df"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}<g class="history-marks">${D.milestones.filter(m=>es[m.episode_index].end_step<=viewMax).map(m=>{const i=D.milestones.indexOf(m),px=x(es[m.episode_index].end_step);return `<line x1="${px}" x2="${px}" y1="${top}" y2="${top+height}" stroke="#ceb278" stroke-dasharray="3 5"/><circle cx="${px}" cy="${i===1?8:26}" r="8" fill="#fff2d3"/><text x="${px}" y="${i===1?11:29}" text-anchor="middle" fill="#93682d">${i+1}</text>`;}).join('')}</g><g class="history-raw" fill="#96aaa2" opacity=".25">${raw}</g><path class="history-average" d="${curve}" fill="none" stroke="${color}" stroke-width="2.7"/><line data-history-cursor="${kind}" y1="${top}" y2="${top+height}" stroke="#526a61" stroke-dasharray="3 3"/><circle data-history-selected="${kind}" r="4" fill="white" stroke="${color}" stroke-width="2"/><circle data-history-raw-selected="${kind}" r="4" fill="#be5e28" stroke="white" stroke-width="1.5"/>${ticks.map(t=>`<text x="${x(t*viewMax)}" y="229" text-anchor="middle">${stepLabel(t*viewMax)}</text>`).join('')}<text x="${left+width}" y="247" text-anchor="end">训练总交互步数（4 个环境合计）</text><rect data-history-hit x="${left}" y="${top}" width="${width}" height="${height}" fill="transparent"/></svg>`;
}
function draw(){
 return `<div class="history-controls"><label>平均窗口 <select id="history-window" aria-label="训练曲线平均窗口">${[20,50,100].map(n=>`<option value="${n}" ${windowSize===n?'selected':''}>最近 ${n} 个完成回合</option>`).join('')}</select></label><label class="history-raw-toggle"><input id="history-raw" type="checkbox" ${showRaw?'checked':''}>显示单回合波动</label><div class="history-zoom"><button type="button" data-history-zoom="${total}" class="${viewMax===total?'active':''}">完整训练</button><button type="button" data-history-zoom="60000" class="${viewMax===60000?'active':''}">放大前 6 万步</button></div></div><div class="history-legend"><span><i class="raw"></i>每一个已完成回合</span><span><i class="mean"></i>最近 <b data-history-window-label>${windowSize}</b> 回合平均</span><span><i class="selected"></i>当前选中的单回合</span><span>两张图共用横轴与选中位置</span></div><div class="history-plot"><h4>训练回合奖励总和 <small>每回合环境 reward 累加</small></h4>${chart('reward')}</div><div class="history-plot"><h4>训练回合长度 <small>每回合执行了多少个环境步</small></h4>${chart('length')}</div><div class="history-inspector" aria-live="polite"><div class="history-inspector-heading"><b id="history-selected-title"></b><span id="history-selected-source"></span></div><div class="history-inspector-values"><div><span>这一回合奖励</span><b id="history-value-reward"></b></div><div><span>这一回合长度</span><b id="history-value-length"></b></div><div><span>窗口平均奖励</span><b id="history-mean-reward"></b></div><div><span>窗口平均长度</span><b id="history-mean-length"></b></div></div><p id="history-inspector-note"></p><label for="history-episode">按完成顺序查回合 <span id="history-episode-label"></span></label><input type="range" id="history-episode" min="0" max="${visibleLast()}" value="${Math.min(selected,visibleLast())}" aria-label="查看训练中的已完成回合"></div>`;
}
function mount(){
 return `<section id="training-history" class="training-history" aria-labelledby="history-heading"><div class="history-heading"><div><span class="eyebrow">从训练日志看进步</span><h3 id="history-heading">它从什么时候开始学会平衡？</h3></div><span class="tag real">${integer(es.length)} 个真实完成回合</span></div><p class="history-lead">第一批采样结束时，最近 100 回合平均只坚持 <strong>${f(D.summary.first_rollout_mean_length)} 步</strong>。训练继续，偶尔跑满逐渐变成多数回合都能跑满。点下面的里程碑或曲线查看当时的数值。</p><div class="history-milestones">${D.milestones.map((m,i)=>{const e=es[m.episode_index];return `<button type="button" data-history-index="${m.episode_index}"><span>0${i+1} · ${m.label}</span><strong>${integer(e.end_step)} <small>训练步</small></strong><em>${i===0?'最近100回合均长 '+f(e.mean_length_100):i===1?'Env '+(e.env+1)+' 首次跑满 40 秒':i===2?'本回合 '+e.length+' 步；之后 '+D.summary.full_episodes_after_last_short+' 回合全跑满':'回看最近100回合：100 / 100 跑满'}</em></button>`;}).join('')}</div><p class="history-window-note">平均值相关的里程碑使用固定的 100 回合窗口。<strong>84,620 步之后，本次记录中的后续 ${D.summary.full_episodes_after_last_short} 个完成回合都跑满；184,620 步时，滑动窗口才全部换成跑满的回合。</strong> 平均线有滞后，不能把它到顶的时刻当作技能突然出现的时刻。</p><div id="training-history-view">${draw()}</div><div class="history-context"><div><b>训练曲线与上方测试不同</b><p>这里的动作随机采样，起点在 ±10° 内随机；上方测试固定在 ±10°，使用确定性动作。曲线来自同一次训练，与测试种子切换和 40 秒回放进度相互独立。</p></div><div><b>奖励和长度为何几乎重合？</b><p>本任务每个健康环境步奖励 1，失败那步奖励 0。因此多数失败回合的奖励比长度少 1；跑满的回合两者都是 1000。这里不是 GAE 的 Return 目标。</p></div></div><details class="history-method"><summary>数据来源与计算方式 <span>已与全部 ${D.meta.rollout_means_verified} 个 rollout 日志逐项核对</span></summary><p>横轴统计四个环境合计的交互次数，不是一个回合内的步数，也不是优化器更新次数。四个环境同步推进；由每个环境累计完成回合长度恢复它的结束位置，再按环境数 4 换算。相同结束步按环境编号排序，与 SB3 收集回合信息的顺序一致。</p><p>平均线使用最近 N 个已完成回合，开头不足 N 个时使用已有回合。窗口按回合数计，不是固定训练步数；浅色点保留全部原始波动，实线只做算术平均，不进行额外平滑。</p><p>训练结束时，4 个环境还有未完成的回合，共 ${integer(D.meta.unfinished_env_steps)} 个已执行环境步。它们不被补零，也不作为完整回合参与统计。一个回合可能跨越多轮 rollout 与策略更新，曲线标的是回合完成时刻。</p><p>训练中未保存中间模型和逐步轨迹，因此这些曲线不能提供某个中间模型的动画或独立评估。上方回放仍严格对应保存的初始模型与最终模型。</p><div class="eval-file-links"><a href="comparison-run-seed0/training-history.json">曲线完整数据 ↗</a><a href="comparison-run-seed0/progress.json">原始 rollout 进度 ↗</a><a href="build_training_history.py">提取与校验脚本 ↗</a>${[0,1,2,3].map(e=>`<a href="comparison-run-seed0/monitor/${e}.monitor.csv">Env ${e+1} 原始日志 ↗</a>`).join('')}</div></details></section>`;
}
function update(){
 const root=document.getElementById('training-history');if(!root)return;
 selected=Math.min(selected,visibleLast());const e=es[selected];
 root.querySelectorAll('[data-history-index]').forEach(b=>b.classList.toggle('active',Number(b.dataset.historyIndex)===selected));
 for(const kind of ['reward','length']){
  const svg=root.querySelector(`[data-history-chart="${kind}"]`),key=kind==='reward'?'reward_sum':'length',left=Number(svg.dataset.left),width=Number(svg.dataset.width),x=left+width*e.end_step/viewMax,y=34+175*(1-average(selected,key)/1000);
  const cursor=root.querySelector(`[data-history-cursor="${kind}"]`);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);
  const dot=root.querySelector(`[data-history-selected="${kind}"]`);dot.setAttribute('cx',x);dot.setAttribute('cy',y);
  const rawDot=root.querySelector(`[data-history-raw-selected="${kind}"]`);rawDot.setAttribute('cx',x);rawDot.setAttribute('cy',34+175*(1-e[key]/1000));
 }
 document.getElementById('history-selected-title').textContent='训练到 '+integer(e.end_step)+' 步';
 document.getElementById('history-selected-source').textContent=`Env ${e.env+1} · 本环境第 ${e.episode} 个回合 · 第 ${Math.ceil(e.end_step/4096)} 批采样期间结束`;
 document.getElementById('history-value-reward').textContent=f(e.reward_sum,0);
 document.getElementById('history-value-length').textContent=e.length+' 步';
 document.getElementById('history-mean-reward').textContent=f(average(selected,'reward_sum'));
 document.getElementById('history-mean-length').textContent=f(average(selected,'length'))+' 步';
 document.getElementById('history-inspector-note').textContent=(e.reached_limit?'这次回合跑满了 1000 步、40 秒。':'这次回合没有跑满，上限是 1000 步。')+` 当前均值使用最近 ${Math.min(windowSize,selected+1)} 个完成回合；单次跑满并不等于后续每次都能跑满。`;
 document.getElementById('history-episode-label').textContent=(selected+1)+' / '+es.length;
 document.getElementById('history-episode').value=selected;
}
function redraw(){const el=document.getElementById('training-history-view');if(el){el.innerHTML=draw();update();}}
function select(i){selected=Math.max(0,Math.min(es.length-1,i));if(es[selected].end_step>viewMax){viewMax=total;redraw();}else update();}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');
 if(b?.dataset.historyIndex!==undefined)select(Number(b.dataset.historyIndex));
 if(b?.dataset.historyZoom!==undefined){viewMax=Number(b.dataset.historyZoom);selected=Math.min(selected,visibleLast());redraw();}
 if(b?.dataset.historyLink!==undefined)document.getElementById('training-history')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
 const svg=e.target.closest('[data-history-chart]');if(svg)pick(svg,e.clientX);
});
function pick(svg,clientX){const point=svg.createSVGPoint();point.x=clientX;point.y=0;const svgX=point.matrixTransform(svg.getScreenCTM().inverse()).x;const t=(svgX-Number(svg.dataset.left))/Number(svg.dataset.width)*viewMax;select(Math.min(nearest(Math.max(0,Math.min(viewMax,t))),visibleLast()));}
document.addEventListener('pointermove',e=>{const svg=e.target.closest('[data-history-chart]');if(svg&&e.pointerType==='mouse')pick(svg,e.clientX);});
document.addEventListener('input',e=>{if(e.target.id==='history-episode')select(Number(e.target.value));});
document.addEventListener('change',e=>{
 if(e.target.id==='history-window'){windowSize=Number(e.target.value);redraw();}
 if(e.target.id==='history-raw'){showRaw=e.target.checked;redraw();}
});
window.PPO_HISTORY={mount,update,getState:()=>({selected,windowSize,showRaw,viewMax}),average};
})();

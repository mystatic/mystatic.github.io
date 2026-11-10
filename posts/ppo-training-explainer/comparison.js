/* Offline evaluation playback. All states and metrics come from the saved paired runs. */
(() => {
'use strict';
const D=window.PPO_EVALUATION,labels={before:'训练前',after:'训练后'},colors={before:'#be5e28',after:'#087e72'};
const f=(v,n=2)=>Number(v).toFixed(n),degrees=v=>v*180/Math.PI;
const prefix=new Map();
D.pairs.forEach((p,i)=>{for(const k of ['before','after']){const a=[0];p[k].rewards.forEach(r=>a.push(a.at(-1)+r));prefix.set(i+':'+k,a);}});
const pair=i=>D.pairs[i];
function maxStep(i){const p=pair(i);return Math.max(p.before.steps,p.after.steps);}
function status(e,n){return n<e.steps?'进行中':e.terminated?'越界终止 · 画面停留':e.reached_limit?'完成 40 秒测试':'时间截断';}
function frame(i,k,n){const e=pair(i)[k],j=Math.min(n,e.steps);return {state:e.states[j],step:j,seconds:j*D.meta.step_seconds,reward:prefix.get(i+':'+k)[j],finished:j===e.steps,status:status(e,j),action:j?e.actions[j-1][0]:null};}
function card(k){return `<div class="eval-card ${k}" id="eval-card-${k}"><div class="eval-card-heading"><div><span>${labels[k]}</span><strong>${k==='before'?'尚未学习的策略':'经过 PPO 学习的策略'}</strong></div><b id="eval-angle-${k}" class="mono"></b></div><svg viewBox="0 0 360 210" role="img" id="eval-svg-${k}" aria-label="${labels[k]}倒立摆真实状态"><line x1="18" y1="164" x2="342" y2="164" stroke="#b8c9c0"/><line x1="180" y1="24" x2="180" y2="164" stroke="#becfc6" stroke-dasharray="4 5"/><text x="18" y="192" fill="#62737a" font-size="10">两侧使用相同位置与角度比例</text><g id="eval-cart-${k}"><path d="M -22.7035 33 L 0 145 L 22.7035 33" fill="none" stroke="#ead8be" stroke-dasharray="3 5"/><rect x="-26" y="143" width="52" height="18" rx="4" fill="${colors[k]}"/><circle cx="-16" cy="164" r="4" fill="#25493e"/><circle cx="16" cy="164" r="4" fill="#25493e"/><g id="eval-pole-${k}"><line x1="0" y1="145" x2="0" y2="33" stroke="#284951" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="33" r="9" fill="${colors[k]}"/></g><circle cx="0" cy="145" r="4" fill="#fff"/></g></svg><div class="eval-status" id="eval-status-${k}"></div><div class="eval-metrics"><div><span>已执行步数</span><b id="eval-steps-${k}"></b></div><div><span>已坚持时间</span><b id="eval-time-${k}"></b></div><div><span>回合奖励总和</span><b id="eval-reward-${k}"></b></div></div><div class="eval-readout"><span id="eval-position-${k}"></span><span id="eval-action-${k}"></span></div></div>`;}
function graph(i,kind,range){
 const viewW=matchMedia('(max-width:670px)').matches?360:730;
 const p=pair(i),left=38,top=22,w=viewW-60,h=145,sec=Math.min(range,maxStep(i)*.04),idx=kind==='angle'?1:0;
 const vals=['before','after'].flatMap(k=>p[k].states.slice(0,Math.round(sec/.04)+1).map(s=>kind==='angle'?degrees(s[idx]):s[idx]));
 const limit=kind==='angle'?Math.max(13,...vals.map(Math.abs))*1.08:Math.max(.05,...vals.map(Math.abs))*1.18;
 const px=t=>left+(t/sec)*w,py=v=>top+h/2-v/(2*limit)*h;
 const paths=['before','after'].map(k=>{const states=p[k].states.slice(0,Math.round(sec/.04)+1);return `<path data-eval-line="${k}" d="${states.map((s,j)=>`${j?'L':'M'}${f(px(j*.04))},${f(py(kind==='angle'?degrees(s[1]):s[0]))}`).join(' ')}" fill="none" stroke="${colors[k]}" stroke-width="2.4"/>`;}).join('');
 const bound=degrees(.2);
 return `<svg class="eval-chart" data-plot-left="${left}" data-plot-width="${w}" viewBox="0 0 ${viewW} 207" role="img" aria-label="${kind==='angle'?'摆角，单位度':'小车位置，单位米'}随仿真时间的真实曲线"><defs><clipPath id="eval-clip-${kind}"><rect id="eval-reveal-${kind}" x="${left-2}" y="${top-3}" width="0" height="${h+6}"/></clipPath></defs>${[-1,0,1].map(v=>`<line x1="${left}" y1="${py(v*limit)}" x2="${left+w}" y2="${py(v*limit)}" stroke="#e0e7e0"/><text x="${left-7}" y="${py(v*limit)+4}" text-anchor="end" font-size="10" fill="#62737a">${f(v*limit,kind==='angle'?0:2)}</text>`).join('')}${kind==='angle'?[-bound,bound].map(v=>`<line x1="${left}" x2="${left+w}" y1="${py(v)}" y2="${py(v)}" stroke="#ca9764" stroke-dasharray="4 4"/><text x="${left+w}" y="${py(v)-4}" text-anchor="end" font-size="9" fill="#a06e3d">${v>0?'+':'−'}11.46° 边界</text>`).join(''):''}<g clip-path="url(#eval-clip-${kind})">${paths}</g><line id="eval-cursor-${kind}" y1="${top}" y2="${top+h}" stroke="#849d90" stroke-width="1"/>${[0,.25,.5,.75,1].map(t=>`<text x="${px(t*sec)}" y="191" text-anchor="middle" fill="#62737a" font-size="10">${f(t*sec,t===0?0:sec<2?2:0)} s</text>`).join('')}<text x="${left}" y="12" font-size="10" fill="#62737a">${kind==='angle'?'摆角 / °':'小车位置 / m'}</text></svg>`;
}
function summary(){return `<div class="eval-summary"><div class="eval-summary-heading"><div><span class="eyebrow">全部测试结果</span><h3>两种起点，各 10 次配对测试</h3></div><span class="tag real">固定种子 1–10 · 全部展示</span></div><div class="eval-table-scroll"><table><thead><tr><th>初始角度</th><th>策略</th><th>平均步数</th><th>平均仿真时间</th><th>平均回合奖励</th><th>达到 1000 步</th></tr></thead><tbody>${D.summary.map(r=>`<tr class="${r.model}"><td>${r.angle_deg>0?'+':''}${r.angle_deg}°</td><td>${labels[r.model]}</td><td>${f(r.mean_steps,0)}</td><td>${f(r.mean_seconds)} s</td><td>${f(r.mean_reward_sum,0)}</td><td>${r.reached_limit_count} / ${r.episodes}</td></tr>`).join('')}</tbody></table></div><p>回合奖励总和只累加环境 reward，不是第六章的 Return 训练目标。达到上限表示本次 40 秒内保持健康；结果仅针对这里的 ±10°、零初始速度和十个测试种子。</p><details class="eval-all"><summary>展开全部 20 对测试结果 <span>点击一行选择那对回放</span></summary><div class="eval-table-scroll"><table><thead><tr><th>起点 / 种子</th><th>训练前步数 / 奖励</th><th>训练后步数 / 奖励</th><th>训练后结束原因</th></tr></thead><tbody>${D.pairs.map((p,i)=>`<tr><td><button type="button" data-eval-pair="${i}">${p.angle_deg>0?'+':''}${p.angle_deg}° / seed ${p.seed} ↗</button></td><td>${p.before.steps} / ${p.before.reward_sum}</td><td>${p.after.steps} / ${p.after.reward_sum}</td><td>${p.after.reached_limit?'达到 1000 步上限':p.after.terminated?'任务终止':'时间截断'}</td></tr>`).join('')}</tbody></table></div></details></div>`;}
function mount(el,i,range){
 const p=pair(i);
 el.innerHTML=`<div class="eval-controls"><div class="eval-angles" aria-label="测试初始角度">${[10,-10].map(a=>`<button type="button" data-eval-angle="${a}" class="${a===p.angle_deg?'active':''}" aria-pressed="${a===p.angle_deg}">${a>0?'+':''}${a}° 起点</button>`).join('')}</div><label>测试种子 <select id="eval-seed" aria-label="测试种子">${D.meta.test_seeds.map(s=>`<option value="${s}" ${s===p.seed?'selected':''}>${s}</option>`).join('')}</select></label><button type="button" class="history-jump" data-history-link>查看训练进步曲线 ↓</button><span class="eval-clock">同步时钟 <b id="eval-clock">0.00 s</b></span></div><p class="eval-condition">同一初始状态 · 确定性动作 · 不更新网络 · 每步 0.04 秒</p><div class="eval-dual">${card('before')}${card('after')}</div><div class="eval-jumps"><button type="button" data-eval-slow>慢看起步 · 0.1×</button><button type="button" data-eval-jump="${p.before.steps}">训练前结束时</button><button type="button" data-eval-jump="25">第 1 秒</button><button type="button" data-eval-jump="${maxStep(i)}">到测试末尾</button></div><div class="eval-graph-heading"><div><b>摆角有没有回到直立附近？</b><span><i class="before"></i>训练前 <i class="after"></i>训练后</span></div><div class="eval-range"><button type="button" data-eval-range="1" class="${range===1?'active':''}">放大前 1 秒</button><button type="button" data-eval-range="40" class="${range===40?'active':''}">完整 40 秒</button></div></div>${graph(i,'angle',range)}<p class="eval-graph-note" id="eval-graph-note"></p><details class="eval-position"><summary>同时查看小车位置变化 <span>同样的时间轴与颜色</span></summary>${graph(i,'position',range)}</details>${summary()}${window.PPO_HISTORY.mount()}<details class="eval-provenance"><summary>这次独立训练与模型文件 <span>初始模型、最终模型、配置与原模型保护记录</span></summary><p>种子 ${D.meta.train_seed}，CPU，4 个环境；起始摆角在 ±10° 内均匀随机，速度清零。请求 300,000 步，实际完成 ${D.meta.actual_steps.toLocaleString('en-US')} 步（${D.meta.rollouts} 个完整 rollout），共 ${D.meta.optimizer_steps.toLocaleString('en-US')} 次优化器更新。测试种子只改变小车初始位置；正负角度与训练前后保持成对一致。</p><p>本章来自单独完整训练。前七章的 8192 条机制记录继续保留，不把它们冒充为最终训练结果。原模型训练前后 SHA256 一致。</p><div class="eval-file-links"><a href="comparison-run-seed0/before.zip">训练前模型 ↗</a><a href="comparison-run-seed0/after.zip">训练后模型 ↗</a><a href="comparison-run-seed0/manifest.json">参数与哈希 ↗</a><a href="comparison-run-seed0/evaluation.json">全部真实评估数据 ↗</a><a href="train_comparison.py">训练与记录脚本 ↗</a></div></details>`;
 window.PPO_HISTORY.update();
}
function update(i,n,range){
 const p=pair(i);document.getElementById('eval-clock').textContent=f(n*.04)+' s';
 for(const k of ['before','after']){
  const a=frame(i,k,n),theta=degrees(a.state[1]),x=180+350*a.state[0];
  document.getElementById('eval-cart-'+k).setAttribute('transform',`translate(${x},0)`);
  document.getElementById('eval-pole-'+k).setAttribute('transform',`rotate(${theta},0,145)`);
  document.getElementById('eval-svg-'+k).setAttribute('aria-label',`${labels[k]}，第 ${a.step} 步，小车 ${f(a.state[0],5)} 米，摆角 ${f(theta,5)} 度`);
  document.getElementById('eval-angle-'+k).textContent=f(theta)+'°';
  document.getElementById('eval-steps-'+k).textContent=a.step;
  document.getElementById('eval-time-'+k).textContent=f(a.seconds)+' s';
  document.getElementById('eval-reward-'+k).textContent=a.reward;
  document.getElementById('eval-status-'+k).textContent=a.status;
  document.getElementById('eval-card-'+k).classList.toggle('finished',a.finished);
  document.getElementById('eval-position-'+k).textContent='小车位置 '+f(a.state[0],4)+' m';
  document.getElementById('eval-action-'+k).textContent=a.action===null?'尚未执行动作':'上次控制输入 '+f(a.action,4);
 }
 const sec=Math.min(range,maxStep(i)*.04),pos=Math.min(1,n*.04/sec);
 for(const kind of ['angle','position']){
  const reveal=document.getElementById('eval-reveal-'+kind),svg=reveal.closest('svg'),left=Number(svg.dataset.plotLeft),width=Number(svg.dataset.plotWidth);
  reveal.setAttribute('width',String(pos*width+4));
  document.getElementById('eval-cursor-'+kind).setAttribute('x1',String(left+pos*width));
  document.getElementById('eval-cursor-'+kind).setAttribute('x2',String(left+pos*width));
 }
 document.getElementById('eval-graph-note').textContent=(range===1?'当前图只显示起步的前 1 秒。':'当前图显示完整 40 秒。')+'曲线到该策略结束时停止；失败后不自动 reset，也不接上新的回合。';
}
window.PPO_COMPARE={data:D,pair,maxStep,frame,mount,update};
})();

/* Pure reconstruction from the saved rollout. No policy or simulator runs here. */
(() => {
'use strict';
const f=(x,n=3)=>Number(x).toFixed(n);
const equation=tex=>`<div class="lesson-math" data-lesson-math="${tex.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></div>`;
function trace(data,rollout,s){
 const run=data.rollouts[rollout],gamma=data.meta.config.gamma,lambda=data.meta.config.gae_lambda;
 const samples=[];
 for(let t=s.t;t<data.meta.config.n_steps;t++){
  const x=run.samples[t*data.meta.n_envs+s.env];
  if(x.episode!==s.episode)break;
  samples.push(x);if(x.done)break;
 }
 const last=samples.at(-1),boundary=last.done?(last.truncated?'timeout':'terminal'):'rollout';
 const bootstrap=boundary==='rollout'?run.last_values[s.env]:boundary==='timeout'?(last.buffer_reward-last.reward)/gamma:0;
 let nextR=bootstrap;
 const rows=new Array(samples.length);
 for(let i=samples.length-1;i>=0;i--){
  const x=samples[i],mask=x.done?0:1;
  const nextV=x.done?0:i+1<samples.length?samples[i+1].old_value:bootstrap;
  const tailR=x.done?0:nextR;
  const result=x.buffer_reward+gamma*mask*((1-lambda)*nextV+lambda*tailR);
  const delta=x.buffer_reward+gamma*mask*nextV-x.old_value;
  rows[i]={s:x,nextV,nextR:tailR,computed:result,delta,advantage:result-x.old_value,mask};
  nextR=result;
 }
 return {rows,boundary,bootstrap,gamma,lambda,rawSum:samples.reduce((a,x)=>a+x.reward,0),discountSum:samples.reduce((a,x,i)=>a+gamma**i*x.reward,0)};
}
const derivation=[
 ['从你熟悉的 GAE 开始','V 是采样时保存的旧预测，A 是尚未标准化的优势，R 是 Critic 的训练目标。普通步骤 m 为 1；回合结束 m 为 0。时间截断先把末状态补值加入 buffer reward。',String.raw`\begin{aligned}\delta_t&=r_t^{\mathrm{buffer}}+\gamma m_tV_{t+1}-V_t\\ A_t&=\delta_t+\gamma\lambda m_tA_{t+1}\\ R_t&=A_t+V_t\end{aligned}`],
 ['代入：当前状态的旧预测抵消','先用 TD 误差展开优势。减去的旧 value 与最后加回的旧 value 抵消。',String.raw`\begin{aligned}R_t&=r_t^{\mathrm{buffer}}+\gamma m_tV_{t+1}\color{#be5e28}{-V_t}+\gamma\lambda m_tA_{t+1}\color{#be5e28}{+V_t}\\ &=r_t^{\mathrm{buffer}}+\gamma m_t[V_{t+1}+\lambda A_{t+1}]\end{aligned}`],
 ['替换：下一步优势也能写成差值','下一步的优势等于下一步目标减去下一步旧预测。把这个关系代入。',String.raw`\begin{aligned}\color{#087e72}{A_{t+1}}&=\color{#087e72}{R_{t+1}-V_{t+1}}\\ R_t&=r_t^{\mathrm{buffer}}+\gamma m_t[V_{t+1}+\lambda\color{#087e72}{(R_{t+1}-V_{t+1})}]\end{aligned}`],
 ['合并：得到 return 的递推式','这是同一套 GAE 的代数改写。rollout 自然结束且回合未结束时，用边界观测的旧 value 初始化下一步 return。',String.raw`R_t=r_t^{\mathrm{buffer}}+\gamma m_t[(1-\lambda)V_{t+1}+\lambda R_{t+1}]`],
 ['代入参数：看清两个权重','在没有终止或截断的普通步骤，m 为 1，buffer reward 就是环境 reward。代入折扣 0.99、λ 为 0.95，得到对话中的公式。',String.raw`\begin{aligned}\gamma&=0.99,\quad\lambda=0.95,\quad1-\lambda=0.05\\ R_t&=r_t+0.99[0.05V_{\mathrm{old}}(s_{t+1})+0.95R_{t+1}]\end{aligned}`]
];
function boundaryHTML(data,tr){
 const fxt=data.timeout_fixture.at(-1);
 return `<details class="boundary-details"><summary>三个边界怎样处理？<span>真正终止 / 时间截断 / rollout 收满</span></summary><div class="boundary-cards"><div><b>真正终止</b><p>任务结束，后续价值为零。目标只剩本步奖励，不接新回合的奖励。</p></div><div><b>时间截断</b><p>任务仍可继续，只是计时器到了。SB3 用 terminal_observation 的 value 补入 buffer reward，再切断跨 reset 的 GAE 链。</p><p>独立两步 TimeLimit 真实案例：奖励 ${fxt.reward}，末状态 value ${f(fxt.terminal_value,5)}，补值后 ${f(fxt.buffer_reward,5)}。不使用 reset 后观测补值；原脚本上限仍是 1000 步。</p></div><div><b>rollout 自然结束</b><p>回合尚未结束。用最后观测的 value 补值，下一轮从原状态继续；该观测没有额外形成一条动作样本。</p></div></div>${equation(String.raw`\begin{aligned}\text{terminal:}\quad&R_t=r_t\\ \text{timeout:}\quad&R_t=r_t+\gamma V_{\mathrm{old}}(s_{\mathrm{terminal}})\\ \text{rollout end:}\quad&R_t=r_t+\gamma V_{\mathrm{old}}(s_{t+1})\end{aligned}`)}</details>`;
}
function derivationHTML(index=0){
 const x=derivation[index];
 return `<div class="derive-nav" aria-label="公式推导步骤">${derivation.map((d,i)=>`<button type="button" data-derive="${i}" class="${i===index?'active':''}" aria-pressed="${i===index}">${i+1}</button>`).join('')}</div><div class="derive-step"><b>${x[0]}</b><p>${x[1]}</p>${equation(x[2])}</div>`;
}
function terms(s){return `<div class="target-terms">${[
 ['reward','环境本步的反馈',s.reward,'来自这一次动作的结果'],
 ['旧 value','采样时的预测',s.old_value,'由当时的 Critic 算出'],
 ['Advantage','相对旧预测的修正量',s.advantage,'沿轨迹用 GAE 计算；交给 Actor 前还会标准化'],
 ['Return','Critic 要拟合的目标',s.return,'原始优势加回旧预测；十遍训练中固定']
 ].map(([a,b,v,n])=>`<div><span>${a}</span><strong>${b}</strong><b>${f(v)}</b><small>${n}</small></div>`).join('')}</div>`;}
function extraQuestion(i,s,r){
 const data=window.PPO_DATA,tr=trace(data,r,s),id=`R${r+1}·E${s.env+1}·T${String(s.t).padStart(4,'0')}`;
 const label=`<span class="qa-data-label">当前所选真实样本 <span class="mono">${id}</span></span>`;
 if(i===6)return {
  title:'沿真实经历倒推，每条样本有自己的 Return',lead:'5.889 是第一条样本的 λ-return 目标；下面的数据随当前所选样本变化。它由真实奖励、采样时旧预测和结束边界共同决定。',
  body:`${label}<div class="qa-readings"><span>已观测奖励和<b>${f(tr.rawSum)}</b></span><span>已观测折扣奖励和<b>${f(tr.discountSum)}</b></span><span>Return 训练目标<b>${f(s.return,5)}</b></span></div><p>第一条样本所在的完整回合有八步：前七步奖励为 1，最后一步为 0。奖励总和为 7，折扣奖励和约为 6.793；λ 为 0.95 时还混合旧 Critic 的预测，得到 5.889。</p><p>对当前样本，从采样步 ${s.t} 开始共 ${tr.rows.length} 条记录，直到${tr.boundary==='terminal'?'真正终止':tr.boundary==='timeout'?'时间截断':'rollout 边界'}。前两项仅统计这些已观测奖励，不能一概当作完整回合收益。</p><div class="return-qa-table"><table class="qa-table"><thead><tr><th>采样步</th><th>reward</th><th>旧 value</th><th>Return</th></tr></thead><tbody>${tr.rows.map(x=>`<tr><td>${x.s.t}</td><td>${x.s.reward}</td><td>${f(x.s.old_value,5)}</td><td>${f(x.s.return,5)}</td></tr>`).join('')}</tbody></table></div><p>普通未结束步骤中，用下一状态的旧预测和已经算出的下一步目标，倒推本步目标。遇真正终止只剩本步奖励；截断和 rollout 边界还要补值。</p>${equation(String.raw`R_t=r_t+0.99[0.05V_{\mathrm{old}}(s_{t+1})+0.95R_{t+1}]`)}<button type="button" data-lesson-go="trace-intro">进入当前样本的逐步倒推动画 ↗</button>`,
  takeaway:'Return 是训练目标，reward 是当步反馈；更换样本，整段计算跟着真实记录变化。'};
 if(i===7)return {
  title:'你学过的 GAE 没变，只是把优势改写成目标',lead:'先算 GAE 优势，再加回采样时的旧 value，就能得到 Return。下面逐步代入，得到动画使用的等价递推。',
  body:`${derivation.map((x,j)=>`<p><strong>第 ${j+1} 步：${x[0]}</strong></p><p>${x[1]}</p>${equation(x[2])}`).join('')}<p>普通步骤中的 0.05 就是 1 − λ，并不是额外设置的新参数。真正终止、时间截断和 rollout 收满的补值方法见第六章的边界说明。</p><button type="button" data-lesson-go="derive">进入逐步公式推导 ↗</button>`,
  takeaway:'旧 value 与原始优势构成固定目标；GAE 递推和 return 递推是同一套计算。'};
 return {
  title:'优势表达修正多少，Return 明确预测到多少',lead:'Actor 利用相对表现调整动作概率；Critic 需要一个明确的价值预测目标。Return 没有增加独立信息，它把原始优势加回旧预测。',
  body:`${label}${terms(s)}<p>当前样本的原始优势是 ${f(s.advantage,5)}，表示相对旧预测 ${f(s.old_value,5)} 的修正量。Critic 的目标因此是 ${f(s.return,5)}。</p>${equation(String.raw`R_t=A_t+V_{\mathrm{old}}(s_t)`)}<p>旧预测为 100、优势为 +5 时，价值目标是 105，不能直接把 +5 当作价值目标。不过 Critic 的损失确实可以用优势等价改写：</p>${equation(String.raw`\begin{aligned}L_V&=[V_\theta(s_t)-R_t]^2\\&=[V_\theta(s_t)-V_{\mathrm{old}}(s_t)-A_t]^2\end{aligned}`)}<p>同一批训练中，旧 value、原始优势和 Return 固定；梯度来自当前网络预测。只对已经存好的优势平方，无法对当前 Critic 参数产生梯度。</p><p>Actor 使用的优势会在每个 minibatch 中标准化，因此标准化结果可能随着分组变化。原始优势保持不变。</p><button type="button" data-lesson-go="usage:0">看目标固定、当前预测变化的十次记录 ↗</button>`,
  takeaway:'可以用优势表达 Critic 的误差，但必须保留旧预测作为参照；Return 直接给出拟合目标。'};
}

window.PPO_LESSON={trace,equation,derivation,derivationHTML,boundaryHTML,terms,extraQuestion};
})();

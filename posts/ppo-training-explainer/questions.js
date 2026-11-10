/* Local teaching notes. All examples read the same selected sample as the animation. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const f=(n,d=3)=>Number(n).toFixed(d);
const topics=['R1·E1·T0000 是什么？','四个观测数从哪里来？','高斯分布从哪里来？','value 是怎么计算的？','两个物理步都在施力吗？','没倒就一直给 reward 1？','Return 5.889 从哪来？','Return 递推与 GAE 什么关系？','有 Advantage 为什么还要 Return？'];
let active=0,lastChapter=-1,manual=false,context=null;
const equation=tex=>`<div class="qa-math" data-qa-math="${tex.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></div>`;
const chain=(items)=>`<div class="qa-chain">${items.map((s,i)=>`${i?'<span aria-hidden="true">→</span>':''}<b>${s}</b>`).join('')}</div>`;
const point=(title,text)=>`<div class="qa-point"><strong>${title}</strong><p>${text}</p></div>`;
function content(i){
 const {sample:s,rollout:r}=context;
 const id=`R${r+1}·E${s.env+1}·T${String(s.t).padStart(4,'0')}`;
 const label=`<span class="qa-data-label">当前所选真实样本 <span class="mono">${id}</span></span>`;
 const first=window.PPO_DATA.rollouts[0].samples[0];
 if(i===0)return {
  title:'这是样本的“地址”，不是训练轮数',lead:'R1·E1·T0000 指的是：第 1 批采样、第 1 个环境、第 0 个时间步的那条样本。',
  body:`<div class="qa-code-parts"><div><b>R1</b><strong>Rollout 1</strong><p>第 1 批采样。4 个环境各 1024 步，共 4096 条样本。</p></div><div><b>E1</b><strong>Environment 1</strong><p>4 个独立环境中的第 1 个。这里 E 指环境，不是 epoch。</p></div><div><b>T0000</b><strong>Time step 0</strong><p>这个环境在本批中的第 0 步；编号从 0000 到 1023。</p></div></div>${label}<p>你选中的样本来自第 <strong>${r+1}</strong> 批、第 <strong>${s.env+1}</strong> 个环境、采样时间步 <strong>${s.t}</strong>。它在自己的 episode 内是第 ${s.episode_step+1} 步，两个计数不必相同。</p>${point('reset 不会把 T 清零','T 统计本次 rollout 已采多少步；episode 中途结束并 reset 后，它仍继续递增。下一批 rollout 才重新从 T0000 开始。')}${point('同一编号，学十遍','这条样本在每个 epoch 出现一次，共参与 10 次 minibatch 损失计算。编号与采样时的数据保留，当前网络不断变化。展开下方的训练记录可以逐次查看。')}`,
  takeaway:'R 看哪批数据，E 看哪个环境，T 看哪次交互；同一条样本重复训练时，地址不变。'};
 if(i===1)return {
  title:'四个数，是 MuJoCo 当前状态的读数',lead:'环境把“小车在哪、摆杆多斜、各自在怎样运动”打包成四维观测，交给策略和价值网络。',
  body:`${label}<div class="qa-table-wrap"><table class="qa-table"><thead><tr><th>位置</th><th>含义</th><th>当前读数</th><th>单位</th></tr></thead><tbody><tr><td>第 1 个</td><td>小车位置</td><td class="mono">${f(s.obs[0])}</td><td>米</td></tr><tr><td>第 2 个</td><td>摆杆相对竖直的角度</td><td class="mono">${f(s.obs[1])}</td><td>弧度</td></tr><tr><td>第 3 个</td><td>小车速度</td><td class="mono">${f(s.obs[2])}</td><td>米/秒</td></tr><tr><td>第 4 个</td><td>摆杆角速度</td><td class="mono">${f(s.obs[3])}</td><td>弧度/秒</td></tr></tbody></table></div>${point(`最初的 [${first.obs.map(x=>f(x)).join(', ')}] 怎么来？`,`底层 reset 先生成带微小随机扰动的状态。训练包装器保留小车位置，把摆角在 −10° 到 +10° 内均匀随机采样，再把两个速度清零。第一条真实记录的角度是 ${f(first.obs[1],6)} 弧度，约 ${f(first.obs[1]*180/Math.PI,2)}°。每次训练 reset 都重新采样；测试时则指定 +10°、−10°，两侧各一个完整回合。`)}${chain(['reset 初始化','修改角度与速度','set_state 写回','读取 qpos + qvel'])}<p>内部 <code>qpos</code> 保存两个位置量，<code>qvel</code> 保存两个速度量；<code>_get_obs()</code> 把它们按表中顺序拼接。后续每次 step，也会从仿真器重新读取这四个量。</p>${point('为什么必须知道速度？','同样倾斜 10°，可能正在继续倒下，也可能正在回到直立。速度告诉策略运动趋势，帮助选择下一次控制输入。')}`,
  takeaway:'这些数是动作前的状态观测；环境执行动作后，又会返回更新后的四个数。'};
 if(i===2)return {
  title:'选用高斯形状，学习它的均值与标准差',lead:'这个连续动作策略预先选择用高斯分布表示“当前状态下要尝试哪些动作”，训练负责调整分布参数。',
  body:`${chain(['四维观测','Actor 算均值','结合可训练标准差','高斯分布','采样动作'])}<div class="qa-pair">${point('均值：由状态经过网络算出','Actor 的网络参数决定如何把四个输入变成均值。状态变了，均值也可能变化。初始网络输出通常接近零；页面显示的是当前真实记录的数值，并经过了舍入。')}${point('标准差：独立的可训练参数','本脚本的默认策略维护 log_std，初始值为 0，取指数得到标准差 1。它不由每次的观测单独算出；同一时刻对不同状态共享，但会随 PPO 更新而变化。')}</div>${equation(String.raw`\sigma=\exp(\mathrm{log\_std}),\qquad a_t\sim\mathcal N\!\left(\mu_\theta(s_t),\sigma^2\right)`)}${label}<div class="qa-readings"><span>均值 <b>${f(s.mean,5)}</b></span><span>标准差 <b>${f(s.std,5)}</b></span><span>本次采样 <b>${f(s.action,5)}</b></span></div><p>均值给出动作的中心，标准差决定随机尝试的分散程度。同样的观测也可能采到不同动作，让策略获得不同尝试的反馈；一次采到 0.432 并不意味着以后都输出这个动作。</p>${point('训练与评估如何不同？','训练从分布随机采样；你的评估代码使用 deterministic=True，通常直接取均值。PPO 在采样后的更新阶段调整参数，下一轮再用更新后的分布采样。ent_coef=0 只是关闭额外熵奖励，随机采样仍然存在。')}`,
  takeaway:'高斯分布的形状是策略设计选择；具体均值和标准差由网络与可训练参数决定。'};
 if(i===3)return {
  title:'Critic 输入当前观测，输出一个未来回报估计',lead:'value 回答：从这个状态出发，继续按照当前策略行动，未来大约能拿到多少折扣累计奖励？',
  body:`${chain(['四维观测','Critic 多层网络','一个标量 value'])}${equation(String.raw`V_\phi(s_t)\approx\mathbb E_{\pi}\!\left[\sum_{k=0}^{\infty}\gamma^k r_{t+k}\mid s_t\right]`)}<p>第一条记录中的 <strong>${f(first.old_value)}</strong> 是第一次采样时，尚未训练好的网络根据初始参数算出的结果。它只是预测，不保证准确。每次采样，Critic 都会对当时的观测做前向计算。</p>${label}<div class="qa-readings"><span>采样时 value <b>${f(s.old_value,5)}</b></span><span>原始优势 <b>${f(s.advantage,5)}</b></span><span>return 目标 <b>${f(s.return,5)}</b></span></div>${point('得到经历后，才构造训练目标','采样满一批后，结合实际奖励、后续价值估计和结束边界，先计算 GAE 优势，再将原始优势加回采样时 value，得到 return。return 也含 bootstrap 估计，不等于已经观察到的完整未来回报。')}${equation(String.raw`R_t^{\mathrm{target}}=A_t^{\mathrm{GAE}}+V_{\mathrm{old}}(s_t)`)}<p>例如第一条真实样本：旧 value ${f(first.old_value,5)}，原始优势 ${f(first.advantage,5)}，return ${f(first.return,5)}。训练用当前 Critic 的预测与这个固定目标比较，反向传播调整网络参数。</p>${equation(String.raw`L_V=\operatorname{mean}\!\left[\left(V_\phi(s_t)-R_t^{\mathrm{target}}\right)^2\right]`)}<div class="qa-terms"><p><strong>reward</strong>：环境本步给的即时反馈。</p><p><strong>value</strong>：网络预测未来能得到多少奖励。</p><p><strong>return</strong>：根据采样经历构造的 Critic 训练目标。</p></div><p>10 个 epoch 中，目标保持固定，当前预测不断变化。网络同时拟合许多样本，单条样本的误差不保证每轮都下降。</p>`,
  takeaway:'先预测 value，再收集经历构造目标，最后用误差训练 Critic；这三个环节发生在不同时间。'};
 if(i===4)return {
  title:'是的，两个物理步都保持同一个控制输入',lead:'PPO 每个环境步只选择一次动作。MuJoCo 保持该输入，连续推进两个物理步，随后才把反馈返回给 PPO。',
  body:`${label}<div class="qa-physics"><div><span>动作选择</span><b>输入 ${f(s.executed_action)}</b><p>写入 data.ctrl</p></div><div><span>物理步 1</span><b>0 → 0.02 秒</b><p>保持同一输入，更新运动状态</p></div><div><span>物理步 2</span><b>0.02 → 0.04 秒</b><p>从上一步末状态继续推进</p></div><div><span>反馈给 PPO</span><b>一次 obs + reward</b><p>下一次动作选择此后才发生</p></div></div><p>每个物理步中，MuJoCo 根据当前状态、执行器作用、重力与约束等计算运动，更新位置和速度。第二步继续施加同一输入，但状态已经改变，因此运动结果不必与第一步相同。这是持续保持的控制输入，不是两次互不相干的“瞬间推一下”。</p>${point('把“力 0.432”说准确','0.432 首先是传入模拟器的控制输入，不应直接称为 0.432 牛顿。这个模型的滑动关节 motor 配置 gear=100；在此直接驱动电机模型中，执行器作用到小车关节的力为控制输入的 100 倍。例如输入约 0.432，对应执行器力约 43.2 牛顿。其他作用力仍会共同影响实际运动。')}${equation(String.raw`F_{\mathrm{actuator}}=100\,u,\qquad \Delta t_{\mathrm{env}}=2\times0.02=0.04\;\mathrm{s}`)}<p>两个物理步之间不会调用 Actor，也不单独返回 reward。网页中的中间姿态是首末状态的视觉插值，不是额外记录的子步状态。</p>`,
  takeaway:'动作频率与物理积分频率不同：控制输入保持 0.04 秒，仿真每 0.02 秒推进一次。'};
 if(i===5)return {
  title:'每个环境步健康就给 1，但不必等到真的倒地',lead:'reward 由环境代码规定。这个任务用“在允许角度内坚持更久”来定义好坏，每完成一个环境步检查一次。',
  body:`<div class="qa-table-wrap"><table class="qa-table"><thead><tr><th>两个物理步结束后的检查</th><th>reward</th><th>terminated</th></tr></thead><tbody><tr><td>摆角绝对值 ≤ 0.2 弧度，且状态均为有限值</td><td>1</td><td>false</td></tr><tr><td>摆角绝对值 > 0.2 弧度，或出现非有限数值</td><td>0</td><td>true</td></tr></tbody></table></div>${point('健康范围约为左右 11.46°','摆杆只要倾斜超过约 11.46°就终止，不必真的倒在地上。训练初始角度在 −10° 到 +10° 内随机；测试使用的 ±10° 靠近两侧边界。源码在整个环境步结束后检查最终观测，不在两个子步之间单独作结束判断。')}<div class="qa-rewards" aria-label="示意：5 个健康步各奖励 1，第 6 步终止奖励 0"><span class="qa-data-label">机制示例 · 不是当前轨迹</span><div>${[1,2,3,4,5,6].map(n=>`<span class="${n===6?'failed':''}"><small>第 ${n} 步</small><b>${n===6?'0':'1'}</b><small>${n===6?'终止':'健康'}</small></span>`).join('')}</div><p>这个示例回合的原始奖励总和为 5。它推动策略让系统保持健康更久。</p></div>${label}<p>本条记录的原始 reward 为 <strong>${s.reward}</strong>，任务终止标记为 <strong>${s.done&&!s.truncated}</strong>，时间截断标记为 <strong>${s.truncated}</strong>。reward 不按每个物理子步发放；两个子步合计只得到一次反馈。</p>${point('到时间上限时怎么办？','原环境默认 1000 个环境步。若最后一步仍健康，reward 仍为 1，但 TimeLimit 会令 truncated=true，随后 reset。任务失败的 terminated 与时间到了的 truncated 要区分；时间截断还涉及末状态价值的 bootstrap。')}`,
  takeaway:'这个奖励鼓励多坚持几个健康的环境步；value 则试图预测之后还能累计多少奖励。'};
 return window.PPO_LESSON.extraQuestion(i,s,r);
}
function paint(){
 const c=content(active);
 $('question-nav').innerHTML=topics.map((t,i)=>`<button type="button" data-question="${i}" aria-controls="question-answer" aria-pressed="${i===active}" class="question-button ${i===active?'active':''}"><span>0${i+1}</span>${t}</button>`).join('');
 $('question-answer').innerHTML=`<span class="eyebrow">QUESTION 0${active+1}</span><h4 id="question-title">${c.title}</h4><p class="qa-lead">${c.lead}</p><div class="qa-content">${c.body}</div><p class="qa-takeaway">${c.takeaway}</p>`;
 $('question-answer').querySelectorAll('[data-qa-math],[data-lesson-math]').forEach(el=>katex.render(el.dataset.qaMath||el.dataset.lessonMath,el,{displayMode:true,throwOnError:true}));
}
window.renderLessonQuestions=ctx=>{
 context=ctx;
 if(lastChapter!==ctx.chapter){manual=false;lastChapter=ctx.chapter;}
 if(!manual)active=ctx.section==='task'?5:ctx.section==='episode'?1:ctx.section==='interaction'?([1,2,2,4,5,0][ctx.step]):ctx.section==='trajectory'?0:ctx.section==='rollout'?5:ctx.section==='training'?(['trace-intro','trace','compare'].includes(ctx.lessonKind)?6:ctx.lessonKind==='derive'?7:['roles','usage'].includes(ctx.lessonKind)?8:3):4;
 paint();
};
document.addEventListener('click',event=>{const button=event.target.closest('[data-question]');if(button){active=Number(button.dataset.question);manual=true;paint();}});
})();

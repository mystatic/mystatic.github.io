
(() => {
const root=document.getElementById('sm-swimlanes-v2');
const $=id=>root.querySelector('#'+id);
const phases=[{name:'① 仿真采样',start:0,end:3},{name:'② 学世界模型',start:4,end:7},{name:'③ 模型内推演',start:8,end:15},{name:'④ 学 Actor',start:16,end:16},{name:'⑤ 学 Critic',start:17,end:17},{name:'⑥ 下一轮',start:18,end:18}];
const rows=[['ref','参考动作','想做什么'],['actor','Actor','策略网络'],['sim','物理仿真器','产生交互结果'],['buffer','数据池','保存仿真记录'],['wm','World Model','预测动作后果'],['reward','奖励 / 回报','评价与训练目标'],['critic','Critic','估计未来回报']];
const steps=[
 ['读取输入','无','当前仿真状态与参考目标交给 Actor；这里展示的是训练中任意一轮，不是假设已有成熟策略。'],
 ['生成动作','无','Actor 输出动作，采样阶段加入探索噪声；记录的是实际执行的含噪动作。'],
 ['物理仿真','无','物理仿真器执行动作并返回下一状态；下一步仍由 Actor 根据新的观测决定动作。'],
 ['记录结果','无','保存连续的交互记录；采样环节可多次重复，不把这里的长度固定成 32 步。'],
 ['抽取 8 步','无','世界模型训练读取连续 8 步记录；动作是已执行的历史动作，不由 Actor 重新生成。'],
 ['预测 8 步','无','世界模型从记录的初始状态出发，沿记录中的动作序列自回归预测 8 步。'],
 ['对照记录','无','比较预测与记录中的状态、奖励等目标；解析计算的输出头没有可训练损失。'],
 ['更新模型','World Model','预测误差反传，只更新世界模型；这一训练阶段包含多批窗口，并非只做一次梯度更新。'],
 ['抽取起点','无','重新从数据池抽起始状态及仿真条件；此后的动作由当前 Actor 决定，不再照搬历史动作。'],
 ['第 1 次出动作','无','Actor 根据起始观测和参考目标产生动作；Actor、世界模型和 Critic 的参数都保持固定。'],
 ['第 1 次预测','无','世界模型接收状态和动作，预测下一状态；奖励与终止同时使用对应的参考目标，可由学习头或解析规则得到。'],
 ['第 2 次出动作','无','Actor 使用刚预测出的新观测再决定动作；并不是只采一个初始动作，再让模型自由播放。'],
 ['第 2 次预测','无','世界模型继续预测，记录这一步的奖励与终止信息；这里还没有更新任何网络参数。'],
 ['重复至 32 步','无','重复“Actor 出动作 → 世界模型预测”，直到 32 步；图中省略中间重复步骤，不代表只执行两步。'],
 ['Critic 估值','无','Critic 根据状态、参考目标和仿真条件估值；这一步集中展示轨迹各处所需的价值计算；第 32 步的末端价值补充短期推演之后的回报。'],
 ['构造优化目标','无','形成 Actor 的预测回报目标，并由想象轨迹构造 Critic 的 GAE / λ-return 目标；后者在拟合期间固定。'],
 ['反传更新策略','Actor','从预测回报反传，穿过固定的世界模型与末端 Critic，只更新 Actor；不是 PPO 的 Advantage 加权更新。'],
 ['拟合价值目标','Critic','Critic 对照刚才固定的回报目标学习；世界模型与 Actor 不更新，目标并非新采集的实机结果。'],
 ['新策略再采样','无','更新后的 Actor 回到物理仿真器采集新记录；再从第 ② 阶段继续纠正世界模型，循环重复。']
];
const events=[];
const add=(row,col,title,sub,kind='compute')=>events.push({id:row+'-'+col,row,col,title,sub,kind});
add('ref',0,'参考运动','提供当前目标','read');add('sim',0,'当前状态','转换为观测');add('actor',0,'读取输入','观测 + 目标','read');
add('actor',1,'生成控制指令','动作 + 探索噪声');
add('sim',2,'执行控制指令','得到下一状态');add('reward',2,'计算采样奖励','来自仿真结果');
add('buffer',3,'写入交互记录','状态、执行动作、结果','write');add('actor',3,'继续交互','新观测 → 新动作');
add('buffer',4,'取连续 8 步','起点、动作、结果','read');
add('wm',5,'连续预测 8 步','沿记录中的动作');
add('buffer',6,'提供监督答案','记录中的实际结果','read');add('wm',6,'计算预测误差','预测值 vs 记录值');
add('wm',7,'更新模型参数','使预测接近记录','update');
add('buffer',8,'抽起始状态','附带仿真条件','read');
add('ref',9,'参考目标','当前目标','read');add('actor',9,'输出动作 1','起始观测 → 动作');
add('wm',10,'预测状态 1','起始状态 + 动作 1');add('reward',10,'记录预测奖励 1','以及终止信息','write');
add('ref',11,'参考目标','下一时刻目标','read');add('actor',11,'输出动作 2','预测观测 1 → 动作');
add('wm',12,'预测状态 2','状态 1 + 动作 2');add('reward',12,'记录预测奖励 2','以及终止信息','write');
add('ref',13,'目标随时间推进','参考运动固定','read');add('actor',13,'继续产生动作','重复到第 32 步');add('wm',13,'继续预测状态','得到第 32 步状态');add('reward',13,'保留想象轨迹','预测奖励与终止','write');
add('critic',14,'固定参数估值','含第 32 步末端价值');
add('reward',15,'构造两类目标','Actor 回报 / Critic 目标');
add('reward',16,'回报对动作求导','沿推演计算链','gradient');add('critic',16,'固定参数传导','末端价值对状态求导','gradient');add('wm',16,'固定参数传导','动作如何影响结果','gradient');add('actor',16,'更新策略参数','改进未来动作','update');
add('reward',17,'固定回报目标','本批 GAE / λ-return','read');add('critic',17,'更新价值参数','拟合固定回报目标','update');
add('actor',18,'新 Actor 出动作','策略已更新');add('sim',18,'新的物理交互','检验新动作后果');add('buffer',18,'新增交互记录','进入下一轮模型训练','write');
add('ref',2,'对应参考目标','用于奖励 / 终止','read');
add('ref',10,'对应参考目标','用于奖励 / 终止','read');
add('ref',12,'对应参考目标','用于奖励 / 终止','read');
add('ref',14,'对应目标','价值也依赖任务','read');
const edges=[
 ['ref-2','reward-2'],['ref-10','reward-10'],['ref-12','reward-12'],['ref-14','critic-14'],['ref-13','reward-13'],

 ['ref-0','actor-0'],['sim-0','actor-0'],['actor-0','actor-1'],['actor-1','sim-2'],['sim-2','reward-2'],['sim-2','buffer-3'],['reward-2','buffer-3'],['actor-1','buffer-3'],['sim-2','actor-3'],
 ['buffer-3','buffer-4'],['buffer-4','wm-5'],['wm-5','wm-6'],['buffer-6','wm-6'],['wm-6','wm-7','gradient'],
 ['buffer-8','actor-9'],['ref-9','actor-9'],['buffer-8','wm-10'],['actor-9','wm-10'],['wm-10','reward-10'],['wm-10','actor-11'],['ref-11','actor-11'],['wm-10','wm-12'],['actor-11','wm-12'],['wm-12','reward-12'],
 ['wm-12','actor-13'],['ref-13','actor-13'],['actor-13','wm-13'],['wm-13','reward-13'],['wm-13','critic-14'],['reward-13','reward-15'],['critic-14','reward-15'],
 ['reward-15','reward-16'],['reward-16','critic-16','gradient'],['reward-16','wm-16','gradient'],['critic-16','wm-16','gradient'],['wm-16','actor-16','gradient'],
 ['reward-15','reward-17'],['reward-17','critic-17'],['actor-16','actor-18'],['actor-18','sim-18'],['sim-18','buffer-18']
];
const eventById=new Map(events.map(e=>[e.id,e]));
let cursor=0,timer=null;
let initial;try{initial=JSON.parse(localStorage.getItem('supermimic-blog-timeline-v1')||'null')}catch{}
if(initial?.version===2&&Number.isInteger(initial.cursor)&&initial.cursor>=0&&initial.cursor<steps.length)cursor=initial.cursor;
function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
for(let i=0;i<=steps.length;i++)$('sw-cols').append(make('col'));
const groupRow=make('tr'),corner=make('th','sw-rowhead','模块 ↓ / 时间 →');corner.rowSpan=2;corner.scope='col';groupRow.append(corner);
phases.forEach((phase,i)=>{const th=make('th','sw-group');th.append(make('span','sw-group-label',phase.name));th.colSpan=phase.end-phase.start+1;th.scope='colgroup';groupRow.append(th);const b=make('button','btn btn-ghost',phase.name);b.type='button';b.dataset.phase=String(i);b.addEventListener('click',()=>select(phase.start));$('sw-stage-nav').append(b);});
$('sw-head').append(groupRow);const columnRow=make('tr');
steps.forEach((step,i)=>{const th=make('th');th.scope='col';th.dataset.col=String(i);const b=make('button','btn btn-ghost',String(i+1).padStart(2,'0'));b.type='button';b.dataset.columnButton=String(i);b.setAttribute('aria-label','时间列 '+(i+1)+'：'+step[0]);b.addEventListener('click',()=>select(i));th.append(b,make('div','text-small',step[0]));columnRow.append(th);});$('sw-head').append(columnRow);
rows.forEach(([id,name,sub])=>{const tr=make('tr');tr.dataset.row=id;const th=make('th','sw-rowhead');th.scope='row';th.append(make('span','sw-name',name),make('span','text-small text-muted',sub));tr.append(th);for(let col=0;col<steps.length;col++){const td=make('td');td.dataset.col=String(col);const e=eventById.get(id+'-'+col);if(e){const node=make('div','sw-event');node.id='sw-e-'+e.id;node.dataset.kind=e.kind;node.append(make('span','',e.title),make('span','text-small text-muted',e.sub));td.append(node);}else td.append(make('span','sw-empty','—'));tr.append(td);}$('sw-body').append(tr);});
function save(){try{localStorage.setItem('supermimic-blog-timeline-v1',JSON.stringify({version:2,cursor}))}catch{}}
function stop(){if(timer!==null)clearInterval(timer);timer=null;$('sw-play').textContent='播放一轮';}
function select(index){stop();cursor=index;render(true);save();}
function draw(){const plane=$('sw-plane'),svg=$('sw-wires'),lines=$('sw-lines'),box=plane.getBoundingClientRect();svg.setAttribute('width',String(plane.scrollWidth));svg.setAttribute('height',String(plane.scrollHeight));lines.replaceChildren();edges.forEach(([from,to,kind])=>{const target=eventById.get(to);if(target.col!==cursor)return;const a=$('sw-e-'+from).getBoundingClientRect(),b=$('sw-e-'+to).getBoundingClientRect();let path;if(eventById.get(from).col===target.col){const x=a.left-box.left-5;const ay=a.top-box.top+a.height/2,by=b.top-box.top+b.height/2;path=`M ${a.left-box.left-1} ${ay} H ${x} V ${by} H ${b.left-box.left-2}`;}else{const ax=a.right-box.left+2,ay=a.top-box.top+a.height/2,bx=b.left-box.left-3,by=b.top-box.top+b.height/2,mx=bx-8;path=`M ${ax} ${ay} H ${mx} V ${by} H ${bx}`;}const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);line.setAttribute('fill','none');line.setAttribute('stroke',kind==='gradient'?'var(--viz-series-4)':'var(--viz-series-2)');line.setAttribute('stroke-width','1.6');if(kind==='gradient')line.setAttribute('stroke-dasharray','5 4');line.setAttribute('marker-end',kind==='gradient'?'url(#sw-grad-head)':'url(#sw-data-head)');line.dataset.from=from;line.dataset.to=to;lines.append(line);});}
function render(scroll){
const changing=steps[cursor][1];
$('sw-freeze').replaceChildren(...['Actor','World Model','Critic'].map(name=>{const el=make('span',name===changing?'updating':'fixed',name+'：'+(name===changing?'更新权重':'权重固定'));return el}));
const phase=phases.find(p=>cursor>=p.start&&cursor<=p.end);$('sw-current').textContent=phase.name+' · '+steps[cursor][0];$('sw-updates').textContent='参数更新：'+steps[cursor][1];$('sw-count').textContent=String(cursor+1).padStart(2,'0')+' / 19';$('sw-detail').textContent=steps[cursor][2];$('sw-range').value=String(cursor);$('sw-range').setAttribute('aria-valuetext','时间列 '+(cursor+1)+'，'+steps[cursor][0]);$('sw-prev').disabled=cursor===0;$('sw-next').disabled=cursor===steps.length-1;root.querySelectorAll('[data-col]').forEach(n=>n.classList.toggle('sw-selected',Number(n.dataset.col)===cursor));events.forEach(e=>$('sw-e-'+e.id).classList.toggle('sw-hot',e.col===cursor));root.querySelectorAll('[data-phase]').forEach(b=>b.setAttribute('aria-pressed',String(phases[Number(b.dataset.phase)]===phase)));root.querySelectorAll('[data-column-button]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.columnButton)===cursor)));requestAnimationFrame(()=>{draw();if(scroll){const cell=root.querySelector('thead [data-col="'+cursor+'"]'),scroller=$('sw-scroll'),rowhead=root.querySelector('.sw-rowhead'),r=cell.getBoundingClientRect(),s=scroller.getBoundingClientRect();const left=r.left-s.left+scroller.scrollLeft;const rowWidth=rowhead.getBoundingClientRect().width;const visibleColumns=Math.floor((scroller.clientWidth-rowWidth-20)/r.width);const previousColumns=Math.min(2,Math.max(0,visibleColumns-1));const offset=rowWidth+20+previousColumns*r.width;scroller.scrollTo({left:Math.max(0,left-offset),behavior:'auto'});}});}
$('sw-prev').addEventListener('click',()=>select(Math.max(0,cursor-1)));$('sw-next').addEventListener('click',()=>select(Math.min(steps.length-1,cursor+1)));$('sw-range').addEventListener('input',e=>select(Number(e.target.value)));$('sw-play').addEventListener('click',()=>{if(timer!==null){stop();return;}if(cursor===steps.length-1)cursor=0;render(true);save();$('sw-play').textContent='暂停';timer=setInterval(()=>{cursor++;render(true);save();if(cursor===steps.length-1)stop();},4200);});
new ResizeObserver(()=>draw()).observe($('sw-plane'));
window.addEventListener('resize',()=>render(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
render(cursor!==0);
})();

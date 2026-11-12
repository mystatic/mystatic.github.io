
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

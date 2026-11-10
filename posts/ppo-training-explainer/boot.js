/* Lossless compressed records online; original scripts also support file://. */
(() => {
'use strict';
const datasets = [{"global":"PPO_DATA","script":"data.js","gzip":"data.json.gz","raw_bytes":10840050,"gzip_bytes":3749328},{"global":"PPO_EVALUATION","script":"comparison-run-seed0/evaluation.js","gzip":"comparison-run-seed0/evaluation.json.gz","raw_bytes":2382459,"gzip_bytes":793531},{"global":"PPO_TRAINING_HISTORY","script":"comparison-run-seed0/training-history.js","gzip":"comparison-run-seed0/training-history.json.gz","raw_bytes":435269,"gzip_bytes":38290}];
const status = document.getElementById('load-state');
const lesson = document.querySelector('.lesson-layout');
function script(src) {
  return new Promise((resolve,reject) => {
    const s = document.createElement('script');
    s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('无法载入 '+src));
    document.head.appendChild(s);
  });
}
async function data(d) {
  if (location.protocol !== 'file:' && typeof DecompressionStream === 'function') {
    try {
      const response=await fetch(d.gzip);
      if (!response.ok || !response.body) throw new Error('数据暂不可用');
      window[d.global]=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
      return;
    } catch (_) { /* Original scripts are the compatibility and transfer-error fallback. */ }
  }
  await script(d.script);
  if (!window[d.global]) throw new Error('数据未完整载入');
}
(async () => {
  let completed=0;
  await Promise.all([script('vendor/katex/katex.min.js'), ...datasets.map(async d=>{
    await data(d);completed++;status.textContent=`正在载入真实训练记录（${completed} / 3）…`;
  })]);
  for (const name of ['training-history.js','comparison.js','learning.js','questions.js','app.js']) await script(name);
  if (!window.PPO_VIEW) throw new Error('交互课件未初始化');
  lesson.removeAttribute('inert');lesson.removeAttribute('aria-busy');status.hidden=true;
})().catch(error=>{
  status.textContent='课件资源未能完整载入，请检查网络后重试。';
  const retry=document.createElement('button');retry.type='button';retry.textContent='重新载入';
  retry.addEventListener('click',()=>location.reload());status.append(' ',retry);
  console.error(error);
});
})();

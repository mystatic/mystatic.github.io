
(() => {
  document.querySelectorAll('.report-video').forEach(figure => {
    const video=figure.querySelector('video'), select=figure.querySelector('select');
    if(!video || !select)return;
    const applySpeed=()=>{video.defaultPlaybackRate=Number(select.value);video.playbackRate=Number(select.value);};
    applySpeed();video.addEventListener('loadedmetadata',applySpeed);select.addEventListener('change',applySpeed);
    figure.querySelector('.video-fullscreen').addEventListener('click',async()=>{
      const status=figure.querySelector('.video-status');
      try {
        if(video.requestFullscreen)await video.requestFullscreen();
        else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
        else status.textContent='请使用播放器自带的全屏控件。';
      } catch {status.textContent='当前浏览器未允许全屏，请使用播放器控件。';}
    });
  });
  const toc = document.querySelector('.toc-details');
  const narrow = window.matchMedia('(max-width: 900px)');
  const adaptToc = () => { toc.open = !narrow.matches; };
  adaptToc(); narrow.addEventListener('change', adaptToc);
  document.querySelectorAll('.report-toc a').forEach(a => a.addEventListener('click', () => {if(narrow.matches) toc.open = false;}));
  const triggers = document.querySelectorAll('.image-zoom-trigger');
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '可缩放图片预览');
  overlay.hidden = true;
  overlay.innerHTML = '<div class="zoom-toolbar"><button type="button" class="zoom-in" aria-label="放大图片">放大 ＋</button><button type="button" class="zoom-out" aria-label="缩小图片">缩小 −</button><button type="button" class="zoom-fit">适合窗口</button><span class="zoom-level" aria-live="polite"></span><button type="button" class="image-lightbox-close" aria-label="关闭大图">关闭 ×</button></div><div class="zoom-viewport" tabindex="0"><img alt=""></div>';
  document.body.append(overlay);
  const closeButton = overlay.querySelector('.image-lightbox-close');
  const viewport = overlay.querySelector('.zoom-viewport');
  const enlarged = viewport.querySelector('img');
  let activeTrigger = null, scale = 1, fitWidth = 1;
  const resize = () => {
    const ratio = enlarged.naturalHeight / enlarged.naturalWidth;
    fitWidth = Math.min(enlarged.naturalWidth, viewport.clientWidth - 32, (viewport.clientHeight - 32) / ratio);
    enlarged.style.width = Math.max(1, fitWidth * scale) + 'px';
    overlay.querySelector('.zoom-level').textContent = Math.round(scale * 100) + '%';
  };
  const zoom = value => {scale = Math.max(1, Math.min(5, value));resize();};
  const close = () => {
    overlay.hidden = true;
    document.body.classList.remove('image-lightbox-open');
    if (activeTrigger) activeTrigger.focus();
    activeTrigger = null;
  };
  const open = async trigger => {
    const source = trigger.querySelector('img');
    activeTrigger = trigger;
    enlarged.src = source.currentSrc || source.src;
    enlarged.alt = source.alt;
    scale = 1;
    overlay.hidden = false;
    document.body.classList.add('image-lightbox-open');
    await enlarged.decode().catch(() => {});
    resize(); viewport.scrollTo(0,0); closeButton.focus();
  };
  document.addEventListener('click', event => {
    const trigger=event.target.closest('.image-zoom-trigger,.flowchart-zoom');
    if(trigger)open(trigger);
  });
  closeButton.addEventListener('click',close);
  overlay.querySelector('.zoom-in').addEventListener('click',()=>zoom(scale*1.5));
  overlay.querySelector('.zoom-out').addEventListener('click',()=>zoom(scale/1.5));
  overlay.querySelector('.zoom-fit').addEventListener('click',()=>zoom(1));
  window.addEventListener('resize',()=>{if(!overlay.hidden)resize();});
  document.addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape')close();
    if(event.key==='+'||event.key==='=')zoom(scale*1.5);
    if(event.key==='-')zoom(scale/1.5);
    if(event.key==='Tab'){
      const focusables=[...overlay.querySelectorAll('button,[tabindex="0"]')];
      const first=focusables[0],last=focusables.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
})();

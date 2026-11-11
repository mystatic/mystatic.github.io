(() => {
  const dialog = document.getElementById('image-dialog');
  const image = document.getElementById('large-image');
  let lastTrigger;
  document.querySelectorAll('.zoom-trigger').forEach(button => {
    button.addEventListener('click', () => {
      lastTrigger = button;
      image.src = button.dataset.image;
      image.alt = button.querySelector('img').alt;
      document.getElementById('image-caption').textContent = image.alt;
      dialog.showModal();
    });
  });
  document.getElementById('image-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {if (e.target === dialog) dialog.close()});
  dialog.addEventListener('close', () => lastTrigger?.focus());
  document.getElementById('print').addEventListener('click', () => window.print());
  const links = [...document.querySelectorAll('.chapter-nav nav a')];
  const chapters = links.map(a => document.querySelector(a.hash));
  function currentChapter() {
    let current = 0;
    chapters.forEach((heading,i) => {if (heading.getBoundingClientRect().top <= 150) current = i});
    links.forEach((link,i) => {if(i === current) link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')});
  }
  let scheduled = false;
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {currentChapter();scheduled=false});
  }, {passive:true});
  currentChapter();
  // Open every derivation when printing, then restore the reader's choices.
  let detailsState = [];
  window.addEventListener('beforeprint', () => {
    detailsState = [...document.querySelectorAll('details')].map(el => [el,el.open]);
    detailsState.forEach(([el]) => el.open=true);
  });
  window.addEventListener('afterprint', () => detailsState.forEach(([el,open]) => el.open=open));
})();

(() => {
  let active = null;
  function closePlayer(box, focus = false) {
    box.querySelector('iframe')?.remove();
    const button = box.querySelector('.pb-load');
    button.hidden = false;
    box.querySelector('.pb-close').hidden = true;
    if (focus) button.focus();
    if (active === box) active = null;
  }
  // Delegation works for players added later and avoids one handler per video.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('.pb-load, .pb-close');
    if (!control) return;
    const box = control.closest('.pb-video');
    if (!box) return;
    event.preventDefault();
    if (control.classList.contains('pb-close')) {
      closePlayer(box, true);
      return;
    }
    if (active) closePlayer(active);
    const frame = document.createElement('iframe');
    frame.title = control.getAttribute('aria-label');
    frame.src = box.dataset.player;
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    control.hidden = true;
    box.querySelector('.pb-stage').append(frame);
    box.querySelector('.pb-close').hidden = false;
    active = box;
    frame.focus();
  });
})();

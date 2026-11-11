(() => {
  const cards = [...document.querySelectorAll('.post-card[data-category]')];
  const group = document.getElementById('post-filters');
  const status = document.getElementById('filter-status');
  if (!group || !status || !cards.length) return;
  const categories = ['全部', ...new Set(cards.map(card => card.dataset.category))];
  const buttons = categories.map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-button';
    button.dataset.category = category;
    const label = document.createElement('span');
    label.textContent = category;
    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = '(' + cards.filter(card => category === '全部' || card.dataset.category === category).length + ')';
    button.append(label, count);
    button.addEventListener('click', () => select(category));
    group.append(button);
    return button;
  });
  function select(category) {
    let visible = 0;
    cards.forEach(card => {
      const show = category === '全部' || card.dataset.category === category;
      card.hidden = !show;
      if (show) visible++;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    document.querySelectorAll('.empty-note').forEach(note => note.hidden = category !== '全部');
    status.textContent = '显示 ' + visible + ' 篇文章 · ' + category;
  }
  select('全部');
  group.hidden = false;
  status.hidden = false;
})();

(() => {
  const STORAGE_KEY = 'rn-theme';
  const root = document.documentElement;

  const MODULES = {
    agent: {
      kicker: '01 · STACK',
      title: 'Agent',
      desc: 'System 2 级高层推理、Coding Agent 与技能演化：机器人如何读懂多模态轨迹反馈、编写演化控制程序并通过真实实验闭环改进策略。',
    },
    system1: {
      kicker: '02 · STACK',
      title: 'System 1',
      desc: '端到端具身基础模型、世界—动作联合生成（WAM / VLA）与多步物理工作流记忆，连接高层任务意图与连续动作序列生成。',
    },
    system0: {
      kicker: '03 · STACK',
      title: 'System 0',
      desc: '底层全身运动跟踪与高频执行控制环：涵盖全身运动跟踪（Motion Tracking）、驱动器轨迹分工（PP / CSP）以及 MIT 阻抗与力矩闭环。',
    },
    hardware: {
      kicker: '04 · PHYSICAL',
      title: '硬件',
      desc: '机器人本体的机械与电驱物理边界：电机扭矩放大、谐波与行星减速器结构、关节透明度及硬件特性对 Sim2Real 的决定作用。',
    },
    rl: {
      kicker: '05 · FOUNDATION',
      title: '强化学习基础',
      desc: '策略优化的数学与算法地基：沿着采样回报、状态价值、TD 误差、GAE 优势估计到 Actor-Critic 与 PPO 多轮裁剪更新。',
    },
    robotics: {
      kicker: '06 · FOUNDATION',
      title: '机器人基础',
      desc: '经典机器人学理论底座：涵盖刚体位姿与坐标变换、正逆运动学（FK / IK）、雅可比矩阵、拉格朗日动力学与运动规划。',
    },
    product: {
      kicker: '07 · PRODUCT',
      title: 'Product',
      desc: '具身智能标杆产品、开源项目与工程系统全拆解：聚焦产品定位、全栈架构选型、真实落地边界与可复用开源资产核查。',
    },
  };

  const POSTS = [
    {
      title: 'Apple HALO：基于仿真的感知型人形机器人全身自主控制与开源拆解',
      moduleKey: 'product',
      moduleLabel: '07 · Product',
      format: '技术解读',
      date: '2026.11.23',
      metaNote: '全景解读 · 4 大技术追问 · 开源核查',
      summary:
        '深度拆解 Apple AIML 人形机器人自主系统 HALO：从 1,000 间虚拟家庭合成数据管线与 0.5/3/50Hz 全机载三层控制栈，到冻结 2B 生成器、带深度 System 0 三阶段 RL、零掉点 Sim2Real 细节及开源资产清单。',
      href: 'posts/apple-halo.html',
    },
    {
      title: 'ASPIRE：当 Coding Agent 接管机器人控制与技能演化',
      moduleKey: 'agent',
      moduleLabel: '01 · Agent',
      format: '技术解读',
      date: '2026.11.19',
      metaNote: '约 15–20 分钟 · 3 组交互与技能原文对照',
      summary:
        '从多模态闭环排障、渐进式查阅 SKILL.md 与逐块生长 policy.py 讲起，再逐字解剖 BEHAVIOR-1K 抓取技能样本，辨析仿真怪癖过滤、跨本体迁移与新场景摸索边界。',
      href: 'posts/aspire.html',
    },
    {
      title: 'ENPIRE：机器人怎样通过真实实验改进策略',
      moduleKey: 'agent',
      moduleLabel: '01 · Agent',
      format: '技术解读',
      date: '2026.11.16',
      metaNote: '机制长文 · 架构图与 9 段官方演示',
      summary:
        '用一张模块架构图串起环境复位与核验、编码 Agent、BC／RL 学习器和真机执行，再沿插销实例解释三层循环、并行研究与实验依据。',
      href: 'posts/enpire.html',
    },
    {
      title: 'GR00T 2：从联合想象与动作，到强化学习、Agent 和全身控制',
      moduleKey: 'system1',
      moduleLabel: '02 · System 1',
      format: '技术解读',
      date: '2026.11.14',
      metaNote: '机制长文 · 28 段官方演示',
      summary:
        '沿数据与动作的流向，理解世界—动作模型怎样联合生成视频与动作，再拆解跨具身迁移、强化学习、长任务 Agent 和人形全身控制。',
      href: 'posts/gr00t-2.html',
    },
    {
      title: 'Dyna-2.1：从单项技能到完整工作流',
      moduleKey: 'system1',
      moduleLabel: '02 · System 1',
      format: '技术解读',
      date: '2026.10.28',
      metaNote: '约 12 分钟',
      summary:
        '拆解 Taku、三层架构、URR、人类数据和工作流记忆，梳理一个物理智能体如何从“会做动作”走向“完成一项工作”。',
      href: 'posts/dyna-2-1-summary.html',
    },
    {
      title: 'PP、CSP 与 MIT：从轨迹规划到力矩控制',
      moduleKey: 'system0',
      moduleLabel: '03 · System 0',
      format: '交互教程',
      date: '2026.11.11 · 更新 2026.11.13',
      metaNote: '约 18–22 分钟 · 3 组交互',
      summary:
        '从 PP/CSP 的轨迹分工，到 MIT 动态闭环与力矩分解，再用未知负载实验理解前馈、角度误差与重心辨识。',
      href: 'posts/pp-vs-csp.html',
    },
    {
      title: 'SuperMimic 学习笔记：从运动跟踪到可微世界模型',
      moduleKey: 'system0',
      moduleLabel: '03 · System 0',
      format: '学习笔记',
      date: '2026.11.11',
      metaNote: '约 35–45 分钟 · 9 章学习笔记',
      summary:
        '从参考运动和仿真数据开始，沿七行时间流看懂世界模型、Actor 与 Critic 怎样更新，再依据论文实验解释训练速度、研究贡献与实机边界。',
      href: 'posts/supermimic-learning/',
    },
    {
      title: '谐波、行星与透明度：看懂机器人关节和 sim2real',
      moduleKey: 'hardware',
      moduleLabel: '04 · 硬件',
      format: '交互教程',
      date: '2026.11.10',
      metaNote: '约 10–15 分钟 · 3 个交互实验',
      summary:
        '从扭矩和减速器讲起，用机构动画、外力推动与控制响应实验，理解关节透明度，以及“谐波是否让强化学习更难落地”的结论与边界。',
      href: 'posts/gearboxes-joint-transparency-sim2real.html',
    },
    {
      title: 'PPO 如何学会稳住倒立摆',
      moduleKey: 'rl',
      moduleLabel: '05 · 强化学习基础',
      format: '交互教程',
      date: '2026.11.10',
      metaNote: '约 30–45 分钟 · 8 章交互教程',
      summary:
        '从一次 episode 跟到采样、reset、GAE 与同批数据的十轮学习，再用真实奖励曲线和训练前后对比，看懂 PPO 怎样逐渐学会平衡。',
      href: 'posts/ppo-training-explainer/',
    },
    {
      title: '从回报到 Actor-Critic · RL 学习笔记',
      moduleKey: 'rl',
      moduleLabel: '05 · 强化学习基础',
      format: '学习笔记',
      date: '2026.11.06',
      metaNote: '约 30 分钟',
      summary:
        '沿着采样回报、状态价值、TD、GAE 和 PPO 的主线，梳理强化学习从轨迹估计到 Actor-Critic 联合优化的核心概念。',
      href: 'posts/rl-learning-notes.html',
    },
  ];

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const label = document.getElementById('themeLabel');
    const icon = document.getElementById('themeIcon');
    if (label) label.textContent = theme === 'dark' ? '浅色' : '深色';
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '◐';
  }

  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.getAttribute('data-theme') || 'light');

    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    }

    // In-place view switching: Latest (default) <-> Selected Module
    const latestView = document.getElementById('latestView');
    const filteredView = document.getElementById('filteredView');
    const filteredKicker = document.getElementById('filteredKicker');
    const filteredTitle = document.getElementById('filteredTitle');
    const filteredDesc = document.getElementById('filteredDesc');
    const filteredList = document.getElementById('filteredList');
    const backLatestBtn = document.getElementById('backLatestBtn');

    const moduleTriggers = Array.from(document.querySelectorAll('[data-filter-module]'));
    let activeModule = 'latest';

    function setView(moduleKey) {
      activeModule = moduleKey;

      moduleTriggers.forEach((el) => {
        const key = el.getAttribute('data-filter-module');
        el.classList.toggle('is-active', key === moduleKey);
      });

      if (moduleKey === 'latest' || !MODULES[moduleKey]) {
        if (latestView) latestView.hidden = false;
        if (filteredView) filteredView.hidden = true;
        return;
      }

      const mod = MODULES[moduleKey];
      const list = POSTS.filter((p) => p.moduleKey === moduleKey);

      if (filteredKicker) filteredKicker.textContent = mod.kicker;
      if (filteredTitle) filteredTitle.textContent = mod.title;
      if (filteredDesc) filteredDesc.textContent = mod.desc;

      if (filteredList) {
        filteredList.replaceChildren();
        if (!list.length) {
          const empty = document.createElement('div');
          empty.className = 'module-empty-row';
          const text = document.createElement('span');
          text.textContent = '该模块下的笔记正在整理中，发布后将在此归档。';
          const tag = document.createElement('span');
          tag.className = 'module-empty-tag';
          tag.textContent = 'COMING SOON';
          empty.appendChild(text);
          empty.appendChild(tag);
          filteredList.appendChild(empty);
        } else {
          list.forEach((p) => {
            const a = document.createElement('a');
            a.className = 'post-row';
            a.href = p.href;

            const left = document.createElement('div');

            const meta = document.createElement('div');
            meta.className = 'post-row-meta';

            const dateSpan = document.createElement('span');
            dateSpan.className = 'meta-date';
            dateSpan.textContent = p.date;

            const fmtSpan = document.createElement('span');
            fmtSpan.className = 'format-pill';
            fmtSpan.textContent = p.format;

            const noteSpan = document.createElement('span');
            noteSpan.textContent = p.metaNote;

            meta.appendChild(dateSpan);
            meta.appendChild(fmtSpan);
            meta.appendChild(noteSpan);

            const h4 = document.createElement('h3');
            h4.className = 'post-row-title';
            h4.textContent = p.title;

            const summary = document.createElement('p');
            summary.className = 'post-row-summary';
            summary.textContent = p.summary;

            left.appendChild(meta);
            left.appendChild(h4);
            left.appendChild(summary);

            const arrow = document.createElement('span');
            arrow.className = 'post-row-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '↗';

            a.appendChild(left);
            a.appendChild(arrow);
            filteredList.appendChild(a);
          });
        }
      }

      if (latestView) latestView.hidden = true;
      if (filteredView) filteredView.hidden = false;
    }

    moduleTriggers.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.getAttribute('data-filter-module') || 'latest';
        if (el.classList.contains('pillar-jump') && activeModule === target) {
          setView('latest');
        } else {
          setView(target);
        }
      });
    });

    if (backLatestBtn) {
      backLatestBtn.addEventListener('click', () => setView('latest'));
    }

    // Quick Search Modal (Cmd/Ctrl + K)
    const backdrop = document.getElementById('searchBackdrop');
    const openBtn = document.getElementById('searchTrigger');
    const closeBtn = document.getElementById('searchClose');
    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');

    if (!backdrop || !input || !resultsContainer) return;

    function renderResults(query) {
      const q = query.trim().toLowerCase();
      const filtered = !q
        ? POSTS
        : POSTS.filter((p) =>
            [p.title, p.moduleLabel, p.format, p.summary, p.date].some((field) =>
              field.toLowerCase().includes(q)
            )
          );

      resultsContainer.replaceChildren();
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.textContent = '未找到匹配的文章，试试「Product」「HALO」「Agent」「System 0」或「PPO」';
        resultsContainer.appendChild(empty);
        return;
      }

      filtered.forEach((p) => {
        const a = document.createElement('a');
        a.className = 'search-result-item';
        a.href = p.href;

        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'search-result-title';
        title.textContent = p.title;

        const sub = document.createElement('div');
        sub.className = 'search-result-sub';
        sub.textContent = `${p.moduleLabel} · ${p.format} · ${p.date}`;

        left.appendChild(title);
        left.appendChild(sub);

        const arrow = document.createElement('span');
        arrow.className = 'read-cta-arrow';
        arrow.textContent = '↗';

        a.appendChild(left);
        a.appendChild(arrow);
        resultsContainer.appendChild(a);
      });
    }

    function openSearch() {
      backdrop.hidden = false;
      renderResults(input.value);
      requestAnimationFrame(() => input.focus());
    }

    function closeSearch() {
      backdrop.hidden = true;
    }

    if (openBtn) openBtn.addEventListener('click', openSearch);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSearch();
    });

    input.addEventListener('input', () => renderResults(input.value));

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (backdrop.hidden) openSearch();
        else closeSearch();
      } else if (e.key === 'Escape' && !backdrop.hidden) {
        closeSearch();
      }
    });
  });
})();

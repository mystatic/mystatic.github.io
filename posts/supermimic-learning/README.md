# SuperMimic 学习笔记

打开 `index.html` 阅读。所有公式、图解、图片和交互资源均在本目录中；离线使用时请保留整个目录。博客首页与其他文章的相对链接需要处于博客的 `posts/supermimic-learning/` 位置。

- `article.md`：正文唯一文字来源，包含独立块级 LaTeX。
- `index.html`：由该 Markdown 构建的阅读页面；数学公式已预渲染。
- `style.css`、`article.js`：博客版式、目录、图片放大和打印支持。
- `timeline.css`、`timeline.js`：七行十九步训练时间流，独立运行，无宿主依赖。
- `figures/`：可编辑 SVG 教学图，以及原论文 Figure 3–5 的 350 DPI 图表节选。
- `vendor/katex/`：离线数学样式、字体与构建用 KaTeX，许可证见该目录 LICENSE。

论文：SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model，arXiv:2610.28480v1。正文依据论文与附录；未进行训练复现。图表保留原作者归属，本文 SVG 为教学重绘。

本地维护源码与构建工具位于 RL 工作区的 `supermimic-learning/blog-build/`。构建命令为 `python3 supermimic-learning/blog-build/build.py`，会由相邻 `blog-article/article.md` 生成页面。博客中的文件为构建结果，不应直接修改 index.html 的正文。

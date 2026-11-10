# PPO 如何学会稳住倒立摆

分类：强化学习 / 交互教程。发布日期：2026-11-10。

这是完整的静态交互课件，不需要后台，也不会在浏览器中训练。
下载本目录所有文件后可直接打开 index.html；在线读取无损压缩数据，本地文件或不支持解压的浏览器读取原始脚本数据。

## 课件与数据

前七章记录两个完整 rollout：8192 条真实交互、320 次更新，每条样本的十次使用均有记录。
第八章来自另一次独立训练：303104 次环境交互、74 个 rollout、11840 次优化器更新。
训练起点在 ±10° 内均匀随机；前后评估使用固定 ±10°、种子 1–10 和确定性动作。
训练前 20 次测试均为 3 步；训练后 20 次均跑满 1000 步、40 秒。
奖励和长度曲线使用 2218 个完成回合，与全部 74 个 rollout 的统计一致。
这些结果描述本次实验与测试条件，不代表无限时间或任意起点上的稳定性。

- data.js：短程流程记录、完整样本及原脚本源码快照。
- comparison-run-seed0/evaluation.json：全部训练前后评估轨迹。
- comparison-run-seed0/training-history.json：逐回合训练曲线。
- comparison-run-seed0/monitor/*.monitor.csv：四个环境的原始训练日志。
- comparison-run-seed0/manifest.json：参数、依赖版本、模型和原始代码哈希。
- comparison-run-seed0/before.zip、after.zip：本次独立训练保存的模型。
- ppo_mujoco_minimal.py：课件依据的原始训练代码。

## 记录脚本

record_demo.py、train_comparison.py 和 build_training_history.py 保留实际记录逻辑，供阅读核对。
前两个脚本原目录关系为 RL/ppo_mujoco_minimal.py 和 RL/ppo-training-explainer/*.py；依赖及版本见 manifest.json。
train_comparison.py 原样保留了本机旧模型完整性检查，因此直接重新运行还需对应的目录与旧模型文件；旧模型不属于本次发布内容。
浏览网页无需运行任何 Python 脚本。原始数据与模型没有为发布重新训练或改写。

## 验证与第三方资源

数值、GAE 边界、每条样本使用次数、模型配对评估与曲线已经独立校验；发布前另查离线与在线加载、全部章节、公式、控件、下载链接和窄屏布局。
公式使用本地 KaTeX，许可证保存在 vendor/katex/LICENSE。SVG 是真实状态的二维表达；视觉插值不是额外的物理采样。

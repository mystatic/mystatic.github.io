# RL 学习笔记：从回报到 TD、GAE 与 Actor-Critic

这份笔记沿着一条主线展开：先从采样轨迹得到回报，再用状态价值建立基准，接着理解 TD 误差、n-step return 和 GAE，最后回到 Actor-Critic 的联合优化。

## 1. 采样轨迹与基本符号

设一条采样轨迹为：

$$
s_0 \xrightarrow{a_0,r_0} s_1
\xrightarrow{a_1,r_1} s_2
\rightarrow \cdots \rightarrow s_T
$$

其中：

- <i>s</i><sub>t</sub> 是第 <i>t</i> 时刻的状态。
- <i>a</i><sub>t</sub> 是策略在 <i>s</i><sub>t</sub> 下采取的动作。
- <i>r</i><sub>t</sub> 是执行 <i>a</i><sub>t</sub> 后获得的即时奖励。
- π<sub>θ</sub>(<i>a</i> | <i>s</i>) 是参数为 θ 的策略。

从时刻 <i>t</i> 开始的累计回报定义为：

$$
G_t=r_t+\gamma r_{t+1}+\gamma^2r_{t+2}+\cdots
$$

其中 γ 是折扣因子。

## 2. 累计回报与策略梯度

如果直接使用采样得到的 <i>G</i><sub>t</sub> 来更新策略，策略梯度可以写成：

$$
\nabla_\theta J(\theta)
=\mathbb{E}_{\tau\sim\pi_\theta}
\left[
\sum_t \nabla_\theta\log\pi_\theta(a_t\mid s_t)G_t
\right]
$$

这个公式理论上是正确的，但 <i>G</i><sub>t</sub> 的波动通常较大。它不仅受到当前动作的影响，还会受到当前状态、后续动作、环境随机性和未来奖励变化的影响。

因此，即使采取相同动作，也可能得到不同的回报：

$$
G_0=100,\qquad G'_0=10
$$

不能只根据 100 大于 10 就认为第一个动作一定更好，因为两个状态本身的平均价值可能不同。

## 3. 状态价值与 Advantage

为每个状态设置一个基准。状态价值表示在状态 <i>s</i> 下继续按照策略行动时的平均回报：

$$
V^\pi(s)=\mathbb{E}_{a\sim\pi(\cdot\mid s)}\left[Q^\pi(s,a)\right]
$$

优势函数比较一个动作和当前状态平均水平的差异：

$$
A^\pi(s,a)=Q^\pi(s,a)-V^\pi(s)
$$

在采样轨迹中，<i>G</i><sub>t</sub> 可以看作动作价值的一次采样，因此可以使用：

$$
\hat A_t=G_t-V_\phi(s_t)
$$

作为 Advantage 的估计，其中 V<sub>ϕ</sub>(<i>s</i><sub>t</sub>) 是 Critic 对状态价值的估计。

例如：

$$
G_0=100,\qquad V_\phi(s_0)=90
$$

$$
\hat A_0=100-90=10
$$

说明动作 <i>a</i><sub>0</sub> 比状态 <i>s</i><sub>0</sub> 下的平均水平好 10。

如果：

$$
G'_0=10,\qquad V_\phi(s'_0)=8
$$

$$
\hat A'_0=10-8=2
$$

说明动作 <i>a</i><sub>0</sub>' 只比状态 <i>s</i><sub>0</sub>' 下的平均水平好 2。

所以，<i>G</i><sub>t</sub> 表示绝对累计回报，而“回报减去状态价值估计”表示动作相对于当前状态平均水平的表现。

## 4. TD：用一步预测替代完整回报

Monte Carlo 要等到回合结束才能得到完整的 <i>G</i><sub>t</sub>。TD 方法只看当前奖励，再用 Critic 估计尚未发生的部分。

设 d<sub>t</sub> 表示当前转移是否终止：终止时为 1，否则为 0。一步 TD 目标为：

$$
\widehat G_t^{\mathrm{TD}(0)}
=r_t+\gamma(1-d_t)V_\phi(s_{t+1})
$$

对应的 TD 误差为：

$$
\delta_t
=r_t+\gamma(1-d_t)V_\phi(s_{t+1})-V_\phi(s_t)
$$

可以把 δ<sub>t</sub> 理解成：这一步实际得到的结果，比 Critic 原先对当前状态的预测多了多少或少了多少。

TD 的特点是更新及时、方差较小，但会受到 Critic 预测偏差的影响。

## 5. G、TD、n-step 和 GAE 到底是什么关系？

它们使用的更新信号不同：

| 方法 | 主要更新信号 | 是否直接使用完整 <i>G</i><sub>t</sub> | 主要特点 |
|---|---|---:|---|
| REINFORCE / Monte Carlo | 完整回报 | 是 | 方差大，但不依赖 Critic 自举 |
| TD(0) | δ<sub>t</sub> | 否 | 一步更新，方差较小但依赖 Critic |
| n-step return | 有限步奖励 + 末端价值 | 否 | 在短期真实奖励和长期预测之间折中 |
| GAE | 多个 TD 误差的加权和 | 否 | 用 λ 控制不同观察长度的混合 |

因此，<strong>G 并不是都会被 GAE 直接使用</strong>。GAE 的实现通常只需要奖励、价值预测、终止标记、γ 和 λ，然后反向递推 δ<sub>t</sub>。

不过，GAE 仍然可以等价理解为多个 n-step Advantage 的加权组合，所以 G 的思想仍然存在于它的推导关系中。

## 6. n-step Advantage：逐步扩大观察范围

由连续的 TD 误差构造 n-step Advantage：

$$
\hat A_t^{(n)}
=\sum_{l=0}^{n-1}\gamma^l\delta_{t+l}
$$

前三种情况分别是：

$$
\hat A_t^{(1)}=\delta_t
$$

$$
\hat A_t^{(2)}=\delta_t+\gamma\delta_{t+1}
$$

$$
\hat A_t^{(3)}=\delta_t+\gamma\delta_{t+1}+\gamma^2\delta_{t+2}
$$

n 越大，估计使用的未来信息越多；同时，它也越依赖真实未来奖励，可能带来更大的方差。

## 7. 为什么两处 gamma 会巧妙抵消？

先看两步 Advantage：

$$
\delta_t+\gamma\delta_{t+1}
$$

把两个 TD 误差展开：

$$
\delta_t+\gamma\delta_{t+1}
=\left[r_t+\gamma V(s_{t+1})-V(s_t)\right]
+\gamma\left[r_{t+1}+\gamma V(s_{t+2})-V(s_{t+1})\right]
$$

继续展开：

$$
\delta_t+\gamma\delta_{t+1}
=r_t+\gamma V(s_{t+1})-V(s_t)
+\gamma r_{t+1}+\gamma^2V(s_{t+2})-\gamma V(s_{t+1})
$$

中间两项正好抵消：

$$
\delta_t+\gamma\delta_{t+1}
=r_t+\gamma r_{t+1}+\gamma^2V(s_{t+2})-V(s_t)
$$

这两个 γ 来自不同层次：

- δ<sub>t</sub> 内部的 γ，负责把 <i>s</i><sub>t+1</sub> 的价值折回到 <i>t</i>。
- 外部的 γ，负责把未来一步的 TD 误差 δ<sub>t+1</sub> 折回到当前时刻。

如果错误地写成不带外部 γ 的形式：

$$
\delta_t+\delta_{t+1}
=r_t+r_{t+1}+(\gamma-1)V(s_{t+1})+\gamma V(s_{t+2})-V(s_t)
$$

中间价值项无法抵消，奖励也不再是标准的两步折扣回报。因此，GAE 中外部的 γ 不是重复计算，而是处理未来 TD 误差的时间距离。

## 8. GAE：指数衰减地混合 TD 误差

GAE 将不同长度的 n-step Advantage 做几何加权：

$$
\hat A_t^{\mathrm{GAE}(\gamma,\lambda)}
=(1-\lambda)\sum_{n=1}^{\infty}\lambda^{n-1}\hat A_t^{(n)}
$$

其中第 n 个估计的权重是：

$$
w_n=(1-\lambda)\lambda^{n-1},\qquad 0\leq\lambda<1
$$

这些权重之和为 1：

$$
\sum_{n=1}^{\infty}w_n
=(1-\lambda)(1+\lambda+\lambda^2+\cdots)=1
$$

所以这确实是一个加权平均。把 n-step Advantage 展开并交换求和顺序后，可以得到常用的 GAE 形式：

$$
\hat A_t^{\mathrm{GAE}}
=\sum_{l=0}^{\infty}(\gamma\lambda)^l\delta_{t+l}
$$

也就是：

$$
\hat A_t^{\mathrm{GAE}}
=\delta_t+\gamma\lambda\delta_{t+1}
+(\gamma\lambda)^2\delta_{t+2}+\cdots
$$

实际实现时通常从轨迹末端反向递推：

$$
\hat A_t
=\delta_t+\gamma\lambda(1-d_t)\hat A_{t+1}
$$

终止标记会切断跨越回合边界的未来信息。

### λ 的直觉

- λ = 0：只使用 δ<sub>t</sub>，等价于一步 TD。
- λ = 0.5：较近的估计权重大，远期信息快速衰减。
- λ 接近 1：更长的未来估计仍有影响，更接近 Monte Carlo，但方差通常更大。

从概率角度看，w<sub>n</sub> 构成一个几何分布。它可以理解为：随机决定观察未来多少步，再对这个随机长度下的估计取期望。

$$
\mathbb{E}[N]=\frac{1}{1-\lambda}
$$

因此 λ = 0.5 时平均观察约 2 步，λ = 0.95 时平均观察约 20 步。

## 9. Actor：让好动作更常出现

使用优势估计后，Actor 的损失为：

$$
L_{\mathrm{actor}}
=-\mathbb{E}_t
\left[
\log\pi_\theta(a_t\mid s_t)\hat A_t
\right]
$$

当优势估计为正时，提高动作 <i>a</i><sub>t</sub> 的概率；当优势估计为负时，降低动作 <i>a</i><sub>t</sub> 的概率。

## 10. Critic：学习状态价值

Critic 通过拟合回报目标，学习估计状态价值。使用 Monte Carlo 回报时，其损失为：

$$
L_{\mathrm{critic}}
=\frac{1}{2}\mathbb{E}_t
\left[
\left(V_\phi(s_t)-G_t\right)^2
\right]
$$

使用 GAE 时，Critic 通常拟合与 GAE 对应的 λ-return 目标，而不一定直接拟合完整 <i>G</i><sub>t</sub>。

## 11. Actor-Critic 联合优化

最终可以将 Actor 和 Critic 的损失联合起来：

$$
L=L_{\mathrm{actor}}+c_VL_{\mathrm{critic}}
$$

其中 c<sub>V</sub> 用于调节 Critic 损失的权重。

Actor 根据 Advantage 调整动作概率，Critic 估计状态价值并提供基准。两者结合后，可以在控制回报估计方差的同时，保留对长期结果的敏感性。

## 12. 为什么普通策略梯度需要限制更新

到这里，Actor-Critic 已经可以用 GAE 得到 Advantage，并据此更新策略。但还有一个问题：一批轨迹是由采样时的旧策略产生的，而我们可能会用这批数据做多轮梯度更新。

如果策略更新过大，就会出现：

- 采样数据来自旧策略，但当前策略已经偏离旧策略很多；
- 同一批数据被重复使用时，更新信号可能被过度放大；
- Advantage 的方向本来是合理的，但策略概率变化太快，训练会变得不稳定。

PPO 的核心思想是：允许策略学习，但限制它相对旧策略的变化幅度。

## 13. 新旧策略与概率比

采样时使用旧策略 π<sub>θ,old</sub>，更新时使用当前策略 π<sub>θ</sub>。对同一个已经执行的动作，定义概率比：

$$
r_t(\theta)
=\frac{\pi_\theta(a_t\mid s_t)}
{\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)}
$$

它的含义是：当前策略给这个动作的概率，相对于采样策略提高或降低了多少。

- 概率比等于 1：新旧策略对该动作的概率相同。
- 概率比大于 1：新策略更偏向该动作。
- 概率比小于 1：新策略降低该动作的概率。

这里的概率比只重新计算当前策略的概率；旧策略概率需要在采样时保存下来。

## 14. PPO Clipping 目标

如果只使用概率比，未裁剪的策略目标为：

$$
L^{\mathrm{PG}}(\theta)
=\mathbb{E}_t
\left[
r_t(\theta)\hat A_t
\right]
$$

当优势为正时，增大概率比会提高目标；当优势为负时，减小概率比会提高目标。问题是，这个目标可能鼓励策略一次性改变太多。

PPO 使用裁剪后的目标：

$$
L^{\mathrm{CLIP}}(\theta)
=\mathbb{E}_t
\left[
\min\left(
r_t(\theta)\hat A_t,
\operatorname{clip}
\left(
r_t(\theta),1-\epsilon,1+\epsilon
\right)\hat A_t
\right)
\right]
$$

其中 ε 控制允许的变化范围。常见示例是 ε = 0.2，此时概率比主要被限制在 0.8 到 1.2 附近。

## 15. Advantage 正负决定裁剪方向

### Advantage 为正

当 <i>A</i><sub>t</sub> 为正时，提高动作概率通常是有利的。但当概率比超过 1 + ε 后，PPO 不再继续奖励这个动作概率的增加，防止好动作被过度强化。

### Advantage 为负

当 <i>A</i><sub>t</sub> 为负时，降低动作概率通常是有利的。但当概率比低于 1 − ε 后，PPO 不再继续扩大惩罚，防止坏动作被过度压低。

因此，min 操作会选择更保守的目标值。它保留有用的更新，同时限制策略离开旧策略太远。

## 16. PPO 的 Critic、Entropy 与联合损失

Critic 使用价值目标训练：

$$
L_{\mathrm{value}}
=\mathbb{E}_t
\left[
\left(
V_\phi(s_t)-\hat R_t
\right)^2
\right]
$$

策略熵可以写成：

$$
H(\pi_\theta)
=\mathbb{E}_t
\left[
-\log\pi_\theta(a_t\mid s_t)
\right]
$$

采用最小化形式时，PPO 的联合损失为：

$$
L_{\mathrm{PPO}}
=-L^{\mathrm{CLIP}}
+c_VL_{\mathrm{value}}
-c_HH(\pi_\theta)
$$

其中：

- 第一项更新 Actor；
- 第二项训练 Critic；
- 第三项鼓励策略保留一定探索性；
- c<sub>V</sub> 和 c<sub>H</sub> 分别控制价值损失和熵项的权重。

注意负号：策略目标是最大化，而代码中的总损失通常采用最小化，所以需要使用 −L<sup>CLIP</sup>。

### 16.1 为什么一次采样会进行多次梯度更新？

采样轨迹需要和环境交互，通常比在已有数据上做一次前向和反向传播更昂贵。因此，PPO 会先收集一批由旧策略产生的 on-policy 数据，再把这批数据切成多个 minibatch，重复训练若干个 epoch。

一次采样批次的典型流程是：

1. 用旧策略采样并保存动作、奖励、旧策略 log probability。
2. 用这批数据计算 Advantage 和价值目标。
3. 将数据打乱并切成 minibatch。
4. 多轮遍历这些 minibatch，更新 Actor 和 Critic。
5. 更新结束后丢弃旧批次，重新用新策略采样。

这样做的原因有三个：

- 提高样本利用率：一次环境交互可以贡献多次参数更新。
- 降低梯度噪声：一个 batch 中的多个样本共同决定更新方向。
- 提高训练效率：环境交互和神经网络计算的成本可以更好地平衡。

但这些数据来自旧策略，不能无限重复使用。随着当前策略变化，数据会逐渐变旧；PPO 的概率比和 clipping 正是用来限制这种策略偏离。经过若干 epoch 后，当前批次应当被丢弃，而不是继续训练很多轮。

### 16.2 熵正则：让策略不要过早变得确定

如果只追求提高 Advantage，策略可能很快把概率集中到少数动作上。一旦过早确定，其他动作就很难再被探索，这会导致策略陷入局部最优。

离散动作下，策略熵定义为：

$$
H\left(\pi_\theta(\cdot\mid s_t)\right)
=-\sum_a\pi_\theta(a\mid s_t)\log\pi_\theta(a\mid s_t)
$$

实际训练中常用采样估计：

$$
\hat H_t
=-\log\pi_\theta(a_t\mid s_t)
$$

熵越大，动作分布越分散，探索性越强；熵越小，动作分布越集中，策略越确定。

由于训练代码通常最小化损失，所以联合目标中写成：

$$
L_{\mathrm{PPO}}
=-L^{\mathrm{CLIP}}
+c_VL_{\mathrm{value}}
-c_HH(\pi_\theta)
$$

前面的负号意味着：最小化总损失时，会倾向于增大熵。c<sub>H</sub> 太小，策略可能过早收敛；c<sub>H</sub> 太大，策略会长期保持随机，难以形成稳定行为。因此熵正则通常是一个逐渐减弱的探索奖励，而不是让策略永远保持高随机性。

## 17. PPO 一次完整更新流程

一次典型的 PPO 更新可以拆成以下步骤：

1. 使用当前策略采样一批轨迹。
2. 保存状态、动作、奖励、终止标记和旧策略的 log probability。
3. 使用 Critic 计算每一步的 TD 误差。
4. 使用 GAE 计算 Advantage。
5. 构造 λ-return 价值目标，训练 Critic。
6. 将轨迹切成多个 minibatch。
7. 多轮更新每个 minibatch 的 Actor 和 Critic。
8. 每轮重新计算当前策略的 log probability。
9. 计算新旧策略的概率比并应用 clipping。
10. 完成本轮更新后丢弃这批 on-policy 数据，使用新策略重新采样。

PPO 可以对一批新采样数据重复使用若干轮，但不能把很旧的数据无限重复使用，否则新旧策略的差距会越来越大，PPO 的概率比也失去原本的意义。

## 18. PPO 与 Actor-Critic、GAE 的关系

它们分别解决不同问题：

- GAE 负责构造更稳定的 Advantage。
- Critic 负责估计状态价值和价值目标。
- Actor 根据 Advantage 调整策略概率。
- PPO clipping 负责限制新旧策略的变化幅度。

可以把整条学习路径记成：

$$
G_t
\longrightarrow
\delta_t
\longrightarrow
\hat A_t^{\mathrm{GAE}}
\longrightarrow
\text{Actor-Critic}
\longrightarrow
r_t(\theta)
\longrightarrow
L^{\mathrm{CLIP}}
$$

所以 PPO 不是替代 GAE，而是通常把 GAE 作为 Advantage 估计器，再用 clipping 限制 Actor 的更新幅度。

## 一句话总结

回报告诉你“结果是多少”，TD 误差告诉你“这一步比预测多了多少”，GAE 把不同时间跨度的 TD 误差按指数衰减加权，PPO 再通过新旧策略概率比的 clipping，防止策略一次更新得太远。

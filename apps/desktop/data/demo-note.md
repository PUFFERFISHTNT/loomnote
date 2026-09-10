---
title: 0-1 背包问题
tags: [动态规划, 算法, 最优化]
difficulty: 4
---

# 0-1 背包问题

## 问题定义

给定 $n$ 件物品和一个容量为 $W$ 的背包。第 $i$ 件物品的重量为 $w_i$、价值为 $v_i$，**每件物品最多选一次**。求装入背包的物品总价值最大是多少。

$$f[i][j] = \max\bigl(f[i-1][j],\; f[i-1][j-w_i] + v_i\bigr)$$

:::demo 排队模型 · 动画演示
<div id="demo-root">
<style>
#demo-root{font-family:-apple-system,'PingFang SC',sans-serif;padding:18px;background:#fbfbfa;border-radius:8px}
#demo-root .row{display:flex;gap:6px;margin:10px 0}
#demo-root .cust{width:34px;height:34px;border-radius:50%;background:#2383e2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;transition:opacity .3s}
#demo-root .server{width:56px;height:34px;border-radius:8px;background:#0f7b4f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;margin-right:10px}
#demo-root .log{font-size:12px;color:#73726e;margin-top:8px;min-height:18px}
</style>
<h3 style="margin:0 0 6px;font-size:16px">M/M/1 排队：谁先被服务？</h3>
<div class="row"><div class="server">服务台</div><div id="queue" class="row"></div></div>
<div class="log" id="msg">点击「下一位」观察队列移动（FIFO）</div>
<button id="next" style="padding:6px 14px;border:none;border-radius:6px;background:#2383e2;color:#fff;cursor:pointer;font-size:13px">下一位</button>
<script>
(function(){
  var q=[1,2,3,4];var n=5;
  function draw(){var el=document.getElementById('queue');el.innerHTML='';q.forEach(function(x){var d=document.createElement('div');d.className='cust';d.textContent=x;el.appendChild(d)})}
  document.getElementById('next').onclick=function(){if(!q.length)return;var served=q.shift();if(n<=8)q.push(n++);document.getElementById('msg').textContent='已服务 #'+served+'，队列长度 '+q.length;draw()}
  draw()
})()
</script>
</div>
:::

:::toc

## 状态设计

用 $f[i][j]$ 表示「只考虑前 $i$ 件物品、容量为 $j$ 时的最大价值」：

| 符号 | 含义 |
|---|---|
| $i$ | 已考虑的物品数（阶段） |
| $j$ | 剩余容量（状态） |
| $f[i][j]$ | 该状态下的最优价值 |

> 关键洞察：每件物品只有「选 / 不选」两个分支，且子问题满足**最优子结构**——大背包的答案由小背包的答案构成。

## 为什么这样递推

1. **不选第 $i$ 件**：价值不变，即 $f[i-1][j]$；
2. **选第 $i$ 件**：必须腾出 $w_i$ 的容量，即 $f[i-1][j-w_i] + v_i$；
3. 两者取最大值，即状态转移方程。

相关知识点：[[前缀和]]、[[完全背包]]、[[最长公共子序列]]。

## 实现要点

```ts
function knapsack(w: number[], v: number[], W: number): number {
  const f = new Array<number>(W + 1).fill(0)
  for (let i = 0; i < w.length; i++) {
    for (let j = W; j >= w[i]!; j--) {
      f[j] = Math.max(f[j]!, f[j - w[i]!]! + v[i]!)
    }
  }
  return f[W]!
}
```

- 时间复杂度 $O(nW)$，空间可滚动优化到一维；
- **倒序枚举容量**保证每件物品只被选一次（正序会退化为完全背包）。

:::details 想一想：为什么倒序？
正序更新时，$f[j-w_i]$ 可能已经包含第 $i$ 件物品的贡献，等价于允许重复选取；倒序则保证转移来源是「上一轮」的值。
:::

## 速记卡

- 0-1 背包核心 = **阶段 × 容量** 的二维 DP，一维滚动需倒序；
- 复杂度 $O(nW)$，无法多项式摆脱 $W$（伪多项式）；
- 变体：完全背包（正序）、多重背包（二进制拆分）。

## 自测

1. 状态转移方程中 $f[i-1][j-w_i]+v_i$ 的边界条件是什么？
2. 一维优化后为什么必须倒序枚举 $j$？
3. 若物品可重复选取，方程只需改动哪里？


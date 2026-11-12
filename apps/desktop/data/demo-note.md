---
title: 0-1 背包问题
tags: [动态规划, 算法, 最优化]
difficulty: 4
---

# 0-1 背包问题

## 问题定义

给定 $n$ 件物品和一个容量为 $W$ 的背包。第 $i$ 件物品的重量为 $w_i$、价值为 $v_i$，**每件物品最多选一次**。求装入背包的物品总价值最大是多少。

$$f[i][j] = \max\bigl(f[i-1][j],\; f[i-1][j-w_i] + v_i\bigr)$$

:::demo 0-1 背包：逐件更新最优价值
<div id="knapsack-demo" style="font-family:system-ui,sans-serif;padding:20px;background:#f5f8fb;border-radius:12px;color:#263447">
<h3 style="margin-top:0">0-1 背包：逐件更新最优价值</h3>
<p>W = 5; (weight, value): A (2, 3), B (3, 4), C (4, 5).</p>
<p id="ks-status"></p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th>容量</th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody id="ks-values"></tbody></table>
<p id="ks-explain" style="min-height:42px"></p>
<button id="ks-next" style="padding:8px 14px">下一件物品</button> <button id="ks-reset" style="padding:8px 14px">重置</button>
<script>
(function(){
var rows=[[0,0,0,0,0,0],[0,0,3,3,3,3],[0,0,3,4,4,7],[0,0,3,4,5,7]],step=0;
var explanations=["从空背包开始。", "加入 A：容量至少为 2 时价值可达 3。", "加入 B：容量 5 可装 A 和 B，价值 7。", "加入 C：容量 4 的价值更新为 5；容量 5 仍选 A 和 B，价值 7。"];
function draw(){document.getElementById('ks-status').textContent='已考虑物品数: '+step+' / 3';document.getElementById('ks-values').innerHTML='<tr><th>最优价值</th>'+rows[step].map(function(v,i){return '<td style="padding:10px;border:1px solid #ccc;background:'+(step&&v!==rows[step-1][i]?'#ccebdc':'white')+'">'+v+'</td>'}).join('')+'</tr>';document.getElementById('ks-explain').textContent=explanations[step];document.getElementById('ks-next').disabled=step===3}
document.getElementById('ks-next').onclick=function(){if(step<3)step++;draw()};
document.getElementById('ks-reset').onclick=function(){step=0;draw()};draw();
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

### Q1. 状态转移方程中 $f[i-1][j-w_i]+v_i$ 的边界条件是什么？

答案：仅在 $j \ge w_i$ 时可选取物品；初始状态为容量为零时价值为零。来源为本示例的状态转移部分；这是合成示例，没有讲义页码。

### Q2. 一维优化后为什么必须倒序枚举 $j$？

答案：倒序保证读取的是处理上一件物品后的状态，避免同一件物品被重复选取。来源为本示例的状态转移部分。

### Q3. 若物品可重复选取，方程只需改动哪里？

答案：把选取物品的项改成 $f[i][j-w_i]+v_i$，允许读取本行状态；一维实现改用正序。来源为本合成示例。


<!-- loomnote:concepts {"concepts": [{"title": "0-1 约束", "description": "每件物品最多选择一次。", "heading": "问题定义"}, {"title": "动态规划状态", "description": "f[i][j] 表示前 i 件物品在容量 j 内的最大价值。", "heading": "状态设计"}, {"title": "选或不选的递推", "description": "容量允许时，比较选入和跳过当前物品的最优价值。", "heading": "状态设计"}, {"title": "伪多项式时间", "description": "O(nW) 时间取决于容量的数值大小。", "heading": "复杂度"}, {"title": "滚动数组优化", "description": "仅保留上一行可将空间减至 O(W)。", "heading": "复杂度"}], "relations": [{"from": "0-1 约束", "to": "选或不选的递推", "label": "约束"}, {"from": "动态规划状态", "to": "选或不选的递推", "label": "定义"}, {"from": "选或不选的递推", "to": "伪多项式时间", "label": "决定"}, {"from": "动态规划状态", "to": "滚动数组优化", "label": "支持"}]} -->

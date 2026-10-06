---
title: 0-1 Knapsack
tags: [dynamic programming, algorithms, optimisation]
difficulty: 4
---

# 0-1 Knapsack

## The problem

Given $n$ items and a knapsack of capacity $W$. Item $i$ has weight $w_i$ and value $v_i$, and **each item may be taken at most once**. Maximise the total value of the items in the knapsack.

$$f[i][j] = \max\bigl(f[i-1][j],\; f[i-1][j-w_i] + v_i\bigr)$$

:::demo Queueing · step-through animation
<div id="demo-root">
<style>
#demo-root{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;padding:18px;background:#fbfbfa;border-radius:8px}
#demo-root .row{display:flex;gap:6px;margin:10px 0}
#demo-root .cust{width:34px;height:34px;border-radius:50%;background:#2383e2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;transition:opacity .3s}
#demo-root .server{width:78px;height:34px;border-radius:8px;background:#0f7b4f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;margin-right:10px}
#demo-root .log{font-size:12px;color:#73726e;margin-top:8px;min-height:18px}
</style>
<h3 style="margin:0 0 6px;font-size:16px">M/M/1 queue: who gets served first?</h3>
<div class="row"><div class="server">Service desk</div><div id="queue" class="row"></div></div>
<div class="log" id="msg">Press “Next customer” to watch the queue move (FIFO)</div>
<button id="next" style="padding:6px 14px;border:none;border-radius:6px;background:#2383e2;color:#fff;cursor:pointer;font-size:13px">Next customer</button>
<script>
(function(){
  var q=[1,2,3,4];var n=5;
  function draw(){var el=document.getElementById('queue');el.innerHTML='';q.forEach(function(x){var d=document.createElement('div');d.className='cust';d.textContent=x;el.appendChild(d)})}
  document.getElementById('next').onclick=function(){if(!q.length)return;var served=q.shift();if(n<=8)q.push(n++);document.getElementById('msg').textContent='Served customer #'+served+' · queue length '+q.length;draw()}
  draw()
})()
</script>
</div>
:::

## Why the recurrence looks like this

The first term leaves item $i$ out. The second term takes it, which spends $w_i$ of the capacity and adds $v_i$ of value, so the best we can do with the remaining capacity is $f[i-1][j-w_i]$.

## Complexity

Time $O(nW)$ and space $O(nW)$, reducible to $O(W)$ by keeping only the previous row.

## Self-test

1. Why can this problem not be solved with a greedy rule that always takes the highest value-to-weight item?
2. What changes in the recurrence if each item may be taken any number of times?

Answers: (1) a locally best ratio can block a better combination, and the recurrence explores both choices instead of committing. (2) The second term becomes $f[i][j-w_i] + v_i$, because item $i$ may be reused.

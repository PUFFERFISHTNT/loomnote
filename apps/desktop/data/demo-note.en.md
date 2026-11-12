---
title: 0-1 Knapsack
tags: [dynamic programming, algorithms, optimisation]
difficulty: 4
---

# 0-1 Knapsack

## The problem

Given $n$ items and a knapsack of capacity $W$. Item $i$ has weight $w_i$ and value $v_i$, and **each item may be taken at most once**. Maximise the total value of the items in the knapsack.

$$f[i][j] = \max\bigl(f[i-1][j],\; f[i-1][j-w_i] + v_i\bigr)$$

:::demo 0-1 knapsack: one item at a time
<div id="knapsack-demo" style="font-family:system-ui,sans-serif;padding:20px;background:#f5f8fb;border-radius:12px;color:#263447">
<h3 style="margin-top:0">0-1 knapsack: one item at a time</h3>
<p>W = 5; (weight, value): A (2, 3), B (3, 4), C (4, 5).</p>
<p id="ks-status"></p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th>Capacity</th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody id="ks-values"></tbody></table>
<p id="ks-explain" style="min-height:42px"></p>
<button id="ks-next" style="padding:8px 14px">Next item</button> <button id="ks-reset" style="padding:8px 14px">Reset</button>
<script>
(function(){
var rows=[[0,0,0,0,0,0],[0,0,3,3,3,3],[0,0,3,4,4,7],[0,0,3,4,5,7]],step=0;
var explanations=["Start with no items.", "Consider A: capacity at least 2 can hold value 3.", "Consider B: capacity 5 holds A and B, value 7.", "Consider C: capacity 4 improves to 5; capacity 5 still uses A and B, value 7."];
function draw(){document.getElementById('ks-status').textContent='Items considered: '+step+' / 3';document.getElementById('ks-values').innerHTML='<tr><th>Best value</th>'+rows[step].map(function(v,i){return '<td style="padding:10px;border:1px solid #ccc;background:'+(step&&v!==rows[step-1][i]?'#ccebdc':'white')+'">'+v+'</td>'}).join('')+'</tr>';document.getElementById('ks-explain').textContent=explanations[step];document.getElementById('ks-next').disabled=step===3}
document.getElementById('ks-next').onclick=function(){if(step<3)step++;draw()};
document.getElementById('ks-reset').onclick=function(){step=0;draw()};draw();
})()
</script>
</div>
:::

## Why the recurrence looks like this

The first term leaves item $i$ out. The second term takes it, which spends $w_i$ of the capacity and adds $v_i$ of value, so the best we can do with the remaining capacity is $f[i-1][j-w_i]$.

## Complexity

Time $O(nW)$ and space $O(nW)$, reducible to $O(W)$ by keeping only the previous row.

## Self-test

### Q1. Why can this problem not be solved with a greedy rule that always takes the highest value-to-weight item?

Answer: A locally best ratio can block a better combination. The recurrence explores both choices instead of committing. Source: the recurrence section of this synthetic sample, rather than a lecture page.

### Q2. What changes in the recurrence if each item may be taken any number of times?

Answer: The second term becomes $f[i][j-w_i] + v_i$, because item $i$ may be reused. Source: the recurrence section of this synthetic sample.


<!-- loomnote:concepts {"concepts": [{"title": "0-1 constraint", "description": "Each item is used at most once.", "heading": "The problem"}, {"title": "DP state", "description": "f[i][j] is the best value using the first i items within capacity j.", "heading": "The problem"}, {"title": "Skip or take recurrence", "description": "Compare skipping the item against taking it when capacity permits.", "heading": "Why the recurrence looks like this"}, {"title": "Pseudo-polynomial time", "description": "The table takes O(nW) time, which depends on the numeric capacity.", "heading": "Complexity"}, {"title": "Rolling-row optimisation", "description": "Keeping only the previous row reduces space to O(W).", "heading": "Complexity"}], "relations": [{"from": "0-1 constraint", "to": "Skip or take recurrence", "label": "constrains"}, {"from": "DP state", "to": "Skip or take recurrence", "label": "defines"}, {"from": "Skip or take recurrence", "to": "Pseudo-polynomial time", "label": "determines"}, {"from": "DP state", "to": "Rolling-row optimisation", "label": "supports"}]} -->

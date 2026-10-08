import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.argv[2] || 'reports/queue-backlog-2026-10-08');
const mean = x => x.length ? x.reduce((a,b) => a+b,0)/x.length : null;
const percentile = (x,p) => x.length ? [...x].sort((a,b)=>a-b)[Math.ceil(p*x.length)-1] : null;
const round = x => x === null || x === undefined ? '—' : x.toFixed(2);
const stat = x => ({ n:x.length, mean:mean(x), p50:percentile(x,.5), p95:percentile(x,.95), max:x.length?Math.max(...x):null });
const files = (await readdir(directory)).filter(x => /-r\d+\.json$/.test(x));
const trials = [];
for (const file of files) {
  const raw = JSON.parse(await readFile(path.join(directory,file),'utf8'));
  const eligible = x => x.startTime >= raw.started && x.startTime < raw.ended;
  const loafs = raw.loafs.filter(eligible), tasks = raw.tasks.filter(eligible);
  const intervals = raw.frames.slice(1).map((x,i)=>x-raw.frames[i]);
  const duration = (raw.ended-raw.started)/1000;
  const stages = loafs.filter(x => x.renderStart>0 && x.styleAndLayoutStart>=x.renderStart)
    .map(x=>({ preRender:x.renderStart-x.startTime, beforeStyle:x.styleAndLayoutStart-x.renderStart, afterStyle:x.startTime+x.duration-x.styleAndLayoutStart }));
  const invokers = {};
  for(const loaf of loafs) for(const script of loaf.scripts) {
    const key = `${script.invokerType} | ${script.invoker} | ${script.sourceFunctionName} | ${script.sourceURL}`;
    invokers[key] = (invokers[key]||0)+script.duration;
  }
  trials.push({ case:raw.config.id, repeat:raw.config.repeat, config:raw.config, file, duration,
    fps:raw.frames.length/duration, consumeRate:raw.final.consumed/duration,
    frameInterval:stat(intervals), loaf:stat(loafs.map(x=>x.duration)),
    loafBlocking:loafs.reduce((s,x)=>s+x.blockingDuration,0), task:stat(tasks.map(x=>x.duration)),
    taskBlocking:tasks.reduce((s,x)=>s+Math.max(0,x.duration-50),0),
    submit:stat(raw.submit), flush:stat(raw.flush), flushOutsideSubmit:stat(raw.flush.map((x,i)=>Math.max(0,x-(raw.submit[i]||0)))),
    chart:stat(raw.chart), map:stat(raw.map), timer:stat(raw.timerDelay),
    stages:{preRender:stat(stages.map(x=>x.preRender)),beforeStyle:stat(stages.map(x=>x.beforeStyle)),afterStyle:stat(stages.map(x=>x.afterStyle))},
    heapBeforeMiB:raw.heap.before.JSHeapUsedSize/1048576, heapAfterMiB:raw.heap.after.JSHeapUsedSize/1048576,
    initial:raw.initial, final:raw.final, enqueue20:raw.initial.enqueue20Ms||[], excludedOutsideWindow:raw.loafs.length-loafs.length,
    errors:raw.runtimeErrors, visibility:raw.visibleAtEnd, invokers,
  });
}
const caseIds = [...new Set(trials.map(x=>x.case))];
const groups = caseIds.map(id => {
  const rows = trials.filter(x=>x.case===id);
  const metric = getter => stat(rows.map(getter).filter(x=>x!==null&&x!==undefined));
  return { id, repetitions:rows.length, config:rows[0].config,
    fps:metric(x=>x.fps), consumeRate:metric(x=>x.consumeRate), enqueueMs:metric(x=>x.initial.enqueueMs),
    pending:metric(x=>x.final.pending), oldestSeconds:metric(x=>x.final.oldestMs/1000),
    heapMiB:metric(x=>x.heapBeforeMiB), frameP95Ms:metric(x=>x.frameInterval.p95),
    loafCount:metric(x=>x.loaf.n), loafP95Ms:metric(x=>x.loaf.p95), timerP95Ms:metric(x=>x.timer.p95),
    submitP95Ms:metric(x=>x.submit.p95), flushP95Ms:metric(x=>x.flush.p95), chartP95Ms:metric(x=>x.chart.p95), mapP95Ms:metric(x=>x.map.p95),
    trials:rows.map(x=>x.file), observed:rows[0].initial.observed,
  };
});
await writeFile(path.join(directory,'analysis.json'),JSON.stringify({groups,trials},null,2));
if (trials.some(x=>x.enqueue20.length)) {
  const probeSummary=groups.map(g=>{
    const rows=trials.filter(x=>x.case===g.id);
    const values=rows.flatMap(x=>x.enqueue20);
    const valuesStat=stat(values);
    return {pending:g.config.pending,repetitions:rows.length,samples:values.length,meanMs:valuesStat.mean,p50Ms:valuesStat.p50,p95Ms:valuesStat.p95,maxMs:valuesStat.max};
  });
  await writeFile(path.join(directory,'small-batch-analysis.json'),JSON.stringify(probeSummary,null,2));
}
const lines = [
  '# 队列积压对照：自动汇总', '',
  '每组为独立页面，以下数据为各轮指标的算术均值；括号内是轮次最小～最大值。LoAF P95 为各轮 P95 的均值，无长帧的轮次不记作 0。原始记录另存。', '',
  '| 场景 | 次数 | rAF/s（范围） | 消费点/s | 队列剩余 | 入队 ms | GC 后起始堆 MiB | 帧间隔 P95 ms | LoAF 数 | LoAF P95 ms | Timer P95 ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...groups.map(g=>`| ${g.id} | ${g.repetitions} | ${round(g.fps.mean)}（${round(Math.min(...trials.filter(x=>x.case===g.id).map(x=>x.fps)))}～${round(g.fps.max)}） | ${round(g.consumeRate.mean)} | ${round(g.pending.mean)} | ${round(g.enqueueMs.mean)} | ${round(g.heapMiB.mean)} | ${round(g.frameP95Ms.mean)} | ${round(g.loafCount.mean)} | ${round(g.loafP95Ms.mean)} | ${round(g.timerP95Ms.mean)} |`),
  '', '| 场景 | 同步提交 P95 ms | 同步 flush P95 ms | 图表 updateOptions P95 ms | 地图批次方法 P95 ms |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...groups.map(g=>`| ${g.id} | ${round(g.submitP95Ms.mean)} | ${round(g.flushP95Ms.mean)} | ${round(g.chartP95Ms.mean)} | ${round(g.mapP95Ms.mean)} |`), '',
  '同步方法计时不能覆盖其安排的 Vue 微任务、ECharts lazyUpdate 与 Canvas 最终绘制。各个 P95 不能相加。rAF/s 为调度机会，不能直接当作 GPU 实际呈现帧率；Timer 延迟不能当作 INP。', '',
  `校验：${trials.length} 轮；队列守恒 ${trials.every(x=>x.final.enqueued-x.final.consumed===x.final.pending)}；均可见 ${trials.every(x=>x.visibility==='visible')}；运行时异常 ${trials.reduce((s,x)=>s+x.errors.length,0)}。`,
];
await writeFile(path.join(directory,'tables.md'),lines.join('\n'));

// Static, self-contained SVG for export and review; generated from measured aggregates.
const chosen = ['paused-q1000','paused-q10000','paused-q50000','active-q10000','history1000','history6000','map-frozen6000','charts-frozen6000','empty6000','raw-active-q50000'];
const chartGroups = chosen.map(id=>groups.find(g=>g.id===id)).filter(Boolean);
const escape = value => String(value).replace(/[&<>]/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]));
const width = 1000, height = 135 + chartGroups.length*43;
const repeatLabel = Math.max(...trials.map(x=>x.repeat));
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  '<rect width="100%" height="100%" fill="#0b1424"/>',
  '<g font-family="Microsoft YaHei,Arial,sans-serif" fill="#e5edf9">',
  `<text x="28" y="35" font-size="21">队列积压与渲染成本：${repeatLabel} 轮对照</text>`,
  '<text x="28" y="61" font-size="13" fill="#9daec8">rAF 调度次数/秒，条末为均值；蓝条长度按统一 180 次/秒刻度</text>',
  ...chartGroups.map((g,i)=>{const y=105+i*43; return `<text x="28" y="${y+17}" font-size="14">${escape(g.id)}</text><rect x="240" y="${y}" width="${g.fps.mean/180*590}" height="24" rx="4" fill="${g.config.mode==='paused'?'#4d91ed':g.config.mode==='empty'?'#20bd9b':'#6383ff'}"/><text x="${255+g.fps.mean/180*590}" y="${y+17}" font-size="14">${round(g.fps.mean)}</text>`;}),
  `<text x="28" y="${height-12}" font-size="12" fill="#9daec8">2026-10-08 · Chrome headless · 相同生产构建 · ${repeatLabel} 轮 · 非 GPU 呈现帧率</text>`, '</g></svg>'];
await writeFile(path.join(directory,'comparison.svg'),svg.join('\n'));
console.log(`Summarized ${trials.length} trials into analysis.json, tables.md and comparison.svg`);

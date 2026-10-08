/** Export a static scientific comparison with the project's ECharts SVG renderer. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../QHZHC_Web/package.json', import.meta.url));
const echarts = require('echarts');
const mainDir = path.resolve(process.argv[2] || 'reports/queue-backlog-2026-10-08');
const mapDir = path.resolve(process.argv[3] || 'reports/queue-backlog-2026-10-08-map-visible');
const main = Object.fromEntries(JSON.parse(await readFile(path.join(mainDir,'analysis.json'),'utf8')).groups.map(g=>[g.id,g]));
const visible = Object.fromEntries(JSON.parse(await readFile(path.join(mapDir,'analysis.json'),'utf8')).groups.map(g=>[g.id,g]));
const colors=['#3565ad','#6687be','#24a086','#76b8a9'];
const ids=[['history6000','map-frozen6000','charts-frozen6000','empty6000'],['history6000','map-frozen6000','charts-frozen6000'],['paused-q50000','raw-paused-q50000']];
const labels=[['完整渲染','冻结地图','冻结图表','空渲染'],['完整渲染','冻结地图','冻结图表'],['响应式队列','独立普通队列']];
const groups=[main,visible,main];
const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:1200,height:700});
chart.setOption({animation:false,backgroundColor:'#fff',textStyle:{fontFamily:'Microsoft YaHei,Arial,sans-serif',color:'#172b46'},
  title:[{text:'队列积压对渲染性能的影响 · 2026-10-08',left:25,top:20,textStyle:{fontSize:23}},
    {text:'A. 6000 点历史：地图点位在视野外',left:25,top:105,textStyle:{fontSize:16}},
    {text:'B. 6000 点历史：全部地图点位可见',left:620,top:105,textStyle:{fontSize:16}},
    {text:'C. 相同原类：一次性入队 50000 点',left:25,top:435,textStyle:{fontSize:16}}],
  graphic:[{type:'text',left:25,top:62,style:{text:'各组为 3 轮均值。地图可见性改变结果，两个视角分别对照。',fontSize:13,fill:'#526a88'}},
    {type:'text',left:690,top:465,style:{text:`响应式队列：${main['paused-q50000'].enqueueMs.mean.toFixed(2)} ms / ${main['paused-q50000'].heapMiB.mean.toFixed(2)} MiB\n独立普通队列：${main['raw-paused-q50000'].enqueueMs.mean.toFixed(2)} ms / ${main['raw-paused-q50000'].heapMiB.mean.toFixed(2)} MiB\n\n同一批次、同一队列类、同一绘制回调。\n仅改变队列是否进入 Vue 深度响应式。`,fontSize:15,lineHeight:28,fill:'#172b46'}},
    {type:'text',left:25,top:662,style:{text:'Chrome headless · rAF/s 为调度机会，不是 GPU 实际呈现帧率 · 单批 50000 点耗时不代表每批 20 点耗时',fontSize:13,fill:'#526a88'}}],
  grid:[{left:145,top:153,width:390,height:200},{left:735,top:153,width:340,height:200},{left:145,top:495,width:390,height:110}],
  xAxis:[0,1,2].map(i=>({gridIndex:i,type:'value',max:[180,20,550][i],name:i===2?'同步入队耗时 / ms':'rAF 调度次数 / 秒',nameLocation:'middle',nameGap:30,splitLine:{lineStyle:{color:'#e8edf5'}}})),
  yAxis:[0,1,2].map(i=>({gridIndex:i,type:'category',inverse:true,data:labels[i],axisLine:{show:false},axisTick:{show:false},axisLabel:{fontSize:13}})),
  series:[0,1,2].map(i=>({type:'bar',xAxisIndex:i,yAxisIndex:i,barMaxWidth:29,
    data:ids[i].map((id,n)=>({value:groups[i][id][i===2?'enqueueMs':'fps'].mean,itemStyle:{color:colors[n]}})),
    label:{show:true,position:'right',formatter:p=>Number(p.value).toFixed(2),color:'#172b46',fontSize:14}}))});
const svg=path.join(mainDir,'comparison.svg');await writeFile(svg,chart.renderToSVGString());chart.dispose();
const profile=await mkdtemp(path.join(os.tmpdir(),'qhzhc-queue-figure-'));
try {
  const chrome=process.env.QHZHC_BENCH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const child=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1',
    '--window-size=1200,700','--user-data-dir='+profile,'--screenshot='+path.join(mainDir,'comparison.png'),pathToFileURL(svg).href],{stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Chrome export: '+code)));});
} finally {if(profile.startsWith(path.join(os.tmpdir(),'qhzhc-queue-figure-'))) await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}
console.log('Saved comparison.svg and comparison.png');

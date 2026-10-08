/** Additional diagnostic profiles are kept separate from uninstrumented comparison trials. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve(process.argv[2] || 'reports/queue-backlog-2026-10-08-trace');
const files = (await readdir(directory)).filter(x=>x.endsWith('-trace.json'));
const analyses = [];
for (const file of files) {
  const events = JSON.parse(await readFile(path.join(directory,file),'utf8')).traceEvents;
  const start = events.find(x=>x.name==='queue-bench-start');
  const end = events.find(x=>x.name==='queue-bench-end');
  if (!start || !end) throw Error('Missing measurement markers');
  const inside = x => x.ts >= start.ts && x.ts < end.ts;
  const gc = events.filter(x=>inside(x) && x.pid===start.pid && x.tid===start.tid && x.ph==='X' && ['MajorGC','MinorGC'].includes(x.name));
  const gcByType = Object.fromEntries(['MajorGC','MinorGC'].map(name=>{
    const rows=gc.filter(x=>x.name===name);
    return [name,{ count:rows.length,totalMs:rows.reduce((s,x)=>s+x.dur/1000,0),maxMs:rows.length?Math.max(...rows.map(x=>x.dur/1000)):0 }];
  }));
  const profile = JSON.parse(await readFile(path.join(directory,file.replace('-trace.json','.cpuprofile')),'utf8'));
  const nodes = new Map(profile.nodes.map(x=>[x.id,x]));
  const self = new Map();
  let cursor = profile.startTime, sampledUs = 0;
  for(let i=0;i<profile.samples.length;i++) {
    const previous=cursor; cursor+=profile.timeDeltas[i];
    const elapsed=Math.max(0,Math.min(cursor,end.ts)-Math.max(previous,start.ts));
    if (!elapsed) continue;
    sampledUs+=elapsed;
    self.set(profile.samples[i],(self.get(profile.samples[i])||0)+elapsed);
  }
  const hot = [...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([id,time])=>{
    const frame=nodes.get(id).callFrame;
    return {name:frame.functionName||'(anonymous)',url:frame.url,line:frame.lineNumber+1,column:frame.columnNumber+1,selfMs:time/1000,samplePercent:time/sampledUs*100};
  });
  const measuredEvents = events.filter(x=>inside(x) && x.pid===start.pid && x.tid===start.tid && x.ph==='X');
  const names={};
  for(const event of measuredEvents) {
    const row=names[event.name]||(names[event.name]={count:0,inclusiveMs:0,maxMs:0});
    row.count++; row.inclusiveMs+=event.dur/1000;row.maxMs=Math.max(row.maxMs,event.dur/1000);
  }
  analyses.push({file,measuredDurationMs:(end.ts-start.ts)/1000,mainThread:{pid:start.pid,tid:start.tid},gc:gcByType,
    cpuSampledMs:sampledUs/1000,cpuSelfHotspots:hot,
    timelineEvents:Object.entries(names).sort((a,b)=>b[1].inclusiveMs-a[1].inclusiveMs).slice(0,25),
    note:'CPU self time is sampled, not exact. Timeline events are inclusive and overlap; never add all categories. GC values use only top-level MinorGC/MajorGC on the measurement main thread. Trace/profiler overhead prevents mixing these runs with primary data.'});
}
await writeFile(path.join(directory,'diagnostics.json'),JSON.stringify(analyses,null,2));
console.log(JSON.stringify(analyses.map(x=>({file:x.file,gc:x.gc,top:x.cpuSelfHotspots.slice(0,7)})),null,2));

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const url = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64");
const location = url(await readFile(new URL("../src/lib/location-config.ts", import.meta.url), "utf8"));
const source = (await readFile(new URL("../src/lib/follow-through.ts", import.meta.url), "utf8")).replace('"@/lib/location-config"', JSON.stringify(location));
const { buildFollowThrough, taskBelongsTo, taskIsOverdue } = await import(url(source));
const { threadIsUnread, threadNeedsAcknowledgment, visibleTeamThreads } = await import(url(await readFile(new URL("../src/lib/communications.ts", import.meta.url), "utf8")));
const now = Date.parse("2026-10-25T19:00:00Z");
const task = { id: 1, title: "Synthetic task", owner: "Demo Reviewer", category: "Admin", due: "Friday", priority: "Normal", completed: false, initials: "", location: "Division" };
test("vague legacy due labels never manufacture an overdue task", () => {
  assert.equal(taskIsOverdue(task,now),false); assert.equal(taskIsOverdue({...task,dueAt:"invalid"},now),false);
  assert.equal(taskIsOverdue({...task,dueAt:"2026-10-25T18:00:00Z"},now),true);
  assert.equal(taskIsOverdue({...task,completed:true,dueAt:"2026-10-25T18:00:00Z"},now),false);
});
test("follow-up is location scoped and personal filters preserve team handoffs", () => {
  const result=buildFollowThrough({tasks:[task,{...task,id:2,owner:"Other Demo"},{...task,id:3,location:"Halcom"}],handoffs:[{id:"h1",completed:false,location:"Division",details:"Synthetic pickup reminder",date:"2026-10-25",category:"Pickup Information",priority:"Important"}],reports:[{id:"r1",status:"Submitted",location:"Division",type:"Opening",date:"2026-10-25",completedBy:"Demo Staff"}],location:"Division",staffName:"Demo Reviewer",mine:true,canReview:false,now});
  assert.deepEqual(result.map(r=>r.id),["handoff-h1","task-1"]);
  assert.ok(result[0].href.endsWith("#pickup-handoff")); assert.equal(taskBelongsTo({...task,owner:"Demo"},"Demo Reviewer"),true); assert.equal(taskBelongsTo(task,"Demo Other"),false);
});
const thread={id:"demo",organization_id:"synthetic",location_id:"division",title:"Synthetic announcement",body:"Review pickup",author_id:"director",author_name:"Demo Director",pinned:true,requires_ack:true,created_at:"2026-10-25T17:00:00Z",replies:[],receipts:[]};
test("a read receipt never satisfies an explicit acknowledgment",()=>{
  const read={...thread,receipts:[{user_id:"staff",read_at:"2026-10-25T18:00:00Z",acknowledged_at:null}]};
  assert.equal(threadIsUnread(read,"staff"),false); assert.equal(threadNeedsAcknowledgment(read,"staff"),true);
  assert.equal(threadIsUnread({...read,replies:[{body:"New reply",created_at:"2026-10-25T18:05:00Z"}]},"staff"),true);
});
test("inbox search includes replies; audience, unread and pinned filters compose",()=>{
  const threads=[thread,{...thread,id:"other",location_id:"halcom"},{...thread,id:"reply",pinned:false,body:"Other text",replies:[{body:"Synthetic van update",created_at:"2026-10-25T19:00:00Z"}]}];
  assert.deepEqual(visibleTeamThreads(threads,"van","unread","staff","division").map(r=>r.id),["reply"]);
  assert.deepEqual(visibleTeamThreads(threads,"","pinned","staff","division").map(r=>r.id),["demo"]);
});
test("your own outgoing messages do not mark your inbox unread",()=>{
  assert.equal(threadIsUnread({...thread,author_id:"staff",replies:[]},"staff"),false);
  assert.equal(threadIsUnread({...thread,receipts:[{user_id:"staff",read_at:"2026-10-25T18:00:00Z"}],replies:[{author_id:"staff",created_at:"2026-10-25T19:00:00Z"}]},"staff"),false);
});

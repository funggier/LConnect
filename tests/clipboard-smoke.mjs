import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==="string"));
const transport = new StdioClientTransport({command:process.execPath,args:["lconnect-mcp.mjs"],cwd:root,env,stderr:"pipe"});
const client = new Client({name:"lconnect-clipboard-smoke",version:"1.0.0"},{capabilities:{}});
let stderr="";
transport.stderr?.on("data",(c)=>{stderr+=c.toString("utf8");});

function textOf(r){return r.content?.find((x)=>x.type==="text")?.text ?? "";}
async function callJson(name,args={}){
  const r=await client.callTool({name,arguments:args});
  const text=textOf(r);
  if(r.isError) throw new Error(name+" failed: "+text);
  return JSON.parse(text);
}

let prior=null;
let canRestore=false;
try{
  await client.connect(transport);
  const first=await callJson("clipboard_get",{max_chars:200000});
  if(!["text","empty","non_text"].includes(first.state)) throw new Error("unexpected state");
  console.log("clipboard_get state: PASS", first.state);

  if(process.platform!=="win32"){
    console.log("clipboard mutation skipped: non-Windows");
  } else {
    prior=first;
    canRestore=first.state==="empty" || (first.state==="text" && !first.truncated);
    if(!canRestore && String(process.env.CI).toLowerCase()!=="true"){
      console.log("clipboard mutation skipped: preserve non-text or oversized user clipboard");
    } else {
      const value="LConnect ไทย Unicode ✓ "+Date.now();
      const set=await callJson("clipboard_set",{text:value});
      if(!set.ok || !set.exact) throw new Error("set not exact");
      const got=await callJson("clipboard_get",{max_chars:200000});
      if(got.state!=="text" || got.text!==value || got.truncated) throw new Error("roundtrip mismatch");
      console.log("clipboard_set/get Unicode roundtrip: PASS");

      const clipped=await callJson("clipboard_get",{max_chars:5});
      if(clipped.text!==value.slice(0,5) || !clipped.truncated || clipped.original_chars!==value.length) throw new Error("bounded read mismatch");
      console.log("clipboard_get bounded output: PASS");

      const largeValue="ก".repeat(100000);
      const largeSet=await callJson("clipboard_set",{text:largeValue});
      if(!largeSet.ok || !largeSet.exact || largeSet.chars!==largeValue.length) throw new Error("large set not exact");
      const largeGot=await callJson("clipboard_get",{max_chars:200000});
      if(largeGot.state!=="text" || largeGot.text!==largeValue || largeGot.truncated) throw new Error("large clipboard roundtrip mismatch");
      console.log("clipboard_set large payload via stdin: PASS");

      const cleared=await callJson("clipboard_clear",{});
      if(!cleared.ok || cleared.state!=="empty") throw new Error("clear failed");
      const empty=await callJson("clipboard_get",{});
      if(empty.state!=="empty" || empty.text!==null) throw new Error("empty state mismatch");
      console.log("clipboard_clear empty state: PASS");
    }
  }
}catch(e){
  console.error("FAIL",e);
  if(stderr) console.error(stderr);
  process.exitCode=1;
}finally{
  if(process.platform==="win32" && canRestore && prior){
    try{
      if(prior.state==="text" && prior.text) await callJson("clipboard_set",{text:prior.text});
      else await callJson("clipboard_clear",{});
      console.log("clipboard prior state restore: PASS");
    }catch(e){console.error("clipboard restore failed",e); process.exitCode=1;}
  }
  await transport.close().catch(()=>{});
}

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env=Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==="string"));
const transport=new StdioClientTransport({command:process.execPath,args:["lconnect-mcp.mjs"],cwd:root,env,stderr:"pipe"});
const client=new Client({name:"lconnect-input-control-smoke",version:"1.0.0"},{capabilities:{}});
let stderr=""; transport.stderr?.on("data",c=>stderr+=c.toString("utf8"));
function textOf(r){return r.content?.find(x=>x.type==="text")?.text??"";}
async function callJson(name,args={},allowError=false){const r=await client.callTool({name,arguments:args}); const t=textOf(r); if(r.isError&&!allowError)throw new Error(name+" failed: "+t); if(r.isError)return {isError:true,text:t}; return {isError:false,data:JSON.parse(t)};}
function enc(s){return Buffer.from(s,"utf16le").toString("base64");}
async function waitTitle(prefix,needle,timeout=8000){const end=Date.now()+timeout; while(Date.now()<end){const r=await callJson("list_windows",{title_contains:prefix,visible_only:true,limit:20}); const w=r.data.windows.find(x=>x.title.includes(needle)); if(w)return w; await new Promise(r=>setTimeout(r,120));} throw new Error("title wait timeout: "+needle);}
let fixture=null; let prior=null;
try{
 await client.connect(transport);
 if(process.platform!=="win32"){console.log("input fixture skipped: non-Windows");}
 else{
  const prefix=`LConnectInputFixture_${process.pid}_${Date.now()}`;
  const ps=[
   "Add-Type -AssemblyName System.Windows.Forms","Add-Type -AssemblyName System.Drawing",
   "$f=New-Object System.Windows.Forms.Form",`$prefix='${prefix}'`,"$f.Text=$prefix+'|READY'","$f.FormBorderStyle='None'","$f.StartPosition='Manual'","$f.Location=[Drawing.Point]::new(180,180)","$f.Size=[Drawing.Size]::new(600,420)",
   "$tb=New-Object System.Windows.Forms.TextBox","$tb.Location=[Drawing.Point]::new(20,20)","$tb.Size=[Drawing.Size]::new(420,30)","$f.Controls.Add($tb)",
   "$btn=New-Object System.Windows.Forms.Button","$btn.Text='ClickMe'","$btn.Location=[Drawing.Point]::new(20,90)","$btn.Size=[Drawing.Size]::new(160,50)","$f.Controls.Add($btn)",
   "$btn.Add_Click({$f.Text=$prefix+'|CLICKED'})","$tb.Add_TextChanged({$f.Text=$prefix+'|TEXT|'+$tb.Text})","$f.Add_Shown({$tb.Focus()})","[Windows.Forms.Application]::Run($f)"
  ].join("; ");
  fixture=spawn("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-Sta","-ExecutionPolicy","Bypass","-EncodedCommand",enc(ps)],{cwd:root,windowsHide:false,stdio:"ignore"});
  const ready=await waitTitle(prefix,"READY"); const {hwnd,pid,x,y}=ready; if(pid!==fixture.pid)throw new Error("fixture pid mismatch");
  prior=await callJson("mouse_move",{x:x+10,y:y+10});
  const wrong=await callJson("key_press",{hwnd,expected_pid:pid+99999,key:"A"},true); if(!wrong.isError||!wrong.text.includes("WINDOW_IDENTITY_MISMATCH"))throw new Error("key guard failed");
  console.log("keyboard expected_pid guard: PASS");
  const unicode="ไทย Unicode ✓";
  const typed=await callJson("type_text",{hwnd,expected_pid:pid,text:unicode}); if(!typed.data.ok)throw new Error("type_text failed");
  await waitTitle(prefix,unicode); console.log("type_text Unicode: PASS");
  await callJson("key_combo",{hwnd,expected_pid:pid,keys:["CTRL","A"]});
  await callJson("key_press",{hwnd,expected_pid:pid,key:"BACKSPACE"});
  await waitTitle(prefix,"|TEXT|"); console.log("key_combo + key_press: PASS");
  const btnX=x+20+80, btnY=y+90+25;
  const guard=await callJson("mouse_click",{x:btnX,y:btnY,expected_hwnd:"0x7FFFFFFFFFFFFFFF"},true); if(!guard.isError||!guard.text.includes("POINT_WINDOW_MISMATCH"))throw new Error("mouse point guard failed");
  console.log("mouse point guard: PASS");
  const move=await callJson("mouse_move",{x:btnX,y:btnY}); if(!move.data.ok)throw new Error("mouse_move failed"); console.log("mouse_move: PASS");
  const click=await callJson("mouse_click",{x:btnX,y:btnY,button:"left",clicks:1,expected_hwnd:hwnd}); if(!click.data.ok)throw new Error("mouse_click failed");
  await waitTitle(prefix,"CLICKED"); console.log("mouse_click: PASS");
  const scroll=await callJson("mouse_scroll",{x:btnX,y:btnY,delta:-120,expected_hwnd:hwnd}); if(!scroll.data.ok||scroll.data.sent_inputs!==1)throw new Error("mouse_scroll failed"); console.log("mouse_scroll: PASS");
 }
}catch(e){console.error("FAIL",e); if(stderr)console.error(stderr); process.exitCode=1;}
finally{
 try{if(prior?.data?.before?.available)await callJson("mouse_move",{x:prior.data.before.x,y:prior.data.before.y});}catch{}
 await transport.close().catch(()=>{}); if(fixture&&fixture.exitCode==null){try{fixture.kill();}catch{}}
}

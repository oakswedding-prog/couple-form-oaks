import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Isolated component harness injected ONLY by this browser test. No app auth or routes are changed.
// All Firebase writes/auth traffic are blocked; these fixtures never create live couples.
const origin = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:80";
const output = "generated-artifacts/moodboard-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.route(/(firestore|identitytoolkit|securetoken)\.googleapis\.com/, route => route.abort());
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVQI12Nc2R7FwMAAAAgPAYyA+b7LAAAAAElFTkSuQmCC";
const image = (title, w, h, fill) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/3}" fill="#FBF7F0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="28" fill="#2A2420">${title}</text></svg>`).toString("base64")}`;
const photos = Array.from({ length: 8 }, (_, i) => image(`Reference ${i+1}`, i%2?400:800, i%2?650:450, i%3?"#B8B29B":"#BE9E8A"));
const family = side => Array.from({length: 17},(_,i)=>({id:`${side}-${i}`,name:i===0?"Zoë Müller":`${side==="bride"?"Maya":"Leo"}'s person ${i+1}`,relationship:["Mother","Father","Sister","Grandfather","Close friend","Other"][i%6],side,mustCapture:i===0,...(i%5?{photoUrl:photos[i%photos.length]}:{})}));
const submission = {
  id:"browser-test-only",partner1:"Maya",partner2:"Leo",weddingDate:"2027-01-01",phone:"",email:"",submittedAt:"2026-01-01",
  answers:{partner1:"Maya",partner2:"Leo",q10_people:{familyMembers:[...family("bride"),...family("groom")],treeNotes:""},
    decorEvents:[{id:"mehendi",name:"Mehendi",notes:"",links:[],images:photos},{id:"wedding",name:"Wedding",images:[photos[0],photos[3]],notes:"",links:[]}],
    wardrobe:{bride:{photos:[photos[1]],notes:"Ivory silk sari",links:[]},groom:{photos:[photos[2]],notes:"White shirt and gold mundu",links:[]}},
    q12_references:{images:[png],links:["https://youtu.be/example","https://pinterest.com/pin/example"],notes:"Natural light and warm colours"}
  }
};
const page = await context.newPage();
const errors = [];
page.on("pageerror", e=>{errors.push(e.message);console.error("Browser exception:",e.message);});
page.on("requestfailed",req=>{if(!/googleapis/.test(req.url()))console.error("Request failed:",req.url(),req.failure()?.errorText);});
await page.route("**/__moodboard-test", route=>route.fulfill({ contentType:"text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/index.css"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
const {default:React}=await import("/node_modules/.vite/deps/react.js");
const ReactDOMModule=await import("/node_modules/.vite/deps/react-dom_client.js");
const createRoot=(ReactDOMModule.default || ReactDOMModule).createRoot;
const {MoodboardView}=await import("/src/moodboard/MoodboardView.tsx");
window.fixture=${JSON.stringify(submission)};
const render=()=>createRoot(document.getElementById("root")).render(React.createElement("main",{style:{padding:32,maxWidth:1300,margin:"auto"}},React.createElement(MoodboardView,{submission:window.fixture})));
render();
</script></body></html>` }));
try {
  await page.goto(`${origin}/__moodboard-test`, {waitUntil:"networkidle"});
  await page.getByTestId("moodboard-view").waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${output}/cover.jpg`});
  await page.getByTestId("button-section-decor").click();
  await page.getByTestId("button-next-page").click();
  await page.waitForTimeout(400);
  await page.screenshot({path:`${output}/decor.jpg`});
  assert.equal(await page.locator("svg image").count(),6);
  assert.equal(await page.locator('svg image[preserveAspectRatio="xMidYMid meet"]').count(),6);
  await page.getByTestId("button-section-family").click();
  await page.getByTestId("button-next-page").click();
  await page.waitForTimeout(300);
  await page.screenshot({path:`${output}/family.jpg`});
  await page.getByTestId("button-next-page").click();
  await page.waitForTimeout(300);
  await page.screenshot({path:`${output}/parents.jpg`});
  for (const format of ["pdf","pptx"]) {
    const event = page.waitForEvent("download", {timeout:90000});
    await page.getByTestId(`button-export-${format}`).click();
    const file = await event;
    assert.match(file.suggestedFilename(),new RegExp(`OAKS_Wedding_Moodboard_Maya_Leo\\.${format}$`));
    const path = `${output}/download.${format}`;
    await file.saveAs(path);
    assert.ok((await readFile(path)).length>20000);
    if(format==="pdf") assert.match(execFileSync("pdftotext",[path,"-"]).toString(),/Zoë Müller/);
    else assert.match(execFileSync("unzip",["-p",path,"ppt/slides/slide*.xml"],{maxBuffer:10_000_000}).toString(),/Zoë Müller/);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${output}/mobile.jpg`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"No document overflow on mobile");
  await page.setViewportSize({width:1440,height:1000});
  // The error path must fail explicitly instead of downloading a file with missing photos.
  await page.route("**/missing-moodboard.png",r=>r.fulfill({status:404,body:"Not found"}));
  // Change the test-only route's fixture, then remount by reloading its HTML.
  submission.answers.q12_references.images=[`${origin}/missing-moodboard.png`];
  await page.reload({waitUntil:"networkidle"});
  const downloads=[];
  page.on("download",d=>downloads.push(d));
  await page.getByTestId("button-export-pdf").click();
  await page.getByRole("status").filter({hasText:"No incomplete file was downloaded"}).waitFor({timeout:60000});
  assert.equal(downloads.length,0);
  assert.deepEqual(errors,[]);
  console.log("PASS: real MoodboardView in isolated browser harness, desktop/mobile layouts, section/page controls, PDF and editable PPTX downloads, Unicode names, complete family list, original-aspect image rendering, and explicit missing-media failure. Live Firebase writes blocked.");
} finally {
  if (errors.length) console.error(errors);
  await context.close();
  await browser.close();
}

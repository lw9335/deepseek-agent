import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/26977/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
for(const width of [1440,375])for(const scheme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:960},colorScheme:scheme,offline:true});
 const page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 await page.goto(pathToFileURL(path.resolve('report/superagent-explained.html')).href);await page.waitForTimeout(150);
 const state=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,sections:[...document.querySelectorAll('main>section')].map(s=>({id:s.id,chars:s.textContent.length})),svg:document.querySelectorAll('svg').length,background:getComputedStyle(document.body).backgroundColor,refs:document.querySelectorAll('[data-source]').length,details:document.querySelectorAll('details').length}));
 await page.screenshot({path:`report/_qa-${width}-${scheme}.png`});
 await page.locator('a[data-source]').first().click();await page.waitForTimeout(100);
 const dialog=await page.locator('#source-modal').evaluate(e=>({open:e.open,target:!!e.querySelector('.target')}));await page.locator('#close-source').click();
 await page.locator('#theme').click();const switched=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);await page.locator('#theme').click();
 await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
 const expanded=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('pre')&&!e.closest('svg')).slice(0,12).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,50)}))}));
 await page.locator('.nav a[href="#ch8"]').click();await page.waitForTimeout(450);const active=await page.locator('.nav a.active').getAttribute('href');
 const citations=await page.evaluate(()=>[...document.querySelectorAll('[data-source]')].map(a=>({file:a.dataset.source,line:Number(a.dataset.line)})));
 const invalid=citations.filter(a=>{const f=path.join('dsh-superagent-prototype',a.file);return !fs.existsSync(f)||!(a.line>0)||a.line>fs.readFileSync(f,'utf8').split(/\r?\n/).length});
 results.push({width,scheme,errors,requests,state,dialog,themeSwitch:switched!==state.background,expanded,active,invalid});await context.close();
}
await browser.close();fs.writeFileSync('report/_qa-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));


const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root='http://127.0.0.1:8784/ai-receptionist/dashboard';
const out='docs/design/qa-workspace';
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[];
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1672,height:941},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 for(const [name,url] of [['overview','/'],['calls','/activity/calls'],['inbox','/activity/inquiries'],['texts','/activity/texts'],['appointments','/scheduling/appointments?id=review-appointment'],['assistant','/assistants/1/configuration'],['settings','/account/settings'],['billing','/account/billing']]){
  await page.goto(root+url);await page.waitForTimeout(900);
  if(['calls','inbox','texts'].includes(name)){await page.locator('.mc-call-row').first().click();}
  if(name==='overview'){
   await page.getByRole('heading',{name:'Recent call outcomes'}).waitFor();
   await page.getByLabel('Chart period').selectOption('7');assert.equal(await page.locator('.cl-bar-column').count(),7);
   await page.getByLabel('Chart period').selectOption('14');
   const order=await page.locator('.cl-overview').evaluate(e=>({attention:e.querySelector('.cl-overview-grid').getBoundingClientRect().bottom,analytics:e.querySelector('.cl-analytics-heading').getBoundingClientRect().top,outcomes:e.querySelector('.cl-outcomes').getBoundingClientRect().top}));assert.ok(order.analytics>=order.attention);assert.ok(order.outcomes>order.analytics);
  }
  if(name==='assistant') {await page.getByRole('button',{name:'Run simulation',exact:true}).click();await page.getByText('Preview complete. Nothing was sent or booked.').waitFor();}
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  results.push({name,mobile,overflow});await page.screenshot({path:`${out}/fidelity-${name}-${mobile?'mobile':'desktop'}.png`,fullPage:true});
 }
 await page.goto(root+'/');await page.getByRole('link',{name:'Review request',exact:true}).click();await page.getByRole('button',{name:'Approve',exact:true}).waitFor();
 await page.goto(root+'/');await page.getByRole('link',{name:'Open message',exact:true}).click();await page.getByRole('heading',{name:'James Carter',exact:true}).waitFor();
 await page.goto(root+'/');await page.getByRole('link',{name:'Add appointment',exact:true}).click();await page.getByRole('heading',{name:'Add an appointment',exact:true}).waitFor();
 await page.goto(root+'/activity/inquiries');await page.getByLabel('Search messages',{exact:true}).fill('no-such-person-xyz');await page.getByLabel('Search messages',{exact:true}).fill('');await page.locator('.mc-call-row').first().waitFor();
 await page.close();
}
await browser.close();fs.writeFileSync(`${out}/fidelity-results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));assert.equal(errors.length,0);assert.equal(results.some(r=>r.overflow),false);
})().catch(e=>{console.error(e);process.exit(1)});

import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')+'.fixture';
const scriptUrl='https://script.google.com/macros/s/FixturePartCastDeployment123456789/exec',key='a'.repeat(64);

async function fixture(context,{supported=true,language='en',large=false,dark=false}={}){
 await context.addInitScript(({userId,token,language,large,dark})=>{
  localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language',language);localStorage.setItem('partcast-text-size',large?'large':'standard');localStorage.setItem('partcast-theme',dark?'dark':'light');
 },{userId,token,language,large,dark});
 const rows=[{provider:'gmail',enabled:true,ready:true,delivery_method:'oauth',smtp_supported:true,apps_script_supported:supported,sender_email:'sender@example.test',fields:{client_id:true,client_secret:true,refresh_token:true,sender_email:true,script_url:false,script_secret:false}},
  {provider:'gemini',enabled:true,ready:true,model:'gemini-2.5-flash',fields:{api_key:true,model:true}}];
 const writes=[];let broken=true,checks=0;
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  let body={data:[]};
  if(path==='/api/me')body={user:{id:userId,full_name:'Store IT',role:'super_admin',active:true,session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(path==='/api/offline-snapshot')body={products:[],suppliers:[]};
  else if(path==='/api/admin/integrations')body={data:rows,forecasting:{ready:true,message:'The forecasting engine is ready.'}};
  else if(path==='/api/admin/integrations/gmail'&&request.method()==='PATCH'){
   const patch=request.postDataJSON();writes.push(patch);
   if(broken)return route.fulfill({status:503,headers,json:{error:'The Apps Script signing key was not accepted. Check the matching key in Render and Script properties.',code:'GMAIL_SCRIPT_AUTH_FAILED'}});
   rows[0]={...rows[0],delivery_method:patch.delivery_method,sender_email:patch.sender_email,fields:{...rows[0].fields,script_url:true,script_secret:true}};body={data:rows[0]};
  }else if(path==='/api/admin/integrations/gmail/test'){checks++;body={ok:true,message:'Apps Script access is valid. Complete a password and email-code sign-in to confirm delivery.'};}
  return route.fulfill({headers,json:body});
 });
 return {writes,rows,get checks(){return checks;},recover:()=>broken=false};
}

test('Apps Script settings check before replacing saved Gmail settings and clear successful secrets',async({page,context})=>{
 const store=await fixture(context);await page.goto('/it-settings');
 const form=page.getByRole('form',{name:'Gmail login codes',exact:true});
 await form.getByLabel('Email connection',{exact:true}).selectOption('apps_script');
 await expect(form.getByLabel('Google client secret',{exact:true})).toHaveCount(0);await expect(form.getByLabel('Google App Password',{exact:true})).toHaveCount(0);
 const endpoint=form.getByLabel('Apps Script web app URL',{exact:true}),secret=form.getByLabel('Apps Script signing key',{exact:true});
 await expect(secret).toHaveAttribute('type','password');await expect(secret).toHaveAttribute('required','');
 await endpoint.fill(scriptUrl);await secret.fill(key);await expect(form.getByRole('button',{name:'Check saved connection',exact:true})).toBeDisabled();
 await form.getByRole('button',{name:'Check and save connection',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('signing key was not accepted');await expect(secret).toHaveValue(key);await expect(form.getByText('Saved connection: Gmail API (OAuth)',{exact:true})).toBeVisible();
 store.recover();await form.getByRole('button',{name:'Check and save connection',exact:true}).click();
 await expect(form.getByText('Saved connection: Gmail via Apps Script',{exact:true})).toBeVisible();await expect(secret).toHaveValue('');await expect(endpoint).toHaveValue('');await expect(secret).not.toHaveAttribute('required');
 expect(store.writes[1]).toEqual({enabled:true,delivery_method:'apps_script',sender_email:'sender@example.test',script_url:scriptUrl,script_secret:key});
 await form.getByRole('button',{name:'Check saved connection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Apps Script access is valid'})).toBeVisible();expect(store.checks).toBe(1);
});

test('the website gates Apps Script selection until the API supports it',async({page,context})=>{
 const store=await fixture(context,{supported:false});await page.goto('/it-settings');
 await expect(page.getByLabel('Email connection',{exact:true}).locator('option[value="apps_script"]')).toHaveAttribute('disabled','');expect(store.writes).toHaveLength(0);
});

test('Apps Script settings remain readable on narrow phones with larger Tagalog text',async({page,context})=>{
 await fixture(context,{language:'fil',large:true,dark:true});
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/it-settings');await page.getByLabel('Koneksyon ng email',{exact:true}).selectOption('apps_script');
  const secret=page.getByLabel('Signing key ng Apps Script',{exact:true});await expect(secret).toBeVisible();const form=page.locator('form').filter({has:secret});await form.locator('summary').click();
  await expect(form.getByRole('link',{name:'Buksan ang pag-setup ng Apps Script',exact:true})).toHaveAttribute('href','/email-setup/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await secret.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/partcast-apps-script-settings-${width}.png`,fullPage:false});
 }
});

test('public setup copies and downloads the actual script and keeps generated signing keys only on the device',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const requests=[];page.on('request',request=>requests.push({url:request.url(),body:request.postData()}));
 await page.goto('/email-setup/');await expect(page.getByRole('heading',{name:'Gmail through Apps Script',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Copy script',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Script copied.'})).toBeVisible();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toContain('computeHmacSha256Signature');expect(copied).toContain('MailApp.sendEmail');
 const waiting=page.waitForEvent('download');await page.getByRole('link',{name:'Download Code.gs',exact:true}).click();const download=await waiting;expect(download.suggestedFilename()).toBe('Code.gs');expect(await readFile(await download.path(),'utf8')).toBe(copied);
 await page.getByRole('button',{name:'Generate signing key',exact:true}).click();const generated=await page.getByLabel('Signing key',{exact:true}).inputValue();expect(generated).toMatch(/^[a-f0-9]{64}$/);await expect(page.getByLabel('Signing key',{exact:true})).toHaveAttribute('type','password');
 await page.getByRole('button',{name:'Copy signing key',exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(generated);
 const persisted=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(persisted).not.toContain(generated);expect(JSON.stringify(requests)).not.toContain(generated);expect(requests.every(request=>new URL(request.url).origin==='http://localhost:4173')).toBe(true);
 await page.reload();await expect(page.getByLabel('Signing key',{exact:true})).toHaveValue('');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});

test('setup instructions remain public without JavaScript or an available API, including after service worker control',async({browser,page,context})=>{
 await context.route('http://localhost:10000/**',route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{needsSetup:false}}));
 await page.goto('/login');await page.evaluate(async()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.goto('/email-setup/');await expect(page.getByRole('heading',{name:'Gmail through Apps Script',exact:true})).toBeVisible();
 const offline=await browser.newContext({baseURL:'http://localhost:4173',javaScriptEnabled:false,serviceWorkers:'block'});const publicPage=await offline.newPage();
 await publicPage.goto('/email-setup/');await expect(publicPage.getByRole('heading',{name:'4. Configure Render',exact:true})).toBeVisible();await expect(publicPage.getByText('Who has access:',{exact:false})).toBeVisible();await expect(publicPage.locator('pre').filter({hasText:'GMAIL_DELIVERY_METHOD=apps_script'})).toBeVisible();await offline.close();
});

test('manual copying remains possible when clipboard permission is unavailable',async({page})=>{
 await page.goto('/email-setup/');await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new DOMException('Clipboard unavailable','NotAllowedError');};});
 await page.getByRole('button',{name:'Copy script',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Copy was unavailable.'})).toBeVisible();await page.locator('summary').click();await expect(page.locator('#script-source')).toContainText('computeHmacSha256Signature');
 await page.getByRole('button',{name:'Generate signing key',exact:true}).click();await page.getByRole('button',{name:'Copy signing key',exact:true}).click();await expect(page.getByLabel('Signing key',{exact:true})).toHaveAttribute('type','text');await expect(page.getByRole('status').filter({hasText:'Copy the selected signing key manually'})).toBeVisible();
});

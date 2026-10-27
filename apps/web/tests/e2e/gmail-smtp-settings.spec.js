import {test,expect} from '@playwright/test';

const userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777';
const project='ragdjkdcrvexqfadlqbf';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')+'.fixture';
const appPassword='abcd efgh ijkl mnop';

async function fixture(context,{supported=true,failSave=false,language='en',large=false,dark=false}={}){
 await context.addInitScript(({userId,project,token,language,large,dark})=>{
  localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language',language);localStorage.setItem('partcast-text-size',large?'large':'standard');localStorage.setItem('partcast-theme',dark?'dark':'light');
 },{userId,project,token,language,large,dark});
 const rows=[{provider:'gmail',enabled:true,ready:true,delivery_method:'oauth',smtp_supported:supported,sender_email:'sender@example.test',fields:{client_id:true,client_secret:true,refresh_token:true,sender_email:true,app_password:false}},
  {provider:'gemini',enabled:true,ready:true,model:'gemini-2.5-flash',fields:{api_key:true,model:true}}];
 const writes=[];let blocked=failSave,checks=0;
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store IT',role:'super_admin',active:true,session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products:[],suppliers:[]};
  else if(url.pathname==='/api/admin/integrations')body={data:rows,forecasting:{ready:true,message:'The forecasting engine is ready.'}};
  else if(url.pathname==='/api/admin/integrations/gmail'&&request.method()==='PATCH'){
   const patch=request.postDataJSON();writes.push(patch);
   if(blocked)return route.fulfill({status:503,headers,json:{error:'The server could not connect to Gmail SMTP. Render Free blocks SMTP; use hosting that allows port 465.',code:'GMAIL_SMTP_UNAVAILABLE'}});
   rows[0]={...rows[0],delivery_method:patch.delivery_method,sender_email:patch.sender_email,fields:{...rows[0].fields,app_password:rows[0].fields.app_password||Boolean(patch.app_password)}};
   body={data:rows[0]};
  }else if(url.pathname==='/api/admin/integrations/gmail/test'){
   checks++;body={ok:true,message:'Gmail SMTP sign-in is valid. Complete a password and email-code sign-in to confirm delivery.'};
  }
  await route.fulfill({headers,json:body});
 });
 return {rows,writes,get checks(){return checks;},setBlocked:value=>blocked=value};
}

test('SMTP selection shows only the sender and App Password, preserves failed entries and clears secrets after save',async({page,context})=>{
 const store=await fixture(context,{failSave:true});await page.goto('/it-settings');
 const form=page.getByRole('form',{name:'Gmail login codes',exact:true});
 await form.getByLabel('Email connection',{exact:true}).selectOption('smtp');
 await expect(form.getByLabel('Google client secret',{exact:true})).toHaveCount(0);
 await expect(form.getByLabel('Google refresh token',{exact:true})).toHaveCount(0);
 const password=form.getByLabel('Google App Password',{exact:true});
 await expect(password).toHaveAttribute('type','password');await expect(password).toHaveAttribute('required','');
 await expect(form.getByRole('note')).toContainText('Render Free blocks SMTP.');
 await password.fill(appPassword);
 await expect(form.getByRole('button',{name:'Check saved connection',exact:true})).toBeDisabled();
 await form.getByRole('button',{name:'Check and save connection',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('could not connect to Gmail SMTP');
 await expect(password).toHaveValue(appPassword);
 await expect(form.getByText('Saved connection: Gmail API (OAuth)',{exact:true})).toBeVisible();
 expect(store.rows[0].delivery_method).toBe('oauth');expect(store.writes).toHaveLength(1);
 store.setBlocked(false);await form.getByRole('button',{name:'Check and save connection',exact:true}).click();
 await expect(password).toHaveValue('');await expect(password).not.toHaveAttribute('required');
 await expect(form.getByText('Saved connection: Gmail SMTP (App Password)',{exact:true})).toBeVisible();
 expect(store.writes[1]).toEqual({enabled:true,delivery_method:'smtp',sender_email:'sender@example.test',app_password:appPassword});
 await expect(page.getByText(appPassword,{exact:false})).toHaveCount(0);
 await form.getByRole('button',{name:'Check saved connection',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Gmail SMTP sign-in is valid'})).toBeVisible();expect(store.checks).toBe(1);
 await form.getByLabel('Email connection',{exact:true}).selectOption('oauth');
 await expect(form.getByLabel('Google App Password',{exact:true})).toHaveCount(0);
 await form.getByRole('button',{name:'Save connection',exact:true}).click();
 await expect(form.getByText('Saved connection: Gmail API (OAuth)',{exact:true})).toBeVisible();
 expect(store.writes[2]).toEqual({enabled:true,delivery_method:'oauth',sender_email:'sender@example.test'});
});

test('a previous API cannot silently accept an unsupported SMTP selection during deployment',async({page,context})=>{
 const store=await fixture(context,{supported:false});await page.goto('/it-settings');
 const form=page.getByRole('form',{name:'Gmail login codes',exact:true});
 await expect(form.getByLabel('Email connection',{exact:true}).locator('option[value="smtp"]')).toHaveAttribute('disabled','');
 await expect(form.getByText('SMTP setup requires the updated API.',{exact:true})).toBeVisible();
 await expect(form.getByLabel('Google App Password',{exact:true})).toHaveCount(0);
 expect(store.writes).toHaveLength(0);
});

test('SMTP settings fit larger Tagalog text and dark mode on phones with a clear Google App Password link',async({page,context})=>{
 await fixture(context,{language:'fil',large:true,dark:true});
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/it-settings');
  await page.getByLabel('Koneksyon ng email',{exact:true}).selectOption('smtp');
  const password=page.getByLabel('Google App Password',{exact:true});await expect(password).toBeVisible();
  const gmail=page.locator('form').filter({has:password});
  await gmail.locator('summary').click();
  await expect(gmail.getByRole('link',{name:'Gumawa ng Google App Password',exact:true})).toHaveAttribute('href','https://myaccount.google.com/apppasswords');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await password.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/partcast-gmail-smtp-${width}.png`,fullPage:false});
 }
});

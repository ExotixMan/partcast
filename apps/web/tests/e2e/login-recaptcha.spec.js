import {test,expect} from '@playwright/test';

const project='ragdjkdcrvexqfadlqbf',uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}],exp:4102444800})).toString('base64url')+'.fixture';
const user={id:uid,email:'staff@example.test',aud:'authenticated'};
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
const widgetScript=`
let next=0,latest;
window.__captchaRenders=[];
window.__captcha={expire:()=>latest['expired-callback'](),fail:()=>latest['error-callback']()};
window.grecaptcha={
 render(element,options){
  const id=next++;latest=options;window.__captchaRenders.push(options);
  const label=document.createElement('label'),input=document.createElement('input');
  label.style.cssText='display:flex;align-items:center;gap:12px;border:1px solid #888;padding:12px;box-sizing:border-box;max-width:100%;';
  label.style.width=options.size==='compact'?'164px':'304px';label.style.height=options.size==='compact'?'144px':'78px';
  input.type='checkbox';input.onchange=()=>options.callback('fixture-recaptcha-token-'+id);
  label.append(input,document.createTextNode("I'm not a robot"));element.append(label);return id;
 },reset(){}
};window.__partcastRecaptchaReady();`;

async function fixture(context,{saved=false,scriptFailure=false,checkFailure=false,slowConfig=false,sdkDelay=0}={}){
 if(saved)await context.addInitScript(({project,token,user})=>localStorage.setItem('sb-'+project+'-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user})),{project,token,user});
 const state={passwords:[],codes:[],verified:false,failPassword:true,scriptFailure,checkFailure,scriptRequests:0};
 await context.route('https://www.google.com/recaptcha/api.js**',route=>{
  state.scriptRequests++;
  return state.scriptFailure?route.abort('failed'):route.fulfill({contentType:'application/javascript',body:sdkDelay?`setTimeout(()=>{${widgetScript}},${sdkDelay});`:widgetScript});
 });
 await context.route(`https://${project}.supabase.co/**`,route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({json:user,headers}));
 await context.route('http://localhost:10000/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let json={needsSetup:false,captcha:{siteKey:'fixture-public-site-key'},data:[]},status=200;
  if(path==='/setup/status'&&slowConfig)await new Promise(resolve=>setTimeout(resolve,500));
  if(path==='/auth/password'){
   state.passwords.push(req.postDataJSON());status=state.failPassword?401:200;
   json=state.failPassword?{error:'Email or password is incorrect.'}:{session:{access_token:token,refresh_token:'fixture-refresh'},botProof:{token:'fixture-signed-proof',expiresAt:Date.now()+600000}};
  }else if(path==='/api/me'){
   status=state.verified?200:428;json=state.verified?{user:{...user,role:'owner',active:true,full_name:'Store Staff',session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}}:{error:'Enter the email code to finish signing in.'};
  }else if(path==='/auth/otp/request'){
   state.codes.push(req.postDataJSON());status=state.checkFailure?422:200;
   json=state.checkFailure?{error:'Security check was not accepted. Please try the check again.',code:'CAPTCHA_FAILED'}:{sent:true,...(req.postDataJSON().captchaToken?{botProof:{token:'fixture-fresh-proof',expiresAt:Date.now()+600000}}:{})};
  }else if(path==='/auth/otp/verify'){
   state.verified=req.postDataJSON().code==='654321';status=state.verified?200:422;json=state.verified?{verified:true}:{error:'The code is incorrect.'};
  }else if(path==='/api/dashboard')json={metrics:{totalProducts:0,lowStock:0,outOfStock:0,inventoryValue:0},salesTrend:[],fastMoving:[],slowMoving:[],reorder:[]};
  else if(path==='/api/offline-snapshot')json={products:[],suppliers:[]};
  return route.fulfill({status,json,headers});
 });
 return state;
}

test('Google checkbox gates password attempts, resets after rejection and keeps email OTP required',async({page,context})=>{
 const state=await fixture(context);await page.goto('/');
 await page.getByLabel('Email address',{exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong-password');
 const proceed=page.getByRole('button',{name:'Continue',exact:true});await expect(proceed).toBeDisabled();
 await page.getByLabel('Password',{exact:true}).press('Enter');expect(state.passwords).toHaveLength(0);
 await page.getByRole('checkbox',{name:"I'm not a robot"}).check();await expect(proceed).toBeEnabled();await proceed.click();
 await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');await expect(proceed).toBeDisabled();
 expect(state.passwords[0].captchaToken).toMatch(/^fixture-recaptcha-token-/);expect(state.codes).toHaveLength(0);
 state.failPassword=false;await page.getByLabel('Password',{exact:true}).fill('fixture-correct-password');
 await page.getByRole('checkbox',{name:"I'm not a robot"}).check();await proceed.click();
 await expect(page.getByLabel('Email sign-in code')).toBeVisible();await expect.poll(()=>state.codes.length).toBe(1);
 expect(state.codes[0]).toEqual({botProof:'fixture-signed-proof'});await expect(page.getByRole('checkbox')).toHaveCount(0);
 await page.getByLabel('Email sign-in code').fill('123456');await page.getByRole('button',{name:'Verify code and sign in'}).click();await expect(page.getByRole('alert')).toContainText('code is incorrect');
 await page.getByLabel('Email sign-in code').fill('654321');await page.getByRole('button',{name:'Verify code and sign in'}).click();await expect(page.getByRole('heading',{name:'Hello, Store'})).toBeVisible();
});

test('expired challenges and provider failures block submission until a fresh check completes',async({page,context})=>{
 const state=await fixture(context);await page.goto('/');
 await page.getByLabel('Email address',{exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('checkbox').check();await page.evaluate(()=>window.__captcha.expire());
 await expect(page.getByText('Security check expired. Please try again.')).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Try security check again'}).click();await page.getByRole('checkbox').check();
 await page.evaluate(()=>window.__captcha.fail());await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();expect(state.passwords).toHaveLength(0);
 await page.getByRole('button',{name:'Try security check again'}).click();await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
});

test('a blocked Google script has a working retry and no sign-in bypass',async({page,context})=>{
 const state=await fixture(context,{scriptFailure:true});await page.goto('/');
 await expect(page.getByText('Security check could not load. Check your connection and try again.')).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
 state.scriptFailure=false;await page.getByRole('button',{name:'Try security check again'}).click();await expect(page.getByRole('checkbox')).toBeVisible();
 expect(state.scriptRequests).toBeGreaterThan(1);expect(state.passwords).toHaveLength(0);
});

test('the checkbox waits for Google’s runtime callback after the loader script downloads',async({page,context})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await fixture(context,{sdkDelay:600});await page.goto('/');await expect(page.getByRole('checkbox')).toBeVisible();
 await expect(page.getByText('Security check could not load. Check your connection and try again.')).toHaveCount(0);expect(errors).toEqual([]);
});

test('a restored password session waits for configuration and a fresh checkbox before sending email',async({page,context})=>{
 const state=await fixture(context,{saved:true,slowConfig:true});await page.goto('/login');
 await expect(page.getByRole('heading',{name:'Check your email',exact:true})).toBeVisible();await expect(page.getByRole('checkbox')).toBeVisible();expect(state.codes).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Send email code',exact:true})).toBeDisabled();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Send email code',exact:true}).click();
 await expect.poll(()=>state.codes.length).toBe(1);expect(state.codes[0].captchaToken).toMatch(/^fixture-recaptcha-token-/);await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('a rejected session proof reveals a new check instead of trapping the email-code page',async({page,context})=>{
 const state=await fixture(context,{checkFailure:true});state.failPassword=false;await page.goto('/');
 await page.getByLabel('Email address',{exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Security check was not accepted.');await expect(page.getByRole('checkbox')).toBeVisible();
 state.checkFailure=false;await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Send email code',exact:true}).click();await expect(page.getByRole('checkbox')).toHaveCount(0);expect(state.codes).toHaveLength(2);
});

test('compact Google check fits a narrow phone with larger text, Tagalog and dark mode',async({page,context})=>{
 await context.addInitScript(()=>{localStorage.setItem('partcast-language','fil');localStorage.setItem('partcast-theme','dark');localStorage.setItem('partcast-text-size','large');});
 await fixture(context);await page.setViewportSize({width:320,height:840});await page.goto('/');await expect(page.getByRole('checkbox')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__captchaRenders.at(-1)?.size)).toBe('compact');
 expect(await page.evaluate(()=>window.__captchaRenders.at(-1).theme)).toBe('dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('checkbox').focus();await page.keyboard.press('Space');await expect(page.getByText('Tapos na ang pagsusuri sa seguridad.')).toBeVisible();
 await page.screenshot({path:'/tmp/partcast-google-check-phone.png',fullPage:true});
});

import {test,expect} from '@playwright/test';

const userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')+'.fixture';

async function fixture(context,{delay=0}={}){
 await context.addInitScript(({userId,token})=>{
  localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}));
 },{userId,token});
 let broken=!delay,requests=0;
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(path==='/api/me')return route.fulfill({status:428,headers,json:{error:'Email verification is required.'}});
  if(path==='/auth/otp/request'){
   requests++;
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   return route.fulfill({status:broken?503:200,headers,json:broken?{
    error:'The server could not connect to Gmail SMTP. Check SMTP access on the API host.',code:'GMAIL_SMTP_UNAVAILABLE',
    diagnostics:{provider:'gmail',stage:'smtp_connection',settings_source:'api_environment',smtp_error_code:'ETIMEDOUT',smtp_command:'CONN'}
   }:{sent:true,expiresIn:600,resendAfter:60}});
  }
  return route.fulfill({headers,json:{needsSetup:false}});
 });
 return {get requests(){return requests;},restore:()=>broken=false};
}

test('OTP failures expose a safe expandable connection reference before sign-in and clear it after recovery',async({page,context})=>{
 const store=await fixture(context);await page.setViewportSize({width:320,height:840});await page.goto('/login');
 await expect(page.getByRole('heading',{name:'Check your email',exact:true})).toBeVisible();
 const alert=page.getByRole('alert').filter({hasText:'could not connect to Gmail SMTP'});
 await expect(alert).toBeVisible();
 const reference=alert.getByText('Reference: GMAIL_SMTP_UNAVAILABLE · ETIMEDOUT · CONN',{exact:true});
 await expect(reference).toBeHidden();await alert.locator('summary').click();await expect(reference).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/partcast-otp-email-reference.png',fullPage:false});
 store.restore();await page.getByRole('button',{name:'Send email code',exact:true}).click();
 await expect(page.getByText('Your password is correct. Enter the code sent to your email to finish signing in.',{exact:true})).toBeVisible();
 await expect(page.getByText('Error details',{exact:true})).toHaveCount(0);expect(store.requests).toBe(2);
});

test('a delayed email submission stays pending beyond the former 20-second timeout',async({page,context})=>{
 const store=await fixture(context,{delay:23000});await page.goto('/login');
 await expect(page.getByRole('heading',{name:'Check your email',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Signing in…',exact:true})).toBeDisabled();
 await expect(page.getByText('Your password is correct. Enter the code sent to your email to finish signing in.',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('alert')).toHaveCount(0);expect(store.requests).toBe(1);
});

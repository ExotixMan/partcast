const byId=id=>document.getElementById(id);
let source;
async function script(){
 if(!source){const response=await fetch('/email-setup/Code.gs');if(!response.ok)throw new Error('Script unavailable');source=await response.text();}
 return source;
}
byId('copy-script').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(await script());byId('script-status').textContent='Script copied. Paste it into Code.gs in Google Apps Script.';}
 catch{byId('script-status').textContent='Copy was unavailable. Use Download Code.gs, or open View script and copy its text.';}
});
document.querySelector('details').addEventListener('toggle',async event=>{
 if(event.target.open)try{byId('script-source').textContent=await script();}catch{byId('script-source').textContent='The script could not be loaded. Refresh this page and try again.';}
});
byId('generate-key').addEventListener('click',()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 byId('signing-key').value=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
 byId('copy-key').disabled=false;
 byId('key-status').textContent='Key generated. Copy this same key into Google Script properties and Render.';
});
byId('copy-key').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(byId('signing-key').value);byId('key-status').textContent='Signing key copied. Keep it private.';}
 catch{byId('signing-key').type='text';byId('signing-key').focus();byId('signing-key').select();byId('key-status').textContent='Automatic copy was unavailable. Copy the selected signing key manually and keep it private.';}
});

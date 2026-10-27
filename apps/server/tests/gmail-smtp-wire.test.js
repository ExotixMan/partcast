import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import nodemailer from 'nodemailer';
import {sendGmailSmtp} from '../src/utils/gmail-smtp.js';

async function mailServer({greet=true,dropAfterData=false}={}){
 const sockets=new Set(),messages=[];let authentications=0;
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  if(greet)socket.write('220 fixture.example ESMTP\r\n');
  let buffer='',data=false,body=[];
  socket.on('data',chunk=>{
   buffer+=chunk.toString();let at;
   while((at=buffer.indexOf('\r\n'))>=0){
    const line=buffer.slice(0,at);buffer=buffer.slice(at+2);
    if(data){
     if(line==='.'){
      messages.push(body.join('\n'));body=[];data=false;
      if(dropAfterData){socket.destroy();return;}
      socket.write('250 2.0.0 Accepted fixture\r\n');
     }else body.push(line);
    }else if(/^EHLO\b/.test(line))socket.write('250-fixture.example\r\n250-AUTH PLAIN\r\n250 PIPELINING\r\n');
    else if(/^AUTH PLAIN\b/.test(line)){authentications++;socket.write('235 2.7.0 Authenticated\r\n');}
    else if(/^MAIL FROM:|^RCPT TO:/.test(line))socket.write('250 2.1.0 OK\r\n');
    else if(line==='DATA'){data=true;socket.write('354 End data\r\n');}
    else if(line==='QUIT'){socket.end('221 Bye\r\n');return;}
    else if(/^RSET|^NOOP/.test(line))socket.write('250 OK\r\n');
    else socket.write('500 Unsupported fixture command\r\n');
   }
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:server.address().port,messages,get authentications(){return authentications;},async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}

test('real Nodemailer protocol distinguishes preflight failure, accepted mail and lost DATA acknowledgement',async t=>{
 for(const scenario of [{name:'accepted',options:{}},{name:'no SMTP greeting',options:{greet:false}},{name:'DATA acknowledgement lost',options:{dropAfterData:true}}])await t.test(scenario.name,async()=>{
  const server=await mailServer(scenario.options),create=nodemailer.createTransport;
  nodemailer.createTransport=options=>{
   assert.equal(options.host,'smtp.gmail.com');assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);
   return create({...options,host:'127.0.0.1',port:server.port,secure:false,connectionTimeout:1500,greetingTimeout:200,socketTimeout:1500});
  };
  try{
   const send=()=>sendGmailSmtp({sender_email:'sender@example.test',app_password:'abcdefghijklmnop'},{to:'staff@example.test',subject:'Fixture code',text:'Your fixture code is 123456.'},'api_environment');
   if(scenario.name==='accepted'){
    const result=await send();assert.match(result.messageId,/@/);assert.equal(server.messages.length,1);assert.match(server.messages[0],/123456/);assert.equal(server.authentications,2);
   }else if(scenario.name==='no SMTP greeting'){
    await assert.rejects(send(),error=>error.code==='GMAIL_SMTP_UNAVAILABLE'&&error.deliveryUncertain===false&&error.details.smtp_error_code==='ETIMEDOUT');
    assert.equal(server.messages.length,0);assert.equal(server.authentications,0);
   }else{
    await assert.rejects(send(),error=>error.code==='GMAIL_SMTP_UNCONFIRMED'&&error.deliveryUncertain===true&&error.details.stage==='smtp_send');
    assert.equal(server.messages.length,1);assert.equal(server.authentications,2);
   }
  }finally{nodemailer.createTransport=create;await server.close();}
 });
});

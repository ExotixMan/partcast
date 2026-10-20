import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export function applyHttpSecurity(app,{frontendOrigins,limit=500,windowMs=15*60*1000}) {
 app.disable('x-powered-by');
 app.use(['/api','/auth','/setup','/jobs'],(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
 app.use(cors({
  origin(origin,done){
   if(!origin||frontendOrigins.includes(origin))return done(null,true);
   done(Object.assign(new Error('This website is not allowed to access the store server.'),{status:403,safe:true}));
  },
  methods:['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders:['Content-Type','Authorization','X-Cron-Secret'],
  maxAge:600
 }));
 app.use(rateLimit({windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many requests. Wait a moment and try again.'}}));
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authenticate, cronAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import setupRoutes from './routes/setup.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import jobsRoutes from './routes/jobs.js';

const app=express();
app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({
  origin(origin,cb){
    if(!origin || config.frontendOrigins.includes(origin)) return cb(null,true);
    return cb(new Error('Origin not allowed by CORS.'));
  },
  methods:['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders:['Content-Type','Authorization','X-Cron-Secret'],
  maxAge:600
}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(rateLimit({windowMs:15*60*1000,limit:500,standardHeaders:'draft-8',legacyHeaders:false}));

app.get('/health',(req,res)=>res.json({ok:true,service:'partcast-api',time:new Date().toISOString()}));
app.use('/setup',setupRoutes);
app.use('/api',authenticate,apiRoutes);
app.use('/api/admin',authenticate,adminRoutes);
app.use('/jobs',cronAuth,jobsRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(config.PORT,'0.0.0.0',()=>console.log(`PartCast API listening on ${config.PORT}`));

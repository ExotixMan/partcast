import express from 'express';
import { applyHttpSecurity } from './middleware/httpSecurity.js';
import { config } from './config.js';
import { authenticate, cronAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import setupRoutes from './routes/setup.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import loginRoutes from './routes/login.js';
import jobsRoutes from './routes/jobs.js';

const app=express();
app.set('trust proxy',1);
applyHttpSecurity(app,{frontendOrigins:config.frontendOrigins});
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));

app.get('/health',(req,res)=>res.json({ok:true,service:'partcast-api',time:new Date().toISOString()}));
app.use('/setup',setupRoutes);
app.use('/auth',loginRoutes);
app.use('/api/admin',authenticate,adminRoutes);
app.use('/api',authenticate,apiRoutes);
app.use('/jobs',cronAuth,jobsRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(config.PORT,'0.0.0.0',()=>console.log(`PartCast API listening on ${config.PORT}`));

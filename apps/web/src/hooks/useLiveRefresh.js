import {useEffect,useRef} from 'react';
import {subscribeToData} from '../lib/liveData.js';

export default function useLiveRefresh(reload,tables,enabled=true){
 const current=useRef(reload);current.current=reload;
 const key=tables.join(',');
 useEffect(()=>{
  if(!enabled)return;
  let timer;
  const stop=subscribeToData(key.split(','),()=>{
   clearTimeout(timer);
   timer=setTimeout(()=>current.current(true),120);
  });
  return()=>{clearTimeout(timer);stop();};
 },[key,enabled]);
}

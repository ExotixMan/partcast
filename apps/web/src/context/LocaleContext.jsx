import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import translations from '../lib/tagalog.json';
const getPreference=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
let language=getPreference('partcast-language','en');
export function t(key,values){
 if(typeof key!=='string')return key;
 let result=key;if(language==='fil'){if(Object.hasOwn(translations,key))result=translations[key];else if(Object.hasOwn(translations,key.trim()))result=key.slice(0,key.length-key.trimStart().length)+translations[key.trim()]+key.slice(key.trimEnd().length);}
 if(values)result=result.replace(/\{(v\d+|\w+)\}/g,(full,name)=>values[name]===undefined?full:String(values[name]));
 return result;
}
const LocaleContext=createContext(null);
export function LocaleProvider({children}){
 const [locale,setLocale]=useState(language==='fil'?'fil':'en'),[theme,setTheme]=useState(()=>getPreference('partcast-theme','light'));
 language=locale;
 useEffect(()=>{try{localStorage.setItem('partcast-language',locale);localStorage.setItem('partcast-theme',theme);}catch{}document.documentElement.lang=locale==='fil'?'fil':'en';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111827':'#ffffff');},[locale,theme]);
 const value=useMemo(()=>({language:locale,setLanguage:setLocale,theme,setTheme,t}),[locale,theme]);
 return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale=()=>useContext(LocaleContext);

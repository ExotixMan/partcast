import {Component} from 'react';
import {t,useLocale} from '../context/LocaleContext.jsx';
function Fallback({retry}) {
 useLocale();
 return <section className="panel p-5" role="alert"><h1 className="text-xl font-bold">{t('This page could not open')}</h1><p className="mt-2 text-slate-600">{t('Try again, or choose another page from the menu. Waiting changes stay on this device.')}</p><div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" onClick={retry}>{t('Try again')}</button><button className="btn-secondary" onClick={()=>window.location.reload()}>{t('Reload app')}</button></div></section>;
}
export default class ErrorBoundary extends Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<Fallback retry={()=>this.setState({failed:false})}/>:this.props.children;}
}

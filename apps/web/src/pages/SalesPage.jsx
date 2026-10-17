import {Link,useSearchParams} from 'react-router-dom';
import {Plus,Upload} from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
import {t,useLocale} from '../context/LocaleContext.jsx';
import {managerRoles} from '../lib/access.js';
import PageHeader from '../components/PageHeader.jsx';
import SalesSummary from '../components/SalesSummary.jsx';
import ImportedSales from '../components/ImportedSales.jsx';
import TransactionsPage from './TransactionsPage.jsx';

export default function SalesPage(){
  useLocale();
  const {profile}=useAuth();
  const [params]=useSearchParams();
  const canImport=managerRoles.includes(profile?.role);
  const source=canImport?(['counter','imported'].includes(params.get('source'))?params.get('source'):'summary'):'counter';
  return <>
    <PageHeader title={t('Sales')} subtitle={t('Review parts sold, customers and amounts.')} actions={<><Link className="btn-primary" to="/counter"><Plus size={17}/>{t('Record a sale')}</Link>{canImport&&<Link className="btn-secondary" to="/imports"><Upload size={17}/>{t('Import spreadsheets')}</Link>}</>}/>
    {canImport&&<nav aria-label={t('Sales sources')} className="mb-5 flex flex-wrap gap-2">{[{value:'summary',label:'Sales by part',url:'/sales'},{value:'counter',label:'Counter sales',url:'/sales?source=counter'},{value:'imported',label:'Imported invoices',url:'/sales?source=imported'}].map(tab=><Link key={tab.value} className={source===tab.value?'btn-primary':'btn-secondary'} aria-current={source===tab.value?'page':undefined} to={tab.url}>{t(tab.label)}</Link>)}</nav>}
    {source==='imported'?<ImportedSales/>:source==='summary'?<SalesSummary/>:<TransactionsPage salesOnly embedded/>}
  </>;
}

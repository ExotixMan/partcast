import {api} from '../lib/api.js';
import {useLiveQuery} from '../hooks/useLiveQuery.js';
import SearchSuggestions from './SearchSuggestions.jsx';

export default function ProductSearch({value,onChange,onSelect,category='all',status='all',...props}){
 const {data,loading,error}=useLiveQuery(signal=>value.trim()?api.get(`/api/products?page=1&pageSize=10&q=${encodeURIComponent(value)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`,{signal}):Promise.resolve({data:[]}),[value,category,status],['products'],100);
 const items=(data?.data||[]).map(p=>({id:p.id,label:p.description,description:[p.part_number,p.brand].filter(Boolean).join(' · '),product:p}));
 return <SearchSuggestions {...props} value={value} onChange={onChange} items={items} loading={loading} error={error} onSelect={item=>onSelect?onSelect(item):onChange(item.product.part_number||item.label)}/>;
}

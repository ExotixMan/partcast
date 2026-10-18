const names={full_name:'Full name',fullName:'Full name',name:'Name',email:'Email address',password:'Password',quantity:'Quantity',unit_price:'Price per unit',selling_price:'Selling price',unit_cost:'Cost per unit',latest_unit_cost:'Cost per unit',lead_time_days:'Delivery time',customer_name:'Customer name',paid_amount:'Amount paid',due_date:'Due date',principal:'Amount owed',amount:'Amount',product_id:'Part',supplier_id:'Supplier',description:'Description',part_number:'Part number',barcode:'Barcode',role:'Account access',subject:'Email subject',message:'Message',from:'Start date',to:'End date'};
export function validationMessage(issue) {
 const path=issue?.path||[],key=path.at(-1),label=names[key]||'This field';
 let message=issue?.message||'Check the entered value.';
 if(issue?.code==='invalid_type')message=issue.expected==='number'?'Enter a valid number.':'Enter a valid value.';
 if(issue?.code==='invalid_format')message=issue.format==='email'?'Enter a valid email address.':issue.format==='uuid'?'Choose a saved record and try again.':'Check the format of this value.';
 if(issue?.code==='too_small')message=issue.origin==='number'?issue.inclusive===false?`Enter more than ${issue.minimum}.`:`Enter ${issue.minimum} or more.`:issue.origin==='string'?`Use at least ${issue.minimum} characters.`:'Choose at least one item.';
 if(issue?.code==='too_big')message=issue.origin==='number'?issue.inclusive===false?`Enter less than ${issue.maximum}.`:`Enter ${issue.maximum} or less.`:issue.origin==='string'?`Use no more than ${issue.maximum} characters.`:'Choose fewer items.';
 if(issue?.code==='invalid_value')message='Choose an option from the list.';
 return `${label}: ${message}`;
}

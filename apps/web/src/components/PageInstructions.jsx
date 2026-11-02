import {t,useLocale} from '../context/LocaleContext.jsx';

const guides={
  counter:[
    {title:'Record a sale or delivery',steps:['Choose Sell parts or Receive delivery.','Tap a part to add it. Tap its photo to enlarge it.','Check quantities and prices, then confirm.']},
    {title:'Customer credit',text:['For a credit sale, choose Customer will pay later and enter the customer’s name and payment.']},
    {title:'Receive stock',text:['Receive a maximum of 100 units per item.','Confirm a delivery only after the items have arrived.']}
  ],
  inventory:[
    {title:'Find a part',steps:['Search by name, part number or barcode.','Use category and stock filters to narrow the list.','Open Part details for shelf location and other information.']},
    {title:'Keep stock correct',edit:true,text:['Use Sell or receive for sales and deliveries. Use Correct stock only to fix an incorrect shelf count.']}
  ],
  balances:[
    {title:'Record a payment',steps:['Find a customer, choose Record payment, then enter the amount received.','Use View payments to check saved payment history.']},
    {title:'Existing balances',text:['For a new credit sale, use Sell or receive and choose “Customer will pay later”. Add existing balance only for balances already owed.']}
  ],
  restock:[
    {title:'Review suggestions',text:['Parts at or below their stock limit appear here. Set stock limits in Inventory.','Suggestions start at 1–2 units per part. Check shelf stock, then review the email before sending.']},
    {title:'Understand the quantities',text:['Sales estimates cover the forecast period; costs apply to this purchase only.','Supplier emails start with the parts shown on this page.']}
  ],
  suppliers:[
    {title:'Supplier contacts',text:['Save a supplier email address to send order requests. Only the owner or an authorized manager can edit these details.']}
  ],
  sales:[
    {title:'Find sales',text:['Choose a sales source, then use dates or a part name to find records.']},
    {title:'Sales sources',text:['Counter sales show sales recorded in PartCast. Imported invoices show uploaded past bills.','Only saved quantities are counted. Missing days remain unknown.']}
  ],
  'counter-sales':[
    {title:'Find sales',text:['Choose dates and select Find sales to review recorded sales.']}
  ],
  reports:[
    {title:'Save a report',steps:['Choose dates and a category, or leave dates blank for all records.','Choose a report and select Download Excel.','Open the file from your device’s Downloads folder.']},
    {title:'Report details',text:['Reports use the latest saved store data and need an internet connection. They download as Excel files (.xlsx).','Leave dates blank for all records. Dates follow Philippines time. Inventory quantities are current; its stock changes sheet uses your dates. Restock suggestions use current stock. Customer balances use the debt date and include payments recorded so far.']}
  ],
  imports:[
    {title:'Import spreadsheets',steps:['Choose one or more Excel or CSV files.','Choose automatically if you are unsure. PartCast checks the column names to find stock records, sales, or forecasting quantities.','Review the results and import notes before trying the same file again.']},
    {title:'For better forecasts:',text:['Import inventory first, then past sales, then your prepared forecasting spreadsheet. Use actual quantities sold, dates, and matching part numbers.']}
  ]
};

export default function PageInstructions({page,canEdit=true}){
  useLocale();
  return (guides[page]||[]).filter(section=>!section.edit||canEdit).map(section=><section key={section.title}><h3>{t(section.title)}</h3>
    {section.steps&&<ol>{section.steps.map(step=><li key={step}>{t(step)}</li>)}</ol>}
    {section.text?.map(text=><p key={text}>{t(text)}</p>)}
  </section>);
}

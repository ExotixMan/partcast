
export function fieldProblem(field) {
 if(!field.willValidate)return null;
 const v=field.validity,value=field.value??'',text=['text','search','email','url','tel'].includes(field.type)||field.tagName==='TEXTAREA';
 if(v.valueMissing||field.required&&text&&!value.trim())return {key:field.tagName==='SELECT'?'Choose an option.':'Enter a value.'};
 if(v.typeMismatch)return {key:field.type==='email'?'Enter a valid email address.':'Check this value.'};
 if(v.badInput)return {key:'Enter a valid number.'};
 if(v.rangeUnderflow)return {key:'Enter {v0} or more.',values:{v0:field.min}};
 if(v.rangeOverflow)return {key:'Enter {v0} or less.',values:{v0:field.max}};
 if(v.stepMismatch)return {key:field.step==='1'?'Use a whole number.':'Use a valid amount with up to 2 decimal places.'};
 if(v.tooShort||text&&value.trim()&&field.minLength>0&&value.trim().length<field.minLength)return {key:'Use at least {v0} characters.',values:{v0:field.minLength}};
 if(v.tooLong)return {key:'Use no more than {v0} characters.',values:{v0:field.maxLength}};
 if(v.patternMismatch)return {key:'Check the format shown for this field.'};
 if(v.customError)return {key:field.validationMessage};
 return v.valid?null:{key:'Check this value.'};
}

export function formProblems(form) {
 return [...form.elements].flatMap(field=>{
  const problem=fieldProblem(field);
  if(!problem)return [];
  const label=field.labels?.[0];
  const name=field.getAttribute('aria-label')||label?.querySelector('.label')?.textContent||label?.textContent||field.name||'This field';
  return [{field,label:name.replace(/\s*\*\s*$/,'').trim(),...problem}];
 });
}

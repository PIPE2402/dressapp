(()=>{
 const closeAll=()=>document.querySelectorAll('.select-trigger').forEach(button=>{button.setAttribute('aria-expanded','false');document.getElementById(button.getAttribute('aria-controls')).hidden=true;});
 document.querySelectorAll('.options select').forEach(select=>{
 const label=select.closest('label');
 const wrap=document.createElement('div');wrap.className='custom-select';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const menu=document.createElement('div');menu.className='select-menu';menu.id=select.id+'-menu';menu.role='listbox';menu.hidden=true;menu.setAttribute('aria-label',select.id==='format'?'Formato':'Calidad');trigger.setAttribute('aria-controls',menu.id);
 const buttons=[...select.options].map(option=>{const b=document.createElement('button');b.type='button';b.className='select-option';b.role='option';b.textContent=option.textContent;b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));closeAll();trigger.focus();};menu.append(b);return b;});
 const sync=()=>{trigger.textContent=select.selectedOptions[0].textContent;trigger.disabled=select.disabled;trigger.setAttribute('aria-label',(select.id==='format'?'Formato: ':'Calidad: ')+trigger.textContent);buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(select.options[i].selected)));if(select.disabled)closeAll();};
 trigger.onclick=()=>{const open=trigger.getAttribute('aria-expanded')==='true';closeAll();if(!open){trigger.setAttribute('aria-expanded','true');menu.hidden=false;buttons[select.selectedIndex].focus();}};
 wrap.addEventListener('keydown',e=>{const index=buttons.indexOf(document.activeElement);if(e.key==='Escape'){closeAll();trigger.focus();e.preventDefault();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();closeAll();trigger.setAttribute('aria-expanded','true');menu.hidden=false;const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:index<0?select.selectedIndex:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}else if(e.key==='Tab')closeAll();});
 select.classList.add('native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');label.removeAttribute('for');
 select.after(wrap);wrap.append(trigger,menu);const field=document.createElement('div');field.className='select-field';field.append(...label.childNodes);label.replaceWith(field);select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});sync();
 });
 document.addEventListener('click',e=>{if(!e.target.closest('.custom-select'))closeAll();});
})();

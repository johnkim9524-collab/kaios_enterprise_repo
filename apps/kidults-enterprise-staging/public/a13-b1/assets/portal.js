"use strict";
const tallDigits=new Set(["3","4","6","7","8","9"]);
function stylizeNumbers(){document.querySelectorAll(".premium-number").forEach((el)=>{const text=el.textContent;el.setAttribute("aria-label",text);el.innerHTML=[...text].map((ch)=>tallDigits.has(ch)?`<span class="tall">${ch}</span>`:ch).join("");});}
function setupSearch(){const trigger=document.querySelector("[data-search-trigger]");const panel=document.querySelector("[data-search-panel]");if(!trigger||!panel)return;trigger.addEventListener("click",(event)=>{event.preventDefault();panel.classList.toggle("open");if(panel.classList.contains("open"))panel.querySelector("input")?.focus();});}
document.addEventListener("DOMContentLoaded",()=>{stylizeNumbers();setupSearch();});
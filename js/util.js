/* Utilitários usados por todos os módulos. Os scripts são clássicos e carregados
   em ordem (ver index.html): compartilham o escopo global, sem etapa de build. */
const $ = (s, r=document) => r.querySelector(s);
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };
const ext = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9"/></svg>';

function toast(msg, ms = 2200){
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

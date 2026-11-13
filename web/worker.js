// uchko-web — десктоп версия на Учко (v1: уроци + „Опит на живо“ + „Песен“ + вход + изпит с Елена)
// Уроците, опитите и песните са публични (за да могат да се пращат линкове).
// Всичко, което струва пари (Елена, гласът) или пипа данни на дете (точки, прогрес), е само след вход.
const PAGE = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Учко</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Unbounded:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F6F2EA;--card:#fff;--ink:#1C2333;--muted:#6B7280;--line:#E7DFD0;--primary:#2563C9;--primaryDark:#173F8A;--accent:#E8743B;--energy:#F5B700;--ok:#167A43;--okBg:#E3F5EA;--half:#9A6B00;--halfBg:#FFF4D6;--subj:#2563C9}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:Nunito,system-ui,sans-serif;background:var(--bg);color:var(--ink);display:grid;grid-template-columns:320px 1fr;height:100vh;overflow:hidden}
button{font-family:Nunito,system-ui,sans-serif}
aside{background:var(--card);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.brand{padding:20px 20px 12px;display:flex;align-items:center;gap:10px}
.brand b{font:700 26px Unbounded,sans-serif;color:var(--primaryDark)}.brand span{font-size:12px;color:var(--muted);font-weight:700}
.who{margin-left:auto;border:2px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font-weight:800;font-size:13px;cursor:pointer;color:var(--ink);white-space:nowrap}
.who.in{border-color:var(--primary);color:var(--primaryDark)}
.grades{display:flex;gap:8px;padding:0 20px 12px}
.grades button,.chip{border:2px solid var(--line);background:#fff;border-radius:999px;padding:7px 14px;font:800 14px Nunito,system-ui,sans-serif;cursor:pointer;color:var(--ink)}
.grades button.on{background:var(--primary);border-color:var(--primary);color:#fff}
.subjects{display:flex;flex-wrap:wrap;gap:6px;padding:0 20px 12px;border-bottom:1px solid var(--line)}
.chip{font-size:13px;padding:6px 12px}.chip.on{border-color:var(--subj);background:var(--subj);color:#fff}
.lessons{overflow:auto;padding:12px;flex:1;min-height:0}
.les{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:14px;cursor:pointer;border:2px solid transparent}
.les:hover{background:var(--bg)}.les.on{border-color:var(--subj);background:#fff}
.les .n{min-width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--bg);font:700 12px Unbounded,sans-serif;color:var(--subj)}
.les.passed .n{background:var(--okBg);color:var(--ok)}
.les .t{font-weight:800;font-size:15px;line-height:1.25}.les .s{font-size:12px;color:var(--muted);margin-top:2px}
.les .tag{font-size:11px;font-weight:800;color:var(--accent);margin-top:3px}
main{display:flex;flex-direction:column;min-height:0;min-width:0}
.top{padding:18px 28px;border-bottom:1px solid var(--line);background:var(--card);display:flex;align-items:center;gap:16px}
.top .eb{font-size:12px;font-weight:900;letter-spacing:1px;color:var(--subj)}
.top h1{margin:2px 0 0;font:700 22px Unbounded,sans-serif}
.score{margin-left:auto;background:var(--okBg);color:var(--ok);font-weight:900;border-radius:999px;padding:8px 16px;display:none}
.body{flex:1;display:grid;grid-template-columns:minmax(300px,380px) 1fr;min-height:0}
.notes{overflow:auto;padding:22px 24px;border-right:1px solid var(--line)}
.notes h3{font:700 14px Unbounded,sans-serif;margin:18px 0 10px;color:var(--subj)}
.notes ul{margin:0;padding-left:18px}.notes li{margin:0 0 10px;line-height:1.45}
.term{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.term b{display:block;margin-bottom:2px}
iframe{border:0;width:100%;height:100%;background:var(--bg);display:block}
#live{display:flex;flex-direction:column;min-height:0;min-width:0}
.tabs{display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--card)}
.tabs button{border:2px solid var(--line);background:#fff;border-radius:999px;padding:7px 16px;font:800 14px Nunito,system-ui,sans-serif;cursor:pointer;color:var(--ink)}
.tabs button.on{background:var(--subj);border-color:var(--subj);color:#fff}
.tabs .share{margin-left:auto;border-style:dashed}
.frame{flex:1;min-height:0;display:flex;flex-direction:column}
.empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:18px;text-align:center;padding:40px;flex-direction:column;gap:16px}
.btn{border:0;background:var(--primary);color:#fff;border-radius:14px;padding:12px 22px;font:800 16px Nunito,system-ui,sans-serif;cursor:pointer}
.btn:disabled{opacity:.5;cursor:default}.btn.ghost{background:#fff;color:var(--ink);border:2px solid var(--line)}.btn.go{background:var(--ok)}
.ex{display:flex;flex-direction:column;min-height:0;flex:1}
.pills{display:flex;flex-wrap:wrap;gap:6px;padding:12px 20px;border-bottom:1px solid var(--line);background:#FBF8F2;align-items:center}
.pill{border-radius:999px;padding:5px 12px;font-weight:800;font-size:13px;border:2px solid var(--line);background:#fff;color:var(--muted)}
.pill.done{background:var(--okBg);border-color:#9BD8B4;color:var(--ok)}.pill.partial{background:var(--halfBg);border-color:#F0D58A;color:var(--half)}
.pills .fin{margin-left:auto;padding:8px 16px;font-size:14px}
.chat{flex:1;overflow:auto;padding:20px 28px;display:flex;flex-direction:column;gap:12px;min-height:0}
.msg{max-width:72%;padding:12px 16px;border-radius:18px;line-height:1.5;font-size:17px;white-space:pre-wrap}
.msg.ai{background:#fff;border:1px solid var(--line);align-self:flex-start;border-top-left-radius:6px}
.msg.ai b{display:block;font-size:12px;color:var(--ok);margin-bottom:2px}
.msg.me{background:var(--primary);color:#fff;align-self:flex-end;border-top-right-radius:6px}
.msg.err{background:#FDECEC;color:#9B1C1C;align-self:center}
.typing{align-self:flex-start;color:var(--muted);font-weight:800}
.hints{display:flex;flex-wrap:wrap;gap:6px;padding:8px 20px 0}
.hints button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font-weight:700;font-size:13px;cursor:pointer;color:var(--ink)}
.compose{display:flex;gap:10px;padding:12px 20px 16px;align-items:flex-end}
.compose textarea{flex:1;resize:none;border:2px solid var(--line);border-radius:16px;padding:12px 14px;font:600 17px Nunito,system-ui,sans-serif;min-height:52px;max-height:160px;outline:none}
.compose textarea:focus{border-color:var(--primary)}
.mic{width:52px;height:52px;border-radius:50%;border:2px solid var(--line);background:#fff;font-size:22px;cursor:pointer}
.mic.rec{background:#E5484D;border-color:#E5484D;animation:pulse 1.2s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 8px rgba(229,72,77,.18)}}
.speaking{font-size:13px;font-weight:800;color:var(--ok);padding:0 20px;min-height:4px}
.result{margin:auto;text-align:center;padding:30px}.result .big{font:700 40px Unbounded,sans-serif;color:var(--ok)}
.ov{position:fixed;inset:0;background:rgba(28,35,51,.45);display:none;align-items:center;justify-content:center;z-index:9}
.ov.show{display:flex}
.card{background:#fff;border-radius:22px;padding:28px;width:min(420px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.2)}
.card h2{font:700 20px Unbounded,sans-serif;margin:0 0 6px}.card p{color:var(--muted);margin:0 0 16px;line-height:1.45}
.card input{width:100%;border:2px solid var(--line);border-radius:12px;padding:12px;font:700 17px Nunito,system-ui,sans-serif;margin-bottom:10px;outline:none}
.card input:focus{border-color:var(--primary)}
.card .row{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
.card .err{color:#B42318;font-weight:700;min-height:20px;margin-bottom:6px}
.kids{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 12px}
.kid{border:2px solid var(--line);background:#fff;border-radius:16px;padding:16px;cursor:pointer;text-align:center;font-weight:800;font-size:17px}
.kid:hover{border-color:var(--primary)}.kid span{display:block;font-size:30px}.kid small{display:block;color:var(--muted);font-size:13px}
.link{background:none;border:0;color:var(--muted);font-weight:700;cursor:pointer;text-decoration:underline;padding:0}
@media (max-width:900px){body{grid-template-columns:1fr;overflow:auto;height:auto}.body{grid-template-columns:1fr}aside{max-height:none}.msg{max-width:90%}}
</style></head><body>
<aside><div class="brand"><b>Учко</b><span>десктоп · проба</span><button class="who" id="who">🔑 Вход</button></div>
<div class="grades" id="grades"></div><div class="subjects" id="subjects"></div><div class="lessons" id="lessons"></div></aside>
<main><div class="top"><div><div class="eb" id="eb">ИЗБЕРИ УРОК</div><h1 id="title">Учко на голям екран</h1></div><div class="score" id="score"></div></div>
<div class="body" id="body"><div class="notes" id="notes"><div class="empty">Вляво избери клас, предмет и урок.</div></div><div id="live"><div class="empty">Тук ще се появи „Опит на живо“.</div></div></div></main>
<div class="ov" id="ov"><div class="card" id="card"></div></div>
<script>
const SUBJ={bulgarian:["📖","Български език и литература","#B9531F"],physics:["⚡","Физика","#2563C9"],biology:["🧬","Биология","#4E8A1E"],chemistry:["⚗️","Химия","#7A3FB8"],geography:["🌍","География","#0E7C86"],history:["🏺","История","#A2452B"],english:["🇬🇧","Английски","#C2364E"],human_nature:["🌱","Човекът и природата","#4E8A1E"],human_society:["🏛️","Човекът и обществото","#A2452B"]};
let IDX={},grade=null,group=null,cur=null,ME={loggedIn:false},PASSED=new Set(),afterLogin=null;
const $=s=>document.querySelector(s);const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.error||("Грешка "+r.status));return d}
function subjOf(k){const r=k.split("_").slice(1).join("_");return Object.keys(SUBJ).find(s=>r.startsWith(s+"_"))||r}
function setColor(k){document.documentElement.style.setProperty("--subj",(SUBJ[subjOf(k)]||[0,0,"#2563C9"])[2])}

/* ---------- вход ---------- */
function kidIcon(c){return c.gender==="female"?"👧":"👦"}
function renderWho(){const b=$("#who");if(ME.child){b.textContent=kidIcon(ME.child)+" "+ME.child.name;b.classList.add("in")}else{b.textContent="🔑 Вход";b.classList.remove("in")}}
async function loadMe(){try{ME=await api("/api/me")}catch(e){ME={loggedIn:false}}renderWho();await loadPassed()}
async function loadPassed(){PASSED=new Set();if(ME.child){try{(await api("/api/progress")).completed.forEach(k=>PASSED.add(k))}catch(e){}}markPassed()}
function markPassed(){document.querySelectorAll(".les").forEach(d=>d.classList.toggle("passed",PASSED.has(d.dataset.key)))}
function closeOv(){$("#ov").classList.remove("show")}
function showLogin(msg){$("#card").innerHTML='<h2>Вход в Учко</h2><p>'+(msg||"Със семейния код от приложението и паролата за сайта. Първия път паролата се задава тук.")+'</p>'+
 '<input id="lc" placeholder="Семеен код" autocomplete="username" style="text-transform:uppercase"><input id="lp" type="password" placeholder="Парола (поне 6 знака)" autocomplete="current-password">'+
 '<div class="err" id="le"></div><div class="row"><button class="btn ghost" id="lx">Затвори</button><button class="btn" id="lgo">Влез</button></div>';
 $("#ov").classList.add("show");$("#lc").focus();$("#lx").onclick=closeOv;
 const go=async()=>{const b=$("#lgo");b.disabled=true;$("#le").textContent="";
  try{const d=await api("/api/login",{code:$("#lc").value,password:$("#lp").value});ME=d;renderWho();
   showKids(d.created?"Паролата е зададена. Запомни я — с нея ще влизаш и на други компютри.":"")}
  catch(e){$("#le").textContent=e.message;b.disabled=false}};
 $("#lgo").onclick=go;$("#lp").onkeydown=e=>{if(e.key==="Enter")go()};$("#lc").onkeydown=e=>{if(e.key==="Enter")$("#lp").focus()}}
function showKids(note){const ks=ME.children||[];
 $("#card").innerHTML='<h2>Кой ще учи?</h2>'+(note?'<p>'+esc(note)+'</p>':'<p>Избери детето. Точките и минатите уроци се записват на него, както в приложението.</p>')+
 '<div class="kids">'+ks.map(c=>'<div class="kid" data-id="'+esc(c.id)+'"><span>'+kidIcon(c)+'</span>'+esc(c.name)+'<small>'+esc(c.grade)+'. клас</small></div>').join("")+'</div>'+
 '<div class="err" id="ke"></div><div class="row" style="justify-content:space-between"><button class="link" id="lo">Изход</button><button class="btn ghost" id="kx">Затвори</button></div>';
 $("#ov").classList.add("show");$("#kx").onclick=closeOv;
 $("#lo").onclick=async()=>{try{await api("/api/logout",{})}catch(e){}ME={loggedIn:false};renderWho();stopExam(true);PASSED=new Set();markPassed();closeOv();rerenderLive()};
 $(".kids").onclick=async e=>{const k=e.target.closest(".kid");if(!k)return;
  try{const prev=ME.child&&ME.child.id;ME=await api("/api/child",{childId:k.dataset.id});renderWho();closeOv();
   if(prev&&prev!==ME.child.id)stopExam(true);await loadPassed();
   if(!cur&&ME.child.grade&&Object.keys(IDX).some(x=>x.startsWith(ME.child.grade+"_")))pickGrade(String(ME.child.grade));
   const f=afterLogin;afterLogin=null;if(f)f();else rerenderLive()}catch(e){$("#ke").textContent=e.message}}}
$("#who").onclick=()=>{if(ME.loggedIn)showKids();else showLogin()};
$("#ov").onclick=e=>{if(e.target.id==="ov")closeOv()};

/* ---------- навигация ---------- */
async function init(){IDX=await (await fetch("/api/index")).json();
 const gs=[...new Set(Object.keys(IDX).map(k=>k.split("_")[0]))].sort((a,b)=>b-a);
 $("#grades").innerHTML=gs.map(g=>'<button data-g="'+g+'">'+g+'. клас</button>').join("");
 $("#grades").onclick=e=>{const g=e.target.dataset.g;if(g)pickGrade(g)};
 await loadMe();
 let saved=null;try{saved=localStorage.getItem("uchko_grade")}catch(e){}
 if(ME.child&&gs.includes(String(ME.child.grade)))saved=String(ME.child.grade);
 if(!route())pickGrade(gs.includes(saved)?saved:gs[0]);}
function parseHash(){const h=decodeURIComponent(location.hash.slice(1));if(!h)return null;const i=h.lastIndexOf("/");return i>0?{key:h.slice(0,i),view:h.slice(i+1)}:{key:h,view:null}}
function route(){const r=parseHash();if(!r)return false;const gk=Object.keys(IDX).find(k=>(IDX[k].lessons||[]).some(l=>l.kvKey===r.key));if(!gk)return false;
 pickGrade(gk.split("_")[0],gk);pickGroup(gk,r.key,r.view);return true}
function setHash(key,v){try{history.replaceState(null,"","#"+encodeURIComponent(key)+(v?"/"+v:""))}catch(e){}}
window.addEventListener("hashchange",()=>{const r=parseHash();if(r&&r.key!==cur)route()});
function pickGrade(g,gk){grade=g;try{localStorage.setItem("uchko_grade",g)}catch(e){}
 document.querySelectorAll("#grades button").forEach(b=>b.classList.toggle("on",b.dataset.g===g));
 const ks=Object.keys(IDX).filter(k=>k.startsWith(g+"_"));
 $("#subjects").innerHTML=ks.map(k=>{const s=SUBJ[subjOf(k)]||["📘",k];const pub=(IDX[k].label||"").split("•").pop().trim();return '<button class="chip" data-k="'+k+'">'+s[0]+' '+esc(s[1])+(ks.filter(x=>subjOf(x)===subjOf(k)).length>1?' · '+esc(pub):'')+'</button>'}).join("");
 $("#subjects").onclick=e=>{const k=e.target.closest("button")?.dataset.k;if(k)pickGroup(k)};
 if(!gk)pickGroup(ks[0]);}
function pickGroup(k,key,view){group=k;setColor(k);
 document.querySelectorAll("#subjects .chip").forEach(b=>b.classList.toggle("on",b.dataset.k===k));
 $("#lessons").innerHTML=(IDX[k].lessons||[]).map((l,i)=>'<div class="les" data-key="'+esc(l.kvKey)+'"><div class="n">'+esc(String(l.id).length<=4?l.id:i+1)+'</div><div><div class="t">'+esc(l.title)+'</div><div class="s">'+esc(l.subtitle||"")+'</div>'+(l.hasInteractive?'<div class="tag">🔬 опит на живо</div>':'')+(l.hasSong?'<div class="tag">🎵 песен</div>':'')+'</div></div>').join("");
 markPassed();
 $("#lessons").onclick=e=>{const d=e.target.closest(".les");if(d)openLesson(d.dataset.key)};
 if(key){openLesson(key,view);const el=document.querySelector('.les[data-key="'+CSS.escape(key)+'"]');if(el)el.scrollIntoView({block:"center"})}}
let LV=null;
async function openLesson(key,want){stopExam(true);cur=key;setHash(key,null);
 document.querySelectorAll(".les").forEach(d=>d.classList.toggle("on",d.dataset.key===key));
 $("#notes").innerHTML='<div class="empty">Зареждам…</div>';$("#score").style.display="none";
 const L=await (await fetch("/api/lesson/"+encodeURIComponent(key))).json();if(cur!==key)return;
 const s=SUBJ[subjOf(group)]||["📘",""];$("#eb").textContent=s[0]+" "+(s[1]||"").toUpperCase();$("#title").textContent=L.title;
 const v=L.vocabulary||{};
 $("#notes").innerHTML='<h3>Най-важното</h3><ul>'+(L.main_concepts||[]).map(c=>'<li>'+esc(c)+'</li>').join("")+'</ul>'+
  (Object.keys(v).length?'<h3>Речник</h3>'+Object.entries(v).map(([t,d])=>'<div class="term"><b>'+esc(t)+'</b>'+esc(d)+'</div>').join(""):"");
 const meta=(IDX[group].lessons||[]).find(l=>l.kvKey===key)||{};
 const views=[];if(L.hasInteractive)views.push(["opit","🔬 Опит на живо"]);if(meta.hasSong)views.push(["pesen","🎵 Песен"]);views.push(["elena","👩‍🏫 Изпит с Елена"]);
 LV={key,L,meta,views,view:null};
 $("#live").innerHTML='<div class="tabs">'+views.map(v=>'<button data-v="'+v[0]+'">'+v[1]+'</button>').join("")+'<button class="share" id="share">🔗 Копирай линк</button></div><div class="frame"></div>';
 $(".tabs").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="share"){copyLink(b);return}if(b.dataset.v)show(b.dataset.v)};
 show(views.some(x=>x[0]===want)?want:views[0][0]);}
function show(v){if(!LV)return;if(LV.view==="elena"&&v!=="elena")stopExam(false);LV.view=v;setHash(LV.key,v);
 document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
 if(v==="elena"){examTab();return}
 $(".frame").innerHTML='<iframe src="/'+v+'/'+encodeURIComponent(LV.key)+'" title="'+esc(LV.views.find(x=>x[0]===v)[1])+'" allow="autoplay"></iframe>'}
function rerenderLive(){if(LV&&LV.view==="elena")examTab()}
async function copyLink(b){const u=location.href;let ok=false;try{await navigator.clipboard.writeText(u);ok=true}catch(e){}
 if(!ok)prompt("Копирай линка:",u);else{const t=b.textContent;b.textContent="✓ Копирано";setTimeout(()=>b.textContent=t,1500)}}
window.addEventListener("message",e=>{const m=e.data||{};if(m.type==="score"||m.type==="done"){const el=$("#score");el.style.display="block";el.textContent=(m.type==="done"?"✓ ":"")+m.right+" / "+m.total}});

/* ---------- изпит с Елена ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let EX=null,EXGEN=0;
function examTab(){const fr=$(".frame");
 if(!ME.child){fr.innerHTML='<div class="empty"><div style="font-size:48px">👩‍🏫</div><div>Елена изпитва само след вход, за да запише точките на правилното дете.</div><button class="btn" id="exlogin">🔑 Вход</button></div>';
  $("#exlogin").onclick=()=>{afterLogin=()=>{if(LV&&LV.view==="elena")examTab()};if(ME.loggedIn)showKids();else showLogin()};return}
 if(EX&&EX.key===LV.key&&!EX.finished){EX.gen=++EXGEN;renderExam();return}
 const t=(LV.meta.topics||[]).map(k=>({key:k,label:(LV.meta.topicLabels||{})[k]||k}));
 fr.innerHTML='<div class="empty"><div style="font-size:48px">👩‍🏫</div><div><b>'+esc(ME.child.name)+'</b>, Елена ще те изпита по „'+esc(LV.L.title)+'“.<br>Отговаряй с писане или с микрофона.</div>'+
  (t.length?'<div style="font-size:15px">Теми: '+t.map(x=>esc(x.label)).join(" · ")+'</div>':'')+'<button class="btn go" id="exgo">Започни изпита</button></div>';
 $("#exgo").onclick=()=>startExam(t)}
function startExam(topics){stopExam(true);
 EX={gen:++EXGEN,key:LV.key,title:LV.L.title,topics,msgs:[],shown:[],done:{},lang:LV.meta.lessonLanguage==="en"?"en":"bg",busy:false,audio:null,rec:null,started:Date.now(),finished:false,logged:false};
 renderExam();send(null,true)}
// drop=true: изпитът се изоставя (друг урок, друго дете, изход); иначе само спира звука/микрофона (смяна на таб)
function stopExam(drop){if(!EX)return;EXGEN++;stopAudio();stopRec();
 if(drop||EX.finished){const min=(Date.now()-EX.started)/60000;if(!EX.logged&&min>=0.15&&ME.child){EX.logged=true;api("/api/activity",{minutes:min}).catch(()=>{})}EX=null}}
function renderExam(){const fr=$(".frame");
 fr.innerHTML='<div class="ex"><div class="pills" id="pills"></div><div class="chat" id="chat"></div><div class="speaking" id="spk"></div><div class="hints" id="hints"></div>'+
  '<div class="compose"><textarea id="inp" rows="1" placeholder="Напиши отговора си… (Enter изпраща)"></textarea>'+(SR?'<button class="mic" id="mic" title="Говори">🎤</button>':'')+'<button class="btn" id="snd">Изпрати</button></div></div>';
 drawPills();drawChat();
 $("#hints").innerHTML=[["💡 Подсказка","Дай ми подсказка, моля."],["🔄 Повтори въпроса","Можеш ли да повториш въпроса?"],["🔇 Спри гласа",""]].concat(EX.topics.map(t=>["📚 "+t.label,"Задай ми въпрос за: "+t.label])).map(h=>'<button data-m="'+esc(h[1])+'">'+esc(h[0])+'</button>').join("");
 $("#hints").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(!b.dataset.m){stopAudio();return}if(!EX.busy){stopRec();stopAudio();send(b.dataset.m)}};
 const inp=$("#inp");inp.oninput=()=>{inp.style.height="auto";inp.style.height=Math.min(inp.scrollHeight,160)+"px"};
 inp.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}};
 $("#snd").onclick=submit;if(SR)$("#mic").onclick=toggleRec;setBusy(EX.busy);inp.focus()}
function drawPills(){const p=$("#pills");if(!p)return;const n=EX.topics.filter(t=>EX.done[t.key]==="done").length;
 p.innerHTML=EX.topics.map(t=>{const s=EX.done[t.key];return '<span class="pill '+(s||"")+'">'+(s==="done"?"✓ ":s==="partial"?"½ ":"")+esc(t.label)+'</span>'}).join("")+
  '<button class="btn '+(EX.topics.length&&n===EX.topics.length?"go":"ghost")+' fin" id="fin">'+(EX.topics.length?"Приключих ("+n+"/"+EX.topics.length+")":"Приключих")+'</button>';
 $("#fin").onclick=finish}
function drawChat(){const c=$("#chat");if(!c)return;c.innerHTML=EX.shown.map(m=>'<div class="msg '+m.r+'">'+(m.r==="ai"?"<b>Елена</b>":"")+esc(m.t)+'</div>').join("")+(EX.busy?'<div class="typing">Елена мисли…</div>':'');c.scrollTop=c.scrollHeight}
function setBusy(b){EX.busy=b;const s=$("#snd");if(s)s.disabled=b;drawChat()}
function submit(){const inp=$("#inp");const t=(inp.value||"").trim();if(!t||EX.busy)return;stopRec();stopAudio();inp.value="";inp.style.height="auto";send(t)}
async function send(text,first){const ex=EX;
 const prev=ex.msgs;
 const toSend=first?[{role:"user",content:"Не ме поздравявай — поздравът вече е изговорен отделно. Задай директно първия си въпрос по днешния урок, без встъпителни думи."}]:prev.concat([{role:"user",content:text}]);
 if(!first)ex.shown.push({r:"me",t:text});
 setBusy(true);
 try{const mastered=Object.keys(ex.done).filter(k=>ex.done[k]==="done");
  const d=await api("/api/chat",{lessonKey:ex.key,messages:toSend,topics:ex.topics,mastered});
  if(d.expectedAnswerLang==="en"||d.expectedAnswerLang==="bg")ex.lang=d.expectedAnswerLang;
  ex.msgs=toSend.concat([{role:"assistant",content:d.text||""}]);
  const greet=first?"Здравей, скъп"+(ME.child&&ME.child.gender==="female"?"а":"")+" "+(ME.child?ME.child.name:"")+"!":"";
  ex.shown.push({r:"ai",t:(greet?greet+" ":"")+(d.text||"")});
  const ev=d.evaluation;if(ev&&ev.topic){const c=ex.done[ev.topic];let n=c;if(ev.verdict==="correct")n="done";else if(ev.verdict==="partial"&&c!=="done")n="partial";if(n)ex.done[ev.topic]=n}
  ex.busy=false;if(ex!==EX)return;setBusy(false);drawPills();
  const g=ex.gen;const clips=[];if(greet){try{const a=await api("/api/tts",{text:greet});if(a.audio)clips.push(a.audio)}catch(e){}}
  (d.audioChunks||[]).forEach(a=>clips.push(a));
  if(ex===EX&&g===EXGEN)await playAll(clips,g)}
 catch(e){ex.busy=false;if(!first)ex.shown.pop();if(ex!==EX)return;ex.shown.push({r:"err",t:"Грешка: "+e.message+" Опитай пак."});
  if(!first){const inp=$("#inp");if(inp&&!inp.value)inp.value=text}setBusy(false)}}
async function playAll(clips,g){const spk=$("#spk");for(const b64 of clips){if(g!==EXGEN)return;if(spk)spk.textContent="🔊 Елена говори…";
  await new Promise(res=>{const a=new Audio("data:audio/wav;base64,"+b64);if(EX)EX.audio=a;let done=false;const fin=()=>{if(!done){done=true;res()}};a.onended=fin;a.onerror=fin;a.onpause=fin;a.play().catch(fin)})}
 if(spk&&g===EXGEN)spk.textContent=""}
function stopAudio(){if(EX&&EX.audio){try{EX.audio.pause()}catch(e){}EX.audio=null}const s=$("#spk");if(s)s.textContent=""}
function toggleRec(){if(EX.rec){stopRec();return}stopAudio();
 const r=new SR();r.lang=EX.lang==="en"?"en-US":"bg-BG";r.continuous=true;r.interimResults=true;
 const inp=$("#inp");const base=inp.value?inp.value.trim()+" ":"";
 r.onresult=e=>{let fin="",tmp="";for(let i=0;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)fin+=t+" ";else tmp+=t}inp.value=(base+fin+tmp).trim();inp.oninput()};
 r.onend=()=>{if(EX&&EX.rec===r){EX.rec=null;const m=$("#mic");if(m)m.classList.remove("rec")}};
 r.onerror=e=>{if(e.error==="not-allowed"||e.error==="service-not-allowed")alert("Браузърът не позволи микрофона. Разреши го от иконката до адреса и опитай пак.")};
 try{r.start();EX.rec=r;$("#mic").classList.add("rec")}catch(e){}}
function stopRec(){if(EX&&EX.rec){const r=EX.rec;EX.rec=null;try{r.stop()}catch(e){}}const m=$("#mic");if(m)m.classList.remove("rec")}
async function finish(){if(!EX||EX.busy)return;const total=EX.topics.length,covered=EX.topics.filter(t=>EX.done[t.key]==="done").length;
 if(!covered){if(!confirm("Още няма овладени теми, а точки има само за тях. Да изляза ли без точки?"))return;EX.finished=true;stopExam(true);examTab();return}
 const complete=covered===total;
 if(!confirm(complete?"Всички теми са овладени! Урокът ще се отбележи като минат.":"Овладени теми: "+covered+" от "+total+". Точки получаваш само за тях, а урокът се брои за минат, когато овладееш всички. Приключваш ли?"))return;
 stopAudio();stopRec();const ex=EX;
 try{const s=SUBJ[subjOf(group)]||["",""];const r=await api("/api/award",{lessonKey:ex.key,subject:s[1],lessonTitle:ex.title,topicsTotal:total,topicsCovered:covered});
  if(complete){PASSED.add(ex.key);markPassed()}
  const extras=[];if(r.is_jackpot)extras.push("🎰 ДЖАКПОТ — двойни точки!");if(r.same_day_bonus>0)extras.push("🔁 +"+r.same_day_bonus+" за връщане пак днес");if(r.current_streak>1)extras.push("серия: "+r.current_streak+" дни");
  ex.finished=true;stopExam(true);
  $(".frame").innerHTML='<div class="result"><div style="font-size:48px">'+(complete?"🎉":"👍")+'</div><div class="big">+'+(r.points||0)+' точки</div><p>'+covered+" "+(covered===1?"овладяна тема":"овладени теми")+(extras.length?"<br>"+extras.join(" · "):"")+'</p><button class="btn ghost" id="again">Нов изпит</button></div>';
  $("#again").onclick=examTab}
 catch(e){alert("Точките не се записаха: "+e.message)}}
window.addEventListener("pagehide",()=>{if(EX&&!EX.logged&&ME.child){const min=(Date.now()-EX.started)/60000;if(min>=0.15){EX.logged=true;navigator.sendBeacon("/api/activity",new Blob([JSON.stringify({minutes:min})],{type:"application/json"}))}}});
init();
</script></body></html>`;

// ---------------- сървър ----------------
const BACKEND = "https://school-simulator-backend.onrender.com";
const COOKIE = "uchko_s";
const SESSION_DAYS = 30;
const enc = new TextEncoder();

const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });
const fail = (msg, status = 400) => json({ error: msg }, status);

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return b64url(new Uint8Array(bits));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readSession(req, env) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || !safeEq(sig, await hmac(env.SESSION_SECRET, body))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return s.exp > Date.now() ? s : null;
  } catch (e) {
    return null;
  }
}
async function sessionCookie(s, env) {
  const body = b64url(enc.encode(JSON.stringify({ ...s, exp: Date.now() + SESSION_DAYS * 864e5 })));
  return `${COOKIE}=${body}.${await hmac(env.SESSION_SECRET, body)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

async function backend(path, opts = {}) {
  const r = await fetch(BACKEND + path, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let d = null;
  try { d = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data: d };
}
const childView = (c) => ({ id: c.id, name: c.name, gender: c.gender, grade: String(c.grade || "") });

async function allowedKeys(env) {
  const idx = await env.LESSONS.get("index", "json");
  const keys = new Set();
  for (const g of Object.values(idx || {})) for (const l of g.lessons || []) keys.add(l.kvKey);
  return { idx, keys };
}

async function elena(env, payload) {
  const r = await env.ELENA.fetch("https://elena/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function handleApi(p, req, env) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const s = await readSession(req, env);

  if (p === "/api/login") {
    const code = String(body.code || "").trim().toUpperCase();
    const pw = String(body.password || "");
    if (!code || !pw) return fail("Попълни семейния код и паролата.");
    const failKey = "webauth-fail-" + code;
    const fails = parseInt((await env.LESSONS.get(failKey)) || "0", 10);
    if (fails >= 10) return fail("Твърде много грешни опити. Опитай пак след 15 минути.", 429);
    const fam = await backend("/families/join", { method: "POST", body: { code } });
    if (!fam.ok) {
      if (fam.status !== 404) return fail("Сървърът не отговаря. Опитай пак след минута.", 502);
      await env.LESSONS.put(failKey, String(fails + 1), { expirationTtl: 900 });
      return fail("Няма семейство с този код.", 401);
    }
    const authKey = "webauth-" + code;
    const rec = await env.LESSONS.get(authKey, "json");
    let created = false;
    if (!rec) {
      if (pw.length < 6) return fail("Първи вход: избери парола с поне 6 знака.");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await env.LESSONS.put(authKey, JSON.stringify({ salt: b64url(salt), hash: await pbkdf2(pw, salt), family_id: fam.data.family_id, created_at: new Date().toISOString() }));
      created = true;
    } else if (!safeEq(await pbkdf2(pw, unb64url(rec.salt)), rec.hash)) {
      await env.LESSONS.put(failKey, String(fails + 1), { expirationTtl: 900 });
      return fail("Грешна парола.", 401);
    }
    return json(
      { loggedIn: true, created, child: null, children: (fam.data.children || []).map(childView) },
      200,
      { "set-cookie": await sessionCookie({ fid: fam.data.family_id, code }, env) }
    );
  }
  if (p === "/api/logout") return json({ loggedIn: false }, 200, { "set-cookie": clearCookie });

  if (!s) return p === "/api/me" ? json({ loggedIn: false }) : fail("Трябва вход.", 401);

  if (p === "/api/me") {
    const r = await backend(`/families/${s.fid}/children`);
    return json({ loggedIn: true, child: s.child || null, children: r.ok ? r.data.map(childView) : [] });
  }
  if (p === "/api/child") {
    const r = await backend(`/families/${s.fid}/children`);
    if (!r.ok) return fail("Сървърът не отговаря. Опитай пак след минута.", 502);
    const c = r.data.find((x) => x.id === body.childId);
    if (!c) return fail("Няма такова дете в семейството.", 404);
    const child = childView(c);
    return json({ loggedIn: true, child, children: r.data.map(childView) }, 200, {
      "set-cookie": await sessionCookie({ fid: s.fid, code: s.code, child }, env),
    });
  }

  const c = s.child;
  if (!c) return fail("Избери кое дете учи.", 401);

  if (p === "/api/progress") {
    const r = await backend(`/children/${c.id}/progress`);
    return json({ completed: (r.ok && r.data && r.data.completed_kv_keys) || [] });
  }
  if (p === "/api/chat") {
    const { keys } = await allowedKeys(env);
    if (!keys.has(body.lessonKey)) return fail("Няма такъв урок.", 404);
    const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-60).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 4000),
    }));
    if (!messages.length) return fail("Празен разговор.");
    const topics = (Array.isArray(body.topics) ? body.topics : []).slice(0, 20).map((t) => ({ key: String(t.key || ""), label: String(t.label || "") }));
    return elena(env, {
      action: "chat",
      messages,
      lessonContent: "",
      lessonKey: body.lessonKey,
      studentName: c.name,
      studentGender: c.gender,
      studentGrade: c.grade,
      topics,
      mastered: Array.isArray(body.mastered) ? body.mastered.slice(0, 20).map(String) : [],
    });
  }
  if (p === "/api/tts") return elena(env, { action: "tts", text: String(body.text || "").slice(0, 300) });
  if (p === "/api/award") {
    const { keys } = await allowedKeys(env);
    if (!keys.has(body.lessonKey)) return fail("Няма такъв урок.", 404);
    const total = Math.max(0, Math.min(20, parseInt(body.topicsTotal, 10) || 0));
    const covered = Math.max(0, Math.min(total, parseInt(body.topicsCovered, 10) || 0));
    if (total > 0 && covered === total) await backend(`/children/${c.id}/progress/${encodeURIComponent(body.lessonKey)}`, { method: "POST" });
    const r = await backend(`/children/${c.id}/points/award`, {
      method: "POST",
      body: { lesson_key: body.lessonKey, subject: String(body.subject || ""), lesson_title: String(body.lessonTitle || ""), topics_total: total, topics_covered: covered },
    });
    return r.ok ? json(r.data) : fail("Сървърът за точки не отговаря.", 502);
  }
  if (p === "/api/activity") {
    const minutes = Math.min(180, Math.max(0, Number(body.minutes) || 0));
    if (minutes > 0) await backend(`/children/${c.id}/activity`, { method: "POST", body: { minutes } });
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    const html = (b) => new Response(b, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/" || p === "/index.html") return html(PAGE);
    if (p === "/api/index") {
      const { idx } = await allowedKeys(env);
      return Response.json(idx || {}, { headers: { "cache-control": "max-age=60" } });
    }
    const m = p.match(/^\/(api\/lesson|opit|pesen)\/(.+)$/);
    if (m) {
      const key = decodeURIComponent(m[2]);
      const { keys } = await allowedKeys(env);
      if (!keys.has(key)) return new Response("Няма такъв урок", { status: 404 });
      if (m[1] === "pesen") {
        const song = await env.LESSONS.get("song-" + key);
        return song ? html(song) : new Response("Няма песен", { status: 404 });
      }
      const L = await env.LESSONS.get(key, "json");
      if (!L) return new Response("Няма такъв урок", { status: 404 });
      if (m[1] === "opit") {
        const h = L.interactive && L.interactive.html;
        return h ? html(h) : new Response("Няма опит", { status: 404 });
      }
      const { interactive, reviveScenes, ...rest } = L;
      return Response.json({ ...rest, hasInteractive: !!(interactive && interactive.html) });
    }
    if (p.startsWith("/api/")) {
      try {
        return await handleApi(p, req, env);
      } catch (e) {
        return fail("Вътрешна грешка: " + (e.message || e), 500);
      }
    }
    return new Response("Not found", { status: 404 });
  },
};

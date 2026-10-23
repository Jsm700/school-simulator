// uchko-web — десктоп версия на Учко (v0: уроци + „Опит на живо“ на голям екран)
const PAGE = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Учко</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Unbounded:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F6F2EA;--card:#fff;--ink:#1C2333;--muted:#6B7280;--line:#E7DFD0;--primary:#2563C9;--primaryDark:#173F8A;--accent:#E8743B;--energy:#F5B700;--subj:#2563C9}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:Nunito,system-ui,sans-serif;background:var(--bg);color:var(--ink);display:grid;grid-template-columns:320px 1fr;height:100vh;overflow:hidden}
aside{background:var(--card);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.brand{padding:20px 20px 12px;display:flex;align-items:center;gap:10px}
.brand b{font:700 26px Unbounded,sans-serif;color:var(--primaryDark)}.brand span{font-size:12px;color:var(--muted);font-weight:700}
.grades{display:flex;gap:8px;padding:0 20px 12px}
.grades button,.chip{border:2px solid var(--line);background:#fff;border-radius:999px;padding:7px 14px;font:800 14px Nunito,system-ui,sans-serif;cursor:pointer;color:var(--ink)}
.grades button.on{background:var(--primary);border-color:var(--primary);color:#fff}
.subjects{display:flex;flex-wrap:wrap;gap:6px;padding:0 20px 12px;border-bottom:1px solid var(--line)}
.chip{font-size:13px;padding:6px 12px}.chip.on{border-color:var(--subj);background:var(--subj);color:#fff}
.lessons{overflow:auto;padding:12px;flex:1;min-height:0}
.les{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:14px;cursor:pointer;border:2px solid transparent}
.les:hover{background:var(--bg)}.les.on{border-color:var(--subj);background:#fff}
.les .n{min-width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--bg);font:700 12px Unbounded,sans-serif;color:var(--subj)}
.les .t{font-weight:800;font-size:15px;line-height:1.25}.les .s{font-size:12px;color:var(--muted);margin-top:2px}
.les .tag{font-size:11px;font-weight:800;color:var(--accent);margin-top:3px}
main{display:flex;flex-direction:column;min-height:0;min-width:0}
.top{padding:18px 28px;border-bottom:1px solid var(--line);background:var(--card);display:flex;align-items:center;gap:16px}
.top .eb{font-size:12px;font-weight:900;letter-spacing:1px;color:var(--subj)}
.top h1{margin:2px 0 0;font:700 22px Unbounded,sans-serif}
.score{margin-left:auto;background:#E3F5EA;color:#167A43;font-weight:900;border-radius:999px;padding:8px 16px;display:none}
.body{flex:1;display:grid;grid-template-columns:minmax(300px,380px) 1fr;min-height:0}
.notes{overflow:auto;padding:22px 24px;border-right:1px solid var(--line)}
.notes h3{font:700 14px Unbounded,sans-serif;margin:18px 0 10px;color:var(--subj)}
.notes ul{margin:0;padding-left:18px}.notes li{margin:0 0 10px;line-height:1.45}
.term{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.term b{display:block;margin-bottom:2px}
iframe{border:0;width:100%;height:100%;background:var(--bg)}
.empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:18px;text-align:center;padding:40px}
@media (max-width:900px){body{grid-template-columns:1fr;overflow:auto;height:auto}.body{grid-template-columns:1fr}aside{max-height:none}}
</style></head><body>
<aside><div class="brand"><b>Учко</b><span>десктоп · проба</span></div>
<div class="grades" id="grades"></div><div class="subjects" id="subjects"></div><div class="lessons" id="lessons"></div></aside>
<main><div class="top"><div><div class="eb" id="eb">ИЗБЕРИ УРОК</div><h1 id="title">Учко на голям екран</h1></div><div class="score" id="score"></div></div>
<div class="body" id="body"><div class="notes" id="notes"><div class="empty">Вляво избери клас, предмет и урок.</div></div><div id="live"><div class="empty">Тук ще се появи „Опит на живо“.</div></div></div></main>
<script>
const SUBJ={bulgarian:["📖","Български език и литература","#B9531F"],physics:["⚡","Физика","#2563C9"],biology:["🧬","Биология","#4E8A1E"],chemistry:["⚗️","Химия","#7A3FB8"],geography:["🌍","География","#0E7C86"],history:["🏺","История","#A2452B"],english:["🇬🇧","Английски","#C2364E"],human_nature:["🌱","Човекът и природата","#4E8A1E"],human_society:["🏛️","Човекът и обществото","#A2452B"]};
let IDX={},grade=null,group=null,cur=null;
const $=s=>document.querySelector(s);const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function subjOf(k){const r=k.split("_").slice(1).join("_");return Object.keys(SUBJ).find(s=>r.startsWith(s+"_"))||r}
function setColor(k){document.documentElement.style.setProperty("--subj",(SUBJ[subjOf(k)]||[0,0,"#2563C9"])[2])}
async function init(){IDX=await (await fetch("/api/index")).json();
 const gs=[...new Set(Object.keys(IDX).map(k=>k.split("_")[0]))].sort((a,b)=>b-a);
 $("#grades").innerHTML=gs.map(g=>'<button data-g="'+g+'">'+g+'. клас</button>').join("");
 $("#grades").onclick=e=>{const g=e.target.dataset.g;if(g)pickGrade(g)};
 let saved=null;try{saved=localStorage.getItem("uchko_grade")}catch(e){}
 pickGrade(gs.includes(saved)?saved:gs[0]);}
function pickGrade(g){grade=g;try{localStorage.setItem("uchko_grade",g)}catch(e){}
 document.querySelectorAll("#grades button").forEach(b=>b.classList.toggle("on",b.dataset.g===g));
 const ks=Object.keys(IDX).filter(k=>k.startsWith(g+"_"));
 $("#subjects").innerHTML=ks.map(k=>{const s=SUBJ[subjOf(k)]||["📘",k];const pub=(IDX[k].label||"").split("•").pop().trim();return '<button class="chip" data-k="'+k+'">'+s[0]+' '+esc(s[1])+(ks.filter(x=>subjOf(x)===subjOf(k)).length>1?' · '+esc(pub):'')+'</button>'}).join("");
 $("#subjects").onclick=e=>{const k=e.target.closest("button")?.dataset.k;if(k)pickGroup(k)};
 pickGroup(ks[0]);}
function pickGroup(k){group=k;setColor(k);
 document.querySelectorAll("#subjects .chip").forEach(b=>b.classList.toggle("on",b.dataset.k===k));
 $("#lessons").innerHTML=(IDX[k].lessons||[]).map(l=>'<div class="les" data-key="'+esc(l.kvKey)+'"><div class="n">'+esc(l.id)+'</div><div><div class="t">'+esc(l.title)+'</div><div class="s">'+esc(l.subtitle||"")+'</div>'+(l.hasInteractive?'<div class="tag">🔬 опит на живо</div>':'')+'</div></div>').join("");
 $("#lessons").onclick=e=>{const d=e.target.closest(".les");if(d)openLesson(d.dataset.key)};}
async function openLesson(key){cur=key;
 document.querySelectorAll(".les").forEach(d=>d.classList.toggle("on",d.dataset.key===key));
 $("#notes").innerHTML='<div class="empty">Зареждам…</div>';$("#score").style.display="none";
 const L=await (await fetch("/api/lesson/"+encodeURIComponent(key))).json();if(cur!==key)return;
 const s=SUBJ[subjOf(group)]||["📘",""];$("#eb").textContent=s[0]+" "+(s[1]||"").toUpperCase();$("#title").textContent=L.title;
 const v=L.vocabulary||{};
 $("#notes").innerHTML='<h3>Най-важното</h3><ul>'+(L.main_concepts||[]).map(c=>'<li>'+esc(c)+'</li>').join("")+'</ul>'+
  (Object.keys(v).length?'<h3>Речник</h3>'+Object.entries(v).map(([t,d])=>'<div class="term"><b>'+esc(t)+'</b>'+esc(d)+'</div>').join(""):"");
 $("#live").innerHTML=L.hasInteractive?'<iframe src="/opit/'+encodeURIComponent(key)+'" title="Опит на живо"></iframe>':'<div class="empty">Този урок още няма „Опит на живо“.</div>';}
window.addEventListener("message",e=>{const m=e.data||{};if(m.type==="score"||m.type==="done"){const el=$("#score");el.style.display="block";el.textContent=(m.type==="done"?"✓ ":"")+m.right+" / "+m.total}});
init();
</script></body></html>`;

async function allowedKeys(env) {
  const idx = await env.LESSONS.get("index", "json");
  const keys = new Set();
  for (const g of Object.values(idx || {})) for (const l of g.lessons || []) keys.add(l.kvKey);
  return { idx, keys };
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
    const m = p.match(/^\/(api\/lesson|opit)\/(.+)$/);
    if (m) {
      const key = decodeURIComponent(m[2]);
      const { keys } = await allowedKeys(env);
      if (!keys.has(key)) return new Response("Няма такъв урок", { status: 404 });
      const L = await env.LESSONS.get(key, "json");
      if (!L) return new Response("Няма такъв урок", { status: 404 });
      if (m[1] === "opit") {
        const h = L.interactive && L.interactive.html;
        return h ? html(h) : new Response("Няма опит", { status: 404 });
      }
      const { interactive, reviveScenes, ...rest } = L;
      return Response.json({ ...rest, hasInteractive: !!(interactive && interactive.html) });
    }
    return new Response("Not found", { status: 404 });
  },
};

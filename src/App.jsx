import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://yvdkzswqfwycpoifxdxd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2ZGt6c3dxZnd5Y3BvaWZ4ZHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzUxMTMsImV4cCI6MjA5ODE1MTExM30.usY5clEQYkauWBFrGmWbA6ppVi6_ranPOYmm-2W9qsc";

const store = {
  get: (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const sb = {
  async get(table, code) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?code=eq.${encodeURIComponent(code)}&limit=1`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
      });
      const rows = await res.json();
      return rows?.[0]?.data ?? null;
    } catch { return null; }
  },
  async set(table, code, data) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ code, data, updated_at: new Date().toISOString() })
      });
    } catch {}
  }
};

function md(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^#{1,3} (.+)$/gm, "<strong style='font-size:14px;display:block;margin-top:10px;margin-bottom:2px;color:#1C1410'>$1</strong>")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n/g, "<br/><br style='line-height:0.5'/>")
    .replace(/\n/g, "<br/>");
}

const C = {
  bg: "#F7F5F2",
  white: "#FFFFFF",
  dark: "#1C1410",
  terra: "#B8735A",
  border: "#E8E2DC",
  muted: "#9A8880",
  light: "#F0EBE6",
  sidebar: "#FAFAF8",
};

const g = {
  page: { fontFamily: "'Inter', sans-serif", background: C.bg, minHeight: "100vh", color: C.dark, fontSize: "14px", overflowX: "hidden" },
  hdr: {
    borderBottom: `1px solid ${C.border}`,
    padding: "0 24px",
    height: "52px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    position: "sticky", top: 0, zIndex: 300, background: C.white,
  },
  hdrLeft: { display: "flex", alignItems: "center", gap: "6px" },
  brandDot: { width: "6px", height: "6px", borderRadius: "50%", background: C.terra, flexShrink: 0 },
  brand: { fontSize: "12px", fontFamily: "'Inter', sans-serif", fontWeight: "700", letterSpacing: "0.18em", textTransform: "uppercase", color: C.dark },
  sub: { fontSize: "11px", fontFamily: "'Inter', sans-serif", color: C.muted, letterSpacing: "0.06em" },
  hdrDivider: { width: "1px", height: "16px", background: C.border, margin: "0 10px" },
  ghostBtn: { fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "500", background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", padding: "6px 14px", borderRadius: "4px", letterSpacing: "0.04em", transition: "all 0.15s" },
  loginWrap: { maxWidth: "400px", margin: "80px auto", padding: "0 24px" },
  loginH: { fontSize: "30px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", marginBottom: "8px", color: C.dark, lineHeight: 1.2 },
  loginP: { fontSize: "14px", color: "#6B5E58", marginBottom: "36px", lineHeight: 1.7 },
  lbl: { display: "block", fontSize: "10px", fontWeight: "600", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "7px", color: C.muted },
  inp: { width: "100%", padding: "11px 14px", fontSize: "14px", border: `1.5px solid ${C.border}`, borderRadius: "6px", fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box", background: C.white, color: C.dark, transition: "border-color 0.15s" },
  btnP: { padding: "12px 24px", background: C.dark, color: C.white, border: "none", fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", borderRadius: "4px", transition: "opacity 0.15s" },
  btnG: { padding: "10px 18px", background: C.white, color: C.dark, border: `1.5px solid ${C.border}`, fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: "4px" },
  err: { fontSize: "13px", color: C.terra, marginTop: "10px" },
  fldGrp: { marginBottom: "16px" },
  layout: { display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" },
  sidebar: { width: "220px", minWidth: "220px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: C.sidebar, flexShrink: 0, overflowY: "auto" },
  sideHeader: { padding: "16px 16px 8px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted },
  newBtn: { margin: "0 12px 12px", padding: "9px 14px", background: C.terra, color: C.white, border: "none", fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", cursor: "pointer", borderRadius: "4px", letterSpacing: "0.06em", textAlign: "center" },
  convItem: (active) => ({
    padding: "10px 16px",
    cursor: "pointer",
    background: active ? C.light : "transparent",
    borderLeft: active ? `2px solid ${C.terra}` : "2px solid transparent",
    transition: "all 0.1s",
  }),
  convTitle: (active) => ({ fontSize: "12px", color: active ? C.dark : "#5A4840", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? "600" : "400" }),
  convDate: { fontSize: "10px", color: C.muted, marginTop: "2px" },
  mainArea: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  msgs: { flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: "720px", width: "100%", margin: "0 auto", boxSizing: "border-box" },
  bubble: (r) => ({ marginBottom: "20px", display: "flex", flexDirection: "column", alignItems: r === "user" ? "flex-end" : "flex-start" }),
  bLbl: { fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: "5px" },
  bBody: (r) => ({
    maxWidth: r === "assistant" ? "100%" : "75%",
    padding: r === "user" ? "10px 15px" : "14px 18px",
    background: r === "user" ? C.dark : C.white,
    color: r === "user" ? C.white : C.dark,
    fontSize: "14px",
    lineHeight: 1.65,
    borderRadius: r === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
    border: r === "assistant" ? `1px solid ${C.border}` : "none",
    borderLeft: r === "assistant" ? `3px solid ${C.terra}` : "none",
    wordBreak: "break-word",
    boxShadow: r === "assistant" ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
  }),
  inputBar: { borderTop: `1px solid ${C.border}`, padding: "12px 32px 14px", background: C.white, maxWidth: "720px", width: "100%", margin: "0 auto", boxSizing: "border-box" },
  inputBarOuter: { borderTop: `1px solid ${C.border}`, background: C.white, display: "flex", justifyContent: "center" },
  inputRow: { display: "flex", gap: "8px", alignItems: "flex-end" },
  chatTa: { flex: 1, padding: "11px 14px", fontSize: "14px", border: `1.5px solid ${C.border}`, borderRadius: "8px", fontFamily: "'Inter', sans-serif", resize: "none", outline: "none", lineHeight: 1.6, minHeight: "44px", maxHeight: "120px", boxSizing: "border-box", color: C.dark, background: C.white, transition: "border-color 0.15s" },
  sendBtn: (dis) => ({ padding: "11px 16px", background: dis ? "#D8CCC6" : C.dark, color: C.white, border: "none", fontSize: "16px", cursor: dis ? "default" : "pointer", flexShrink: 0, borderRadius: "8px", transition: "background 0.15s" }),
  attachBtn: (active) => ({ padding: "11px 12px", background: active ? C.dark : C.white, color: active ? C.white : C.muted, border: `1.5px solid ${active ? C.dark : C.border}`, fontSize: "16px", cursor: "pointer", flexShrink: 0, borderRadius: "8px", transition: "all 0.15s" }),
  dot: (d) => ({ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: C.terra, margin: "0 2px", animation: "bounce 1.2s ease-in-out infinite", animationDelay: d }),
  emptyWrap: { textAlign: "center", padding: "60px 24px", maxWidth: "520px", margin: "0 auto" },
  emptyH: { fontSize: "26px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", color: C.dark, marginBottom: "10px" },
  emptyP: { fontSize: "14px", color: "#7A6860", lineHeight: 1.7, marginBottom: "28px" },
  quickBtns: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" },
  quickBtn: { fontSize: "12px", padding: "9px 16px", background: C.white, border: `1px solid ${C.border}`, color: "#5A4840", cursor: "pointer", borderRadius: "6px", transition: "all 0.15s" },
};

function Login({ onLogin }) {
  const [code, setCode] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [stap, setStap] = useState("code");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkCode() {
    const c = code.trim().toUpperCase();
    if (!c) { setErr("Vul een toegangscode in."); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/codes?code=eq.${encodeURIComponent(c)}&actief=eq.true&limit=1`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
      });
      const rows = await res.json();
      if (rows.length === 0) setErr("Code niet herkend. De Always In Control Bot is te koop via www.carrieremoeder.com");
      else if (rows[0].wachtwoord) setStap("wachtwoord-in");
      else setStap("wachtwoord-nieuw");
    } catch { setErr("Er ging iets mis. Probeer opnieuw."); }
    setLoading(false);
  }

  async function maakWachtwoord() {
    if (nieuwWachtwoord.length < 8) { setErr("Kies een wachtwoord van minimaal 8 tekens."); return; }
    if (nieuwWachtwoord !== bevestig) { setErr("Wachtwoorden komen niet overeen."); return; }
    setLoading(true); setErr("");
    const c = code.trim().toUpperCase();
    try {
      const hash = btoa(nieuwWachtwoord + c);
      await fetch(`${SUPABASE_URL}/rest/v1/codes?code=eq.${encodeURIComponent(c)}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ wachtwoord: hash })
      });
      store.set("bot_user_code", c); onLogin(c);
    } catch { setErr("Er ging iets mis."); }
    setLoading(false);
  }

  async function controleerWachtwoord() {
    if (!wachtwoord) { setErr("Vul je wachtwoord in."); return; }
    setLoading(true); setErr("");
    const c = code.trim().toUpperCase();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/codes?code=eq.${encodeURIComponent(c)}&actief=eq.true&limit=1`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
      });
      const rows = await res.json();
      if (!rows.length) { setErr("Code niet gevonden."); setLoading(false); return; }
      if (rows[0].wachtwoord === btoa(wachtwoord + c)) { store.set("bot_user_code", c); onLogin(c); }
      else setErr("Onjuist wachtwoord.");
    } catch { setErr("Er ging iets mis."); }
    setLoading(false);
  }

  return (
    <div style={g.loginWrap}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "28px" }}>
        <div style={g.brandDot} />
        <span style={{ ...g.brand, fontSize: "10px" }}>Carrièremoeder</span>
      </div>
      <h1 style={g.loginH}>Always In Control Bot</h1>
      <p style={g.loginP}>Jouw persoonlijke communicatiecoach bij elk bericht van je ex.</p>

      {stap === "code" && (<>
        <div style={g.fldGrp}><label style={g.lbl}>Toegangscode</label>
          <input style={g.inp} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && checkCode()} placeholder="Jouw toegangscode" autoFocus /></div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={checkCode} disabled={loading}>{loading ? "Controleren..." : "Volgende →"}</button>
      </>)}

      {stap === "wachtwoord-nieuw" && (<>
        <div style={{ background: "#FDF5F2", border: `1px solid #F0E4DE`, padding: "12px 14px", marginBottom: "18px", fontSize: "13px", color: "#5A4840", lineHeight: 1.6, borderRadius: "6px" }}>
          Welkom! Kies een persoonlijk wachtwoord voor je account.
        </div>
        <div style={g.fldGrp}><label style={g.lbl}>Nieuw wachtwoord</label>
          <input style={g.inp} type="password" value={nieuwWachtwoord} onChange={e => setNieuwWachtwoord(e.target.value)} placeholder="Minimaal 8 tekens" autoFocus /></div>
        <div style={g.fldGrp}><label style={g.lbl}>Bevestig wachtwoord</label>
          <input style={g.inp} type="password" value={bevestig} onChange={e => setBevestig(e.target.value)} onKeyDown={e => e.key === "Enter" && maakWachtwoord()} placeholder="Herhaal wachtwoord" /></div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={maakWachtwoord} disabled={loading}>{loading ? "Opslaan..." : "Wachtwoord instellen →"}</button>
        <button style={{ ...g.btnG, width: "100%", marginTop: "8px" }} onClick={() => setStap("code")}>← Terug</button>
      </>)}

      {stap === "wachtwoord-in" && (<>
        <div style={g.fldGrp}><label style={g.lbl}>Wachtwoord</label>
          <input style={g.inp} type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} onKeyDown={e => e.key === "Enter" && controleerWachtwoord()} placeholder="Jouw wachtwoord" autoFocus /></div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={controleerWachtwoord} disabled={loading}>{loading ? "Controleren..." : "Inloggen →"}</button>
        <button style={{ ...g.btnG, width: "100%", marginTop: "8px" }} onClick={() => setStap("code")}>← Terug</button>
      </>)}

      <p style={{ fontSize: "12px", color: "#C8B8B0", marginTop: "28px", lineHeight: 1.7 }}>Toegangscode ontvangen na aankoop via www.carrieremoeder.com</p>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!store.get("bot_user_code"));
  const [userCode, setUserCode] = useState(() => store.get("bot_user_code") || "");
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImg, setPendingImg] = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!loggedIn || !userCode) return;
    sb.get("chat", userCode).then(data => {
      if (data && Array.isArray(data)) {
        setConversations(data);
        if (data.length > 0) { setActiveId(data[0].id); setHistory(data[0].messages || []); }
      }
    });
  }, [loggedIn, userCode]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, loading]);

  function saveConversations(convs) { setConversations(convs); sb.set("chat", userCode, convs); }

  function newConversation() {
    const id = Date.now();
    const conv = { id, title: "Nieuw gesprek", date: new Date().toLocaleDateString("nl-NL"), messages: [] };
    const updated = [conv, ...conversations];
    saveConversations(updated); setActiveId(id); setHistory([]); setPendingImg(null);
  }

  function loadConversation(conv) { setActiveId(conv.id); setHistory(conv.messages || []); setPendingImg(null); }

  function updateCurrentConversation(msgs, id) {
    const targetId = id || activeId;
    const updated = conversations.map(c => {
      if (c.id !== targetId) return c;
      const firstUser = msgs.find(m => m.role === "user");
      const rawText = firstUser ? (typeof firstUser.content === "string" ? firstUser.content : firstUser.display?.text || "Gesprek") : "Gesprek";
      return { ...c, messages: msgs, title: rawText.slice(0, 45) + (rawText.length > 45 ? "..." : "") };
    });
    saveConversations(updated);
  }

  function handleImageUpload(file) {
    if (!file) return;
    setUploadingImg(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingImg({ base64: e.target.result.split(",")[1], type: file.type, name: file.name, preview: e.target.result });
      setUploadingImg(false);
    };
    reader.readAsDataURL(file);
  }

  async function send() {
    const msg = input.trim();
    if ((!msg && !pendingImg) || loading) return;

    let currentId = activeId;
    let currentConvs = conversations;
    if (!currentId) {
      const id = Date.now();
      const conv = { id, title: "Nieuw gesprek", date: new Date().toLocaleDateString("nl-NL"), messages: [] };
      currentConvs = [conv, ...conversations];
      saveConversations(currentConvs);
      setActiveId(id); currentId = id;
    }

    setInput("");
    if (taRef.current) taRef.current.style.height = "44px";

    let userContent, displayContent;
    if (pendingImg) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: pendingImg.type, data: pendingImg.base64 } },
        { type: "text", text: msg || "Analyseer dit bericht/screenshot." }
      ];
      displayContent = { text: msg || "Analyseer dit bericht/screenshot.", image: pendingImg.preview };
    } else {
      userContent = msg; displayContent = msg;
    }

    const userMsg = { role: "user", content: userContent, display: displayContent };
    const nh = [...history, userMsg];
    setHistory(nh); setPendingImg(null); setLoading(true);

    try {
      const apiMessages = nh.map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: apiMessages }) });
      const d = await res.json();
      const reply = d.content?.[0]?.text || "Er ging iets mis.";
      const newHistory = [...nh, { role: "assistant", content: reply }];
      setHistory(newHistory);
      updateCurrentConversation(newHistory, currentId);
    } catch {
      const newHistory = [...nh, { role: "assistant", content: "Er ging iets mis. Probeer opnieuw." }];
      setHistory(newHistory);
    }
    setLoading(false);
  }

  function logout() { setLoggedIn(false); setUserCode(""); store.set("bot_user_code", ""); setHistory([]); setConversations([]); setActiveId(null); }

  function renderMessage(m, i) {
    const display = m.display || m.content;
    const isUser = m.role === "user";
    const text = typeof display === "string" ? display : display?.text || "";
    const image = display?.image;
    return (
      <div key={i} style={g.bubble(m.role)}>
        <div style={g.bLbl}>{isUser ? "Jij" : "Always In Control Bot"}</div>
        <div style={g.bBody(m.role)}>
          {image && <img src={image} alt="bijlage" style={{ maxWidth: "180px", maxHeight: "120px", border: "1px solid #eee", display: "block", marginBottom: "8px", borderRadius: "4px" }} />}
          {isUser ? <span>{text}</span> : <span dangerouslySetInnerHTML={{ __html: md(typeof m.content === "string" ? m.content : text) }} />}
        </div>
      </div>
    );
  }

  const quick = ["Mijn ex stuurde dit bericht — wat doe ik?", "Ik wil een grens stellen maar weet niet hoe", "Mijn ex reageert niet op mijn berichten", "Ik raak steeds getriggerd door dezelfde situatie"];

  const CSS = `@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500;600;700&display=swap");
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
*{box-sizing:border-box}
button:hover{opacity:.85}
input:focus,textarea:focus{border-color:#B8735A!important;outline:none}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#E0D8D4;border-radius:2px}`;

  if (!loggedIn) return (
    <div style={{ ...g.page, background: C.white }}>
      <style>{CSS}</style>
      <Login onLogin={(code) => { setLoggedIn(true); setUserCode(code); store.set("bot_user_code", code); }} />
    </div>
  );

  return (
    <div style={g.page}>
      <style>{CSS}</style>
      <div style={g.hdr}>
        <div style={g.hdrLeft}>
          <div style={g.brandDot} />
          <span style={g.brand}>Carrièremoeder</span>
          <div style={g.hdrDivider} />
          <span style={g.sub}>Always In Control Bot</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={g.ghostBtn} onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div style={g.layout}>
        <div style={g.sidebar}>
          <button style={g.newBtn} onClick={newConversation}>+ Nieuw gesprek</button>
          <div style={g.sideHeader}>Gesprekken</div>
          {conversations.length === 0 && <div style={{ padding: "10px 16px", fontSize: "12px", color: C.muted }}>Nog geen gesprekken</div>}
          {conversations.map(conv => (
            <div key={conv.id} style={g.convItem(conv.id === activeId)} onClick={() => loadConversation(conv)}>
              <div style={g.convTitle(conv.id === activeId)}>{conv.title}</div>
              <div style={g.convDate}>{conv.date}</div>
            </div>
          ))}
        </div>

        <div style={g.mainArea}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={g.msgs}>
              {history.length === 0 && (
                <div style={g.emptyWrap}>
                  <h2 style={g.emptyH}>Wat speelt er vandaag?</h2>
                  <p style={g.emptyP}>Plak het bericht van je ex, upload een screenshot of beschrijf een situatie.</p>
                  <div style={g.quickBtns}>{quick.map(q => <button key={q} style={g.quickBtn} onClick={() => setInput(q)}>{q}</button>)}</div>
                </div>
              )}
              {history.map((m, i) => renderMessage(m, i))}
              {loading && (
                <div style={g.bubble("assistant")}>
                  <div style={g.bLbl}>Always In Control Bot</div>
                  <div style={g.bBody("assistant")}><span style={g.dot("0s")} /><span style={g.dot("0.2s")} /><span style={g.dot("0.4s")} /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div style={g.inputBarOuter}>
            <div style={g.inputBar}>
              {pendingImg && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", padding: "8px 12px", background: C.light, borderRadius: "6px" }}>
                  <img src={pendingImg.preview} alt="" style={{ maxWidth: "50px", maxHeight: "34px", borderRadius: "3px" }} />
                  <span style={{ fontSize: "12px", color: "#5A4840", flex: 1 }}>{pendingImg.name}</span>
                  <button onClick={() => setPendingImg(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }}>×</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImageUpload(e.target.files[0])} />
              <div style={g.inputRow}>
                <button onClick={() => fileRef.current?.click()} disabled={uploadingImg} style={g.attachBtn(!!pendingImg)} title="Screenshot uploaden">
                  {uploadingImg ? "…" : "📎"}
                </button>
                <textarea ref={taRef} style={g.chatTa} value={input}
                  onChange={e => { setInput(e.target.value); if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px"; } }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Plak hier het bericht van je ex, of beschrijf de situatie..." rows={1} />
                <button style={g.sendBtn(loading || (!input.trim() && !pendingImg))} onClick={send} disabled={loading || (!input.trim() && !pendingImg)}>→</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                <span style={{ fontSize: "10px", color: "#C8B8B0" }}>Shift+Enter voor nieuwe regel · 📎 voor screenshot</span>
                <span style={{ fontSize: "10px", color: "#C8B8B0" }}>⚠ Deel geen persoonsgegevens</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

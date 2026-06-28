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
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({ code, data, updated_at: new Date().toISOString() })
      });
    } catch {}
  }
};

function md(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^#{1,3} (.+)$/gm, "<strong style='font-size:15px;display:block;margin-top:14px;margin-bottom:4px'>$1</strong>")
    .replace(/\n/g, "<br/>");
}

const g = {
  page: { fontFamily: "'Inter', 'Helvetica Neue', sans-serif", background: "#FAFAF8", minHeight: "100vh", color: "#1C1410", fontSize: "15px", overflowX: "hidden" },
  hdr: { borderBottom: "1.5px solid #E8E0D8", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 300, background: "#FFFFFF" },
  brand: { fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.22em", textTransform: "uppercase", color: "#1C1410" },
  sub: { fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "400", color: "#9A8880", letterSpacing: "0.08em", marginLeft: "10px" },
  ghostBtn: { fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "500", background: "none", border: "1px solid #C8B8B0", color: "#7A6860", cursor: "pointer", padding: "6px 10px", letterSpacing: "0.06em" },
  loginWrap: { maxWidth: "400px", margin: "60px auto", padding: "0 24px" },
  loginH: { fontSize: "32px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", marginBottom: "8px", color: "#1C1410", letterSpacing: "0.02em" },
  loginP: { fontSize: "14px", color: "#5A4E48", fontFamily: "'Inter', sans-serif", fontWeight: "400", marginBottom: "36px", lineHeight: 1.7 },
  lbl: { display: "block", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "8px", color: "#7A6860" },
  inp: { width: "100%", padding: "12px 14px", fontSize: "14px", border: "1.5px solid #E0D8D4", borderRadius: 0, fontFamily: "'Inter', sans-serif", fontWeight: "400", outline: "none", boxSizing: "border-box", background: "#fff", color: "#1C1410" },
  btnP: { padding: "13px 24px", background: "#1C1410", color: "#FFFFFF", border: "none", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" },
  btnG: { padding: "11px 18px", background: "#FFFFFF", color: "#1C1410", border: "1.5px solid #C8B8B0", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "500", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" },
  err: { fontSize: "13px", color: "#B8735A", marginTop: "10px", fontFamily: "'Inter', sans-serif" },
  fldGrp: { marginBottom: "18px" },
  layout: { display: "flex", height: "calc(100vh - 57px)", overflow: "hidden" },
  sidebar: { width: "240px", minWidth: "240px", borderRight: "1.5px solid #E8E0D8", display: "flex", flexDirection: "column", background: "#F8F6F4", flexShrink: 0, overflowY: "auto" },
  sideSecLabel: { fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.2em", textTransform: "uppercase", color: "#B8A89E", padding: "14px 16px 6px" },
  convItem: (active) => ({ padding: "10px 16px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", background: active ? "#1C1410" : "#fff", transition: "background 0.1s" }),
  convTitle: (active) => ({ fontSize: "12px", fontFamily: "'Inter', sans-serif", color: active ? "#fff" : "#333", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
  convDate: (active) => ({ fontSize: "10px", color: active ? "#ccc" : "#bbb", fontFamily: "'Inter', sans-serif", marginTop: "2px" }),
  mainArea: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  chatWrap: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  msgs: { flex: 1, overflowY: "auto", padding: "28px 24px" },
  bubble: (r) => ({ marginBottom: "28px", display: "flex", flexDirection: "column", alignItems: r === "user" ? "flex-end" : "flex-start" }),
  bLbl: { fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.14em", textTransform: "uppercase", color: "#B8A89E", marginBottom: "6px" },
  bBody: (r) => ({
    maxWidth: r === "assistant" ? "100%" : "80%",
    padding: r === "user" ? "11px 15px" : "14px 16px",
    background: r === "user" ? "#1C1410" : "#F8F6F4",
    color: r === "user" ? "#FFFFFF" : "#1C1410",
    fontSize: "14px",
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    borderLeft: r === "assistant" ? "2px solid #B8735A" : "none",
    wordBreak: "break-word",
  }),
  inputBar: { borderTop: "1.5px solid #E8E0D8", padding: "12px 20px", background: "#FFFFFF" },
  inputRow: { display: "flex", gap: "10px", alignItems: "flex-end" },
  chatTa: { flex: 1, padding: "11px 14px", fontSize: "14px", border: "1.5px solid #E0D8D4", borderRadius: 0, fontFamily: "'Inter', sans-serif", resize: "none", outline: "none", lineHeight: 1.6, minHeight: "46px", maxHeight: "130px", boxSizing: "border-box", color: "#1C1410", background: "#fff" },
  sendBtn: (dis) => ({ padding: "11px 18px", background: dis ? "#C8B8B0" : "#1C1410", color: "#FFFFFF", border: "none", fontSize: "13px", cursor: dis ? "default" : "pointer", flexShrink: 0 }),
  dot: (d) => ({ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#aaa", margin: "0 2px", animation: "bounce 1.2s ease-in-out infinite", animationDelay: d }),
  emptyWrap: { textAlign: "center", padding: "60px 24px", maxWidth: "560px", margin: "0 auto" },
  emptyH: { fontSize: "28px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", color: "#1C1410", marginBottom: "12px" },
  emptyP: { fontSize: "14px", color: "#7A6860", fontFamily: "'Inter', sans-serif", lineHeight: 1.7, marginBottom: "32px" },
  quickBtns: { display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" },
  quickBtn: { fontSize: "11px", fontFamily: "'Inter', sans-serif", padding: "10px 16px", background: "#fff", border: "1px solid #D8CCC6", color: "#5A4840", cursor: "pointer" },
  uploadedImg: { maxWidth: "200px", maxHeight: "130px", border: "1px solid #eee", display: "block", marginTop: "8px" },
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
      if (rows.length === 0) {
        setErr("Code niet herkend. De Always In Control Bot is te koop via www.carrieremoeder.com");
      } else {
        if (rows[0].wachtwoord) setStap("wachtwoord-in");
        else setStap("wachtwoord-nieuw");
      }
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
      store.set("bot_user_code", c);
      onLogin(c);
    } catch { setErr("Er ging iets mis. Probeer opnieuw."); }
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
      if (rows.length === 0) { setErr("Code niet gevonden."); setLoading(false); return; }
      const hash = btoa(wachtwoord + c);
      if (rows[0].wachtwoord === hash) {
        store.set("bot_user_code", c);
        onLogin(c);
      } else { setErr("Onjuist wachtwoord."); }
    } catch { setErr("Er ging iets mis. Probeer opnieuw."); }
    setLoading(false);
  }

  return (
    <div style={g.loginWrap}>
      <h1 style={g.loginH}>Always In Control Bot</h1>
      <p style={g.loginP}>Jouw persoonlijke communicatiecoach bij elk bericht van je ex. Altijd rustig. Altijd met regie.</p>

      {stap === "code" && (<>
        <div style={g.fldGrp}>
          <label style={g.lbl}>Toegangscode</label>
          <input style={g.inp} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && checkCode()} placeholder="Jouw toegangscode" autoFocus />
        </div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={checkCode} disabled={loading}>{loading ? "Controleren..." : "Volgende →"}</button>
      </>)}

      {stap === "wachtwoord-nieuw" && (<>
        <div style={{ background: "#FDF5F2", border: "1px solid #F0E4DE", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", fontFamily: "'Inter', sans-serif", color: "#5A4840", lineHeight: 1.6 }}>
          Welkom! Kies een persoonlijk wachtwoord voor je account.
        </div>
        <div style={g.fldGrp}>
          <label style={g.lbl}>Nieuw wachtwoord</label>
          <input style={g.inp} type="password" value={nieuwWachtwoord} onChange={e => setNieuwWachtwoord(e.target.value)} placeholder="Minimaal 8 tekens" autoFocus />
        </div>
        <div style={g.fldGrp}>
          <label style={g.lbl}>Bevestig wachtwoord</label>
          <input style={g.inp} type="password" value={bevestig} onChange={e => setBevestig(e.target.value)} onKeyDown={e => e.key === "Enter" && maakWachtwoord()} placeholder="Herhaal wachtwoord" />
        </div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={maakWachtwoord} disabled={loading}>{loading ? "Opslaan..." : "Wachtwoord instellen →"}</button>
        <button style={{ ...g.btnG, width: "100%", marginTop: "10px" }} onClick={() => setStap("code")}>← Terug</button>
      </>)}

      {stap === "wachtwoord-in" && (<>
        <div style={g.fldGrp}>
          <label style={g.lbl}>Wachtwoord</label>
          <input style={g.inp} type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} onKeyDown={e => e.key === "Enter" && controleerWachtwoord()} placeholder="Jouw wachtwoord" autoFocus />
        </div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={controleerWachtwoord} disabled={loading}>{loading ? "Controleren..." : "Inloggen →"}</button>
        <button style={{ ...g.btnG, width: "100%", marginTop: "10px" }} onClick={() => setStap("code")}>← Terug</button>
      </>)}

      <p style={{ fontSize: "12px", color: "#ccc", marginTop: "28px", fontFamily: "'Inter', sans-serif", lineHeight: 1.7 }}>Toegangscode ontvangen na aankoop via www.carrieremoeder.com</p>
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
  const [uploadingImg, setUploadingImg] = useState(false);
  const [pendingImg, setPendingImg] = useState(null);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Load conversations from Supabase
  useEffect(() => {
    if (!loggedIn || !userCode) return;
    sb.get("chat", userCode).then(data => {
      if (data && Array.isArray(data)) {
        setConversations(data);
        if (data.length > 0) {
          setActiveId(data[0].id);
          setHistory(data[0].messages || []);
        }
      }
    });
  }, [loggedIn, userCode]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  function saveConversations(convs) {
    setConversations(convs);
    sb.set("chat", userCode, convs);
  }

  function newConversation() {
    const id = Date.now();
    const conv = { id, title: "Nieuw gesprek", date: new Date().toLocaleDateString("nl-NL"), messages: [] };
    const updated = [conv, ...conversations];
    saveConversations(updated);
    setActiveId(id);
    setHistory([]);
    setPendingImg(null);
  }

  function loadConversation(conv) {
    setActiveId(conv.id);
    setHistory(conv.messages || []);
    setPendingImg(null);
  }

  function updateCurrentConversation(msgs) {
    const updated = conversations.map(c => {
      if (c.id !== activeId) return c;
      const firstUserMsg = msgs.find(m => m.role === "user");
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 45) + (firstUserMsg.content.length > 45 ? "..." : "") : "Gesprek";
      return { ...c, messages: msgs, title };
    });
    saveConversations(updated);
  }

  async function handleImageUpload(file) {
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

    // Create conversation if none active
    if (!activeId) {
      const id = Date.now();
      const conv = { id, title: "Nieuw gesprek", date: new Date().toLocaleDateString("nl-NL"), messages: [] };
      const updated = [conv, ...conversations];
      saveConversations(updated);
      setActiveId(id);
    }

    setInput("");
    if (taRef.current) taRef.current.style.height = "46px";

    // Build user message content
    let userContent;
    let displayContent;
    if (pendingImg) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: pendingImg.type, data: pendingImg.base64 } },
        { type: "text", text: msg || "Analyseer dit bericht/screenshot." }
      ];
      displayContent = { text: msg || "Analyseer dit bericht/screenshot.", image: pendingImg.preview };
    } else {
      userContent = msg;
      displayContent = msg;
    }

    const userMsg = { role: "user", content: userContent, display: displayContent };
    const nh = [...history, userMsg];
    setHistory(nh);
    setPendingImg(null);
    setLoading(true);

    try {
      // Build clean messages for API (no display field)
      const apiMessages = nh.map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const d = await res.json();
      const reply = d.content?.[0]?.text || "Er ging iets mis. Probeer opnieuw.";
      const newHistory = [...nh, { role: "assistant", content: reply }];
      setHistory(newHistory);
      updateCurrentConversation(newHistory);
    } catch {
      const newHistory = [...nh, { role: "assistant", content: "Er ging iets mis. Controleer je verbinding en probeer opnieuw." }];
      setHistory(newHistory);
    }
    setLoading(false);
  }

  function logout() {
    setLoggedIn(false);
    setUserCode("");
    store.set("bot_user_code", "");
    setHistory([]);
    setConversations([]);
    setActiveId(null);
  }

  function renderMessage(m, i) {
    const display = m.display || m.content;
    const isUser = m.role === "user";
    const text = typeof display === "string" ? display : display?.text || "";
    const image = display?.image;

    return (
      <div key={i} style={g.bubble(m.role)}>
        <div style={g.bLbl}>{isUser ? "Jij" : "Always In Control Bot"}</div>
        <div style={g.bBody(m.role)}>
          {image && <img src={image} alt="bijlage" style={g.uploadedImg} />}
          {isUser
            ? <span>{text}</span>
            : <span dangerouslySetInnerHTML={{ __html: md(typeof m.content === "string" ? m.content : text) }} />
          }
        </div>
      </div>
    );
  }

  const quick = [
    "Mijn ex stuurde dit bericht — wat doe ik?",
    "Ik wil een grens stellen maar weet niet hoe",
    "Mijn ex reageert niet op mijn berichten",
    "Ik raak steeds getriggerd door dezelfde situatie",
  ];

  if (!loggedIn) {
    return (
      <div style={g.page}>
        <style>{`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500;600;700&display=swap");@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}button:hover{opacity:.82}input:focus,textarea:focus{border-color:#B8735A!important}*{box-sizing:border-box}`}</style>
        <div style={g.hdr}>
          <div><span style={g.brand}>Carrièremoeder</span><span style={g.sub}>Always In Control Bot</span></div>
        </div>
        <Login onLogin={(code) => { setLoggedIn(true); setUserCode(code); store.set("bot_user_code", code); }} />
      </div>
    );
  }

  return (
    <div style={g.page}>
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500;600;700&display=swap");@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}button:hover{opacity:.82}input:focus,textarea:focus,select:focus{border-color:#B8735A!important}*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ddd}`}</style>
      <div style={g.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={g.brand}>Carrièremoeder</span><span style={g.sub}>Always In Control Bot</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={g.ghostBtn} onClick={newConversation}>+ Nieuw gesprek</button>
          <button style={g.ghostBtn} onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div style={g.layout}>
        {/* Sidebar */}
        <div style={g.sidebar}>
          <div style={g.sideSecLabel}>Gesprekken</div>
          {conversations.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: "12px", color: "#B8A89E", fontFamily: "'Inter', sans-serif" }}>Nog geen gesprekken</div>
          )}
          {conversations.map(conv => (
            <div key={conv.id} style={g.convItem(conv.id === activeId)} onClick={() => loadConversation(conv)}>
              <div style={g.convTitle(conv.id === activeId)}>{conv.title}</div>
              <div style={g.convDate(conv.id === activeId)}>{conv.date}</div>
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={g.mainArea}>
          <div style={g.chatWrap}>
            <div style={g.msgs}>
              {history.length === 0 && (
                <div style={g.emptyWrap}>
                  <h2 style={g.emptyH}>Wat speelt er vandaag?</h2>
                  <p style={g.emptyP}>Plak het bericht van je ex, upload een screenshot of beschrijf een situatie. Ik help je rustig en met regie reageren.</p>
                  <div style={g.quickBtns}>
                    {quick.map(q => <button key={q} style={g.quickBtn} onClick={() => setInput(q)}>{q}</button>)}
                  </div>
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

            <div style={g.inputBar}>
              {pendingImg && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", padding: "8px 12px", background: "#F8F6F4", border: "1px solid #E0D8D4" }}>
                  <img src={pendingImg.preview} alt="" style={{ maxWidth: "60px", maxHeight: "40px", border: "1px solid #eee" }} />
                  <span style={{ fontSize: "12px", fontFamily: "'Inter', sans-serif", color: "#5A4840", flex: 1 }}>{pendingImg.name}</span>
                  <button onClick={() => setPendingImg(null)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "16px" }}>×</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImageUpload(e.target.files[0])} />
              <div style={g.inputRow}>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingImg}
                  style={{ padding: "11px 12px", background: pendingImg ? "#1C1410" : "#fff", color: pendingImg ? "#fff" : "#aaa", border: "1.5px solid #ddd", fontSize: "16px", cursor: "pointer", flexShrink: 0 }}
                  title="Screenshot uploaden"
                >
                  {uploadingImg ? "..." : "📎"}
                </button>
                <textarea
                  ref={taRef}
                  style={g.chatTa}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 130) + "px"; }
                  }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Plak hier het bericht van je ex, of beschrijf de situatie... (📎 voor screenshot)"
                  rows={1}
                />
                <button style={g.sendBtn(loading || (!input.trim() && !pendingImg))} onClick={send} disabled={loading || (!input.trim() && !pendingImg)}>→</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "7px" }}>
                <span style={{ fontSize: "10px", color: "#ccc", fontFamily: "'Inter', sans-serif" }}>Shift+Enter voor nieuwe regel · 📎 voor screenshot</span>
                <span style={{ fontSize: "10px", color: "#ccc", fontFamily: "'Inter', sans-serif" }}>⚠ Deel geen persoonsgegevens</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

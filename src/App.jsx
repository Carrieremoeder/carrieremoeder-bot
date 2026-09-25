import { readCoachReply } from "../lib/coachStream.js";
import * as K from "./designTokens.js";
import { brandLogo } from "./brandLogo.js";
import { useState, useEffect, useRef } from "react";

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...options });
  const data = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
  return data;
}

function md(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^\s*---+\s*$/gm, "")
    .trim().split(/\n\s*\n/)
    .map(part => '<div class="reply-paragraph">' + part
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^#{1,3} (.+)$/gm, '<strong class="reply-heading">$1</strong>')
      .replace(/\n/g, "<br/>") + '</div>')
    .join("");
}

const C = {
  bg: K.kleur.pagina, white: K.kleur.kaart, dark: K.kleur.tekst,
  terra: K.kleur.accentSteun, border: K.kleur.rand, muted: K.kleur.tekstMeta,
  light: K.kleur.vlakAccent, sidebar: K.kleur.paginaZacht,
};
const g = {
  page: { fontFamily: K.font.sans, background: C.bg, height: "100dvh", minHeight: "100dvh", color: C.dark, fontSize: "14px", display: "flex", flexDirection: "column", overflow: "hidden" },
  hdr: { borderBottom: `1px solid ${K.kleur.randStructuur}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 12px", background: C.bg, flexShrink: 0, zIndex: 30 },
  hdrLeft: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  brand: { ...K.label, letterSpacing: "0.22em", color: C.dark },
  sub: { ...K.labelKlein, fontSize: "10.5px", fontWeight: "400", letterSpacing: "0.14em", textTransform: "none", whiteSpace: "nowrap" },
  hdrDivider: { width: "1px", height: "26px", background: K.kleur.randStructuur, margin: "0 4px", flexShrink: 0 },
  ghostBtn: { ...K.secundaireKnop, fontSize: "10px", padding: "9px 14px", minHeight: "36px" },
  loginWrap: { width: "100%", maxWidth: "420px", margin: "72px auto", padding: "0 24px" },
  loginH: { ...K.serifKop("36px"), margin: "0 0 10px" },
  loginP: { fontSize: "14px", color: K.kleur.tekstZacht, marginBottom: "36px", lineHeight: 1.75 },
  lbl: { ...K.label, display: "block", marginBottom: "8px" },
  inp: { width: "100%", padding: "12px 14px", fontSize: "14px", border: `1px solid ${K.kleur.randVeld}`, borderRadius: 0, fontFamily: K.font.sans, background: C.white, color: C.dark },
  btnP: K.actieKnop, btnG: K.secundaireKnop,
  err: { fontSize: "13px", color: K.kleur.gevaar, marginTop: "10px", lineHeight: 1.6 },
  fldGrp: { marginBottom: "16px" },
  layout: { display: "flex", flex: "1 1 auto", minHeight: 0, position: "relative", overflow: "hidden" },
  sidebar: { width: "240px", minWidth: "240px", borderRight: `1px solid ${K.kleur.randStructuur}`, display: "flex", flexDirection: "column", background: C.sidebar, overflowY: "auto", flexShrink: 0 },
  sideHeader: { ...K.labelKlein, letterSpacing: "0.2em", padding: "20px 16px 8px" },
  newBtn: { ...K.actieKnop, margin: "20px 16px 4px" },
  convItem: active => ({ padding: "12px 16px", background: active ? C.light : "transparent", borderLeft: active ? `3px solid ${K.kleur.accent}` : "3px solid transparent" }),
  convTitle: active => ({ display: "block", width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", fontFamily: K.font.sans, fontSize: "12px", color: active ? K.kleur.accentDiep : K.kleur.tekstZacht, lineHeight: 1.5, fontWeight: active ? "600" : "400", overflowWrap: "anywhere" }),
  convDate: { fontSize: "10px", color: C.muted, marginTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  mainArea: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
  msgs: { padding: "32px", maxWidth: "860px", width: "100%", margin: "0 auto" },
  bubble: role => ({ marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: role === "user" ? "flex-end" : "flex-start" }),
  bLbl: { ...K.labelKlein, marginBottom: "5px" },
  bBody: role => ({ maxWidth: role === "assistant" ? "100%" : "85%", padding: "12px 16px", background: role === "user" ? K.kleur.accentVlakLicht : C.white, color: C.dark, fontSize: "14px", lineHeight: 1.55, border: `1px solid ${role === "user" ? K.kleur.accentRandZacht : C.border}`, borderLeft: role === "assistant" ? `2px solid ${K.kleur.accentSteun}` : undefined, overflowWrap: "anywhere" }),
  inputBar: { padding: "18px 32px 16px", maxWidth: "860px", width: "100%", margin: "0 auto" },
  inputBarOuter: { borderTop: `1px solid ${K.kleur.randStructuur}`, background: C.bg, flexShrink: 0 },
  inputRow: { display: "flex", gap: "8px", alignItems: "flex-end" },
  chatTa: { flex: 1, minWidth: 0, padding: "12px 14px", fontSize: "14px", border: `1px solid ${K.kleur.randVeld}`, borderRadius: 0, fontFamily: K.font.sans, resize: "none", lineHeight: 1.6, minHeight: "46px", maxHeight: "120px", color: C.dark, background: C.white },
  sendBtn: disabled => ({ ...K.actieKnop, padding: "10px 16px", minHeight: "46px", fontSize: "18px", opacity: disabled ? 0.45 : 1 }),
  attachBtn: active => ({ ...K.secundaireKnop, padding: "10px 12px", minHeight: "46px", fontSize: "18px", background: active ? C.light : "transparent" }),
  dot: delay => ({ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: C.terra, margin: "0 2px", animation: "bounce 1.2s ease-in-out infinite", animationDelay: delay }),
  emptyWrap: { padding: "0 0 20px", maxWidth: "740px", margin: "0 auto" },
  emptyH: { ...K.serifKop("40px"), margin: "0 0 12px" },
  emptyP: { fontSize: "14px", color: K.kleur.tekstZacht, lineHeight: 1.65, margin: 0, maxWidth: "540px" },
};
function BrandHeader({ loggedIn = false, loading = false, sidebarOpen, onMenu, onLogout }) {
  return <header style={g.hdr} className="hdr-bar">
    <div style={g.hdrLeft} className="hdr-brand">
      {loggedIn && <button type="button" style={K.icoonKnop} onClick={onMenu} aria-label="Gesprekkenmenu" aria-expanded={sidebarOpen} aria-controls="gesprekkenmenu">☰</button>}
      <img src={brandLogo} alt="CARRIEREMOEDER" className="brand-logo" style={{ height: "36px", width: "auto", display: "block", flexShrink: 0 }} />
      <span style={g.hdrDivider} className="hdr-divider" />
      <span style={g.sub} className="hdr-sub">Always In Control Bot</span>
    </div>
    {loggedIn && <button style={g.ghostBtn} onClick={onLogout} disabled={loading}>Uitloggen</button>}
  </header>;
}

function Login({ onLogin }) {
  const [code, setCode] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [stap, setStap] = useState("code");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkCode() {
    setLoading(true); setErr("");
    try {
      const data = await api("session", { method: "POST", body: JSON.stringify({ action: "check", code }) });
      setStap(data.needsPassword ? "wachtwoord-in" : "wachtwoord-nieuw");
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }

  async function maakWachtwoord() {
    if (nieuwWachtwoord.length < 8) { setErr("Kies een wachtwoord van minimaal 8 tekens."); return; }
    if (nieuwWachtwoord !== bevestig) { setErr("Wachtwoorden komen niet overeen."); return; }
    setLoading(true); setErr("");
    try { await api("session", { method: "POST", body: JSON.stringify({ action: "register", code, password: nieuwWachtwoord }) }); onLogin(); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }

  async function controleerWachtwoord() {
    setLoading(true); setErr("");
    try { await api("session", { method: "POST", body: JSON.stringify({ action: "login", code, password: wachtwoord }) }); onLogin(); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <div style={g.loginWrap}>
      <h1 style={g.loginH}>Always In Control Bot</h1>
      <p style={g.loginP}>Jouw persoonlijke communicatiecoach bij elk bericht van je ex.</p>

      {stap === "code" && (<>
        <div style={g.fldGrp}><label style={g.lbl}>Toegangscode</label>
          <input style={g.inp} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && checkCode()} placeholder="Jouw toegangscode" autoFocus /></div>
        {err && <p style={g.err}>{err}</p>}
        <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={checkCode} disabled={loading}>{loading ? "Controleren..." : "Volgende →"}</button>
      </>)}

      {stap === "wachtwoord-nieuw" && (<>
        <div style={{ background: K.kleur.accentVlakLicht, border: `1px solid ${K.kleur.rand}`, padding: "12px 14px", marginBottom: "18px", fontSize: "13px", color: K.kleur.tekstZacht, lineHeight: 1.6, borderRadius: "6px" }}>
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

      <p style={{ fontSize: "12px", color: C.muted, marginTop: "28px", lineHeight: 1.7 }}>Toegangscode ontvangen na aankoop via www.carrieremoeder.com</p>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720);
  const [chatError, setChatError] = useState("");
  const [pendingImg, setPendingImg] = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api("session").then(() => setLoggedIn(true)).catch(() => {}).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    api("conversations").then(data => {
      if (Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (data.conversations.length) { setActiveId(data.conversations[0].id); setHistory(data.conversations[0].messages || []); }
      }
    }).catch(() => {});
  }, [loggedIn]);

  useEffect(() => {
    function escapeMenu(e) { if (e.key === "Escape") setSidebarOpen(false); }
    window.addEventListener("keydown", escapeMenu);
    return () => window.removeEventListener("keydown", escapeMenu);
  }, []);

  useEffect(() => {
    if (history.length) endRef.current?.scrollIntoView({ behavior: "smooth" });
    else scrollRef.current?.scrollTo({ top: 0 });
  }, [history, loading]);

  function saveConversations(convs) { setConversations(convs); api("conversations", { method: "PUT", body: JSON.stringify({ conversations: convs }) }).catch(() => { alert("Gesprek opslaan is niet gelukt. Kopieer belangrijke tekst voordat je de pagina sluit."); }); }

  function closeMobileMenu() { if (window.innerWidth <= 720) setSidebarOpen(false); }

  function newConversation() {
    if (loading) return;
    closeMobileMenu();
    const id = Date.now();
    const conv = { id, title: "Nieuw gesprek", date: new Date().toLocaleDateString("nl-NL"), messages: [] };
    const updated = [conv, ...conversations];
    saveConversations(updated); setActiveId(id); setHistory([]); setPendingImg(null);
  }

  function deleteConversation(id) {
    if (loading) return;
    if (!window.confirm("Dit gesprek definitief uit de actieve database verwijderen?")) return;
    const updated = conversations.filter(c => c.id !== id);
    saveConversations(updated);
    if (activeId === id) { setActiveId(updated[0]?.id || null); setHistory(updated[0]?.messages || []); }
  }

  function loadConversation(conv) { if (loading) return; closeMobileMenu(); setActiveId(conv.id); setHistory(conv.messages || []); setPendingImg(null); }

  function updateCurrentConversation(msgs, id, baseConversations = conversations) {
    const targetId = id || activeId;
    const updated = baseConversations.map(c => {
      if (c.id !== targetId) return c;
      const firstUser = msgs.find(m => m.role === "user");
      const rawText = firstUser ? (typeof firstUser.content === "string" ? firstUser.content : firstUser.display?.text || "Gesprek") : "Gesprek";
      return { ...c, messages: msgs, title: rawText.slice(0, 45) + (rawText.length > 45 ? "..." : "") };
    });
    saveConversations(updated);
  }

  function handleImageUpload(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4_000_000) { alert("Gebruik een JPG, PNG of WebP van maximaal 4 MB."); return; }
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

    setChatError("");
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
      const apiMessages = nh.slice(-30).map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: apiMessages, stream: true }) });
      const reply = await readCoachReply(res, text => {
        setHistory([...nh, { role: "assistant", content: text }]);
      });
      const newHistory = [...nh, { role: "assistant", content: reply }];
      setHistory(newHistory);
      updateCurrentConversation(newHistory, currentId, currentConvs);
    } catch (e) {
      setHistory(history);
      setInput(msg);
      if (pendingImg) setPendingImg(pendingImg);
      setChatError(e.message || "Er ging iets mis. Probeer opnieuw.");
    }
    setLoading(false);
  }

  function logout() { api("session", { method: "DELETE" }).catch(() => {}); setLoggedIn(false); setHistory([]); setConversations([]); setActiveId(null); }

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
          {isUser ? <span>{text}</span> : <div className="coach-answer" dangerouslySetInnerHTML={{ __html: md(typeof m.content === "string" ? m.content : text) }} />}
        </div>
      </div>
    );
  }

  const CSS = `@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@400;500;600;700&display=swap");
${K.TOKENS_CSS}
*{box-sizing:border-box}body{margin:0;background:var(--vlak-pagina)}
button,textarea,input{font:inherit}button:disabled{cursor:default;opacity:.5}
button:not(:disabled):hover{background:var(--accent-vlak)}
button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:var(--rand-structuur)}
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.reply-paragraph + .reply-paragraph{margin-top:7px}.reply-heading{display:inline-block;font-size:14px;line-height:1.5}.reply-paragraph:empty{display:none}
.menu-backdrop{display:none}
@media(max-width:720px){
.hdr-bar{padding:12px 14px!important}.hdr-brand{flex-wrap:wrap;gap:8px!important}
.hdr-sub{font-size:9px!important}.hdr-divider{display:none!important}
.brand-logo{height:32px!important}.hdr-bar>button{padding:8px!important;font-size:9px!important}
.chat-sidebar{position:absolute;inset:0 auto 0 0;z-index:20;width:min(280px,85vw)!important;min-width:0!important}
.menu-backdrop{display:block;position:absolute;inset:0;background:rgba(28,20,16,.22);border:0;z-index:19}
.chat-messages{padding:24px 18px!important}.welcome{padding:0 0 18px!important}
.welcome h2{font-size:34px!important}
.composer{padding:14px 14px max(14px,env(safe-area-inset-bottom))!important}.composer textarea{font-size:16px!important}
.composer-hints{flex-direction:column;gap:5px}.keyboard-hint{display:none}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

  if (checking) return <div style={g.page}><style>{CSS}</style><BrandHeader /><p role="status" style={{ padding: "24px", color: C.muted }}>Toegang controleren…</p></div>;
  if (!loggedIn) return (
    <div style={{ ...g.page, overflowY: "auto" }}>
      <style>{CSS}</style>
      <BrandHeader />
      <Login onLogin={() => setLoggedIn(true)} />
    </div>
  );

  return (
    <div style={g.page}>
      <style>{CSS}</style>
      <BrandHeader loggedIn loading={loading} sidebarOpen={sidebarOpen} onMenu={() => setSidebarOpen(open => !open)} onLogout={logout} />

      <div style={g.layout}>
        {sidebarOpen && <button className="menu-backdrop" aria-label="Gesprekkenmenu sluiten" onClick={() => setSidebarOpen(false)} />}
        {sidebarOpen && <aside id="gesprekkenmenu" aria-label="Gesprekken" className="chat-sidebar" style={g.sidebar}>
          <button style={g.newBtn} disabled={loading} onClick={newConversation}>+ Nieuw gesprek</button>
          <div style={g.sideHeader}>Gesprekken</div>
          {conversations.length === 0 && <div style={{ padding: "10px 16px", fontSize: "12px", color: C.muted }}>Nog geen gesprekken</div>}
          {conversations.map(conv => (
            <div key={conv.id} style={g.convItem(conv.id === activeId)}>
              <button disabled={loading} aria-current={conv.id === activeId ? "page" : undefined} style={g.convTitle(conv.id === activeId)} onClick={() => loadConversation(conv)}>{conv.title}</button>
              <div style={g.convDate}>{conv.date} <button type="button" disabled={loading} aria-label="Gesprek verwijderen" onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }} style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", float: "right" }}>Verwijder</button></div>
            </div>
          ))}
        </aside>}

        <main style={g.mainArea}>
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: history.length ? "block" : "none" }}>
            <div className="chat-messages" style={g.msgs}>
              {history.map((m, i) => renderMessage(m, i))}
              {loading && history[history.length - 1]?.role !== "assistant" && (
                <div style={g.bubble("assistant")}>
                  <div style={g.bLbl}>Always In Control Bot</div>
                  <div style={g.bBody("assistant")}><span style={g.dot("0s")} /><span style={g.dot("0.2s")} /><span style={g.dot("0.4s")} /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div style={{ ...g.inputBarOuter, ...(history.length === 0 ? { borderTop: "none", overflowY: "auto", flex: 1, paddingTop: "28px" } : {}) }}>
            <div className="composer" style={g.inputBar}>
              {history.length === 0 && <div className="welcome" style={g.emptyWrap}>
                <h2 style={g.emptyH}>Welk bericht wil je bespreken?</h2>
                <p style={g.emptyP}>Plak het bericht van je ex, voeg een screenshot toe of vertel wat er is gebeurd.</p>
              </div>}
              {pendingImg && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", padding: "8px 12px", background: C.light, borderRadius: "6px" }}>
                  <img src={pendingImg.preview} alt="" style={{ maxWidth: "50px", maxHeight: "34px", borderRadius: "3px" }} />
                  <span style={{ fontSize: "12px", color: K.kleur.tekstZacht, flex: 1 }}>{pendingImg.name}</span>
                  <button onClick={() => setPendingImg(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }}>×</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImageUpload(e.target.files[0])} />
              {chatError && <p role="alert" style={g.err}>{chatError} Je bericht staat nog klaar om opnieuw te versturen.</p>}
              <div style={g.inputRow}>
                <button onClick={() => fileRef.current?.click()} disabled={uploadingImg} style={g.attachBtn(!!pendingImg)} title="Screenshot uploaden">
                  {uploadingImg ? "…" : "📎"}
                </button>
                <textarea aria-label="Jouw bericht" ref={taRef} style={{ ...g.chatTa, ...(history.length === 0 ? { minHeight: "110px" } : {}) }} value={input}
                  onChange={e => { setInput(e.target.value); if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px"; } }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Plak hier het bericht van je ex, of beschrijf de situatie..." rows={1} />
                <button aria-label="Bericht versturen" style={g.sendBtn(loading || (!input.trim() && !pendingImg))} onClick={send} disabled={loading || (!input.trim() && !pendingImg)}>→</button>
              </div>
              <div className="composer-hints" style={{ display: "flex", justifyContent: "space-between", gap: "18px", marginTop: "10px", lineHeight: 1.6 }}>
                <span className="keyboard-hint" style={{ fontSize: "10px", color: C.muted }}>Shift+Enter voor nieuwe regel · 📎 voor screenshot</span>
                <span style={{ fontSize: "10px", color: C.muted }}>Maak namen en andere herkenbare details onleesbaar vóór je iets deelt</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

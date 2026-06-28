import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://yvdkzswqfwycpoifxdxd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2ZGt6c3dxZnd5Y3BvaWZ4ZHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzUxMTMsImV4cCI6MjA5ODE1MTExM30.usY5clEQYkauWBFrGmWbA6ppVi6_ranPOYmm-2W9qsc";

const store = {
  get: (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function md(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^#{1,3} (.+)$/gm, "<strong style='font-size:15px;display:block;margin-top:14px;margin-bottom:4px'>$1</strong>")
    .replace(/\n/g, "<br/>");
}

const g = {
  page: { fontFamily: "'Inter', 'Helvetica Neue', sans-serif", background: "#FAFAF8", minHeight: "100vh", color: "#1C1410", fontSize: "15px" },
  hdr: { borderBottom: "1.5px solid #E8E0D8", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, background: "#FAFAF8" },
  brand: { fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.22em", textTransform: "uppercase", color: "#1C1410" },
  sub: { fontSize: "11px", fontFamily: "'Inter', sans-serif", color: "#9A8880", letterSpacing: "0.06em", marginLeft: "10px" },
  ghostBtn: { fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "500", background: "none", border: "1px solid #C8B8B0", color: "#7A6860", cursor: "pointer", padding: "6px 12px", letterSpacing: "0.06em" },
  loginWrap: { maxWidth: "420px", margin: "60px auto", padding: "0 24px" },
  loginH: { fontSize: "34px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", marginBottom: "10px", color: "#1C1410", letterSpacing: "0.01em", lineHeight: 1.2 },
  loginP: { fontSize: "14px", color: "#5A4E48", fontFamily: "'Inter', sans-serif", marginBottom: "36px", lineHeight: 1.7 },
  lbl: { display: "block", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "8px", color: "#7A6860" },
  inp: { width: "100%", padding: "13px 16px", fontSize: "14px", border: "1.5px solid #E0D8D4", borderRadius: 0, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box", background: "#fff", color: "#1C1410" },
  btnP: { padding: "14px 28px", background: "#1C1410", color: "#FFFFFF", border: "none", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" },
  btnG: { padding: "12px 20px", background: "#FFFFFF", color: "#1C1410", border: "1.5px solid #C8B8B0", fontSize: "10px", fontFamily: "'Inter', sans-serif", fontWeight: "500", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" },
  err: { fontSize: "13px", color: "#B8735A", marginTop: "10px", fontFamily: "'Inter', sans-serif" },
  fldGrp: { marginBottom: "18px" },
  chatWrap: { display: "flex", flexDirection: "column", height: "calc(100vh - 57px)" },
  msgs: { flex: 1, overflowY: "auto", padding: "28px 24px", maxWidth: "760px", margin: "0 auto", width: "100%" },
  bubble: (r) => ({ marginBottom: "28px", display: "flex", flexDirection: "column", alignItems: r === "user" ? "flex-end" : "flex-start" }),
  bLbl: { fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.14em", textTransform: "uppercase", color: "#B8A89E", marginBottom: "6px" },
  bBody: (r) => ({
    maxWidth: r === "assistant" ? "100%" : "80%",
    padding: r === "user" ? "12px 16px" : "16px 20px",
    background: r === "user" ? "#1C1410" : "#FFFFFF",
    color: r === "user" ? "#FFFFFF" : "#1C1410",
    fontSize: "14px",
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    borderLeft: r === "assistant" ? "2px solid #B8735A" : "none",
    border: r === "user" ? "none" : "1px solid #EEE8E4",
    wordBreak: "break-word",
  }),
  inputBar: { borderTop: "1.5px solid #E8E0D8", padding: "14px 24px", background: "#FAFAF8" },
  inputInner: { maxWidth: "760px", margin: "0 auto" },
  inputRow: { display: "flex", gap: "10px", alignItems: "flex-end" },
  chatTa: { flex: 1, padding: "12px 16px", fontSize: "14px", border: "1.5px solid #E0D8D4", borderRadius: 0, fontFamily: "'Inter', sans-serif", resize: "none", outline: "none", lineHeight: 1.6, minHeight: "48px", maxHeight: "140px", boxSizing: "border-box", color: "#1C1410", background: "#fff" },
  sendBtn: (dis) => ({ padding: "12px 20px", background: dis ? "#C8B8B0" : "#1C1410", color: "#FFFFFF", border: "none", fontSize: "13px", cursor: dis ? "default" : "pointer", flexShrink: 0 }),
  dot: (d) => ({ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#B8735A", margin: "0 2px", animation: "bounce 1.2s ease-in-out infinite", animationDelay: d }),
  emptyWrap: { textAlign: "center", padding: "60px 24px", maxWidth: "560px", margin: "0 auto" },
  emptyH: { fontSize: "28px", fontWeight: "300", fontFamily: "'Cormorant Garamond', serif", color: "#1C1410", marginBottom: "12px" },
  emptyP: { fontSize: "14px", color: "#7A6860", fontFamily: "'Inter', sans-serif", lineHeight: 1.7, marginBottom: "32px" },
  quickBtns: { display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" },
  quickBtn: { fontSize: "12px", fontFamily: "'Inter', sans-serif", padding: "10px 18px", background: "#fff", border: "1.5px solid #E0D8D4", color: "#5A4840", cursor: "pointer", lineHeight: 1.5, textAlign: "left" },
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
    } catch {
      setErr("Er ging iets mis. Probeer opnieuw.");
    }
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
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500;600;700&display=swap");`}</style>
      <h1 style={g.loginH}>Always In Control Bot</h1>
      <p style={g.loginP}>Jouw persoonlijke communicatiecoach bij elk bericht van je ex. Altijd rustig. Altijd met regie.</p>

      {stap === "code" && (
        <>
          <div style={g.fldGrp}>
            <label style={g.lbl}>Toegangscode</label>
            <input style={g.inp} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && checkCode()} placeholder="Jouw toegangscode" autoFocus />
          </div>
          {err && <p style={g.err}>{err}</p>}
          <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={checkCode} disabled={loading}>{loading ? "Controleren..." : "Volgende →"}</button>
        </>
      )}

      {stap === "wachtwoord-nieuw" && (
        <>
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
        </>
      )}

      {stap === "wachtwoord-in" && (
        <>
          <div style={g.fldGrp}>
            <label style={g.lbl}>Wachtwoord</label>
            <input style={g.inp} type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} onKeyDown={e => e.key === "Enter" && controleerWachtwoord()} placeholder="Jouw wachtwoord" autoFocus />
          </div>
          {err && <p style={g.err}>{err}</p>}
          <button style={{ ...g.btnP, width: "100%", marginTop: "4px", opacity: loading ? 0.6 : 1 }} onClick={controleerWachtwoord} disabled={loading}>{loading ? "Controleren..." : "Inloggen →"}</button>
          <button style={{ ...g.btnG, width: "100%", marginTop: "10px" }} onClick={() => setStap("code")}>← Terug</button>
        </>
      )}

      <p style={{ fontSize: "12px", color: "#ccc", marginTop: "28px", fontFamily: "'Inter', sans-serif", lineHeight: 1.7 }}>Toegangscode ontvangen na aankoop via www.carrieremoeder.com</p>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!store.get("bot_user_code"));
  const [userCode, setUserCode] = useState(() => store.get("bot_user_code") || "");
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "48px";
    const nh = [...history, { role: "user", content: msg }];
    setHistory(nh);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nh.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await res.json();
      const reply = d.content?.[0]?.text || "Er ging iets mis. Probeer opnieuw.";
      setHistory([...nh, { role: "assistant", content: reply }]);
    } catch {
      setHistory([...nh, { role: "assistant", content: "Er ging iets mis. Controleer je verbinding en probeer opnieuw." }]);
    }
    setLoading(false);
  }

  function logout() {
    setLoggedIn(false);
    setUserCode("");
    store.set("bot_user_code", "");
    setHistory([]);
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
        <style>{`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500;600;700&display=swap");@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}*{box-sizing:border-box}button:hover{opacity:.85}input:focus,textarea:focus{border-color:#B8735A!important}`}</style>
        <div style={g.hdr}>
          <div><span style={g.brand}>Carrièremoeder</span><span style={g.sub}>always in control bot</span></div>
        </div>
        <Login onLogin={(code) => { setLoggedIn(true); setUserCode(code); store.set("bot_user_code", code); }} />
      </div>
    );
  }

  return (
    <div style={g.page}>
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500;600;700&display=swap");@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}*{box-sizing:border-box}button:hover{opacity:.85}input:focus,textarea:focus{border-color:#B8735A!important}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#E0D8D4}`}</style>
      <div style={g.hdr}>
        <div><span style={g.brand}>Carrièremoeder</span><span style={g.sub}>always in control bot</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {history.length > 0 && <button style={{ ...g.ghostBtn, fontSize: "10px" }} onClick={() => setHistory([])}>Nieuw gesprek</button>}
          <button style={g.ghostBtn} onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div style={g.chatWrap}>
        <div style={g.msgs}>
          {history.length === 0 && (
            <div style={g.emptyWrap}>
              <h2 style={g.emptyH}>Wat speelt er vandaag?</h2>
              <p style={g.emptyP}>Plak het bericht van je ex, beschrijf een situatie of stel een vraag. Ik help je rustig en met regie reageren.</p>
              <div style={g.quickBtns}>
                {quick.map(q => (
                  <button key={q} style={g.quickBtn} onClick={() => setInput(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {history.map((m, i) => (
            <div key={i} style={g.bubble(m.role)}>
              <div style={g.bLbl}>{m.role === "user" ? "Jij" : "Always In Control Bot"}</div>
              <div style={g.bBody(m.role)} dangerouslySetInnerHTML={m.role === "assistant" ? { __html: md(m.content) } : undefined}>
                {m.role === "user" ? m.content : undefined}
              </div>
            </div>
          ))}

          {loading && (
            <div style={g.bubble("assistant")}>
              <div style={g.bLbl}>Always In Control Bot</div>
              <div style={{ ...g.bBody("assistant"), padding: "16px 20px" }}>
                <span style={g.dot("0s")} /><span style={g.dot("0.2s")} /><span style={g.dot("0.4s")} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div style={g.inputBar}>
          <div style={g.inputInner}>
            <div style={g.inputRow}>
              <textarea
                ref={taRef}
                style={g.chatTa}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  if (taRef.current) {
                    taRef.current.style.height = "auto";
                    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + "px";
                  }
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Plak hier het bericht van je ex, of beschrijf de situatie..."
                rows={1}
              />
              <button style={g.sendBtn(loading || !input.trim())} onClick={send} disabled={loading || !input.trim()}>→</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
              <span style={{ fontSize: "10px", color: "#C8B8B0", fontFamily: "'Inter', sans-serif" }}>Shift+Enter voor nieuwe regel</span>
              <span style={{ fontSize: "10px", color: "#C8B8B0", fontFamily: "'Inter', sans-serif" }}>⚠ Deel geen persoonsgegevens</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

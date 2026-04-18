import { useState, useCallback } from "react";

const COLORS = ["#5DCAA5", "#378ADD", "#D4537E", "#EF9F27", "#7F77DD", "#D85A30"];
const DEFAULT_COLLABS = [
  { id: 1, role: "Designer",     share: "40", addr: "GDES...KQ7R", color: "#5DCAA5" },
  { id: 2, role: "Developer",    share: "30", addr: "GDEV...MN2X", color: "#378ADD" },
  { id: 3, role: "Copywriter",   share: "20", addr: "GCPY...VB9L", color: "#D4537E" },
  { id: 4, role: "Videographer", share: "10", addr: "GVID...PL3K", color: "#EF9F27" },
];

let nextId = 5;

// ─── Small reusable pieces ────────────────────────────────────────────────────

function CheckIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7l3.5 3.5 6-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12 20" fill="none" />
    </svg>
  );
}

function Avatar({ initials, color }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: color + "22", color, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: 11, fontWeight: 600,
    }}>
      {initials}
    </div>
  );
}

function StepBar({ current, done }) {
  const steps = ["Configure Split", "Client Pays", "Release Funds"];
  return (
    <div style={{
      display: "flex", gap: 0, marginBottom: "1.75rem",
      background: "#f5f5f3", borderRadius: 12, padding: 4,
      border: "0.5px solid #e0e0dc",
    }}>
      {steps.map((label, i) => {
        const isActive = i === current;
        const isDone = done > i;
        return (
          <div key={i} style={{
            flex: 1, padding: "8px 4px", borderRadius: 9, textAlign: "center",
            background: isActive ? "#fff" : "transparent",
            border: isActive ? "0.5px solid #ddd" : "0.5px solid transparent",
            boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.07)" : "none",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 10, marginBottom: 2, color: isDone ? "#00C9A7" : isActive ? "#666" : "#aaa", fontWeight: 500 }}>
              {isDone ? "✓ " : ""}STEP {i + 1}
            </div>
            <div style={{ fontSize: 13, color: isActive ? "#111" : isDone ? "#00C9A7" : "#999", fontWeight: isActive ? 500 : 400 }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e0e0dc", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "1.25rem 1.5rem 1rem", borderBottom: "0.5px solid #e0e0dc" }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: "#666" }}>{sub}</div>}
      </div>
      <div style={{ padding: "1.5rem" }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {label && <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>{label}</label>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, mono, placeholder, readOnly, style: extra }) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        width: "100%", fontSize: mono ? 12 : 14, padding: "8px 12px",
        borderRadius: 8, border: "0.5px solid #ccc", outline: "none",
        fontFamily: mono ? "monospace" : "inherit", background: readOnly ? "#fafaf8" : "#fff",
        color: readOnly ? "#888" : "#111", boxSizing: "border-box",
        ...extra,
      }}
    />
  );
}

function Btn({ children, onClick, primary, disabled, style: extra }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 7, padding: "9px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
        border: primary ? "none" : "0.5px solid #ccc",
        background: primary ? "#00C9A7" : "#f5f5f3",
        color: primary ? "#fff" : "#333",
        opacity: disabled ? 0.45 : 1,
        transition: "all 0.15s",
        ...extra,
      }}
    >
      {children}
    </button>
  );
}

function ActionRow({ children }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "0.5px solid #e8e8e4",
    }}>
      {children}
    </div>
  );
}

// ─── Step 1: Configure ────────────────────────────────────────────────────────

function ConfigureStep({ collabs, setCollabs, projectName, setProjectName, coordAddr, setCoordAddr, onNext }) {
  const total = collabs.reduce((s, c) => s + (parseFloat(c.share) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.001;

  const updateField = useCallback((id, key, val) => {
    setCollabs(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  }, [setCollabs]);

  const addCollab = () => {
    if (collabs.length >= 10) return;
    const idx = collabs.length % COLORS.length;
    setCollabs(prev => [...prev, { id: nextId++, role: "Collaborator", share: "0", addr: "G...", color: COLORS[idx] }]);
  };

  const removeCollab = (id) => {
    if (collabs.length <= 1) return;
    setCollabs(prev => prev.filter(c => c.id !== id));
  };

  return (
    <Panel title="Configure your payment split" sub="Add collaborators, assign wallet addresses, and set percentage splits.">
      <Field label="Project name">
        <TextInput value={projectName} onChange={e => setProjectName(e.target.value)} />
      </Field>
      <Field label="Coordinator wallet (your Stellar address)">
        <TextInput value={coordAddr} onChange={e => setCoordAddr(e.target.value)} mono />
      </Field>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: "1.25rem" }}>
        <label style={{ fontSize: 13, color: "#555" }}>Collaborators</label>
        <span style={{ fontSize: 12, color: "#aaa" }}>{collabs.length} of 10</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
        {collabs.map((c) => (
          <CollabCard
            key={c.id}
            collab={c}
            onUpdate={(key, val) => updateField(c.id, key, val)}
            onRemove={() => removeCollab(c.id)}
            canRemove={collabs.length > 1}
          />
        ))}
      </div>

      {collabs.length < 10 && (
        <button onClick={addCollab} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", padding: 10, border: "0.5px dashed #ccc", borderRadius: 8,
          background: "none", color: "#888", fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", transition: "all 0.15s", marginBottom: 12,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add collaborator
        </button>
      )}

      <TotalBar total={total} totalOk={totalOk} />

      <ActionRow>
        <span style={{ fontSize: 12, color: "#888" }}>Contract will deploy to Stellar Testnet</span>
        <Btn primary disabled={!totalOk} onClick={onNext}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1l1.4 4.1H12L8.8 7.8l1.2 4.2-3.5-2.4-3.5 2.4 1.2-4.2L1 5.1h4.1L6.5 1z" fill="currentColor" />
          </svg>
          Deploy Contract
        </Btn>
      </ActionRow>
    </Panel>
  );
}

function CollabCard({ collab, onUpdate, onRemove, canRemove }) {
  const shareNum = parseFloat(collab.share) || 0;
  const shareValid = shareNum >= 0 && shareNum <= 100;

  return (
    <div style={{
      background: "#fafaf8", border: "0.5px solid #e8e8e4", borderRadius: 10,
      padding: "1rem 1.1rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Avatar initials={collab.role.slice(0, 2).toUpperCase()} color={collab.color} />
        <input
          type="text"
          value={collab.role}
          onChange={e => onUpdate("role", e.target.value)}
          style={{
            flex: 1, fontSize: 13, fontWeight: 600, border: "none", background: "transparent",
            padding: 0, outline: "none", color: "#111", fontFamily: "inherit",
          }}
        />
        {canRemove && (
          <button onClick={onRemove} style={{
            background: "none", border: "none", cursor: "pointer", color: "#bbb",
            fontSize: 20, lineHeight: 1, padding: "0 4px", fontFamily: "inherit",
          }}>×</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Wallet address</label>
          <input
            type="text"
            value={collab.addr}
            onChange={e => onUpdate("addr", e.target.value)}
            placeholder="G..."
            style={{
              width: "100%", fontSize: 11, padding: "6px 10px", borderRadius: 6,
              border: "0.5px solid #ddd", fontFamily: "monospace", background: "#fff",
              color: "#555", boxSizing: "border-box", outline: "none",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textAlign: "right" }}>Share %</label>
          <div style={{ position: "relative", width: 80 }}>
            <input
              type="number"
              value={collab.share}
              onChange={e => onUpdate("share", e.target.value)}
              min="0" max="100" step="0.5"
              style={{
                width: "100%", fontSize: 18, fontWeight: 700, padding: "5px 28px 5px 10px",
                borderRadius: 7, border: `1.5px solid ${shareValid ? collab.color + "88" : "#e74c3c"}`,
                color: shareValid ? collab.color : "#e74c3c", textAlign: "right",
                background: shareValid ? collab.color + "0d" : "#fff0ee",
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                appearance: "textfield", MozAppearance: "textfield",
              }}
            />
            <span style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              fontSize: 13, fontWeight: 600, color: shareValid ? collab.color : "#e74c3c",
              pointerEvents: "none",
            }}>%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalBar({ total, totalOk }) {
  const off = (total - 100).toFixed(1);
  return (
    <div style={{
      background: totalOk ? "#00C9A711" : "#fdf2f2",
      border: `0.5px solid ${totalOk ? "#00C9A744" : "#f5c6c6"}`,
      borderRadius: 9, padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: "all 0.25s",
    }}>
      <div>
        <div style={{ fontSize: 13, color: "#555" }}>Total allocated</div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
          {totalOk ? "Ready to deploy" : total > 100 ? `Over by ${Math.abs(off)}%` : `${Math.abs(off)}% unallocated`}
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: totalOk ? "#00C9A7" : "#e74c3c", transition: "color 0.2s" }}>
        {total.toFixed(total % 1 === 0 ? 0 : 1)}%
      </div>
    </div>
  );
}

// ─── Step 2: Client Pays ──────────────────────────────────────────────────────

function ClientPaysStep({ collabs, invoiceAmt, setInvoiceAmt, onBack, onNext }) {
  const [loading, setLoading] = useState(false);

  const handlePay = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onNext(); }, 1800);
  };

  const amt = parseFloat(invoiceAmt) || 0;

  return (
    <Panel title="Share payment link with client" sub="The client deposits USDC directly into the smart contract. No middleman.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { val: collabs.length, lbl: "Collaborators" },
          { val: "USDC", lbl: "Settlement token" },
          { val: "< 5s", lbl: "Finality" },
        ].map(({ val, lbl }) => (
          <div key={lbl} style={{ background: "#f5f5f3", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#00C9A7" }}>{val}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      <Field label="Invoice amount (USDC)">
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, color: "#888", pointerEvents: "none",
          }}>USDC&nbsp;$</span>
          <input
            type="number"
            value={invoiceAmt}
            onChange={e => setInvoiceAmt(e.target.value)}
            min="1" step="1"
            style={{
              width: "100%", fontSize: 16, padding: "8px 12px 8px 72px",
              borderRadius: 8, border: "0.5px solid #ccc", outline: "none",
              fontFamily: "inherit", boxSizing: "border-box",
              appearance: "textfield", MozAppearance: "textfield",
            }}
          />
        </div>
      </Field>

      <div style={{ background: "#f9f9f7", border: "0.5px solid #e8e8e4", borderRadius: 10, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 10, letterSpacing: "0.04em" }}>SPLIT PREVIEW</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {collabs.map(c => {
            const share = (c.share / 100) * amt;
            const pct = parseFloat(c.share) || 0;
            return (
              <div key={c.id}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{c.role}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#999" }}>{pct}%</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>${share.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ height: 3, background: "#eee", borderRadius: 2 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Contract address">
        <TextInput value="CSPLIT7K3XPQR...MNBA92" readOnly mono />
      </Field>

      <ActionRow>
        <Btn onClick={onBack}>← Back</Btn>
        <Btn primary onClick={handlePay} disabled={loading || amt <= 0}>
          {loading ? <><SpinnerIcon /> Processing…</> : "Simulate Client Payment"}
        </Btn>
      </ActionRow>
    </Panel>
  );
}

// ─── Step 3: Release ──────────────────────────────────────────────────────────

function ReleaseStep({ collabs, invoiceAmt, onReset }) {
  const [paidIds, setPaidIds] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [txHash] = useState(() => Math.random().toString(16).slice(2, 18).toUpperCase());
  const amt = parseFloat(invoiceAmt) || 0;

  const doRelease = () => {
    if (running || done) return;
    setRunning(true);
    collabs.forEach((c, i) => {
      setTimeout(() => {
        setPaidIds(prev => [...prev, c.id]);
        if (i === collabs.length - 1) {
          setTimeout(() => { setRunning(false); setDone(true); }, 300);
        }
      }, 450 + i * 380);
    });
  };

  return (
    <Panel title="Release funds to collaborators" sub="All collaborators receive their share simultaneously in one atomic transaction.">
      <div style={{ textAlign: "center", paddingTop: "0.5rem", paddingBottom: "1rem" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: done ? "#00C9A722" : "#f5f5f3",
          border: `1.5px solid ${done ? "#00C9A766" : "#ddd"}`,
          margin: "0 auto 1rem", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.4s",
        }}>
          {done
            ? <CheckIcon size={28} color="#00C9A7" />
            : (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 4v12M9 11l5 5 5-5" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 20h16" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )
          }
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 5 }}>
          {done ? "Funds distributed!" : "Contract is funded"}
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: "1rem" }}>
          {done
            ? `$${amt.toFixed(2)} USDC sent to ${collabs.length} wallets in 4.1s`
            : `Ready to distribute $${amt.toFixed(2)} USDC to ${collabs.length} collaborators.`
          }
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#f5f5f3", border: "0.5px solid #e0e0dc",
          borderRadius: 20, padding: "5px 14px", fontSize: 12,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          CSPLIT7K3XPQR...MNBA92 · Testnet
        </div>

        {running && (
          <div style={{ height: 4, background: "#eee", borderRadius: 2, margin: "14px 0 0" }}>
            <div style={{
              height: "100%", borderRadius: 2, background: "#00C9A7",
              width: `${(paidIds.length / collabs.length) * 100}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {collabs.map(c => {
          const paid = paidIds.includes(c.id);
          const share = ((parseFloat(c.share) || 0) / 100 * amt);
          return (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: paid ? "#00C9A711" : "#f9f9f7",
              border: `0.5px solid ${paid ? "#00C9A744" : "#e8e8e4"}`,
              borderRadius: 9, padding: "10px 14px",
              transition: "all 0.35s",
            }}>
              <Avatar initials={c.role.slice(0, 2).toUpperCase()} color={c.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.role}</div>
                <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{c.addr}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#00C9A7" }}>
                +${share.toFixed(2)}
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", background: "#00C9A7",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: paid ? 1 : 0, transform: paid ? "scale(1)" : "scale(0.4)",
                transition: "all 0.3s",
              }}>
                <CheckIcon size={11} color="#fff" />
              </div>
            </div>
          );
        })}
      </div>

      {done && (
        <div style={{
          background: "#00C9A711", border: "0.5px solid #00C9A744", borderRadius: 9,
          padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, marginTop: "1rem",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: "#00C9A7",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <CheckIcon size={13} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#00C9A7" }}>
              ${amt.toFixed(2)} USDC distributed in 4.1 seconds across {collabs.length} wallets
            </div>
            <div style={{ fontSize: 11, color: "#999", fontFamily: "monospace", marginTop: 3 }}>
              tx: 0x{txHash}…
            </div>
          </div>
        </div>
      )}

      <ActionRow>
        <Btn onClick={onReset}>Start new project</Btn>
        <Btn primary onClick={doRelease} disabled={running || done}>
          {running
            ? <><SpinnerIcon /> Executing…</>
            : done
            ? <><CheckIcon size={13} color="#fff" /> Distributed!</>
            : <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M1 6.5l5.5 4.5 5.5-4.5M6.5 2v9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                release()
              </>
          }
        </Btn>
      </ActionRow>
    </Panel>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

export default function SplitWorkApp() {
  const [step, setStep] = useState(0);
  const [collabs, setCollabs] = useState(DEFAULT_COLLABS);
  const [projectName, setProjectName] = useState("Brew & Brand — Brand Identity Package");
  const [coordAddr, setCoordAddr] = useState("GCOOR...XY4P");
  const [invoiceAmt, setInvoiceAmt] = useState("500");
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => { setDeploying(false); setStep(1); }, 1600);
  };

  const reset = () => {
    setStep(0);
    setCollabs(DEFAULT_COLLABS);
    setInvoiceAmt("500");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f3", padding: "1.5rem 1rem 4rem", fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input:focus { border-color: #00C9A7 !important; box-shadow: 0 0 0 3px #00C9A722; }
      `}</style>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "2rem" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: "#00C9A7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="#fff" strokeWidth="1.5" />
              <path d="M6 10h8M11 7l3 3-3 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.3px", textAlign: "left" }}>SplitWork</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>Powered by Stellar Soroban</div>
          </div>
          <div style={{
            marginLeft: "auto", background: "#fff", border: "0.5px solid #e0e0dc",
            borderRadius: 20, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#666",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            Stellar Testnet
          </div>
        </div>

        <StepBar current={step} done={step} />

        {step === 0 && (
          <ConfigureStep
            collabs={collabs} setCollabs={setCollabs}
            projectName={projectName} setProjectName={setProjectName}
            coordAddr={coordAddr} setCoordAddr={setCoordAddr}
            onNext={handleDeploy}
            deploying={deploying}
          />
        )}
        {step === 1 && (
          <ClientPaysStep
            collabs={collabs}
            invoiceAmt={invoiceAmt} setInvoiceAmt={setInvoiceAmt}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <ReleaseStep
            collabs={collabs}
            invoiceAmt={invoiceAmt}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
// SplitWorkApp.jsx — connected to Stellar Testnet via Freighter + Soroban SDK
//
// Setup:
//   npm create vite@latest splitwork -- --template react
//   cd splitwork
//   npm install @stellar/stellar-sdk @stellar/freighter-api
//   Replace src/App.jsx content with this file, then: npm run dev
//
// Requirements:
//   - Freighter browser extension installed (freighter.app)
//   - A funded Testnet account with USDC trustline


console.log("APP LOADED");

import { useState, useEffect, useCallback } from "react";
import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  isConnected as freighterIsConnected,
  requestAccess,
  signTransaction,
  getAddress,
} from "@stellar/freighter-api";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT_ID        = "CC47MFMXFNPMQUCJHYJZK3S2YE3T5BGVFVVRDYEAK6YPT4HZAIQD353C";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL            = "https://soroban-testnet.stellar.org";
// Circle's USDC SAC on Stellar Testnet — swap if you minted your own test token
const USDC_CONTRACT_ID   = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const USDC_DECIMALS      = 7; // 1 USDC = 10_000_000 stroops

const toStroops   = (usd) => BigInt(Math.round(parseFloat(usd) * 10 ** USDC_DECIMALS));
const fromStroops = (s)   => (Number(s) / 10 ** USDC_DECIMALS).toFixed(2);

const server = new SorobanServer(RPC_URL);
const contract = new Contract(CONTRACT_ID);

// ─── Soroban helpers ──────────────────────────────────────────────────────────

async function waitForTx(hash, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await server.getTransaction(hash);
    if (res.status !== "NOT_FOUND") return res;
  }
  throw new Error(`Timed out waiting for tx ${hash}`);
}

// Build → prepareTransaction → sign with Freighter → sendTransaction → wait
async function invokeContract(operation, publicKey) {
  const account  = await server.getAccount(publicKey);
  const tx       = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);

  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const signed  = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const sendRes = await server.sendTransaction(signed);

  if (sendRes.status === "ERROR") {
    throw new Error("Submit failed: " + JSON.stringify(sendRes.errorResult));
  }

  const confirmed = await waitForTx(sendRes.hash);
  if (confirmed.status !== "SUCCESS") {
    throw new Error("Transaction failed with status: " + confirmed.status);
  }

  return { hash: sendRes.hash, returnValue: confirmed.returnValue };
}

// Simulate (read-only — no signing required)
async function simulateContract(operation, publicKey) {
  // Fall back to a known funded account for read-only calls if wallet not connected
  const addr    = publicKey || "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  const account = await server.getAccount(addr);
  const tx      = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  return server.simulateTransaction(tx);
}

// ─── useFreighter hook ────────────────────────────────────────────────────────

function useFreighter() {
  const [publicKey, setPublicKey] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const ok = await freighterIsConnected();
      if (!ok) throw new Error("Freighter not found — install it at freighter.app then reload");
      await requestAccess();
      const { address } = await getAddress();
      setPublicKey(address);
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, []);

  // Auto-reconnect on page load if Freighter already has permission
  useEffect(() => {
    freighterIsConnected().then(async (ok) => {
      if (!ok) return;
      try {
        const { address } = await getAddress();
        if (address) setPublicKey(address);
      } catch {}
    });
  }, []);

  return { publicKey, connecting, connect, error };
}

// ─── useContract hook ─────────────────────────────────────────────────────────

function useContract(publicKey) {
  const [balance, setBalance]         = useState(null);  // raw stroops
  const [initialized, setInitialized] = useState(null);  // null = unknown
  const [loading, setLoading]         = useState(false);
  const [txHash, setTxHash]           = useState(null);
  const [error, setError]             = useState(null);

  const run = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await simulateContract(contract.call("get_balance"), publicKey);
      if (SorobanRpc.Api.isSimulationSuccess(res) && res.result) {
        setBalance(scValToNative(res.result.retval));
        setInitialized(true);
      }
    } catch {
      setBalance(null);
    }
  }, [publicKey]);

  const checkInitialized = useCallback(async () => {
    try {
      const res = await simulateContract(contract.call("get_collaborators"), publicKey);
      setInitialized(SorobanRpc.Api.isSimulationSuccess(res));
    } catch {
      setInitialized(false);
    }
  }, [publicKey]);

  // initialize(coordinator, usdc_token, collaborators, shares)
  const initialize = useCallback((collabs) => run(async () => {
    if (!publicKey) throw new Error("Connect Freighter first");

    const addresses = collabs.map((c) => c.addr.trim());
    // Convert % to basis points: 40% → 4000 bp
    const shares    = collabs.map((c) => Math.round(parseFloat(c.share) * 100));

    const op = contract.call(
      "initialize",
      nativeToScVal(publicKey,        { type: "address" }),
      nativeToScVal(USDC_CONTRACT_ID, { type: "address" }),
      xdr.ScVal.scvVec(addresses.map((a) => nativeToScVal(a, { type: "address" }))),
      xdr.ScVal.scvVec(shares.map((s) => xdr.ScVal.scvU32(s))),
    );

    const { hash } = await invokeContract(op, publicKey);
    setTxHash(hash);
    setInitialized(true);
    return hash;
  }), [publicKey, run]);

  // deposit(from, amount) — payer sends USDC to the contract
  const deposit = useCallback((amtUsdc) => run(async () => {
    if (!publicKey) throw new Error("Connect Freighter first");

    const op = contract.call(
      "deposit",
      nativeToScVal(publicKey,           { type: "address" }),
      nativeToScVal(toStroops(amtUsdc),  { type: "i128"    }),
    );

    const { hash } = await invokeContract(op, publicKey);
    setTxHash(hash);
    await fetchBalance();
    return hash;
  }), [publicKey, run, fetchBalance]);

  // release() — coordinator only; atomically splits balance to all collaborators
  const release = useCallback(() => run(async () => {
    if (!publicKey) throw new Error("Connect Freighter first");

    const { hash } = await invokeContract(contract.call("release"), publicKey);
    setTxHash(hash);
    await fetchBalance();
    return hash;
  }), [publicKey, run, fetchBalance]);

  useEffect(() => {
    if (publicKey) {
      checkInitialized();
      fetchBalance();
    }
  }, [publicKey, checkInitialized, fetchBalance]);

  return {
    balance, initialized, loading, txHash, error,
    initialize, deposit, release, fetchBalance,
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const TEAL   = "#00C9A7";
const COLORS = ["#5DCAA5", "#378ADD", "#D4537E", "#EF9F27", "#7F77DD", "#D85A30"];
const C      = { bg: "#f5f5f3", card: "#fff", border: "#e0e0dc", muted: "#888", danger: "#e74c3c" };

// ─── Reusable primitives ──────────────────────────────────────────────────────

function Spinner({ color = "#fff" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5" stroke={color}
        strokeWidth="1.5" strokeDasharray="12 20" fill="none" />
    </svg>
  );
}

function Check({ size = 13, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <path d="M2 6.5l3.5 3.5 6-7" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ label, color }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: color + "22", color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 700,
    }}>
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, style: extra }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      gap: 7, padding: "9px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
      border: "none",
      background: primary ? TEAL : "#ebebea",
      color: primary ? "#fff" : "#333",
      opacity: disabled ? 0.45 : 1,
      transition: "opacity 0.15s",
      ...extra,
    }}>
      {children}
    </button>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div style={{
      background: C.card, border: `0.5px solid ${C.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ padding: "1.25rem 1.5rem 1rem", borderBottom: `0.5px solid ${C.border}` }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 3 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: C.muted }}>{sub}</div>}
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

function TextInput({ value, onChange, mono, placeholder, readOnly }) {
  return (
    <input type="text" value={value} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly}
      style={{
        width: "100%", fontSize: mono ? 12 : 14, padding: "8px 12px",
        borderRadius: 8, border: `0.5px solid ${C.border}`, outline: "none",
        fontFamily: mono ? "monospace" : "inherit",
        background: readOnly ? "#fafaf8" : "#fff",
        color: readOnly ? "#888" : "#111",
        boxSizing: "border-box",
      }}
    />
  );
}

function ActionRow({ children }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginTop: "1.5rem", paddingTop: "1.25rem",
      borderTop: `0.5px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

function TxBanner({ hash, error }) {
  if (!hash && !error) return null;
  return (
    <div style={{
      background: error ? "#fff0ee" : "#00C9A711",
      border: `0.5px solid ${error ? "#f5c6c6" : "#00C9A744"}`,
      borderRadius: 9, padding: "12px 16px", marginTop: "1rem",
    }}>
      {error
        ? <div style={{ fontSize: 13, color: C.danger }}><strong>Error:</strong> {error}</div>
        : <>
            <div style={{ fontSize: 13, color: TEAL, fontWeight: 700, marginBottom: 3 }}>
              Transaction confirmed ✓
            </div>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#555", fontFamily: "monospace", wordBreak: "break-all" }}
            >
              {hash} ↗
            </a>
          </>
      }
    </div>
  );
}

function StepBar({ current }) {
  const steps = ["Initialize Contract", "Fund Contract", "Release Funds"];
  return (
    <div style={{
      display: "flex", marginBottom: "1.75rem",
      background: "#f0f0ee", borderRadius: 12, padding: 4,
      border: `0.5px solid ${C.border}`,
    }}>
      {steps.map((label, i) => {
        const active = i === current;
        const done   = i < current;
        return (
          <div key={i} style={{
            flex: 1, padding: "8px 4px", borderRadius: 9, textAlign: "center",
            background: active ? "#fff" : "transparent",
            border: active ? `0.5px solid ${C.border}` : "0.5px solid transparent",
            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
          }}>
            <div style={{ fontSize: 10, marginBottom: 2, fontWeight: 600, color: done ? TEAL : active ? "#666" : "#bbb" }}>
              {done ? "✓ " : ""}STEP {i + 1}
            </div>
            <div style={{ fontSize: 13, color: active ? "#111" : done ? TEAL : "#bbb", fontWeight: active ? 600 : 400 }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WalletBar({ publicKey, connecting, connect, error }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: "1.75rem",
      background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12,
      padding: "12px 16px",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: publicKey ? "#22c55e" : "#f59e0b", flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, fontFamily: publicKey ? "monospace" : "inherit", color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {publicKey || error || "Freighter wallet not connected"}
      </div>
      {!publicKey && (
        <Btn primary onClick={connect} disabled={connecting} style={{ padding: "7px 16px", fontSize: 13, flexShrink: 0 }}>
          {connecting && <Spinner />}
          {connecting ? "Connecting…" : "Connect Freighter"}
        </Btn>
      )}
      {publicKey && (
        <span style={{ fontSize: 12, background: "#f0fdf8", color: TEAL, border: `0.5px solid ${TEAL}44`, borderRadius: 20, padding: "3px 10px", flexShrink: 0 }}>
          {publicKey.slice(0, 6)}…{publicKey.slice(-4)}
        </span>
      )}
    </div>
  );
}

// ─── Step 0 — Initialize ──────────────────────────────────────────────────────

let nextId = 5;
const DEFAULT_COLLABS = [
  { id: 1, role: "Designer",     share: "40", addr: "", color: COLORS[0] },
  { id: 2, role: "Developer",    share: "30", addr: "", color: COLORS[1] },
  { id: 3, role: "Copywriter",   share: "20", addr: "", color: COLORS[2] },
  { id: 4, role: "Videographer", share: "10", addr: "", color: COLORS[3] },
];

function CollabCard({ collab, onUpdate, onRemove, canRemove }) {
  const pct   = parseFloat(collab.share) || 0;
  const valid = pct >= 0 && pct <= 100;
  return (
    <div style={{ background: "#fafaf8", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "1rem 1.1rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Avatar label={collab.role} color={collab.color} />
        <input
          type="text" value={collab.role}
          onChange={(e) => onUpdate("role", e.target.value)}
          style={{ flex: 1, fontSize: 13, fontWeight: 700, border: "none", background: "transparent", padding: 0, outline: "none", color: "#111", fontFamily: "inherit" }}
        />
        {canRemove && (
          <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
        )}
      </div>

      {/* Address + share row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Stellar wallet (G… 56 chars)</label>
          <input
            type="text" value={collab.addr} placeholder="GABC...XYZ"
            onChange={(e) => onUpdate("addr", e.target.value)}
            style={{ width: "100%", fontSize: 11, padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontFamily: "monospace", background: "#fff", color: "#444", boxSizing: "border-box", outline: "none" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4, textAlign: "right" }}>Share</label>
          <div style={{ position: "relative" }}>
            <input
              type="number" value={collab.share} min="0" max="100" step="0.5"
              onChange={(e) => onUpdate("share", e.target.value)}
              style={{
                width: "100%", fontSize: 20, fontWeight: 700,
                padding: "5px 28px 5px 10px", borderRadius: 7,
                border: `1.5px solid ${valid ? collab.color + "99" : C.danger}`,
                color: valid ? collab.color : C.danger,
                background: valid ? collab.color + "0e" : "#fff0ee",
                textAlign: "right", outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
                appearance: "textfield", MozAppearance: "textfield",
              }}
            />
            <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: valid ? collab.color : C.danger, pointerEvents: "none" }}>%</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, textAlign: "right", marginTop: 3 }}>{Math.round(pct * 100)} bp</div>
        </div>
      </div>
    </div>
  );
}

function InitializeStep({ publicKey, contractState, onDone }) {
  const { initialize, loading, txHash, error } = contractState;
  const [collabs, setCollabs] = useState(DEFAULT_COLLABS);

  const total    = collabs.reduce((s, c) => s + (parseFloat(c.share) || 0), 0);
  const totalOk  = Math.abs(total - 100) < 0.001;
  const addrsOk  = collabs.every((c) => c.addr.trim().length >= 56 && c.addr.startsWith("G"));

  const update = (id, key, val) =>
    setCollabs((prev) => prev.map((c) => c.id === id ? { ...c, [key]: val } : c));
  const add    = () => {
    if (collabs.length >= 10) return;
    const idx = collabs.length % COLORS.length;
    setCollabs((prev) => [...prev, { id: nextId++, role: "Collaborator", share: "0", addr: "", color: COLORS[idx] }]);
  };
  const remove = (id) => {
    if (collabs.length <= 1) return;
    setCollabs((prev) => prev.filter((c) => c.id !== id));
  };

  const handleInit = async () => {
    const hash = await initialize(collabs);
    if (hash) onDone(collabs);
  };

  return (
    <Panel
      title="Initialize split contract"
      sub={`${CONTRACT_ID.slice(0, 10)}…${CONTRACT_ID.slice(-8)} · Testnet`}
    >
      <div style={{ background: "#fffbeb", border: "0.5px solid #fde68a", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#92400e", marginBottom: "1.25rem" }}>
        <strong>One-time setup.</strong> This calls <code>initialize()</code> on-chain and locks the coordinator + split percentages. Wallet addresses and shares cannot be changed after this.
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <label style={{ fontSize: 13, color: "#555" }}>Collaborators</label>
        <span style={{ fontSize: 12, color: C.muted }}>{collabs.length} / 10</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
        {collabs.map((c) => (
          <CollabCard key={c.id} collab={c}
            onUpdate={(k, v) => update(c.id, k, v)}
            onRemove={() => remove(c.id)}
            canRemove={collabs.length > 1}
          />
        ))}
      </div>

      {collabs.length < 10 && (
        <button onClick={add} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: 10, border: `0.5px dashed ${C.border}`, borderRadius: 8, background: "none", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
          + Add collaborator
        </button>
      )}

      {/* Total bar */}
      <div style={{ background: totalOk ? "#00C9A711" : "#fff0ee", border: `0.5px solid ${totalOk ? "#00C9A744" : "#f5c6c6"}`, borderRadius: 9, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}>
        <div>
          <div style={{ fontSize: 13, color: "#555" }}>Total allocated</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            {totalOk ? "10 000 bp — ready" : total > 100 ? `Over by ${(total - 100).toFixed(1)}%` : `${(100 - total).toFixed(1)}% unallocated`}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: totalOk ? TEAL : C.danger, transition: "color 0.2s" }}>
          {total.toFixed(total % 1 === 0 ? 0 : 1)}%
        </div>
      </div>

      <TxBanner hash={txHash} error={error} />

      <ActionRow>
        <div style={{ fontSize: 12, color: C.muted }}>
          You ({publicKey?.slice(0, 6)}…) will be the coordinator
        </div>
        <Btn primary onClick={handleInit} disabled={!publicKey || !totalOk || !addrsOk || loading}>
          {loading ? <><Spinner /> Calling initialize()…</> : "Initialize →"}
        </Btn>
      </ActionRow>
      {!addrsOk && publicKey && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6, textAlign: "right" }}>
          All collaborator wallet addresses must be valid (G… 56 chars)
        </div>
      )}
    </Panel>
  );
}

// ─── Step 1 — Fund ────────────────────────────────────────────────────────────

function FundStep({ collabs, publicKey, contractState, onNext }) {
  const { deposit, balance, loading, txHash, error, fetchBalance } = contractState;
  const [amt, setAmt] = useState("500");
  const balanceUsdc   = balance != null ? fromStroops(balance) : null;
  const hasFunds      = balance != null && balance > 0n;

  const handleDeposit = async () => {
    const hash = await deposit(amt);
    if (hash) onNext();
  };

  return (
    <Panel title="Fund the contract" sub="The client deposits USDC — or you can test it from your own wallet.">
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { val: balanceUsdc != null ? `$${balanceUsdc}` : "…", lbl: "Contract balance" },
          { val: collabs.length, lbl: "Collaborators" },
          { val: "< 5s", lbl: "Finality" },
        ].map(({ val, lbl }) => (
          <div key={lbl} style={{ background: "#f5f5f3", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEAL }}>{val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Split preview */}
      <div style={{ background: "#f9f9f7", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 10 }}>SPLIT PREVIEW</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {collabs.map((c) => {
            const pct   = parseFloat(c.share) || 0;
            const share = pct / 100 * (parseFloat(amt) || 0);
            return (
              <div key={c.id}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                    <span style={{ fontSize: 13 }}>{c.role}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{c.addr.slice(0, 4)}…{c.addr.slice(-4)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{pct}%</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>${share.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ height: 3, background: "#eee", borderRadius: 2 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Deposit amount (USDC)">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.muted, pointerEvents: "none" }}>USDC&nbsp;$</span>
          <input
            type="number" value={amt} onChange={(e) => setAmt(e.target.value)} min="1" step="1"
            style={{ width: "100%", fontSize: 16, padding: "8px 12px 8px 72px", borderRadius: 8, border: `0.5px solid ${C.border}`, outline: "none", fontFamily: "inherit", boxSizing: "border-box", appearance: "textfield", MozAppearance: "textfield" }}
          />
        </div>
      </Field>

      <Field label="Contract address">
        <TextInput value={CONTRACT_ID} readOnly mono />
      </Field>

      <div style={{ background: "#eff8ff", border: "0.5px solid #bfdbfe", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#1e3a5f" }}>
        The depositing wallet needs a <strong>USDC trustline</strong> and USDC balance on Testnet.
        Fund at{" "}
        <a href="https://laboratory.stellar.org" target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
          Stellar Laboratory ↗
        </a>
      </div>

      <TxBanner hash={txHash} error={error} />

      <ActionRow>
        <button onClick={fetchBalance} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: TEAL, fontFamily: "inherit" }}>
          ⟳ Refresh balance
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {hasFunds && (
            <Btn onClick={onNext} style={{ fontSize: 13 }}>
              Already funded →
            </Btn>
          )}
          <Btn primary onClick={handleDeposit} disabled={!publicKey || loading || parseFloat(amt) <= 0}>
            {loading ? <><Spinner /> Calling deposit()…</> : "Deposit USDC →"}
          </Btn>
        </div>
      </ActionRow>
    </Panel>
  );
}

// ─── Step 2 — Release ─────────────────────────────────────────────────────────

function ReleaseStep({ collabs, contractState, onReset }) {
  const { release, balance, loading, txHash, error, fetchBalance } = contractState;
  const [released, setReleased] = useState(false);
  const balanceUsdc = balance != null ? fromStroops(balance) : "0.00";

  const handleRelease = async () => {
    const hash = await release();
    if (hash) setReleased(true);
  };

  return (
    <Panel title="Release funds" sub="Calls release() — all collaborators paid in one atomic transaction.">
      {/* Status icon */}
      <div style={{ textAlign: "center", padding: "0.5rem 0 1.25rem" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", margin: "0 auto 1rem",
          background: released ? "#00C9A722" : "#f5f5f3",
          border: `1.5px solid ${released ? "#00C9A766" : "#ddd"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.4s",
        }}>
          {released
            ? <Check size={28} color={TEAL} />
            : <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 4v12M9 11l5 5 5-5" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 20h16" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
              </svg>
          }
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 5 }}>
          {released ? "Funds distributed on-chain!" : `$${balanceUsdc} USDC ready`}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: "1rem" }}>
          {released
            ? `$${balanceUsdc} sent to ${collabs.length} wallets`
            : `${collabs.length} collaborators will receive their cut simultaneously`}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f5f5f3", border: `0.5px solid ${C.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontFamily: "monospace" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          {CONTRACT_ID.slice(0, 10)}…{CONTRACT_ID.slice(-6)} · Testnet
        </div>
      </div>

      {/* Collaborator rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {collabs.map((c) => {
          const share = (parseFloat(c.share) || 0) / 100 * parseFloat(balanceUsdc);
          return (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: released ? "#00C9A711" : "#f9f9f7",
              border: `0.5px solid ${released ? "#00C9A744" : C.border}`,
              borderRadius: 9, padding: "10px 14px", transition: "all 0.4s",
            }}>
              <Avatar label={c.role} color={c.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.role}</div>
                <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
                  {c.addr.slice(0, 8)}…{c.addr.slice(-6)}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEAL }}>+${share.toFixed(2)}</div>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", background: TEAL,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: released ? 1 : 0, transform: released ? "scale(1)" : "scale(0.3)",
                transition: "all 0.4s",
              }}>
                <Check size={11} color="#fff" />
              </div>
            </div>
          );
        })}
      </div>

      <TxBanner hash={txHash} error={error} />

      <ActionRow>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={fetchBalance} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: TEAL, fontFamily: "inherit" }}>
            ⟳ Refresh
          </button>
          <button onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.muted, fontFamily: "inherit" }}>
            ← Back to fund
          </button>
        </div>
        <Btn primary onClick={handleRelease} disabled={loading || released || !balance || balance <= 0n}>
          {loading
            ? <><Spinner /> Executing release()…</>
            : released
            ? <><Check size={13} color="#fff" /> Distributed!</>
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function SplitWorkApp() {
  const freighter     = useFreighter();
  const contractState = useContract(freighter.publicKey);
  const { initialized } = contractState;

  const [step, setStep]       = useState(0);
  const [collabs, setCollabs] = useState(DEFAULT_COLLABS);

  // Auto-advance past step 0 if contract is already initialized on-chain
  useEffect(() => {
    if (initialized === true && step === 0) setStep(1);
  }, [initialized]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "1.5rem 1rem 4rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input:focus { border-color: ${TEAL} !important; box-shadow: 0 0 0 3px ${TEAL}22; }
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        a:hover { text-decoration: underline; }
        code { font-family: monospace; font-size: 0.9em; }
      `}</style>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>

        {/* Logo bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: TEAL, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="#fff" strokeWidth="1.5" />
              <path d="M6 10h8M11 7l3 3-3 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>SplitWork</div>
            <div style={{ fontSize: 11, color: C.muted }}>Stellar Testnet · {CONTRACT_ID.slice(0, 8)}…{CONTRACT_ID.slice(-6)}</div>
          </div>
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank" rel="noreferrer"
            style={{ marginLeft: "auto", fontSize: 12, color: TEAL, border: `0.5px solid ${TEAL}44`, borderRadius: 20, padding: "4px 12px", background: "#00C9A711" }}
          >
            View on Explorer ↗
          </a>
        </div>

        <WalletBar
          publicKey={freighter.publicKey}
          connecting={freighter.connecting}
          connect={freighter.connect}
          error={freighter.error}
        />

        {/* Contract status hint */}
        {freighter.publicKey && initialized === false && step === 0 && (
          <div style={{ background: "#eff8ff", border: "0.5px solid #bfdbfe", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#1e3a5f", marginBottom: "1.25rem" }}>
            Contract not yet initialized. Fill in collaborators below and call <code>initialize()</code>.
          </div>
        )}
        {freighter.publicKey && initialized === true && (
          <div style={{ background: "#f0fdf8", border: `0.5px solid ${TEAL}44`, borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#065f46", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Check size={13} color={TEAL} /> Contract already initialized on-chain.
          </div>
        )}

        <StepBar current={step} />

        {step === 0 && (
          <InitializeStep
            publicKey={freighter.publicKey}
            contractState={contractState}
            onDone={(c) => { setCollabs(c); setStep(1); }}
          />
        )}
        {step === 1 && (
          <FundStep
            collabs={collabs}
            publicKey={freighter.publicKey}
            contractState={contractState}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <ReleaseStep
            collabs={collabs}
            contractState={contractState}
            onReset={() => setStep(1)}
          />
        )}
      </div>
    </div>
  );
}

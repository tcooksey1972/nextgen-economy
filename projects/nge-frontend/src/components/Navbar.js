import React from "react";
import { NavLink } from "react-router-dom";
import { truncateAddress } from "../utils/config";

const navStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 32px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-card)",
};

const logoStyle = {
  fontSize: "18px",
  fontWeight: 700,
  color: "var(--text)",
  textDecoration: "none",
};

const linksStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const linkStyle = {
  color: "var(--text-muted)",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: "6px",
  transition: "all 0.2s",
};

const activeLinkStyle = {
  ...linkStyle,
  color: "var(--accent)",
  background: "rgba(59, 130, 246, 0.1)",
};

const dividerStyle = {
  width: "1px",
  height: "20px",
  background: "var(--border)",
  margin: "0 8px",
};

const walletStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const addressStyle = {
  fontFamily: '"SF Mono", "Fira Code", monospace',
  fontSize: "13px",
  color: "var(--text-muted)",
  background: "var(--bg)",
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid var(--border)",
};

const authBadgeStyle = {
  fontSize: "12px",
  color: "var(--text-muted)",
  background: "rgba(34, 197, 94, 0.1)",
  border: "1px solid rgba(34, 197, 94, 0.3)",
  padding: "4px 10px",
  borderRadius: "6px",
};

export default function Navbar({ account, chainId, isCorrectChain, onConnect, onDisconnect, onSwitchChain, auth }) {
  return (
    <nav style={navStyle}>
      <NavLink to="/" style={logoStyle}>
        NGE
      </NavLink>

      <div style={linksStyle}>
        {/* Marketing pages — always visible */}
        <NavLink
          to="/use-cases"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Use Cases
        </NavLink>
        <NavLink
          to="/about"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          About
        </NavLink>

        <NavLink
          to="/demo"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Demo
        </NavLink>
        <NavLink
          to="/assets"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Assets
        </NavLink>

        {/* Divider between marketing and app */}
        <div style={dividerStyle} />

        {/* App pages */}
        <NavLink
          to="/dashboard"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/token"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Token
        </NavLink>
        <NavLink
          to="/devices"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Devices
        </NavLink>
        <NavLink
          to="/onboard"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Onboard
        </NavLink>
        <NavLink
          to="/governance"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          Governance
        </NavLink>
      </div>

      <div style={walletStyle}>
        {/* Auth status */}
        {auth?.enabled && (
          auth.isAuthenticated ? (
            <>
              <span style={authBadgeStyle}>{auth.user.email}</span>
              <button className="btn-outline" onClick={auth.signOut} style={{ fontSize: "12px", padding: "6px 12px" }}>
                Sign Out
              </button>
            </>
          ) : (
            <NavLink to="/onboard">
              <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }}>
                Sign In
              </button>
            </NavLink>
          )
        )}

        {/* Wallet connection */}
        {account ? (
          <>
            {!isCorrectChain && (
              <button className="btn-outline" onClick={onSwitchChain} style={{ fontSize: "12px", padding: "6px 12px" }}>
                Wrong Network
              </button>
            )}
            <span style={addressStyle}>{truncateAddress(account)}</span>
            <button className="btn-outline" onClick={onDisconnect} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn-primary" onClick={onConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

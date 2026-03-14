import React from "react";
import { Routes, Route } from "react-router-dom";
import useWallet from "./hooks/useWallet";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Token from "./pages/Token";
import Devices from "./pages/Devices";
import Governance from "./pages/Governance";

const layoutStyle = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "32px",
};

export default function App() {
  const wallet = useWallet();

  return (
    <div>
      <Navbar
        account={wallet.account}
        chainId={wallet.chainId}
        isCorrectChain={wallet.isCorrectChain}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
        onSwitchChain={wallet.switchChain}
      />

      {wallet.error && (
        <div style={{ padding: "0 32px", maxWidth: "1200px", margin: "16px auto 0" }}>
          <div className="error-message">{wallet.error}</div>
        </div>
      )}

      <main style={layoutStyle}>
        <Routes>
          <Route path="/" element={<Dashboard wallet={wallet} />} />
          <Route path="/token" element={<Token wallet={wallet} />} />
          <Route path="/devices" element={<Devices wallet={wallet} />} />
          <Route path="/governance" element={<Governance wallet={wallet} />} />
        </Routes>
      </main>
    </div>
  );
}

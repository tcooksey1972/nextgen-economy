import React from "react";
import { Routes, Route } from "react-router-dom";
import useWallet from "./hooks/useWallet";
import useAuth from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import Landing from "./pages/Landing";
import UseCases from "./pages/UseCases";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import Token from "./pages/Token";
import Devices from "./pages/Devices";
import Governance from "./pages/Governance";
import Onboard from "./pages/Onboard";
import ColdChainDemo from "./pages/ColdChainDemo";
import Assets from "./pages/Assets";

const layoutStyle = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "32px",
};

export default function App() {
  const wallet = useWallet();
  const auth = useAuth();

  return (
    <div>
      <Navbar
        account={wallet.account}
        chainId={wallet.chainId}
        isCorrectChain={wallet.isCorrectChain}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
        onSwitchChain={wallet.switchChain}
        auth={auth}
      />

      {wallet.error && (
        <div style={{ padding: "0 32px", maxWidth: "1200px", margin: "16px auto 0" }}>
          <div className="error-message">{wallet.error}</div>
        </div>
      )}

      <main style={layoutStyle}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/use-cases" element={<UseCases />} />
          <Route path="/about" element={<About />} />
          <Route path="/dashboard" element={<Dashboard wallet={wallet} auth={auth} />} />
          <Route path="/token" element={<Token wallet={wallet} auth={auth} />} />
          <Route path="/devices" element={<Devices wallet={wallet} auth={auth} />} />
          <Route path="/governance" element={<Governance wallet={wallet} auth={auth} />} />
          <Route path="/onboard" element={<Onboard wallet={wallet} auth={auth} />} />
          <Route path="/demo" element={<ColdChainDemo wallet={wallet} />} />
          <Route path="/assets" element={<Assets wallet={wallet} />} />
        </Routes>
      </main>
    </div>
  );
}

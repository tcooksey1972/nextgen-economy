import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import config from "../utils/config";

/**
 * @hook useWallet
 * @description Manages MetaMask wallet connection, account state, and chain validation.
 *
 * Returns:
 *   - account: connected address or null
 *   - provider: ethers BrowserProvider
 *   - signer: ethers Signer (for write operations)
 *   - chainId: current chain ID
 *   - isCorrectChain: whether connected to the expected chain
 *   - connect(): request wallet connection
 *   - disconnect(): clear connection state
 *   - switchChain(): switch MetaMask to the expected chain
 *   - error: error message or null
 */
export default function useWallet() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);

  const isCorrectChain = chainId === config.chainId;

  const connect = useCallback(async () => {
    setError(null);

    if (!window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask to continue.");
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);

      if (accounts.length === 0) {
        setError("No accounts found. Please unlock MetaMask.");
        return;
      }

      const network = await browserProvider.getNetwork();
      const walletSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(walletSigner);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
    } catch (err) {
      if (err.code === 4001) {
        setError("Connection rejected. Please approve the connection in MetaMask.");
      } else {
        setError(err.message || "Failed to connect wallet.");
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
  }, []);

  const switchChain = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${config.chainId.toString(16)}` }],
      });
    } catch (err) {
      setError(`Failed to switch chain: ${err.message}`);
    }
  }, []);

  // Listen for account and chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0]);
      }
    };

    const handleChainChanged = (newChainId) => {
      setChainId(parseInt(newChainId, 16));
      // Refresh provider on chain change
      if (account) {
        connect();
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [account, connect, disconnect]);

  // Auto-connect if already authorized
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts.length > 0) {
            connect();
          }
        })
        .catch(() => {});
    }
  }, [connect]);

  return {
    account,
    provider,
    signer,
    chainId,
    isCorrectChain,
    connect,
    disconnect,
    switchChain,
    error,
  };
}

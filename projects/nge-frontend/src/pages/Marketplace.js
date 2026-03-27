import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { truncateAddress } from "../utils/config";
import MARKETPLACE_ABI from "../abi/SkillsMarketplace.json";

const LISTING_TYPES = ["Gig", "Contract", "Permanent"];
const ENGAGEMENT_STATUSES = ["Active", "Completed", "Disputed"];

/**
 * Marketplace page — Browse listings, engage workers, and manage reputation.
 *
 * Features: listing browser, create listing form, engage worker with escrow,
 * worker reputation display, and pending balance withdrawal.
 */
export default function Marketplace({ wallet }) {
  const [listings, setListings] = useState([]);
  const [listingCount, setListingCount] = useState(0);
  const [engagementCount, setEngagementCount] = useState(0);
  const [pendingBalance, setPendingBalance] = useState("0");
  const [workerRating, setWorkerRating] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  // Create listing form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [listingType, setListingType] = useState(0);

  // Engage form
  const [engageListingId, setEngageListingId] = useState("");
  const [engageAmount, setEngageAmount] = useState("");

  const getContract = useCallback(
    (useSigner = false) => {
      if (!config.contracts.marketplace) return null;
      const providerOrSigner = useSigner ? wallet.signer : wallet.provider;
      if (!providerOrSigner) return null;
      return new ethers.Contract(config.contracts.marketplace, MARKETPLACE_ABI, providerOrSigner);
    },
    [wallet.provider, wallet.signer]
  );

  const fetchData = useCallback(async () => {
    const contract = getContract();
    if (!contract) return;

    setLoading(true);
    try {
      const [lCount, eCount] = await Promise.all([
        contract.listingCount(),
        contract.engagementCount(),
      ]);
      setListingCount(Number(lCount));
      setEngagementCount(Number(eCount));

      // Fetch listings (up to 50)
      const limit = Math.min(Number(lCount), 50);
      const listingList = [];
      for (let i = 0; i < limit; i++) {
        try {
          const listing = await contract.getListing(i);
          listingList.push({
            id: i,
            worker: listing[0],
            title: listing[1],
            description: listing[2],
            rate: ethers.formatEther(listing[3]),
            listingType: Number(listing[4]),
            active: listing[5],
          });
        } catch {
          // skip invalid listings
        }
      }
      setListings(listingList);

      // Fetch user-specific data
      if (wallet.account) {
        const [pending, rating] = await Promise.all([
          contract.pendingWithdrawals(wallet.account),
          contract.getWorkerRating(wallet.account),
        ]);
        setPendingBalance(ethers.formatEther(pending));
        const totalJobs = Number(rating[1]);
        setWorkerRating({
          averageRating: totalJobs > 0 ? (Number(rating[0]) / totalJobs).toFixed(1) : "N/A",
          totalJobs,
        });
      }
    } catch (err) {
      console.error("Failed to fetch marketplace data:", err);
    }
    setLoading(false);
  }, [getContract, wallet.account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateListing(e) {
    e.preventDefault();
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Creating listing..." });
      const rateWei = ethers.parseEther(rate);
      const tx = await contract.createListing(title, description, rateWei, listingType);
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "Listing created successfully." });
      setTitle("");
      setDescription("");
      setRate("");
      setListingType(0);
      fetchData();
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleEngage(e) {
    e.preventDefault();
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Engaging worker..." });
      const tx = await contract.engageWorker(engageListingId, {
        value: ethers.parseEther(engageAmount),
      });
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "Worker engaged successfully." });
      setEngageListingId("");
      setEngageAmount("");
      fetchData();
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleWithdraw() {
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Withdrawing funds..." });
      const tx = await contract.withdraw();
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "Withdrawal successful." });
      fetchData();
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to access the marketplace</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Browse skill listings, engage workers, and manage your reputation.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ marginTop: "24px" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!config.contracts.marketplace) {
    return (
      <div className="empty-state">
        <h2>Skills Marketplace not configured</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Set REACT_APP_MARKETPLACE_ADDRESS in your .env file after deploying the contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Skills Marketplace</h1>
        <p>
          Decentralized skills marketplace on {config.chainName} &mdash;{" "}
          {truncateAddress(wallet.account)}
        </p>
      </div>

      {/* Transaction Status */}
      {txStatus && (
        <div
          className={txStatus.type === "error" ? "error-message" : "card"}
          style={{
            marginBottom: "16px",
            borderColor:
              txStatus.type === "success"
                ? "rgba(34, 197, 94, 0.3)"
                : txStatus.type === "pending"
                ? "rgba(59, 130, 246, 0.3)"
                : undefined,
          }}
        >
          <p
            style={{
              color:
                txStatus.type === "success"
                  ? "var(--success)"
                  : txStatus.type === "pending"
                  ? "var(--accent)"
                  : "var(--danger)",
              fontWeight: 600,
            }}
          >
            {txStatus.message}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Listings</div>
          <div className="value">{loading ? "..." : listingCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Engagements</div>
          <div className="value">{loading ? "..." : engagementCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending Balance</div>
          <div className="value">{parseFloat(pendingBalance).toFixed(4)} ETH</div>
        </div>
        {workerRating && (
          <>
            <div className="stat-card">
              <div className="label">My Rating</div>
              <div className="value" style={{ color: "var(--warning)" }}>
                {workerRating.averageRating}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Total Jobs</div>
              <div className="value">{workerRating.totalJobs}</div>
            </div>
          </>
        )}
      </div>

      {/* Withdraw Section */}
      {parseFloat(pendingBalance) > 0 && (
        <div className="section">
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontWeight: 600 }}>Pending Withdrawal</p>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                You have {parseFloat(pendingBalance).toFixed(4)} ETH available to withdraw.
              </p>
            </div>
            <button className="btn-primary" onClick={handleWithdraw}>
              Withdraw
            </button>
          </div>
        </div>
      )}

      {/* Listings */}
      <div className="section">
        <h2>Browse Listings</h2>
        {loading ? (
          <div className="loading">Loading listings...</div>
        ) : listings.length === 0 ? (
          <div className="card">
            <p className="empty-state" style={{ padding: "16px" }}>No listings yet.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
            {listings.map((listing) => (
              <div className="card" key={listing.id} style={{ opacity: listing.active ? 1 : 0.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 600 }}>{listing.title}</h3>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background:
                        listing.listingType === 0
                          ? "rgba(59, 130, 246, 0.15)"
                          : listing.listingType === 1
                          ? "rgba(34, 197, 94, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        listing.listingType === 0
                          ? "var(--accent)"
                          : listing.listingType === 1
                          ? "var(--success)"
                          : "var(--warning)",
                    }}
                  >
                    {LISTING_TYPES[listing.listingType]}
                  </span>
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "12px" }}>
                  {listing.description.length > 120
                    ? listing.description.slice(0, 120) + "..."
                    : listing.description}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Rate: </span>
                    <span style={{ fontWeight: 600 }}>{listing.rate} ETH</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Worker: </span>
                    <span className="mono" style={{ fontSize: "13px" }}>
                      {truncateAddress(listing.worker)}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <span className={listing.active ? "status-active" : "status-inactive"} style={{ fontSize: "12px" }}>
                    {listing.active ? "Active" : "Closed"}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px" }}>
                    #{listing.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {listingCount > 50 && (
          <p style={{ marginTop: "8px", color: "var(--text-muted)", fontSize: "13px" }}>
            Showing first 50 of {listingCount} listings.
          </p>
        )}
      </div>

      {/* Create Listing */}
      <div className="section">
        <h2>Create Listing</h2>
        <form onSubmit={handleCreateListing} className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-group">
              <label>Title</label>
              <input
                placeholder="e.g. Solidity Smart Contract Audit"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Listing Type</label>
              <select
                value={listingType}
                onChange={(e) => setListingType(Number(e.target.value))}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              >
                {LISTING_TYPES.map((type, i) => (
                  <option key={i} value={i}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              placeholder="Describe the work to be done..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Rate (ETH)</label>
            <input
              type="number"
              step="0.001"
              placeholder="0.1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary">
            Create Listing
          </button>
        </form>
      </div>

      {/* Engage Worker */}
      <div className="section">
        <h2>Engage Worker</h2>
        <form onSubmit={handleEngage} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Listing ID</label>
              <input
                type="number"
                placeholder="0"
                value={engageListingId}
                onChange={(e) => setEngageListingId(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Escrow Amount (ETH)</label>
              <input
                type="number"
                step="0.001"
                placeholder="0.1"
                value={engageAmount}
                onChange={(e) => setEngageAmount(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Engage
            </button>
          </div>
        </form>
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={fetchData} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}

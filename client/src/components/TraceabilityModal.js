import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import "./Modal.css";

const TraceabilityModal = ({
  contract,
  account,
  cidToTrace,
  owner,
  setModalOpen,
}) => {
  const [trace, setTrace] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTrace = useCallback(async () => {
    if (!contract || !cidToTrace) return;
    setIsLoading(true);
    setError("");
    setTrace([]);
    try {
      console.log(`[Traceability] Fetching trace for CID: ${cidToTrace}`);
      const filter = contract.filters.ItemAccessGranted(cidToTrace, null, null);
      const deploymentBlock = 0;
      const events = await contract.queryFilter(
        filter,
        deploymentBlock,
        "latest"
      );
      console.log(
        `[Traceability] Found ${events.length} ItemAccessGranted events.`
      );
      if (events.length === 0) {
        setError("No sharing events found for this item beyond the owner.");
        setIsLoading(false);
        return;
      }

      const traceSteps = events.map((event, index) => {
        console.log(
          `[Traceability] Raw event.args for event index ${index}:`,
          event.args
        );
        // Solidity event: ItemAccessGranted(string indexed ipfsCid, address indexed granter, address indexed viewer)
        // Corresponding indices in args array: 0, 1, 2
        const granterAddr = event.args ? event.args[1] : null;
        const viewerAddr = event.args ? event.args[2] : null;
        const isValidGranter = typeof granterAddr === "string" && granterAddr.startsWith("0x");
        const isValidViewer = typeof viewerAddr === "string" && viewerAddr.startsWith("0x");
        return {
          granter: isValidGranter ? granterAddr : null,
          viewer: isValidViewer ? viewerAddr : null,
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
        };
      });

      traceSteps.sort((a, b) => a.blockNumber - b.blockNumber);
      console.log("[Traceability] Processed Trace Steps:", traceSteps);
      setTrace(traceSteps);
    } 
    catch (err) {
      console.error("[Traceability] Error fetching trace:", err);
      setError("Failed to fetch sharing history. See console for details.");
    } 
    finally {
      setIsLoading(false);
    }
  }, [contract, cidToTrace]);

  useEffect(() => {
    fetchTrace();
  }, [fetchTrace]);

  const formatAddr = (addr) =>
    addr
      ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
      : "N/A";

  return (
    <div
      className="modal-backdrop"
      onClick={() => !isLoading && setModalOpen(false)}
    >
      <div
        className="modal-container trace-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {" "}
        {/* Add specific class */}
        <div className="modal-header">
          <h2>Sharing Trace for Item</h2>
          <span className="modal-cid-trace" title={cidToTrace}>
            {cidToTrace.substring(0, 12)}...
          </span>
          <button
            className="modal-close-button"
            onClick={() => setModalOpen(false)}
            disabled={isLoading}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {isLoading && <p className="loading-indicator">Loading history...</p>}
          {error && <p className="modal-error-message">{error}</p>}

          {!isLoading && !error && (
            <div className="trace-list">
              {/* Always show the original owner */}
              <div className="trace-step owner-step">
                <span className="trace-role">Owner:</span>
                <span className="trace-address" title={owner}>
                  {formatAddr(owner)}
                </span>
                <span className="trace-action">(Original Upload)</span>
              </div>

              {/* Display the trace steps */}
              {trace.length > 0 ? (
                trace.map((step, index) => (
                  <div className="trace-step" key={step.txHash || index}>
                    <span className="trace-arrow">↳</span>{" "}
                    {/* Arrow or indent */}
                    <span className="trace-role">Shared by:</span>
                    <span className="trace-address" title={step.granter}>
                      {formatAddr(step.granter)}
                    </span>
                    <span className="trace-role">To:</span>
                    <span className="trace-address" title={step.viewer}>
                      {formatAddr(step.viewer)}
                    </span>
                    <span className="trace-block">
                      (Block: {step.blockNumber})
                    </span>
                    {/* Optional link to block explorer */}
                    {/* <a href={`etherscan-link/${step.txHash}`} target="_blank">View Tx</a> */}
                  </div>
                ))
              ) : (
                <p className="empty-list-placeholder">
                  Item has not been shared further.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="button cancel-button"
            onClick={() => setModalOpen(false)}
            disabled={isLoading}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TraceabilityModal;

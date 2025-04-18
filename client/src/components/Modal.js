import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import "./Modal.css";

const Modal = ({ setModalOpen, contract, account, cidToShare }) => {
  const [shareAddress, setShareAddress] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const handleSharing = async () => {
    setShareError("");
    if (!cidToShare) {
        setShareError("Error: No item CID provided for sharing.");
        toast.error("Error: No item CID provided for sharing.");
        return;
    }
    if (!ethers.utils.isAddress(shareAddress)) { /* ... error handling ... */ return; }
    const normalizedShareAddress = shareAddress.toLowerCase();
    const normalizedAccount = account?.toLowerCase();
    if (!normalizedAccount) { /* ... error handling ... */ return; }
    if (normalizedShareAddress === normalizedAccount) { /* ... error handling ... */ return; }

    // --- Call Contract ---
    if (contract) {
      setIsSharing(true);
      try {
        // !!! UPDATED CONTRACT CALL !!!
        console.log(`Attempting to grant access for CID ${cidToShare.substring(0,10)}... to: ${shareAddress}`);
        const tx = await contract.grantItemAccess(cidToShare, shareAddress);

        toast.info(`Granting access... Tx: ${tx.hash}...`);
        await tx.wait();

        toast.success(`Access to item ${cidToShare}... successfully granted to ${shareAddress}...`);
        setShareAddress("");
      } 
      catch (error) {
        console.error("Error granting item access:", error);
        let specificError = "Failed to grant item access.";
        if (error.reason) { specificError = error.reason; }
        setShareError(specificError);
        toast.error(`Error: ${specificError}`);
      } 
      finally {
        setIsSharing(false);
      }
      } 
      else {
      setShareError("Contract not available.");
      toast.error("Contract not available.");
    }
  };

 return (
    <div className="modal-backdrop" onClick={() => !isSharing && setModalOpen(false)}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {/* Display the CID being shared */}
          <h2>Share Item <span className="modal-cid" title={cidToShare}>({cidToShare.substring(0,8)}...)</span></h2>
          <button className="modal-close-button" onClick={() => setModalOpen(false)} disabled={isSharing}>×</button>
        </div>

        <div className="modal-body">
          <label htmlFor="shareAddressInput">Grant Access To (Address):</label>
          <input
            type="text"
            id="shareAddressInput"
            className="address-input"
            placeholder="Enter Ethereum address (0x...)"
            value={shareAddress}
            onChange={(e) => {
              setShareAddress(e.target.value);
              if (shareError) setShareError("");
            }}
            disabled={isSharing}
          />

          {shareError && <p className="modal-error-message">{shareError}</p>}

          <button
            className="modal-action-button allow-button"
            onClick={handleSharing}
            disabled={isSharing || !shareAddress || !ethers.utils.isAddress(shareAddress)}
          >
            {isSharing ? "Granting..." : "Grant Item Access"}
          </button>

          {/* Removed the old address list display section */}
          {/* Consider adding a call to a new contract function `getViewersForItem(cidToShare)` */}
          {/* here if you want to show who has access to THIS specific item */}

        </div>

         <div className="modal-footer">
             <button className="button cancel-button" onClick={() => setModalOpen(false)} disabled={isSharing}> Close </button>
         </div>

      </div>
    </div>
  );
};

export default Modal;
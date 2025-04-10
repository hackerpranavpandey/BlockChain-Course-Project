import { useState, useEffect } from "react";
import { ethers } from "ethers"; // For address validation
import { toast } from "react-toastify"; // Assuming you use react-toastify
import "./Modal.css"; // Import your CSS file

// Accept account prop from App.js
const Modal = ({ setModalOpen, contract, account }) => {
  const [shareAddress, setShareAddress] = useState(""); // Input field state
  const [accessList, setAccessList] = useState([]); // Stores { address: string, hasAccess: bool }
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  // --- Fetch Access List ---
  useEffect(() => {
    const fetchAccessList = async () => {
      if (contract && account) {
        setIsLoadingList(true);
        setAccessList([]);
        try {
          const rawList = await contract.shareAccess();
          console.log("Fetched Raw Access List:", rawList);
          const formattedList = rawList.map(item => ({
            address: item.user,
            hasAccess: item.access
          }));
          setAccessList(formattedList);
        } catch (error) {
          console.error("Error fetching access list:", error);
          toast.error("Could not fetch access list.");
        } finally {
          setIsLoadingList(false);
        }
      }
    };
    fetchAccessList();
  }, [contract, account]);

  // --- Handle Sharing Action ---
  const handleSharing = async () => {
    setShareError("");

    // 1. Validate Input Address Format
    if (!ethers.utils.isAddress(shareAddress)) {
      const errorMsg = "Invalid Ethereum address format.";
      setShareError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    // Normalize addresses for comparison
    const normalizedShareAddress = shareAddress.toLowerCase();
    const normalizedAccount = account?.toLowerCase();

    // 2. Check Account Availability
    if (!normalizedAccount) {
        setShareError("Cannot verify sharing: Your account address is not available.");
        toast.error("Cannot verify sharing: Your account address is not available.");
        return;
    }

    // 3. Prevent Self-Sharing
    if (normalizedShareAddress === normalizedAccount) {
      const errorMsg = "You cannot grant access to yourself.";
      setShareError(errorMsg);
      toast.warn(errorMsg);
      return;
    }

    // --- 4. Check if Access Already Granted (NEW CHECK) ---
    const alreadyHasAccess = accessList.some(
        item => item.address.toLowerCase() === normalizedShareAddress && item.hasAccess === true
    );

    if (alreadyHasAccess) {
        const errorMsg = `Access already granted to ${shareAddress.substring(0,6)}...`;
        setShareError(errorMsg);
        toast.info(errorMsg); // Use info or warn instead of error
        return; // Stop execution
    }
    // --- END NEW CHECK ---


    // 5. Call Contract
    if (contract) {
      setIsSharing(true);
      try {
        console.log(`Attempting to grant access to: ${shareAddress}`);
        const tx = await contract.allow(shareAddress);
        toast.info(`Granting access... Tx: ${tx.hash.substring(0, 6)}...`);

        await tx.wait();

        toast.success(`Access successfully granted to ${shareAddress.substring(0, 6)}...`);
        setShareAddress(""); // Clear input

        // Refresh list after successful share
        const newList = await contract.shareAccess();
        const formattedList = newList.map(item => ({ address: item.user, hasAccess: item.access }));
        setAccessList(formattedList);

      } catch (error) {
        console.error("Error granting access:", error);
        let specificError = "Failed to grant access.";
        if (error.reason) {
          specificError = error.reason;
        } else if (error.data?.message?.includes("reverted with reason string")) {
            const match = error.data.message.match(/reverted with reason string '(.*?)'/);
            if (match && match[1]) specificError = match[1];
            else specificError = "Transaction reverted by contract.";
        } else if (error.code === 4001) {
            specificError = "Transaction rejected in MetaMask.";
        } else if (error.message) {
            specificError = error.message;
        }
        // Don't overwrite specific contract revert messages with the generic one
        if (!specificError.startsWith("Upload:")) {
           setShareError(`Failed to grant access: ${specificError}`);
        } else {
           setShareError(specificError); // Show the exact revert reason
        }
        toast.error(`Error: ${specificError}`);
      } finally {
        setIsSharing(false);
      }
    } else {
      setShareError("Contract not available.");
      toast.error("Contract not available.");
    }
  };

 // --- Rest of the component (JSX, useEffect, etc.) remains the same ---
 // ... (keep the return statement with JSX structure) ...

 return (
    // Using class names corresponding to the modern CSS provided before
    <div className="modal-backdrop" onClick={() => !isSharing && setModalOpen(false)}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Share Access</h2>
          <button
            className="modal-close-button"
            onClick={() => setModalOpen(false)}
            disabled={isSharing}
          >
            × {/* Close symbol */}
          </button>
        </div>

        <div className="modal-body">
          {/* Input */}
          <label htmlFor="shareAddressInput">Share With (Address):</label>
          <input
            type="text"
            id="shareAddressInput"
            className="address-input" // Use this class for specific styling if needed
            placeholder="Enter Ethereum address (0x...)"
            value={shareAddress}
            onChange={(e) => {
              setShareAddress(e.target.value);
              if (shareError) setShareError(""); // Clear error on input change
            }}
            disabled={isSharing}
          />

          {/* Error Display */}
          {shareError && <p className="modal-error-message">{shareError}</p>}

          {/* Share Button */}
          <button
            className="modal-action-button allow-button" // Use specific classes
            onClick={handleSharing}
            disabled={isSharing || !shareAddress || !ethers.utils.isAddress(shareAddress)} // Basic validation disable
          >
            {isSharing ? "Granting..." : "Grant Access"}
          </button>

          {/* Access List Display */}
          <div className="address-list">
            <h3>People With Access:</h3>
            {isLoadingList ? (
              <p>Loading list...</p>
            ) : accessList.length > 0 ? (
              accessList.map((item) => (
                 // Display only if access is currently true (optional)
                 item.hasAccess && (
                    <p key={item.address} title={item.address}>
                      {item.address.substring(0, 8)}...{item.address.substring(item.address.length - 6)}
                      {/* You could add a revoke button here later */}
                    </p>
                 )
              ))
            ) : (
              <p className="empty-list-placeholder">No addresses shared yet.</p>
            )}
            {/* Filtered message if some had access revoked */}
            {!isLoadingList && accessList.length > 0 && !accessList.some(item => item.hasAccess) && (
                 <p className="empty-list-placeholder">No users currently have active access.</p>
            )}
          </div>
        </div>

         {/* Footer with Cancel Button */}
         <div className="modal-footer">
             <button
                className="button cancel-button" // Use classes for styling
                onClick={() => setModalOpen(false)}
                disabled={isSharing}
             >
                Close
             </button>
         </div>

      </div>
    </div>
  );
};

export default Modal;
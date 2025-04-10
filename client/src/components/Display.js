import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers"; // Ensure ethers is imported
import Modal from "./Modal";      // Import the updated Modal component
import "./Display.css";         // Make sure this CSS file exists and is styled

// --- Hashing Helper (Keep as is) ---
const calculateArrayBufferHash = async (buffer) => {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Cannot hash empty or invalid buffer.");
  }
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
     console.error("Error during crypto.subtle.digest:", error);
     throw new Error("Hashing failed. Crypto API might not be available or input was invalid.");
  }
};

// --- URL Builder Helper (Keep as is) ---
const buildDisplayUrl = (cidOrUri) => {
    if (!cidOrUri || typeof cidOrUri !== 'string' || cidOrUri.trim().length === 0) {
        console.warn(`Invalid input for buildDisplayUrl: ${cidOrUri}`);
        return null;
    }
    const gateways = [
        "https://gateway.pinata.cloud/ipfs/", // Using Pinata as primary
        // Add other gateways as fallbacks if needed
    ];
    const gateway = gateways[0];

    // Check various formats
    if (cidOrUri.startsWith('http://') || cidOrUri.startsWith('https://')) {
        return cidOrUri; // Assume it's a direct link or already gateway link
    } else if (cidOrUri.startsWith('ipfs://')) {
        const cid = cidOrUri.substring(7);
        return cid.length > 40 ? `${gateway}${cid}` : null;
    } else if ((cidOrUri.startsWith('Qm') || cidOrUri.startsWith('b')) && cidOrUri.length > 40) {
        // console.log(`Identified CID: ${cidOrUri}, building URL with ${gateway}`);
        return `${gateway}${cidOrUri}`;
    } else {
        console.warn(`Skipping unrecognized format for URL building: ${cidOrUri}`);
        return null;
    }
};

// --- MediaRenderer Component (Keep as is) ---
const MediaRenderer = ({ url, altText }) => {
    const [mediaType, setMediaType] = useState('unknown');
    const [tryVideo, setTryVideo] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        // Reset state when URL changes
        setHasError(false);
        setTryVideo(false);
        setMediaType('unknown'); // Reset media type determination

        if (!url) {
            setHasError(true);
            return;
        }

        // Basic extension check (can be improved with MIME type fetching if needed)
        const extensionMatch = url.match(/\.([^.?#]+)(?:[?#]|$)/i);
        const extension = extensionMatch ? extensionMatch[1].toLowerCase() : null;
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
        const videoExtensions = ['mp4', 'webm', 'ogg', 'mov']; // Common web video types

        if (extension) {
            if (imageExtensions.includes(extension)) {
                setMediaType('image');
            } else if (videoExtensions.includes(extension)) {
                setMediaType('video');
            }
        }
        // If no extension or unrecognized, it remains 'unknown'
    }, [url]);

    const handleImageError = () => {
        if (mediaType === 'unknown' && !tryVideo) {
            console.warn(`Image attempt failed for ${url}, trying video.`);
            setTryVideo(true); // Set flag to attempt video render
        } else {
            console.warn(`Failed to load image (or unknown after video attempt) from: ${url}`);
            setHasError(true); // Final error state
        }
    };

    const handleVideoError = () => {
        console.warn(`Failed to load video from: ${url}`);
        setHasError(true); // Final error state
    };

    if (hasError) {
        return (
            <div className="media-fallback error">
                ⚠️ Error loading media.{" "}
                <a href={url} target="_blank" rel="noopener noreferrer">Open Link</a>
            </div>
        );
    }

    // Render video if type is video OR if image failed and we're trying video
    if (mediaType === 'video' || tryVideo) {
        return (
            <video
                key={`${url}-video`}
                src={url}
                controls
                preload="metadata"
                className="media-item video-item"
                onError={handleVideoError}
            >
                Your browser does not support the video tag.{" "}
                <a href={url} target="_blank" rel="noopener noreferrer">Download video</a>
            </video>
        );
    }

    // Render image if type is image OR if type is unknown and we haven't tried video yet
    if (mediaType === 'image' || (mediaType === 'unknown' && !tryVideo)) {
        return (
            <img
                key={`${url}-image`}
                src={url}
                alt={altText}
                className="media-item image-list-item"
                onError={handleImageError}
                loading="lazy"
            />
        );
    }

    // Fallback while determining type or if truly unknown and not an error yet
    return <div className="media-fallback">Loading media...</div>;
};


// --- Main Display Component ---
const Display = ({ contract, account }) => {
  // State: displayData holds { id, cid, hash, owner, displayUrl }
  const [displayData, setDisplayData] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState({});
  const [isModalOpen, setModalOpen] = useState(false);
  const [cidToShare, setCidToShare] = useState("");

  // --- getdata Function ---
   const getdata = useCallback(async () => {
    if (!contract || !account) {
        setMessage("Please connect wallet and ensure contract is loaded.");
        setLoading(false);
        setDisplayData([]); // Clear data if disconnected
        return;
    }
    setDisplayData([]);
    setMessage("");
    setLoading(true);
    setVerificationStatus({});
    const connectedAccountLower = account.toLowerCase();

    try {
        setMessage(`Fetching accessible content for your account (${account.substring(0,6)}...)`);
        console.log(`[Display getdata] Calling contract.getAccessibleCIDsAndHashes() for ${account}`);

        // --- Call the NEW Smart Contract Function ---
        // No longer takes an address argument
        const result = await contract.getAccessibleCIDsAndHashes();
        console.log("[Display getdata] Raw contract result:", result);

        // --- Validate Contract Result Structure ---
        if (!Array.isArray(result) || result.length !== 3 || !Array.isArray(result[0]) || !Array.isArray(result[1]) || !Array.isArray(result[2])) {
            throw new Error("Contract did not return the expected structure [[string], [string], [address]].");
        }
        const cidsArray = result[0];
        const hashesArray = result[1];
        const ownersArray = result[2];

        if (cidsArray.length !== hashesArray.length || cidsArray.length !== ownersArray.length) {
            throw new Error("Contract returned mismatched CID, Hash, or Owner data arrays.");
        }
        console.log(`[Display getdata] Received ${cidsArray.length} accessible items.`);

        // --- Process Fetched Data ---
        if (cidsArray.length === 0) {
            setMessage(`No content found that you own or that has been shared with you.`);
            setDisplayData([]);
        } else {
            const processedData = [];
            const initialStatus = {};
            for (let i = 0; i < cidsArray.length; i++) {
                const cid = cidsArray[i];
                const hash = hashesArray[i];
                const owner = ownersArray[i];
                const displayUrl = buildDisplayUrl(cid);

                if (displayUrl && typeof hash === 'string' && hash.length > 10 && ethers.utils.isAddress(owner)) {
                    const uniqueId = cid; // CID is the unique identifier
                    processedData.push({
                        id: uniqueId,
                        cid: cid,
                        hash: hash,
                        owner: owner, // Store the owner
                        displayUrl: displayUrl
                    });
                    initialStatus[uniqueId] = 'idle'; // Set initial verification status
                } else {
                     console.warn(`[Display getdata] Skipping item index ${i}: Invalid URL('${displayUrl}') / Hash('${hash}') / Owner('${owner}') derived from CID '${cid}'`);
                }
            }

            // Optionally sort: Owned items first, then shared items
            processedData.sort((a, b) => {
                const aIsOwner = a.owner.toLowerCase() === connectedAccountLower;
                const bIsOwner = b.owner.toLowerCase() === connectedAccountLower;
                if (aIsOwner && !bIsOwner) return -1; // a (owned) comes before b (shared)
                if (!aIsOwner && bIsOwner) return 1;  // b (owned) comes before a (shared)
                return 0; // Keep original order among owned/shared items
            });

            if (processedData.length > 0) {
                console.log("[Display getdata] Setting display data:", processedData);
                setDisplayData(processedData);
                setVerificationStatus(initialStatus);
                setMessage(""); // Clear loading/status message on success
            } else {
                setDisplayData([]);
                setMessage(`No processable content found after filtering.`);
            }
        }
    } catch (e) {
        console.error("[Display getdata] Error during execution:", e);
        let specificError = e.reason || e.data?.message || e.error?.message || e.message || "An unknown error occurred fetching data.";
        setMessage(`Error: ${specificError}`);
        setDisplayData([]);
    } finally {
       setLoading(false);
    }
  }, [contract, account]); // Dependencies for useCallback

  // --- Fetch data on initial load or when account/contract changes ---
  useEffect(() => {
      // Only fetch if contract and account are available
      if(contract && account) {
          getdata();
      } else {
          // Clear data if disconnected or contract not loaded
          setDisplayData([]);
          setMessage("Connect wallet to view content.");
      }
  }, [getdata]); // Depend on the memoized getdata function

  // --- verifyHash Function (Keep as is) ---
  const verifyHash = useCallback(async (imageUrl, expectedHash, itemId) => {
    if (!imageUrl || !expectedHash || !itemId) {
        console.error("VerifyHash: Missing arguments");
        setVerificationStatus(prev => ({ ...prev, [itemId]: 'error' }));
        return;
    }
    setVerificationStatus(prev => ({ ...prev, [itemId]: 'verifying' }));
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) { throw new Error(`Fetch failed: ${response.status} ${response.statusText}`); }
        const fileBuffer = await response.arrayBuffer();
        if (fileBuffer.byteLength === 0) throw new Error("Fetched empty file for hashing.");
        const calculatedHash = await calculateArrayBufferHash(fileBuffer);
        if (calculatedHash.toLowerCase() === expectedHash.toLowerCase()) {
            setVerificationStatus(prev => ({ ...prev, [itemId]: 'verified' }));
            console.log(`✅ Verification SUCCESS for ${itemId}`);
        } else {
            setVerificationStatus(prev => ({ ...prev, [itemId]: 'mismatch' }));
            console.warn(`❌ Verification FAILED for ${itemId}: Hash mismatch! Expected: ${expectedHash.toLowerCase()}, Calculated: ${calculatedHash.toLowerCase()}`);
        }
    } catch (error) {
        console.error(`❌ Verification ERROR for ${itemId}:`, error);
        setVerificationStatus(prev => ({ ...prev, [itemId]: 'error' }));
    }
  }, []); // Empty dependency array is fine here

  // --- getStatusInfo Function (Keep as is) ---
  const getStatusInfo = (status) => {
    switch (status) {
        case 'verifying': return { text: 'Verifying...', class: 'status-verifying' };
        case 'verified': return { text: '✅ Verified', class: 'status-verified' };
        case 'mismatch': return { text: '❌ Mismatch', class: 'status-mismatch' };
        case 'error': return { text: '⚠️ Error', class: 'status-error' };
        case 'idle': default: return { text: 'Verify Hash', class: 'status-idle' }; // Button text change
    }
  };

  // --- Function to Open Share Modal ---
  const handleOpenShareModal = (cid) => {
      if (!cid) {
          console.error("Cannot share: Invalid CID provided.");
          return;
      }
      console.log("[Display] Opening share modal for CID:", cid);
      setCidToShare(cid); // Set the CID state
      setModalOpen(true);  // Open the modal
  };

  // --- Component Return JSX ---
  return (
    <> {/* Use Fragment to avoid unnecessary div */}
        <div className="display-container">
            {/* Header/Title (Optional) */}
             <h2 className="display-header">Your Accessible Content</h2>

            {/* Status/Loading Messages */}
            {message && <p className={`status-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</p>}
            {loading && <p className="loading-indicator">Loading Content...</p>}

            {/* Refresh Button */}
             <div className="controls refresh-controls">
                 <button
                    className="button refresh-button"
                    onClick={getdata} // Call getdata directly
                    disabled={loading || !contract || !account}
                 >
                    {loading ? "Refreshing..." : "Refresh"}
                 </button>
             </div>

            {/* Item List */}
            <div className="image-list">
                {displayData.length === 0 && !loading && !message.startsWith('Error') && (
                    <p className="no-data-message">No items found that you own or that are shared with you.</p>
                )}
                {displayData.map((item) => {
                  const statusInfo = getStatusInfo(verificationStatus[item.id]);
                  const isOwner = item.owner.toLowerCase() === account?.toLowerCase(); // Check ownership

                  return (
                    <div className="image-item-container" key={item.id}> {/* Use item.id (CID) as key */}
                      {/* Media Renderer */}
                      <MediaRenderer url={item.displayUrl} altText={`File: ${item.cid?.substring(0, 10)}...`} />

                      {/* Owner Info */}
                       <p className="item-owner" title={`Owner: ${item.owner}`}>
                           {isOwner ? "Owned by You" : `Shared by ${item.owner.substring(0, 6)}...`}
                       </p>

                      {/* Hash Display */}
                      <p className="image-hash" title={`Hash: ${item.hash}`}>
                          {item.hash?.substring(0, 10)}...
                      </p>

                      {/* Verification Section */}
                      <div className="verification-section">
                         <button
                           className={`verify-button ${statusInfo.class}`} // Use status class for potential styling
                           onClick={() => verifyHash(item.displayUrl, item.hash, item.id)}
                           disabled={loading || verificationStatus[item.id] === 'verifying' || verificationStatus[item.id] === 'verified'} // Disable if verifying or already verified
                         >
                            {statusInfo.text}
                         </button>
                      </div>

                      {/* Share Button (Only if Owner) */}
                      {isOwner && (
                          <div className="share-section">
                              <button
                                className="button share-button" // Add specific class for styling
                                onClick={() => handleOpenShareModal(item.cid)}
                                disabled={loading || isModalOpen} // Disable if loading data or modal already open
                              >
                                  Share
                              </button>
                          </div>
                      )}
                    </div>
                  );
                })}
            </div>
             {/* Removed the old address input controls */}
        </div> {/* End display-container */}

        {/* Render Modal Conditionally */}
        {isModalOpen && (
            <Modal
                setModalOpen={setModalOpen} // Function to close modal
                contract={contract}       // Pass contract instance
                account={account}         // Pass current account
                cidToShare={cidToShare}   // Pass the specific CID to share
            />
        )}
    </>
  );
};

export default Display;
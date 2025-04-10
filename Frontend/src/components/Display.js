import { useState, useCallback, useEffect } from "react";
import "./Display.css"; // Make sure this CSS file exists

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

// --- URL Builder Helper (Keep as is, using Pinata default) ---
const buildDisplayUrl = (cidOrUri) => {
    if (!cidOrUri || typeof cidOrUri !== 'string' || cidOrUri.trim().length === 0) {
        console.warn(`Invalid input for buildDisplayUrl: ${cidOrUri}`);
        return null;
    }
    const gateways = [
        "https://gateway.pinata.cloud/ipfs/", // Using Pinata
        "https://ipfs.io/ipfs/",
        "https://cloudflare-ipfs.com/ipfs/",
        "https://dweb.link/ipfs/",
    ];
    const gateway = gateways[0]; // Pinata

    if (cidOrUri.startsWith('http://') || cidOrUri.startsWith('https://')) {
        if (gateways.some(gw => cidOrUri.startsWith(gw))) {
             return cidOrUri;
        } else {
            console.warn(`URL is HTTP(S) but not a recognized IPFS gateway: ${cidOrUri}`);
             return cidOrUri;
        }
    }
    else if (cidOrUri.startsWith('ipfs://')) {
        const cid = cidOrUri.substring(7);
        return cid.length > 40 ? `${gateway}${cid}` : null;
    }
    else if ((cidOrUri.startsWith('Qm') || cidOrUri.startsWith('b')) && cidOrUri.length > 40) {
         console.log(`Identified CID: ${cidOrUri}, building URL with ${gateway}`);
         return `${gateway}${cidOrUri}`;
    }
    else {
        console.warn(`Skipping unrecognized format for URL building: ${cidOrUri}`);
        return null;
    }
};

// --- MediaRenderer Component (Keep as is with 'tryVideo' logic) ---
const MediaRenderer = ({ url, altText }) => {
  const [mediaType, setMediaType] = useState('unknown');
  const [tryVideo, setTryVideo] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setTryVideo(false);

    if (!url) {
        setMediaType('unknown');
        setHasError(true);
        console.warn("MediaRenderer received invalid URL:", url)
        return;
    }

    const extensionMatch = url.match(/\.([^.?#]+)(?:[?#]|$)/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : null;
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'qt'];

    if (imageExtensions.includes(extension)) {
      setMediaType('image');
      // console.log(`Media type determined as 'image' for ${url}`); // Optional log
    } else if (videoExtensions.includes(extension)) {
      setMediaType('video');
      // console.log(`Media type determined as 'video' for ${url}`); // Optional log
    } else {
      setMediaType('unknown');
      // console.log(`Media type 'unknown' for ${url}, will try rendering as image first.`); // Optional log
    }
  }, [url]);

  const handleImageError = () => {
    // console.log(`>>> handleImageError called for URL: ${url}. Current mediaType: ${mediaType}, hasError: ${hasError}, tryVideo: ${tryVideo}`); // Optional debug log
    if (mediaType === 'unknown' && !hasError) {
      console.warn(`Image attempt failed for unknown type: ${url}. Setting flag to try video render.`);
      setTryVideo(true);
    } else {
      console.warn(`Failed to load image from: ${url}. Setting final error state.`);
      setHasError(true);
    }
  };

  const handleVideoError = () => {
    console.warn(`Failed to load video from: ${url}. Setting final error state.`);
    setHasError(true);
  };

  if (hasError) {
    return (
      <div className="media-fallback error">
        ⚠️ Error loading media.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer">Open Link</a>
      </div>
    );
  }

  if (mediaType === 'video' || tryVideo) {
    // console.log(`Rendering <video> for ${url} (mediaType: ${mediaType}, tryVideo: ${tryVideo})`); // Optional log
    return (
      <video
        key={url + '-video'}
        src={url}
        controls preload="metadata"
        className="media-item video-item"
        onError={handleVideoError}
      >
        Your browser does not support the video tag.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer">Download video</a>
      </video>
    );
  }

  if (mediaType === 'image' || (mediaType === 'unknown' && !tryVideo)) {
    // console.log(`Rendering <img> for ${url} (mediaType: ${mediaType}, tryVideo: ${tryVideo})`); // Optional log
    return (
      <img
        key={url + '-image'}
        src={url} alt={altText}
        className="media-item image-list-item"
        onError={handleImageError} loading="lazy"
      />
    );
  }

  return <div className="media-fallback">Loading...</div>;
};


// --- Main Display Component ---
const Display = ({ contract, account }) => {
  const [displayData, setDisplayData] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState({});

  // --- getdata Function ---
   const getdata = async () => {
    setDisplayData([]);
    setMessage("");
    setLoading(true);
    setVerificationStatus({});

    const otherAddressInput = document.querySelector(".address");
    const otherAddress = otherAddressInput?.value.trim();
    let addressToQuery = otherAddress || account; // Defaults to connected account if input is empty

    // --- Validations ---
    if (!contract) { setMessage("Error: Contract not loaded yet."); setLoading(false); return; }
    if (!account) { setMessage("Error: Wallet not connected."); setLoading(false); return; } // Added check for connected account
    if (!addressToQuery) { setMessage("Error: No address specified or connected."); setLoading(false); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(addressToQuery)) { setMessage("Error: Invalid Ethereum address format provided."); setLoading(false); return; }
    addressToQuery = addressToQuery.toLowerCase(); // Normalize address to query
    const connectedAccountLower = account.toLowerCase(); // Normalize connected account

    try {
        setMessage(`Fetching content for ${addressToQuery.substring(0,6)}...${addressToQuery.substring(addressToQuery.length-4)}`);
        console.log(`Fetching data for address: ${addressToQuery}`);

        // --- !!! IMPORTANT: SIGNER CHECK !!! ---
        let currentSignerAddress = '';
        if (contract.signer) {
            currentSignerAddress = await contract.signer.getAddress();
            console.log(`DEBUG: Calling contract.display AS signer: ${currentSignerAddress}`);
            // Optional: Strict check if the signer matches the 'account' prop passed down
            if (currentSignerAddress.toLowerCase() !== connectedAccountLower) {
                 console.error(`CRITICAL: Signer address mismatch! Component account prop: ${account}, Contract signer: ${currentSignerAddress}`);
                 // You might want to throw an error or force a reload here if this happens
                 // throw new Error("Signer mismatch detected. Please reconnect wallet or refresh.");
                 setMessage("Error: Wallet signer mismatch. Please refresh or reconnect.");
                 setLoading(false);
                 return; // Stop execution
            }
        } else {
             console.error("CRITICAL: Contract object does not have a signer attached!");
             setMessage("Error: Cannot read data - contract signer is missing.");
             setLoading(false);
             return; // Stop execution
        }
        // --- END SIGNER CHECK ---

        // --- Call the Smart Contract ---
        // The contract object inherently uses its associated signer (checked above)
        // So msg.sender in the contract call will be currentSignerAddress
        const result = await contract.display(addressToQuery);
        console.log("Raw contract result:", result);

        // --- Validate Contract Result Structure ---
        if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[0]) || !Array.isArray(result[1])) {
            let errorDetail = "Contract did not return the expected structure [[string], [string]].";
             if (result === null || typeof result !== 'object') { errorDetail = `Contract returned non-array data: ${result}`; }
             throw new Error(`${errorDetail} Check contract logic or address permissions.`);
        }
        const cidsArray = result[0];
        const hashesArray = result[1];
        if (cidsArray.length !== hashesArray.length) { throw new Error("Contract returned mismatched CID and Hash data."); }

        // --- Process Fetched Data ---
        if (cidsArray.length === 0) {
            // Use a different message if querying another address vs self
            if (addressToQuery === connectedAccountLower) {
                setMessage(`You haven't uploaded any content yet.`);
            } else {
                setMessage(`No content found for address ${addressToQuery.substring(0,6)}... (or you lack access).`);
            }
            setDisplayData([]);
        } else {
            const processedData = [];
            const initialStatus = {};
            for (let i = 0; i < cidsArray.length; i++) {
                const cid = cidsArray[i];
                const hash = hashesArray[i];
                const displayUrl = buildDisplayUrl(cid);
                // console.log(`Processing Item ${i}: CID='${cid}', Hash='${hash}', Generated URL='${displayUrl}'`); // Optional log
                if (displayUrl && typeof hash === 'string' && hash.length > 10) {
                    // Use CID if available and seems valid, otherwise hash, or combine
                    const uniqueId = (cid && cid.length > 40) ? cid : `${cid}-${hash}`; // Make ID more robust
                    processedData.push({ id: uniqueId, cid: cid, hash: hash, displayUrl: displayUrl });
                    initialStatus[uniqueId] = 'idle';
                } else {
                    console.warn(`Skipping item ${i}: Invalid URL ('${displayUrl}') or Hash ('${hash}') derived from CID '${cid}'`);
                }
            }
            if (processedData.length > 0) {
                console.log("Setting display data:", processedData);
                setDisplayData(processedData);
                setVerificationStatus(initialStatus);
                setMessage(""); // Clear loading/status message on success
            } else {
                setDisplayData([]);
                // Different message if filtering removed everything vs. contract returning empty
                if (cidsArray.length > 0) {
                     setMessage(`No processable content URLs/hashes found for address ${addressToQuery.substring(0,6)}... after filtering.`);
                } else {
                     // This case handled above
                }
            }
        }
    } catch (e) {
        // --- Error Handling ---
        console.error("Error during getdata execution:", e);
        let specificError = "An unknown error occurred.";
        // Prioritize specific revert reason
        if (e.reason) {
            specificError = e.reason;
            console.log("Contract Revert Reason:", specificError);
        } else if (e.data?.message) {
            specificError = e.data.message;
        } else if (e.error?.message) {
             specificError = e.error.message;
        } else if (e.message) {
             specificError = e.message;
        }
        // Update UI message
        setMessage(`Error fetching data: ${specificError}. Please check the address and network permissions.`);
        setDisplayData([]); // Clear data on error
    } finally {
       setLoading(false); // Ensure loading indicator is turned off
    }
};

  // --- verifyHash Function (Keep as is) ---
  const verifyHash = useCallback(async (imageUrl, expectedHash, itemId) => {
    if (!imageUrl || !expectedHash || !itemId) { /*...*/ return; }
    setVerificationStatus(prev => ({ ...prev, [itemId]: 'verifying' }));
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) { throw new Error(`Fetch failed: ${response.status} ${response.statusText}`); }
        const fileBuffer = await response.arrayBuffer();
        const calculatedHash = await calculateArrayBufferHash(fileBuffer);
        if (calculatedHash.toLowerCase() === expectedHash.toLowerCase()) {
            setVerificationStatus(prev => ({ ...prev, [itemId]: 'verified' }));
        } else {
            setVerificationStatus(prev => ({ ...prev, [itemId]: 'mismatch' }));
            console.warn(`Hash mismatch! Expected: ${expectedHash}, Calculated: ${calculatedHash}`);
        }
    } catch (error) {
        console.error(`Verification ERROR for ${itemId}:`, error);
        setVerificationStatus(prev => ({ ...prev, [itemId]: 'error' }));
    }
  }, []);

  // --- getStatusInfo Function (Keep as is) ---
  const getStatusInfo = (status) => {
    switch (status) {
        case 'verifying': return { text: 'Verifying...', class: 'status-verifying' };
        case 'verified': return { text: '✅ Verified', class: 'status-verified' };
        case 'mismatch': return { text: '❌ Mismatch', class: 'status-mismatch' };
        case 'error': return { text: '⚠️ Error', class: 'status-error' };
        case 'idle': default: return { text: 'Not Verified', class: 'status-idle' };
    }
  };

  // --- Component Return JSX ---
  return (
    <div className="display-container">
      {/* Status/Loading Messages */}
      {message && <p className={`status-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</p>}
      {loading && <p className="loading-indicator">Loading...</p>}

      {/* Item List */}
      <div className="image-list">
        {displayData.length === 0 && !loading && !message.startsWith('Error') && (
            <p className="no-data-message">No items to display for this address.</p>
        )}
        {displayData.map((item) => {
          const statusInfo = getStatusInfo(verificationStatus[item.id]);
          return (
            <div className="image-item-container" key={item.id}> {/* Using updated uniqueId (cid/hash) as key */}
              <MediaRenderer
                 url={item.displayUrl}
                 altText={`IPFS file: ${item.cid?.substring(0, 10)}...`}
              />
              <p className="image-hash" title={item.hash}>
                  Hash: {item.hash?.substring(0, 10)}...
              </p>
              <div className="verification-section">
                <span className={`verification-status ${statusInfo.class}`}>
                   {statusInfo.text}
                </span>
                {(statusInfo.class === 'status-idle' || statusInfo.class === 'status-mismatch' || statusInfo.class === 'status-error') && (
                  <button
                    className="verify-button"
                    onClick={() => verifyHash(item.displayUrl, item.hash, item.id)}
                    disabled={loading || verificationStatus[item.id] === 'verifying'}
                  >
                    Verify Hash
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Controls */}
      <div className="controls">
        <input
            type="text"
            placeholder="Enter Address (Optional)"
            className="address"
            disabled={loading}
          />
          <button
            className="center button" // Keep 'center' class if used elsewhere
            onClick={getdata}
            disabled={!contract || loading || !account} // Also disable if account not connected
           >
            {loading ? "Loading..." : "Get Data"}
          </button>
      </div>
    </div>
  );
};

export default Display;
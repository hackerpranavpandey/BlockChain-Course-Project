import { useState } from "react";
import axios from "axios";
import "./FileUpload.css";
import { toast } from "react-toastify";

// Helper function to calculate SHA-256 hash of a file
const calculateFileHash = async (file) => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
};

// --- Configuration ---
const PINATA_API_KEY = "ae1ba446a9aeca73624c";
const PINATA_SECRET_API_KEY = "b30349d6044ed59285ba496207015af363c7ad38dcefdca17fa96481b9f9360d";
const CONSENSUS_THRESHOLD = 0.5;
const NODE_REQUEST_TIMEOUT = 15000;

// URLs fordeepfake detection nodes
const DEEPFAKE_NODE_URLS = [
  "http://localhost:5001/predict",
  "http://localhost:5002/predict",
  "http://localhost:5003/predict",
];

const FileUpload = ({ contract, account, provider }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("No file selected");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fileHash, setFileHash] = useState("");

  const retrieveFile = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      const acceptedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/mov', 'video/mkv'];
      if (!acceptedImageTypes.includes(selected.type) && !acceptedVideoTypes.includes(selected.type)) {
         const errorMsg = `⚠️ Unsupported file type: ${selected.type || 'Unknown'}. Please select a supported image or video.`;
         setMessage(errorMsg);
         toast.error(errorMsg);
         setFile(null);
         setFileName("No file selected");
         setFileHash("");
         e.target.value = null;
         return;
      }
      setFile(selected);
      setFileName(selected.name);
      setMessage("");
      setFileHash("");
      toast.success("Image/Video file selected");
    } else {
      setFile(null);
      setFileName("No file selected");
      setFileHash("");
    }
  };

  // Consensus logic (expects confidence 0.0-1.0 from backend)
  const determineConsensus = (results) => {
    if (!results || results.length === 0) {
      return { consensus: "inconclusive", reason: "No valid responses from nodes." };
    }
    let realVotes = 0;
    let fakeVotes = 0;
    let totalConfidenceReal = 0;
    let totalConfidenceFake = 0;
    results.forEach((result) => {
      const confidence = typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1 ? result.confidence : null;
      if (confidence === null) {
          console.warn("Received invalid confidence value:", result.confidence);
          return;
      }
      if (result.is_deepfake === true) {
        fakeVotes++;
        totalConfidenceFake += confidence;
      } else if (result.is_deepfake === false) {
        realVotes++;
        totalConfidenceReal += confidence;
      }
    });

    const totalVotes = realVotes + fakeVotes;
    if (totalVotes === 0) {
      return { consensus: "inconclusive", reason: "No nodes provided a clear real/fake vote with valid confidence." };
    }
    const realRatio = realVotes / totalVotes;
    const fakeRatio = fakeVotes / totalVotes;
    console.log(
      `Consensus Check: Real Votes=${realVotes}, Fake Votes=${fakeVotes}, Total Votes=${totalVotes}`
    );
    if (realRatio > CONSENSUS_THRESHOLD) {
      const avgConfidence = realVotes > 0 ? (totalConfidenceReal / realVotes) * 100 : 0;
      return { consensus: "real", confidence: avgConfidence, votes: `${realVotes}/${totalVotes}` };
    } else if (fakeRatio > CONSENSUS_THRESHOLD) {
      // Average confidence of the nodes that voted FAKE
      const avgConfidence = fakeVotes > 0 ? (totalConfidenceFake / fakeVotes) * 100 : 0;
      return { consensus: "deepfake", confidence: avgConfidence, votes: `${fakeVotes}/${totalVotes}` };
    } else {
      return { consensus: "inconclusive", reason: `No clear majority (${realVotes} real, ${fakeVotes} fake).` };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage("Please select an image or video file first.");
      return;
    }
    if (!contract || !account) {
      setMessage("Wallet not connected or contract not loaded.");
      return;
    }

    setIsLoading(true);
    setMessage("Processing file...");
    setFileHash("");

    try {
      // --- Step 1: Calculate Hash ---
      setMessage("Calculating file hash...");
      const calculatedHash = await calculateFileHash(file);
      setFileHash(calculatedHash);
      console.log("Calculated File Hash:", calculatedHash);
      toast.info(`File Hash: ${calculatedHash.substring(0, 10)}...`);
      setMessage("File hash calculated. Analyzing for deepfakes via nodes...");

      // --- Step 2: Send to Deepfake Nodes ---
      const deepfakeFormData = new FormData();
      deepfakeFormData.append('file', file);

      const promises = DEEPFAKE_NODE_URLS.map((url) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NODE_REQUEST_TIMEOUT);

        return fetch(url, {
          method: "POST",
          body: deepfakeFormData,
          signal: controller.signal,
        })
          .then(async (response) => {
            clearTimeout(timeoutId);
            if (!response.ok) {
              let errorMsg = `Node ${url} failed: ${response.status}`;
              try { const errData = await response.json(); errorMsg = errData.error || errorMsg; }
              catch (parseErr) { /* ignore */ }
              throw new Error(errorMsg);
            }
            return response.json();
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            console.warn(`Node request failed for ${url}: ${error.message}`);
            throw new Error(`Node ${url}: ${error.message}`);
          });
      });

      setMessage(`Sent requests to ${DEEPFAKE_NODE_URLS.length} nodes. Awaiting responses...`);
      const results = await Promise.allSettled(promises);

      // --- Step 3: Process Node Responses ---
      const successfulResults = [];
      let nodeErrors = 0;
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          console.log(`Node ${DEEPFAKE_NODE_URLS[index]} Result:`, result.value);
          if (typeof result.value?.is_deepfake === "boolean" && typeof result.value?.confidence === "number") {
            successfulResults.push(result.value);
          } 
          else {
            console.warn(`Node ${DEEPFAKE_NODE_URLS[index]} returned invalid data format:`, result.value);
            nodeErrors++;
          }
        } 
        else {
          console.error(`Node ${DEEPFAKE_NODE_URLS[index]} Failed:`, result.reason?.message || result.reason);
          nodeErrors++;
        }
      });
    
      setMessage(`Received responses. ${successfulResults.length} successful, ${nodeErrors} failed/invalid. Determining consensus...`);

      // --- Step 4: Determine Consensus Outcome ---
      const consensusOutcome = determineConsensus(successfulResults);
      console.log("Consensus Outcome:", consensusOutcome);

      // --- Step 5: Act based on Consensus ---
      if (consensusOutcome.consensus === "deepfake") {
        setMessage(
          `⚠️ Consensus: Deepfake Detected (${consensusOutcome.votes} votes, avg conf ${consensusOutcome.confidence?.toFixed(2)}%). Upload cancelled. Hash: ${calculatedHash.substring(0, 10)}...`
        );
        toast.warn("DeepFake detected by consensus! Upload blocked.");
        setFile(null);
        setFileName("No file selected");
        setIsLoading(false);
        return;
      }

      if (consensusOutcome.consensus === "inconclusive") {
        setMessage(
          `🤔 Consensus Inconclusive: ${consensusOutcome.reason}. Upload cancelled.`
        );
        toast.info("Consensus on deepfake status was inconclusive. Upload blocked.");
        setFile(null);
        setFileName("No file selected");
        setIsLoading(false);
        return;
      }

      // --- Step 6: Proceed if Consensus is REAL ---
      setMessage(
        `✅ Consensus: Real File Detected (${consensusOutcome.votes} votes, avg conf ${consensusOutcome.confidence?.toFixed(2)}%). Proceeding with IPFS upload...` // Updated message
      );
      toast.success("File determined to be real by consensus.");

      // --- Step 7: Upload to Pinata ---
      setMessage("Uploading file to IPFS via Pinata...");
      const pinataFormData = new FormData();
      pinataFormData.append("file", file);
      const pinataMetadata = JSON.stringify({
        name: fileName,
        keyvalues: { fileHash: calculatedHash },
      });
      pinataFormData.append("pinataMetadata", pinataMetadata);
      const pinataOptions = JSON.stringify({ cidVersion: 1 });
      pinataFormData.append("pinataOptions", pinataOptions);

      const resFile = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        pinataFormData,
        {
          headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY,
          },
           onUploadProgress: (progressEvent) => {
             const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
             setMessage(`Uploading to IPFS: ${percentCompleted}%`);
           }
        }
      );
      const fileCid = resFile.data.IpfsHash;
      console.log("File uploaded to Pinata. CID:", fileCid);
      if (!fileCid) throw new Error("Failed to get IPFS hash from Pinata response.");

      setMessage(`File uploaded to IPFS (CID: ${fileCid.substring(0, 10)}...). Adding to blockchain...`);
      toast.success("File Uploaded to Pinata!");

      // --- Step 8: Add CID and Hash to Blockchain ---
      console.log(`Calling contract.add("${fileCid}", "${calculatedHash}")`);
      const transaction = await contract.add(fileCid, calculatedHash);
      setMessage(`Transaction sent (${transaction.hash.substring(0, 10)}...). Waiting for confirmation...`);
      await transaction.wait();

      setMessage(`✅ Successfully uploaded. CID and Hash recorded on the blockchain!`);
      toast.success("Successfully uploaded. CID and Hash recorded on the blockchain!");
      setFileName("No file selected");
      setFile(null);

    } 
    catch (error) {
      console.error("Upload process failed:", error);
      let specificMessage = `Upload failed: ${error.message || 'Unknown error'}`;
      if (error.message?.includes("Node")) {
        specificMessage = `Node verification error: ${error.message}`;
      } else if (error.response?.data?.error) {
        specificMessage = `Pinata upload error: ${error.response.data.error}`;
      } else if (error.code === "ACTION_REJECTED") { // MetaMask rejection
        specificMessage = "Transaction rejected in MetaMask.";
      } else if (error.reason || error.data?.message) { // Blockchain transaction revert
        specificMessage = `Blockchain transaction failed: ${error.reason || error.data.message}`;
      }
      setMessage(`❌ ${specificMessage}`);
      toast.error(specificMessage);

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="top file-upload-container">
      {/* Updated Title */}
      <h3>Upload & Authenticate Image or Video</h3>
      <form className="form" onSubmit={handleSubmit}>
        <label
          htmlFor="file-upload"
          className={`choose ${!account || isLoading ? "disabled" : ""}`}
        >
          {/* Updated Label Text */}
          {file ? `Change File: ${fileName}` : "Choose Image / Video"}
        </label>
        <input
          disabled={!account || isLoading}
          type="file"
          // *** Updated accept attribute for images AND common video types ***
          accept="image/png, image/jpeg, image/jpg, image/gif, image/webp, video/mp4, video/webm, video/ogg, video/quicktime, video/x-msvideo, video/avi, video/mov, video/mkv"
          id="file-upload"
          name="file"
          onChange={retrieveFile}
          style={{ display: 'none' }}
        />
        {/* Updated Text */}
        <span className="textArea file-name-display">File: {fileName}</span>
        <button
          type="submit"
          className="upload"
          disabled={!file || isLoading || !account}
        >
          {isLoading ? "Processing..." : "Verify & Upload"}
        </button>
      </form>
      {/* Message display (no changes needed here) */}
      {message && (
        <p
          className={`upload-message ${
            message.includes("Error") ||
            message.includes("⚠️") ||
            message.includes("❌") ||
            message.includes("🤔")
              ? "error"
              : message.includes("✅")
              ? "success"
              : "info"
          }`}
        >
          {message}
        </p>
      )}
       {/* Optional: Display calculated hash */}
       {fileHash && <p className="hash-display">File Hash: {fileHash.substring(0, 10)}...</p>}
    </div>
  );
};

export default FileUpload;
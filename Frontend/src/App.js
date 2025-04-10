import Upload from "./artifacts/contracts/Upload.sol/Upload.json";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import FileUpload from "./components/FileUpload";
import Display from "./components/Display";
import Modal from "./components/Modal";
import Notification from "./components/Notification";
import "./App.css";

// --- IMPORTANT: Replace with your ACTUAL deployed contract address ---
// This is the default Hardhat Network address. Use the address from your deployment script output.
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// Example for Sepolia: const CONTRACT_ADDRESS = "0xYourDeployedContractAddressOnSepolia";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null); // Added state for signer
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [network, setNetwork] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(""); // State for connection errors

  // Function to handle initialization and updates
  const initializeProviderAndSigner = async () => {
    setErrorMsg(""); // Clear previous errors
    if (window.ethereum) {
      try {
        setIsLoading(true);
        // Create provider
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any"); // "any" allows network changes
        setProvider(web3Provider);

        // Request accounts & get signer
        await web3Provider.send("eth_requestAccounts", []);
        const currentSigner = web3Provider.getSigner();
        setSigner(currentSigner);

        // Get address
        const currentAddress = await currentSigner.getAddress();
        setAccount(currentAddress);

        // Get network
        const networkData = await web3Provider.getNetwork();
        const networkName = networkData.name === "unknown" ? `Localhost (${networkData.chainId})` : networkData.name;
        setNetwork(networkName);
        console.log(`Connected to network: ${networkName} (Chain ID: ${networkData.chainId})`);
        console.log(`Connected account: ${currentAddress}`);

        // Instantiate contract with the current signer
        const contractInstance = new ethers.Contract(
          CONTRACT_ADDRESS,
          Upload.abi,
          currentSigner // Use the signer obtained above
        );
        setContract(contractInstance);
        console.log("Contract instance created/updated:", contractInstance.address);

      } catch (error) {
        console.error("Error initializing provider/signer:", error);
        if (error.code === 4001) {
          setErrorMsg("Connection rejected. Please connect MetaMask.");
        } else {
          setErrorMsg(`Connection error: ${error.message}`);
        }
        // Reset state on error
        setAccount("");
        setSigner(null);
        setContract(null);
        setNetwork(null);
      } finally {
        setIsLoading(false);
      }
    } else {
      setErrorMsg("MetaMask not detected. Please install MetaMask.");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial connection attempt
    initializeProviderAndSigner();

    // --- Event Listeners ---
    const handleAccountsChanged = (accounts) => {
      console.log("Accounts changed:", accounts);
      // Reload or re-initialize on account change
      // Reloading is simpler to ensure clean state
      window.location.reload();
      // Alternatively, re-run initialization:
      // if (accounts.length === 0) {
      //   // MetaMask disconnected
      //   setAccount(""); setSigner(null); setContract(null); setNetwork(null); setErrorMsg("Wallet disconnected.");
      // } else {
      //   initializeProviderAndSigner();
      // }
    };

    const handleChainChanged = (_chainId) => {
      console.log("Network changed to:", _chainId);
      // Reload is the safest way to handle network changes with ethers v5/v6
      window.location.reload();
    };

    if (window.ethereum) {
      // Add listeners after initial connection attempt
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      // Cleanup function to remove listeners when component unmounts
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []); // Empty dependency array runs only once on mount

  return (
    <>
      {/* Render Modal only if contract and account are available */}
      {modalOpen && contract && account && (
        <Modal
          setModalOpen={setModalOpen}
          contract={contract} // Pass contract instance (with current signer)
          account={account}   // Pass current account address
        />
      )}

      <div className="app-container">
        <header className="app-header">
          <div className="header-title">
            <h1>Welcome to Blockchian Course Project</h1>
            <span className="subtitle">Deepfake Detection & Decentralized Storage</span>
          </div>
          <div className="header-controls">
             {/* Loading/Connection Status */}
             {isLoading ? (
                <span className="connection-status loading">Connecting Wallet...</span>
             ) : account ? (
                <div className="connection-info">
                    <span className="account-address" title={account}>
                        Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}
                    </span>
                    <span className="network-name">
                        Network: {network || 'N/A'}
                    </span>
                </div>
             ) : (
                <span className="connection-status disconnected">Wallet Not Connected</span>
             )}
             {/* Share Button */}
             {account && contract && !modalOpen && ( // Only show if connected and contract ready
               <button className="button share-button" onClick={() => setModalOpen(true)}>
                 Share Access
               </button>
             )}
          </div>
        </header>

        <main className="app-main">
          {/* Display error messages */}
          {errorMsg && <div className="connect-prompt error">{errorMsg}</div>}

          {/* Display components only when fully connected and ready */}
          {account && contract && provider && signer ? (
            <>
              <FileUpload
                account={account}
                provider={provider} // Pass provider if needed by FileUpload
                contract={contract}   // Pass contract instance
              />
              <Display
                contract={contract}   // Pass contract instance
                account={account}     // Pass current account
              />
            </>
          ) : !isLoading && !errorMsg ? ( // Show prompt only if not loading and no error
            <div className="connect-prompt">
              <h2>Please connect your MetaMask wallet to use the application.</h2>
              <p>(Ensure you are on the correct network: {network || 'Target Network'}).</p>
            </div>
          ) : null /* Or a global loading indicator */}
        </main>
      </div>
      <Notification />
    </>
  );
}

export default App;
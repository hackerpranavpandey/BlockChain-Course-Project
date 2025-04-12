# DeepFake Detection

This Project is a decentralized application demonstrating a system for detecting deepfakes in images/videos, verifying their authenticity using cryptographic hashes, storing them decentrally on IPFS, and managing sharing permissions securely via a blockchain smart contract.
---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the Application (Local Development)](#running-the-application-local-development)
  - [1. Start Backend Nodes](#1-start-backend-nodes)
  - [2. Start Local Blockchain Node](#2-start-local-blockchain-node)
  - [3. Deploy Smart Contract](#3-deploy-smart-contract)
  - [4. Update Frontend Configuration](#4-update-frontend-configuration)
  - [5. Start Frontend Application](#5-start-frontend-application)
- [File Structure](#file-structure)
- [Contributors](#contributors)
- [Contributing](#contributing)
- [License](#license)

---

## Introduction

Our project aims to tackle the challenges posed by deepfake technology to media authenticity by leveraging the combined power of blockchain and machine learning.

1.  **Deepfake Detection:** Uploaded media is analyzed by three backend nodes running a deep learning model to assess if it's likely a deepfake. A consensus mechanism can be used for higher reliability.
2.  **Integrity Verification:** A cryptographic hash (SHA-256) of the original media file is calculated before upload.
3.  **Decentralized Storage:** Verified authentic media is uploaded to IPFS via Pinata, ensuring content-addressable, decentralized storage.
4.  **Immutable Record:** The IPFS CID (Content Identifier) and the calculated hash are stored immutably on an Ethereum-compatible blockchain using a Solidity smart contract.
5.  **Secure Sharing & Traceability:** The smart contract manages fine-grained, item-level sharing permissions. Sharing actions are logged via events, enabling traceability of who shared what with whom.
6.  **Client-Side Verification:** When viewing media, the application fetches the content from IPFS, recalculates its hash, and verifies it against the hash stored on the blockchain, ensuring tamper-evidence.

---
## Features

-   **Deepfake Detection:** Analyzes uploads using a Keras/TensorFlow model.
    -   Supports a client-orchestrated consensus mechanism across multiple detection nodes.
-   **Cryptographic Hashing:** Generates SHA-256 hash for integrity verification.
-   **IPFS Upload:** Stores verified media on IPFS via Pinata pinning service.
-   **Blockchain Anchoring:** Records media CID, hash, and ownership on the blockchain (via Solidity Smart Contract).
-   **Client-Side Verification:** Verifies retrieved media integrity against the blockchain hash.
-   **Item-Level Sharing:** Allows owners (or those granted access) to securely share specific media items with other Ethereum addresses.
-   **Sharing Traceability:** Logs sharing events on the blockchain, allowing reconstruction of the sharing history.

---

## Technology Stack

-   **Frontend:** React.js, Ethers.js
-   **Backend:** Python, Flask, TensorFlow/Keras
-   **Blockchain:** Solidity, Hardhat 
-   **Decentralized Storage:** Pinata 
-   **Wallet:** MetaMask 

---

## Requirements
Ensure you have the following installed before proceeding:

**General:**

-   Web Browser with [MetaMask](https://metamask.io/) extension.

**Frontend:**

-   [Node.js](https://nodejs.org/)
-   [npm](https://www.npmjs.com/)

**Backend:**

- Python >= 3.12
- Additional dependencies listed in `requirement.txt`

Install the required packages with:
```bash
pip install -r requirement.txt
```

**Blockchain Development:**

-   Hardhat (installed via npm in the project)

**Services:**

-   [Pinata](https://pinata.cloud/) Account: Required for API Key and Secret Key to pin files to IPFS.

---

## Installation

Clone this repository to your local machine:
```bash
git clone https://github.com/hackerpranavpandey/BlockChain-Course-Project.git
cd BlockChain-Course-Project
```

## Running the Application (Local Development)

### Please see this video on how to start the Application :-
  
    https://youtu.be/aRHTKzFZOkw?si=3DcqbRniiuajmQTQ

### 1. Start Backend Nodes
For the consensus mechanism, you need to run three instances of the Flask backend, each on a different port specified in client/src/components/FileUpload.jsx (e.g., 5001, 5002, 5003).

**Commands common for three terminals**
```bash
cd Backend
# Activate virtual environment if not already active
# source venv/bin/activate # (macOS/Linux) OR venv\Scripts\activate (Windows)
```

**Terminal 1:**
```bash
python backend1.py --port 5001
```

**Terminal 2:**
```bash
python backend2.py --port 5002
```

**Terminal 3:**
```bash
python backend3.py --port 5003
```

### 2. Start Local Blockchain Node
In a new terminal, start the Hardhat local node from the project root:
```bash
npm i # to install node modules
npx hardhat node
```

### 3. Deploy Smart Contract
In another new terminal, deploy the Upload.sol contract to the local Hardhat node:
```bash
npx hardhat run --network localhost scripts/deploy.js
```
IMPORTANT: Note the contract address printed in the console after successful deployment.

### 4. Update Frontend Configuration
Open the file in your frontend where the contract instance is initialized (client/src/App.js). Update the contractAddress variable with the address you noted in the previous step.

### 5. Start Frontend Application
```bash
cd client
npm i # to install node modules
npm start
```

---

## File Structure

```
.
├── Backend/                  # Python Flask backend code
│   ├── backend.py            # Main Flask application logic
│   └── deepfake_model.keras  # Trained deep learning model file for Image
│   └── deepfake-detection-model1.h5  # Trained deep learning model file for Video
├── client/                   # React frontend application (DApp)
│   ├── public/               # Static assets
│   └── src/                  # React source code
│       ├── artifacts/        # Contract artifacts generated by Hardhat (including ABI)
│       ├── components/       # React components (FileUpload, Display, TraceabilityModal, Modal, etc.)
│       ├── contracts/        # Copied contract ABI JSON file(s)
│       ├── App.css           # Main app styles
│       ├── App.js            # Main application component, contract/wallet setup
│       └── index.js          # Entry point
├── contracts/                # Solidity smart contract source code
│   └── Upload.sol            # The main smart contract
├── cache/                    # Hardhat cache 
├── ignition/                 # Hardhat Ignition deployment modules (if used)
├── scripts/                  # Deployment scripts (e.g., deploy.js)
├── hardhat.config.js         # Hardhat configuration file
├── package-lock.json         # Exact dependency versions for npm
├── package.json              # Project metadata and Node.js dependencies
├── requirements.txt          # Python dependencies
└── README.md                 # documentation file
```


---

## Contributors

Pranav Kumar Pandey                   
Parikshit Gehlaut  

## Contributing

We welcome contributions to the our project! To contribute, please follow these steps:

1. Fork the repository
2. create a new branch
3. Make and commit your changes
4. Push to the branch
5. Open a pull request

## License

This project is licensed under the MIT License. See the LICENSE file for details.


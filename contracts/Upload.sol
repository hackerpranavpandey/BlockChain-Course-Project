// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;


contract Upload {

    struct ImageRecord {
        string ipfsCid;   
        string imageHash; 
        address owner;    
        uint256 timestamp;
    }


    mapping(string => ImageRecord) public cidToRecord;
    mapping(address => string[]) public userOwnedCIDs;
    mapping(string => mapping(address => bool)) public itemAccess;
    mapping(address => string[]) public sharedWithUserCIDs;
    mapping(address => mapping(string => uint256)) private sharedWithUserIndex;
    mapping(string => bool) private cidExists;


    event ImageAdded(
        address indexed owner,
        string ipfsCid,
        string imageHash,
        uint256 timestamp
    );

    event ItemAccessGranted(
        string indexed ipfsCid,
        address indexed owner,
        address indexed viewer
    );

     event ItemAccessRevoked(
        string indexed ipfsCid,
        address indexed owner,
        address indexed viewer
    );

    function add(string memory _ipfsCid, string memory _imageHash) external {
        require(bytes(_ipfsCid).length > 0, "Upload: CID cannot be empty");
        require(bytes(_imageHash).length > 0, "Upload: Hash cannot be empty");
        require(!cidExists[_ipfsCid], "Upload: CID already exists");

        address owner = msg.sender;

        ImageRecord memory newRecord = ImageRecord({
            ipfsCid: _ipfsCid,
            imageHash: _imageHash,
            owner: owner,
            timestamp: block.timestamp
        });

        cidToRecord[_ipfsCid] = newRecord;
        userOwnedCIDs[owner].push(_ipfsCid);
        cidExists[_ipfsCid] = true;

        emit ImageAdded(owner, _ipfsCid, _imageHash, block.timestamp);
    }


    function grantItemAccess(string memory _cid, address _viewer) external {
        require(cidExists[_cid], "Upload: Item does not exist");
        require(_viewer != address(0), "Upload: Invalid viewer address");
        require(_viewer != msg.sender, "Upload: Cannot grant access to yourself");

        ImageRecord storage record = cidToRecord[_cid];
        bool callerHasAccess = (record.owner == msg.sender) || itemAccess[_cid][msg.sender];
        require(callerHasAccess, "Upload: Caller lacks permission to grant access");
        
        require(!itemAccess[_cid][_viewer], "Upload: Access already granted");

        itemAccess[_cid][_viewer] = true;

        if (record.owner != _viewer) {
             // Prevent adding duplicate CIDs 
             if(sharedWithUserIndex[_viewer][_cid] == 0) {
                sharedWithUserIndex[_viewer][_cid] = sharedWithUserCIDs[_viewer].length + 1;
                sharedWithUserCIDs[_viewer].push(_cid);
             } else {
                 // Already in the shared array, likely because access was granted, revoked, then granted again.
                 // No action needed 
             }
        }

        emit ItemAccessGranted(_cid, msg.sender, _viewer);
    }

    function revokeItemAccess(string memory _cid, address _viewer) external {
        require(cidExists[_cid], "Upload: Item does not exist");
        ImageRecord storage record = cidToRecord[_cid];
        require(record.owner == msg.sender, "Upload: Only owner can revoke access");
        require(itemAccess[_cid][_viewer], "Upload: Access not currently granted");

        itemAccess[_cid][_viewer] = false;

        // --- Remove from sharedWithUserCIDs array ---
        uint256 indexToRemove = sharedWithUserIndex[_viewer][_cid];
        require(indexToRemove > 0, "Upload: CID not found in viewer's shared list index");
        indexToRemove = indexToRemove - 1;

        string[] storage sharedList = sharedWithUserCIDs[_viewer];
        require(indexToRemove < sharedList.length, "Upload: Index out of bounds");

        if (indexToRemove < sharedList.length - 1) {
            string memory lastCid = sharedList[sharedList.length - 1];
            sharedList[indexToRemove] = lastCid;
            sharedWithUserIndex[_viewer][lastCid] = indexToRemove + 1;
        }

        sharedList.pop();
        delete sharedWithUserIndex[_viewer][_cid];

        emit ItemAccessRevoked(_cid, msg.sender, _viewer);
    }

    function getAccessibleCIDsAndHashes() external view returns (string[] memory cids, string[] memory hashes, address[] memory owners) {
        address caller = msg.sender;

        // 1. Get owned items
        string[] memory ownedCIDs = userOwnedCIDs[caller];
        uint256 ownedCount = ownedCIDs.length;

        // 2. Get items shared with the caller
        string[] memory sharedCIDs = sharedWithUserCIDs[caller];
        uint256 sharedCount = sharedCIDs.length;

        // Temporary storage
        uint256 maxCapacity = ownedCount + sharedCount;
        string[] memory tempCids = new string[](maxCapacity);
        string[] memory tempHashes = new string[](maxCapacity);
        address[] memory tempOwners = new address[](maxCapacity);
        uint256 accessibleCount = 0;

        // Add owned items first
        for (uint i = 0; i < ownedCount; i++) {
             string memory cid = ownedCIDs[i];
             ImageRecord storage record = cidToRecord[cid]; // Fetch record details
             tempCids[accessibleCount] = cid;
             tempHashes[accessibleCount] = record.imageHash;
             tempOwners[accessibleCount] = record.owner; // Owner is the caller
             accessibleCount++;
        }

        // Add items shared with the caller (only if access is still valid AND they aren't already added because the caller owns them)
        for (uint i = 0; i < sharedCount; i++) {
            string memory cid = sharedCIDs[i];
            ImageRecord storage record = cidToRecord[cid]; // Fetch record details

            // Check: 1. Access is still granted. 2. The caller is NOT the owner (already added above).
            if (itemAccess[cid][caller] && record.owner != caller) {
                 if (accessibleCount < maxCapacity) { // Safety check
                     tempCids[accessibleCount] = cid;
                     tempHashes[accessibleCount] = record.imageHash;
                     tempOwners[accessibleCount] = record.owner; // Owner is the original uploader
                     accessibleCount++;
                 } else {
                     break; // Should not be reached if maxCapacity is calculated correctly
                 }
            }
             // If access was revoked (itemAccess[cid][caller] is false), skip it.
             // If the caller owns the item (record.owner == caller), skip it (already added).
        }

        // Resize final arrays to the actual count
        cids = new string[](accessibleCount);
        hashes = new string[](accessibleCount);
        owners = new address[](accessibleCount);

        for (uint i = 0; i < accessibleCount; i++) {
            cids[i] = tempCids[i];
            hashes[i] = tempHashes[i];
            owners[i] = tempOwners[i];
        }
    }

    function checkItemAccess(string memory _cid, address _viewer) external view returns (bool) {
         if (!cidExists[_cid]) return false;

         ImageRecord storage record = cidToRecord[_cid];
         if (record.owner == _viewer) return true;

         return itemAccess[_cid][_viewer];
    }
}
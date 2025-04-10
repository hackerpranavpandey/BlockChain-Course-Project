// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Upload Contract
 * @dev Stores IPFS CIDs and their corresponding SHA-256 hashes for user uploads.
 * Manages sharing access to view this data.
 */
contract Upload {

    // Struct to hold details about each uploaded image
    struct ImageRecord {
        string ipfsCid;   // IPFS Content Identifier (v0 or v1)
        string imageHash; // SHA-256 hash of the original image content
        uint256 timestamp; // Time of upload
    }

    // Struct to manage access permissions granted by an owner to other users
    struct Access {
        address user;   // The address granted or denied access
        bool access;    // True if access is granted, false otherwise
    }

    // --- State Variables ---

    // Mapping from owner address to an array of their image records (CID + Hash)
    mapping(address => ImageRecord[]) public imageData;

    // Mapping to track explicit view permissions: owner => viewer => hasAccess
    mapping(address => mapping(address => bool)) private ownership;

    // Mapping to store the list of users an owner has configured access for (for easy display)
    // owner => array of Access structs
    mapping(address => Access[]) public accessList;

    // Internal tracking to optimize updating the accessList: owner => user => existsInList
    mapping(address => mapping(address => bool)) private userInAccessList;

    // --- Events ---

    /**
     * @dev Emitted when a new image record (CID and hash) is added for a user.
     * @param owner The address of the user who owns the image.
     * @param ipfsCid The IPFS CID of the uploaded image.
     * @param imageHash The SHA-256 hash of the uploaded image.
     * @param timestamp The block timestamp when the image was added.
     */
    event ImageAdded(
        address indexed owner,
        string ipfsCid,
        string imageHash,
        uint256 timestamp
    );

    /**
     * @dev Emitted when access permission is changed for a user.
     * @param owner The address of the user granting/revoking access.
     * @param viewer The address whose access permission is being changed.
     * @param granted True if access was granted, false if revoked.
     */
    event AccessChanged(
        address indexed owner,
        address indexed viewer,
        bool granted
    );


    // --- Functions ---

    /**
     * @notice Adds a new image record (IPFS CID and its hash) for the specified user.
     * @dev Typically, `_user` should be `msg.sender`, but allowing explicit setting
     *      for potential flexibility (e.g., admin functions, proxy patterns).
     *      Requires non-empty CID and hash.
     * @param _user The address of the owner of the image.
     * @param _ipfsCid The IPFS Content Identifier for the image.
     * @param _imageHash The SHA-256 hash of the image content.
     */
    function add(address _user, string memory _ipfsCid, string memory _imageHash) external {
        require(bytes(_ipfsCid).length > 0, "Upload: IPFS CID cannot be empty");
        require(bytes(_imageHash).length > 0, "Upload: Image hash cannot be empty");
        // Consider adding a check: require(_user == msg.sender, "Upload: Cannot add for another user");
        // If you want to strictly enforce uploads only for the caller.

        imageData[_user].push(ImageRecord({
            ipfsCid: _ipfsCid,
            imageHash: _imageHash,
            timestamp: block.timestamp
        }));

        emit ImageAdded(_user, _ipfsCid, _imageHash, block.timestamp);
    }

    /**
     * @notice Grants permission for another user to view the caller's images.
     * @param _viewer The address to grant access to.
     */
    function allow(address _viewer) external {
        require(_viewer != msg.sender, "Upload: Cannot grant access to yourself");
        require(!ownership[msg.sender][_viewer], "Upload: Access already granted"); // Prevent redundant calls/events

        ownership[msg.sender][_viewer] = true;

        // Update or add to the accessList for easy frontend display
        if (userInAccessList[msg.sender][_viewer]) {
            // User exists, find and update their status
            for (uint i = 0; i < accessList[msg.sender].length; i++) {
                if (accessList[msg.sender][i].user == _viewer) {
                    accessList[msg.sender][i].access = true;
                    break; // Found and updated, exit loop
                }
            }
        } else {
            // User does not exist in the list, add them
            accessList[msg.sender].push(Access(_viewer, true));
            userInAccessList[msg.sender][_viewer] = true;
        }

        emit AccessChanged(msg.sender, _viewer, true);
    }

    /**
     * @notice Revokes permission for another user to view the caller's images.
     * @param _viewer The address to revoke access from.
     */
    function disallow(address _viewer) external { // Changed visibility to external
        require(_viewer != msg.sender, "Upload: Cannot revoke access from yourself");
        require(ownership[msg.sender][_viewer], "Upload: Access not currently granted"); // Ensure access exists to revoke

        ownership[msg.sender][_viewer] = false;

        // Update the accessList (user must exist if ownership was true)
        require(userInAccessList[msg.sender][_viewer], "Upload: Inconsistent state - user not in access list");
        for (uint i = 0; i < accessList[msg.sender].length; i++) {
            if (accessList[msg.sender][i].user == _viewer) {
                accessList[msg.sender][i].access = false;
                break; // Found and updated, exit loop
            }
        }

        emit AccessChanged(msg.sender, _viewer, false);
    }

    /**
     * @notice Retrieves the IPFS CIDs and corresponding image hashes for a given user.
     * @dev Requires the caller to be the owner or have been granted access by the owner.
     * @param _user The address whose image records are being requested.
     * @return cids An array of IPFS CIDs.
     * @return hashes An array of corresponding SHA-256 image hashes.
     */
    function display(address _user) external view returns (string[] memory cids, string[] memory hashes) {
        require(_user == msg.sender || ownership[_user][msg.sender], "Upload: You don't have access");

        ImageRecord[] storage records = imageData[_user];
        uint256 count = records.length;

        cids = new string[](count);
        hashes = new string[](count);

        for (uint i = 0; i < count; i++) {
            cids[i] = records[i].ipfsCid;
            hashes[i] = records[i].imageHash;
        }

        // Named return values are implicitly returned
    }

    /**
     * @notice Retrieves the list of users the caller has granted/revoked access to.
     * @return Access[] An array detailing who has access (user address and status).
     */
    function shareAccess() external view returns (Access[] memory) { // Changed visibility to external
        return accessList[msg.sender];
    }

    /**
     * @notice Checks if a specific viewer has access to a specific owner's images.
     * @param _owner The owner address.
     * @param _viewer The viewer address.
     * @return bool True if the viewer has access, false otherwise.
     */
    function checkAccess(address _owner, address _viewer) external view returns (bool) {
        return _owner == _viewer || ownership[_owner][_viewer];
    }
}
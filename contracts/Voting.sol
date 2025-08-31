// contracts/Voting.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    struct Candidate { uint256 id; string name; uint256 voteCount; string imageURI; }
    struct Election  { uint256 id; string title; bool active; }
    struct Vote      { uint256 id; uint256 candidateId; uint64 timestamp; }

    // votos y paginado
    mapping(uint256 => Vote[]) private _votes;
    mapping(uint256 => mapping(uint256 => uint256[])) private _voteIdxByCandidate;

    // catálogo
    mapping(uint256 => Election) public elections;
    mapping(uint256 => Candidate[]) private _candidates;

    // control de unicidad
    mapping(uint256 => mapping(bytes32 => bool)) private _leafUsed;                 // NUEVO: leaf usado por elección
    mapping(uint256 => mapping(bytes32 => bool)) private _nullifierUsed;            // compatibilidad (interno)
    mapping(uint256 => bytes32) public merkleRootOf;

    // estado
    uint256 public currentElectionId;
    uint256 public electionCount;

    // eventos
    event VoteRecorded(uint256 indexed electionId, uint256 indexed candidateId, uint256 indexed voteId, uint64 timestamp);
    event ElectionCreated(uint256 indexed electionId, string title);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name, string imageURI);
    event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, uint256 newTotal);
    event ElectionClosed(uint256 indexed electionId);
    event MerkleRootUpdated(uint256 indexed electionId, bytes32 root);

    // ===== Admin =====
    function createElection(string memory _title) external {
        if (currentElectionId != 0) {
            require(!elections[currentElectionId].active, "Close current election first");
        }
        electionCount++;
        currentElectionId = electionCount;
        elections[currentElectionId] = Election({ id: currentElectionId, title: _title, active: true });
        emit ElectionCreated(currentElectionId, _title);
    }

    function closeCurrentElection() external {
        require(currentElectionId != 0, "No election");
        require(elections[currentElectionId].active, "Already closed");
        elections[currentElectionId].active = false;
        emit ElectionClosed(currentElectionId);
    }

    function addCandidate(uint256 electionId, string memory _name, string memory _imageURI) external {
        require(electionId == currentElectionId, "Must add to current election");
        require(elections[electionId].active, "Election not active");
        uint256 cid = _candidates[electionId].length;
        _candidates[electionId].push(Candidate({ id: cid, name: _name, voteCount: 0, imageURI: _imageURI }));
        emit CandidateAdded(electionId, cid, _name, _imageURI);
    }

    // ===== Lecturas rápidas =====
    function getAllCandidates() external view returns (Candidate[] memory) { return _candidates[currentElectionId]; }
    function getCandidatesCount() external view returns (uint256) { return _candidates[currentElectionId].length; }
    function getCandidate(uint256 candidateId) external view returns (Candidate memory) { return _candidates[currentElectionId][candidateId]; }
    function getElection(uint256 electionId) external view returns (Election memory) { return elections[electionId]; }
    function getVotes(uint256 candidateId) external view returns (uint256) { return _candidates[currentElectionId][candidateId].voteCount; }
    function hasVoted(uint256 electionId, bytes32 nullifier) external view returns (bool) { return _nullifierUsed[electionId][nullifier]; }

    // ===== Merkle helpers (pares ordenados; merkletreejs {sortPairs:true}) =====
    function getVotesCount() external view returns (uint256) { return _votes[currentElectionId].length; }
    function getVotesCount(uint256 electionId) external view returns (uint256) { return _votes[electionId].length; }
    function getVote(uint256 index) external view returns (Vote memory) { return _votes[currentElectionId][index]; }
    function getVote(uint256 electionId, uint256 index) external view returns (Vote memory) { return _votes[electionId][index]; }

    function getVotesRange(uint256 start, uint256 limit) external view returns (Vote[] memory out) {
        Vote[] storage arr = _votes[currentElectionId];
        uint256 n = arr.length; if (start >= n) return out;
        uint256 end = _min(start + limit, n);
        out = new Vote[](end - start);
        for (uint256 i = start; i < end; i++) { out[i - start] = arr[i]; }
    }

    function getVotesRange(uint256 electionId, uint256 start, uint256 limit) external view returns (Vote[] memory out) {
        Vote[] storage arr = _votes[electionId];
        uint256 n = arr.length; if (start >= n) return out;
        uint256 end = _min(start + limit, n);
        out = new Vote[](end - start);
        for (uint256 i = start; i < end; i++) { out[i - start] = arr[i]; }
    }

    function getVotesByCandidateCount(uint256 electionId, uint256 candidateId) external view returns (uint256) {
        return _voteIdxByCandidate[electionId][candidateId].length;
    }

    function getVotesByCandidateRange(uint256 electionId, uint256 candidateId, uint256 start, uint256 limit)
        external view returns (Vote[] memory out)
    {
        uint256[] storage idxs = _voteIdxByCandidate[electionId][candidateId];
        uint256 n = idxs.length; if (start >= n) return out;
        uint256 end = _min(start + limit, n);
        out = new Vote[](end - start);
        Vote[] storage arr = _votes[electionId];
        for (uint256 i = start; i < end; i++) { out[i - start] = arr[idxs[i]]; }
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashPair(computed, proof[i]);
        }
        return computed == root;
    }

    // ===== Voto con prueba Merkle (sin ZK), 1 leaf = 1 voto =====
    // Firma compatible con tu relayer: el primer parámetro se ignora y se deriva un nullifier interno
    function voteWithNullifier(
        bytes32 /*ignored*/,
        uint256 candidateId,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");
        bytes32 root = merkleRootOf[eid];
        require(root != bytes32(0), "Root not set");
        require(_verify(proof, root, leaf), "Invalid proof");
        require(!_leafUsed[eid][leaf], "Leaf used");

        // marca unicidad por leaf y por nullifier interno (compatibilidad con lecturas)
        _leafUsed[eid][leaf] = true;
        bytes32 internalNullifier = keccak256(abi.encodePacked(leaf, eid));
        _nullifierUsed[eid][internalNullifier] = true;

        Candidate storage c = _candidates[eid][candidateId];
        unchecked { c.voteCount += 1; }
        _recordVote(eid, candidateId);
        emit VoteCast(eid, candidateId, c.voteCount);
    }

    // Mantén la versión antigua para que si alguien la usa sin prueba, falle explícitamente
    function voteWithNullifier(bytes32, uint256) external pure {
        revert("Use voteWithNullifier(bytes32,uint256,bytes32[],bytes32)");
    }

    // Legacy sin nulificador (no usar en prod)
    function vote(uint256 candidateId) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");
        Candidate storage c = _candidates[eid][candidateId];
        unchecked { c.voteCount += 1; }
        _recordVote(eid, candidateId);
        emit VoteCast(eid, candidateId, c.voteCount);
    }

    function setCurrentElectionMerkleRoot(bytes32 root) external {
        require(currentElectionId != 0, "No election");
        require(elections[currentElectionId].active, "Election closed");
        require(root != bytes32(0), "Invalid root");
        merkleRootOf[currentElectionId] = root;
        emit MerkleRootUpdated(currentElectionId, root);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }

    function _recordVote(uint256 eid, uint256 candidateId) private {
        uint256 vid = _votes[eid].length;
        _votes[eid].push(Vote({ id: vid, candidateId: candidateId, timestamp: uint64(block.timestamp) }));
        _voteIdxByCandidate[eid][candidateId].push(vid);
        emit VoteRecorded(eid, candidateId, vid, uint64(block.timestamp));
    }
}

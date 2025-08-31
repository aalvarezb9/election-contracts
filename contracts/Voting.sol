// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    struct Election {
        uint256 id;
        string title;
        bool active;
    }

    // Elecciones registradas
    mapping(uint256 => Election) public elections;

    // Candidatos por elección
    mapping(uint256 => Candidate[]) private _candidates;

    // Nulificadores usados por elección: evita doble voto preservando anonimato
    mapping(uint256 => mapping(bytes32 => bool)) private _nullifierUsed;

    mapping(uint256 => bytes32) public merkleRootOf;

    // Estado
    uint256 public currentElectionId;
    uint256 public electionCount;

    // Eventos
    event ElectionCreated(uint256 indexed electionId, string title);
    event CandidateAdded(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        string name
    );
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        uint256 newTotal
    );
    event ElectionClosed(uint256 indexed electionId);
    event MerkleRootUpdated(uint256 indexed electionId, bytes32 root);

    // ===== Admin =====

    function createElection(string memory _title) external {
        if (currentElectionId != 0) {
            require(
                !elections[currentElectionId].active,
                "Close current election first"
            );
        }
        
        electionCount++;
        currentElectionId = electionCount;

        elections[currentElectionId] = Election({
            id: currentElectionId,
            title: _title,
            active: true
        });

        emit ElectionCreated(currentElectionId, _title);
    }

    function closeCurrentElection() external {
        require(currentElectionId != 0, "No election");
        require(elections[currentElectionId].active, "Already closed");
        
        elections[currentElectionId].active = false;
        emit ElectionClosed(currentElectionId);
    }

    function addCandidate(uint256 electionId, string memory _name) external {
        require(
            electionId == currentElectionId,
            "Must add to current election"
        );
        require(elections[electionId].active, "Election not active");
        
        uint256 cid = _candidates[electionId].length;
        _candidates[electionId].push(
            Candidate({id: cid, name: _name, voteCount: 0})
        );
        
        emit CandidateAdded(electionId, cid, _name);
    }

    // ===== Lecturas =====

    function getAllCandidates() external view returns (Candidate[] memory) {
        return _candidates[currentElectionId];
    }

    function getCandidatesCount() external view returns (uint256) {
        return _candidates[currentElectionId].length;
    }

    function getCandidate(
        uint256 candidateId
    ) external view returns (Candidate memory) {
        return _candidates[currentElectionId][candidateId];
    }

    function getElection(
        uint256 electionId
    ) external view returns (Election memory) {
        return elections[electionId];
    }

    function getVotes(uint256 candidateId) external view returns (uint256) {
        return _candidates[currentElectionId][candidateId].voteCount;
    }

    function hasVoted(
        uint256 electionId,
        bytes32 nullifier
    ) external view returns (bool) {
        return _nullifierUsed[electionId][nullifier];
    }

    // ===== Merkle helpers (pares ordenados; compatible con merkletreejs sortPairs:true) =====

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a <= b 
            ? keccak256(abi.encodePacked(a, b)) 
            : keccak256(abi.encodePacked(b, a));
    }

    function _verify(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashPair(computed, proof[i]);
        }
        return computed == root;
    }

    // ===== Voto con nulificador y verificación Merkle on-chain =====

    // Firma que espera tu relayer
    function voteWithNullifier(
        bytes32 nullifier,
        uint256 candidateId,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");
        require(merkleRootOf[eid] != bytes32(0), "Root not set");
        require(!_nullifierUsed[eid][nullifier], "Already voted");
        require(_verify(proof, merkleRootOf[eid], leaf), "Invalid proof");

        _nullifierUsed[eid][nullifier] = true;
        
        Candidate storage c = _candidates[eid][candidateId];
        unchecked {
            c.voteCount += 1;
        }
        
        emit VoteCast(eid, candidateId, c.voteCount);
    }

    // Versión antigua: si quieres, puedes mantenerla para compatibilidad temporal.
    // Recomiendo deshabilitarla en producción para no permitir saltarse la prueba Merkle.
    function voteWithNullifier(bytes32 nullifier, uint256 candidateId) external {
        revert("Use voteWithNullifier(bytes32,uint256,bytes32[],bytes32)");
    }

    // Legacy sin nulificador (no usar en prod)
    function vote(uint256 candidateId) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");
        
        Candidate storage c = _candidates[eid][candidateId];
        unchecked {
            c.voteCount += 1;
        }
        
        emit VoteCast(eid, candidateId, c.voteCount);
    }

    function setCurrentElectionMerkleRoot(bytes32 root) external {
        require(currentElectionId != 0, "No election");
        require(elections[currentElectionId].active, "Election closed");
        require(root != bytes32(0), "Invalid root");

        merkleRootOf[currentElectionId] = root;
        emit MerkleRootUpdated(currentElectionId, root);
    }
}
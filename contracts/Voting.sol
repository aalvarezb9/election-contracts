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

    // Estado
    uint256 public currentElectionId;
    uint256 public electionCount;

    // Eventos
    event ElectionCreated(uint256 indexed electionId, string title);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, uint256 newTotal);
    event ElectionClosed(uint256 indexed electionId);

    // ---------- Admin ----------
    function createElection(string memory _title) external {
        if (currentElectionId != 0) {
            require(!elections[currentElectionId].active, "Close current election first");
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
        require(electionId == currentElectionId, "Must add to current election");
        require(elections[electionId].active, "Election not active");
        uint256 cid = _candidates[electionId].length;
        _candidates[electionId].push(Candidate({ id: cid, name: _name, voteCount: 0 }));
        emit CandidateAdded(electionId, cid, _name);
    }

    // ---------- Lecturas ----------
    function getAllCandidates() external view returns (Candidate[] memory) {
        return _candidates[currentElectionId];
    }

    function getCandidatesCount() external view returns (uint256) {
        return _candidates[currentElectionId].length;
    }

    function getCandidate(uint256 candidateId) external view returns (Candidate memory) {
        return _candidates[currentElectionId][candidateId];
    }

    function getElection(uint256 electionId) external view returns (Election memory) {
        return elections[electionId];
    }

    function getVotes(uint256 candidateId) external view returns (uint256) {
        return _candidates[currentElectionId][candidateId].voteCount;
    }

    function hasVoted(uint256 electionId, bytes32 nullifier) external view returns (bool) {
        return _nullifierUsed[electionId][nullifier];
    }

    // ---------- Voto (con nulificador) ----------
    /// @notice Vota por `candidateId` usando un nulificador único para *esta elección*
    /// @dev El relayer calcula el nulificador de forma determinística (DNI+salt del RNP [+ electionId]).
    function voteWithNullifier(bytes32 nullifier, uint256 candidateId) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");
        require(!_nullifierUsed[eid][nullifier], "Already voted");

        _nullifierUsed[eid][nullifier] = true;
        Candidate storage c = _candidates[eid][candidateId];
        unchecked { c.voteCount += 1; }

        emit VoteCast(eid, candidateId, c.voteCount);
    }

    // (Se mantiene para compat, pero ya NO lo uses en producción)
    function vote(uint256 candidateId) external {
        uint256 eid = currentElectionId;
        require(eid != 0, "No election");
        require(elections[eid].active, "Election closed");
        require(candidateId < _candidates[eid].length, "Invalid candidate");

        Candidate storage c = _candidates[eid][candidateId];
        unchecked { c.voteCount += 1; }
        emit VoteCast(eid, candidateId, c.voteCount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IVotes {
    function getPastVotes(
        address account,
        uint256 timepoint
    ) external view returns (uint256);
}

contract V2Governor {
    enum ProposalStatus {
        Active,
        Defeated,
        Executed,
        Expired,
        Canceled
    }

    struct Proposal {
        uint256 id;
        address proposer;
        uint64 snapshotBlock;
        uint64 startTime;
        uint64 endTime;
        ProposalStatus status;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 quorum;
        string title;
        string description;
        address[] targets;
        uint256[] values;
        string[] signatures;
        bytes[] calldatas;
    }

    IVotes public immutable token;
    uint256 public votingPeriodBlocks;
    uint256 public quorumRequired;
    uint256 public proposalThreshold;
    uint256 public gracePeriod;

    Proposal[] public proposals;

    mapping(uint256 => mapping(address => bool)) public hasVoted;

    error InvalidToken();
    error InvalidProposal();
    error ProposalNotActive();
    error VotingEnded();
    error AlreadyVoted();
    error NoVotingPower();
    error InvalidVoteType();
    error VotingActive();
    error QuorumNotMet();
    error ProposalDefeated();
    error ProposerVotesBelowThreshold();
    error CannotCancel();
    error ExecutionFailed();
    error OnlyGovernor();
    error ProposalExpired();

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address[] targets,
        uint256[] values,
        string[] signatures,
        bytes[] calldatas,
        string title,
        string description,
        uint256 snapshotBlock,
        uint256 startTime,
        uint256 endTime,
        uint256 quorum
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 voteType,
        uint256 weight
    );

    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCanceled(uint256 indexed proposalId);
    event ProposalThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event QuorumRequiredUpdated(uint256 oldQuorum, uint256 newQuorum);
    event VotingPeriodUpdated(uint256 oldVotingPeriod, uint256 newVotingPeriod);
    event GracePeriodUpdated(uint256 oldGracePeriod, uint256 newGracePeriod);

    modifier onlyGovernor() {
        if (msg.sender != address(this)) revert OnlyGovernor();
        _;
    }

    constructor(
        address _token,
        uint256 _votingPeriodBlocks,
        uint256 _quorum,
        uint256 _proposalThreshold,
        uint256 _gracePeriod
    ) {
        if (_token == address(0)) revert InvalidToken();
        token = IVotes(_token);
        votingPeriodBlocks = _votingPeriodBlocks;
        quorumRequired = _quorum;
        proposalThreshold = _proposalThreshold;
        gracePeriod = _gracePeriod;
    }

    function setProposalThreshold(uint256 newThreshold) external onlyGovernor {
        emit ProposalThresholdUpdated(proposalThreshold, newThreshold);
        proposalThreshold = newThreshold;
    }

    function setQuorumRequired(uint256 newQuorum) external onlyGovernor {
        emit QuorumRequiredUpdated(quorumRequired, newQuorum);
        quorumRequired = newQuorum;
    }

    function setVotingPeriodBlocks(uint256 newVotingPeriod) external onlyGovernor {
        emit VotingPeriodUpdated(votingPeriodBlocks, newVotingPeriod);
        votingPeriodBlocks = newVotingPeriod;
    }

    function setGracePeriod(uint256 newGracePeriod) external onlyGovernor {
        emit GracePeriodUpdated(gracePeriod, newGracePeriod);
        gracePeriod = newGracePeriod;
    }

    function propose(
        address[] calldata targets,
        uint256[] calldata values,
        string[] calldata signatures,
        bytes[] calldata calldatas,
        string calldata title,
        string calldata description
    ) external returns (uint256) {
        if (
            targets.length != values.length ||
            targets.length != signatures.length ||
            targets.length != calldatas.length
        ) revert InvalidProposal();

        // Verify proposer's voting power at block.number - 1 to prevent flash loan exploits
        uint256 proposerVotes = token.getPastVotes(msg.sender, block.number - 1);
        if (proposerVotes < proposalThreshold) revert ProposerVotesBelowThreshold();

        uint256 proposalId = proposals.length;
        uint64 snapshotBlock = uint64(block.number - 1);
        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(votingPeriodBlocks * 12);

        Proposal storage proposal = proposals.push();
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.snapshotBlock = snapshotBlock;
        proposal.startTime = startTime;
        proposal.endTime = endTime;
        proposal.status = ProposalStatus.Active;
        proposal.forVotes = 0;
        proposal.againstVotes = 0;
        proposal.abstainVotes = 0;
        proposal.quorum = quorumRequired;
        proposal.title = title;
        proposal.description = description;
        proposal.targets = targets;
        proposal.values = values;
        proposal.signatures = signatures;
        proposal.calldatas = calldatas;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            targets,
            values,
            signatures,
            calldatas,
            title,
            description,
            snapshotBlock,
            startTime,
            endTime,
            quorumRequired
        );
        return proposalId;
    }

    function castVote(uint256 proposalId, uint8 voteType) external {
        if (proposalId >= proposals.length) revert InvalidProposal();
        Proposal storage proposal = proposals[proposalId];

        ProposalStatus status = proposal.status;
        uint64 endTime = proposal.endTime;
        uint64 snapshotBlock = proposal.snapshotBlock;

        if (status != ProposalStatus.Active) revert ProposalNotActive();
        if (block.timestamp > endTime) revert VotingEnded();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        uint256 weight = token.getPastVotes(msg.sender, snapshotBlock);
        if (weight == 0) revert NoVotingPower();

        hasVoted[proposalId][msg.sender] = true;

        unchecked {
            if (voteType == 0) {
                proposal.againstVotes += weight;
            } else if (voteType == 1) {
                proposal.forVotes += weight;
            } else if (voteType == 2) {
                proposal.abstainVotes += weight;
            } else {
                revert InvalidVoteType();
            }
        }

        emit VoteCast(proposalId, msg.sender, voteType, weight);
    }

    function execute(uint256 proposalId) external {
        if (proposalId >= proposals.length) revert InvalidProposal();
        Proposal storage proposal = proposals[proposalId];

        ProposalStatus status = proposal.status;
        uint64 endTime = proposal.endTime;

        if (status != ProposalStatus.Active) revert ProposalNotActive();
        if (block.timestamp <= endTime) revert VotingActive();
        if (block.timestamp > endTime + gracePeriod) revert ProposalExpired();

        uint256 forVotes = proposal.forVotes;
        uint256 againstVotes = proposal.againstVotes;
        uint256 abstainVotes = proposal.abstainVotes;
        uint256 quorum = proposal.quorum;

        uint256 totalVotes;
        unchecked {
            totalVotes = forVotes + againstVotes + abstainVotes;
        }

        if (totalVotes < quorum) revert QuorumNotMet();
        if (forVotes <= againstVotes) revert ProposalDefeated();

        proposal.status = ProposalStatus.Executed;

        // Perform execution of the actions
        uint256 len = proposal.targets.length;
        for (uint256 i = 0; i < len; ) {
            address target = proposal.targets[i];
            uint256 value = proposal.values[i];
            string memory signature = proposal.signatures[i];
            bytes memory calldata_ = proposal.calldatas[i];

            bytes memory callData;
            if (bytes(signature).length == 0) {
                callData = calldata_;
            } else {
                callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), calldata_);
            }

            (bool success, ) = target.call{value: value}(callData);
            if (!success) revert ExecutionFailed();

            unchecked { ++i; }
        }

        emit ProposalExecuted(proposalId);
    }

    function cancel(uint256 proposalId) external {
        if (proposalId >= proposals.length) revert InvalidProposal();
        Proposal storage proposal = proposals[proposalId];

        ProposalStatus status = proposal.status;
        if (status != ProposalStatus.Active) revert ProposalNotActive();

        // Proposer can cancel, or anyone if the proposer's current voting power drops below threshold
        if (
            msg.sender != proposal.proposer &&
            token.getPastVotes(proposal.proposer, block.number - 1) >= proposalThreshold
        ) {
            revert CannotCancel();
        }

        proposal.status = ProposalStatus.Canceled;

        emit ProposalCanceled(proposalId);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(
        uint256 proposalId
    ) external view returns (Proposal memory) {
        if (proposalId >= proposals.length) revert InvalidProposal();
        Proposal memory p = proposals[proposalId];
        p.status = getProposalStatus(proposalId);
        return p;
    }

    function getProposalStatus(uint256 proposalId) public view returns (ProposalStatus) {
        if (proposalId >= proposals.length) revert InvalidProposal();
        Proposal memory p = proposals[proposalId];

        if (p.status == ProposalStatus.Canceled) {
            return ProposalStatus.Canceled;
        }
        if (p.status == ProposalStatus.Executed) {
            return ProposalStatus.Executed;
        }

        if (block.timestamp > p.endTime) {
            uint256 totalVotes;
            unchecked {
                totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;
            }
            if (totalVotes >= p.quorum && p.forVotes > p.againstVotes) {
                if (block.timestamp > p.endTime + gracePeriod) {
                    return ProposalStatus.Expired;
                }
                // Returns Active if it's passed the end time, within grace period, but not executed yet
                return ProposalStatus.Active;
            } else if (totalVotes >= p.quorum) {
                return ProposalStatus.Defeated;
            } else {
                return ProposalStatus.Expired;
            }
        }

        return ProposalStatus.Active;
    }
}

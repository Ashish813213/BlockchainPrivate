// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Poll - on-chain voting
contract Poll {
    struct Proposal {
        string title;
        string description;
        uint256 votes;
        bool exists;
    }

    Proposal[] private proposals;
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    address public owner;
    uint256 public totalVotes;

    event ProposalCreated(uint256 indexed proposalId, string title, address indexed creator);
    event Voted(uint256 indexed proposalId, address indexed voter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Poll: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createProposal(string calldata _title, string calldata _description) external onlyOwner {
        proposals.push(Proposal({ title: _title, description: _description, votes: 0, exists: true }));
        emit ProposalCreated(proposals.length - 1, _title, msg.sender);
    }

    function vote(uint256 _proposalId) external {
        require(_proposalId < proposals.length, "Poll: no such proposal");
        require(!hasVoted[msg.sender][_proposalId], "Poll: already voted");
        hasVoted[msg.sender][_proposalId] = true;
        proposals[_proposalId].votes += 1;
        totalVotes += 1;
        emit Voted(_proposalId, msg.sender);
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(uint256 _proposalId)
        external
        view
        returns (string memory title, string memory description, uint256 votes)
    {
        require(_proposalId < proposals.length, "Poll: no such proposal");
        Proposal storage p = proposals[_proposalId];
        return (p.title, p.description, p.votes);
    }

    function getProposals() external view returns (Proposal[] memory) {
        return proposals;
    }
}

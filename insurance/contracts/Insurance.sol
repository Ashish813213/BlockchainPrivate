// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Insurance - a deliberately small policy and claims example
contract Insurance {
    struct Policy {
        uint256 id;
        address holder;
        uint256 premium;
        uint256 coverage;
        bool active;
        bool claimed;
    }

    address public owner;
    Policy[] private policies;

    event PolicyPurchased(uint256 indexed policyId, address indexed holder, uint256 premium, uint256 coverage);
    event ClaimSubmitted(uint256 indexed policyId, uint256 amount);
    event ClaimPaid(uint256 indexed policyId, address indexed holder, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Insurance: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function buyPolicy(uint256 _coverage) external payable returns (uint256) {
        require(msg.value > 0, "Insurance: premium must be > 0");
        require(_coverage > 0, "Insurance: coverage must be > 0");
        uint256 id = policies.length;
        policies.push(Policy(id, msg.sender, msg.value, _coverage, true, false));
        emit PolicyPurchased(id, msg.sender, msg.value, _coverage);
        return id;
    }

    function submitClaim(uint256 _policyId, uint256 _amount) external {
        require(_policyId < policies.length, "Insurance: no policy");
        Policy storage policy = policies[_policyId];
        require(policy.active, "Insurance: policy is inactive");
        require(msg.sender == policy.holder, "Insurance: only holder can claim");
        require(!policy.claimed, "Insurance: claim already submitted");
        require(_amount > 0 && _amount <= policy.coverage, "Insurance: invalid claim amount");
        policy.claimed = true;
        emit ClaimSubmitted(_policyId, _amount);
    }

    function approveClaim(uint256 _policyId, uint256 _amount) external onlyOwner {
        require(_policyId < policies.length, "Insurance: no policy");
        Policy storage policy = policies[_policyId];
        require(policy.claimed, "Insurance: claim not submitted");
        require(_amount > 0 && _amount <= policy.coverage, "Insurance: invalid payout");
        require(address(this).balance >= _amount, "Insurance: insufficient funds");
        policy.active = false;
        (bool ok, ) = payable(policy.holder).call{value: _amount}("");
        require(ok, "Insurance: payout failed");
        emit ClaimPaid(_policyId, policy.holder, _amount);
    }

    function policyCount() external view returns (uint256) {
        return policies.length;
    }

    function getPolicies() external view returns (Policy[] memory) {
        return policies;
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}

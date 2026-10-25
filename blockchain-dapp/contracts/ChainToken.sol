// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChainToken - an ERC-20 style token
contract ChainToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "ChainToken: not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        _mint(msg.sender, _initialSupply);
    }

    function transfer(address _to, uint256 _value) external returns (bool) {
        _transfer(msg.sender, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) external returns (bool) {
        require(_spender != address(0), "ChainToken: zero spender");
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool) {
        uint256 allowed = allowance[_from][msg.sender];
        require(allowed >= _value, "ChainToken: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[_from][msg.sender] = allowed - _value;
        }
        _transfer(_from, _to, _value);
        return true;
    }

    function mint(address _to, uint256 _value) external onlyOwner {
        _mint(_to, _value);
    }

    function _mint(address _to, uint256 _value) internal {
        require(_to != address(0), "ChainToken: zero address");
        totalSupply += _value;
        balanceOf[_to] += _value;
        emit Transfer(address(0), _to, _value);
    }

    function _transfer(address _from, address _to, uint256 _value) internal {
        require(_to != address(0), "ChainToken: zero address");
        require(balanceOf[_from] >= _value, "ChainToken: insufficient balance");
        unchecked {
            balanceOf[_from] -= _value;
            balanceOf[_to] += _value;
        }
        emit Transfer(_from, _to, _value);
    }
}

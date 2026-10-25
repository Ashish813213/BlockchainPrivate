// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Hostel - rooms, tenants and rent payments on chain
contract Hostel {
    struct Room {
        uint256 id;
        uint256 rent;
        bool occupied;
        string tenantName;
        address tenant;
        uint256 monthsPaid;
        uint256 lastPayment;
    }

    Room[] private rooms;
    address public owner;

    event RoomAdded(uint256 indexed roomId, uint256 rent);
    event RoomOccupied(uint256 indexed roomId, address indexed tenant, string tenantName);
    event RentPaid(uint256 indexed roomId, address indexed payer, uint256 amount, uint256 monthsPaid);
    event RoomVacated(uint256 indexed roomId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Hostel: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addRoom(uint256 _rent) external onlyOwner returns (uint256) {
        require(_rent > 0, "Hostel: rent must be > 0");
        rooms.push(Room({ id: rooms.length, rent: _rent, occupied: false, tenantName: "", tenant: address(0), monthsPaid: 0, lastPayment: 0 }));
        emit RoomAdded(rooms.length - 1, _rent);
        return rooms.length - 1;
    }

    function setRent(uint256 _roomId, uint256 _rent) external onlyOwner {
        require(_roomId < rooms.length, "Hostel: no room");
        require(_rent > 0, "Hostel: rent must be > 0");
        rooms[_roomId].rent = _rent;
    }

    function occupy(uint256 _roomId, address _tenant, string calldata _tenantName) external onlyOwner {
        require(_roomId < rooms.length, "Hostel: no room");
        require(_tenant != address(0), "Hostel: zero tenant");
        Room storage r = rooms[_roomId];
        require(!r.occupied, "Hostel: room already occupied");
        r.occupied = true;
        r.tenant = _tenant;
        r.tenantName = _tenantName;
        r.monthsPaid = 0;
        r.lastPayment = 0;
        emit RoomOccupied(_roomId, _tenant, _tenantName);
    }

    function vacate(uint256 _roomId) external onlyOwner {
        require(_roomId < rooms.length, "Hostel: no room");
        Room storage r = rooms[_roomId];
        require(r.occupied, "Hostel: room is empty");
        r.occupied = false;
        r.tenant = address(0);
        r.tenantName = "";
        r.monthsPaid = 0;
        r.lastPayment = 0;
        emit RoomVacated(_roomId);
    }

    function payRent(uint256 _roomId) external payable {
        require(_roomId < rooms.length, "Hostel: no room");
        Room storage r = rooms[_roomId];
        require(r.occupied, "Hostel: room is empty");
        require(msg.sender == r.tenant, "Hostel: only the tenant can pay");
        require(msg.value == r.rent, "Hostel: send the exact rent amount");
        r.monthsPaid += 1;
        r.lastPayment = block.timestamp;
        emit RentPaid(_roomId, msg.sender, msg.value, r.monthsPaid);
    }

    function withdraw(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance, "Hostel: insufficient balance");
        (bool ok, ) = payable(owner).call{ value: _amount }("");
        require(ok, "Hostel: withdraw failed");
    }

    function roomCount() external view returns (uint256) {
        return rooms.length;
    }

    function getRooms() external view returns (Room[] memory) {
        return rooms;
    }

    function getRoom(uint256 _roomId) external view returns (Room memory) {
        require(_roomId < rooms.length, "Hostel: no room");
        return rooms[_roomId];
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}

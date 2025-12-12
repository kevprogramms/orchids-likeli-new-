// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CollateralVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateralToken;

    address public feeRecipient;

    mapping(address => uint256) public userBalance;
    mapping(address => uint256) public marketBalance;

    mapping(address => bool) public isMarket;

    uint256 public feeBalance;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event MarketStatusUpdated(address indexed market, bool allowed);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeCollected(address indexed from, bool indexed fromMarket, uint256 amount);
    event CollateralMoved(address indexed from, address indexed to, uint256 amount);

    error NotAuthorized();
    error NotMarket();
    error InvalidMarket();
    error InsufficientBalance();

    modifier onlyMarket() {
        if (!isMarket[msg.sender]) revert NotMarket();
        _;
    }

    constructor(address _collateralToken, address initialOwner, address _feeRecipient) Ownable(initialOwner) {
        collateralToken = IERC20(_collateralToken);
        feeRecipient = _feeRecipient;
    }

    function setMarketAllowed(address market, bool allowed) external onlyOwner {
        isMarket[market] = allowed;
        emit MarketStatusUpdated(market, allowed);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    function deposit(uint256 amount) external {
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        userBalance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (userBalance[msg.sender] < amount) revert InsufficientBalance();
        userBalance[msg.sender] -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function moveFromUserToMarket(address user, address market, uint256 amount) external {
        if (!(isMarket[msg.sender] || msg.sender == owner())) revert NotAuthorized();
        if (!isMarket[market]) revert InvalidMarket();
        if (userBalance[user] < amount) revert InsufficientBalance();

        userBalance[user] -= amount;
        marketBalance[market] += amount;

        emit CollateralMoved(user, market, amount);
    }

    function moveFromMarketToUser(address market, address user, uint256 amount) external {
        if (msg.sender != market) revert NotMarket();
        if (marketBalance[market] < amount) revert InsufficientBalance();

        marketBalance[market] -= amount;
        userBalance[user] += amount;

        emit CollateralMoved(market, user, amount);
    }

    function collectFeeFromUser(address user, uint256 amount) external onlyOwner {
        if (userBalance[user] < amount) revert InsufficientBalance();
        userBalance[user] -= amount;
        feeBalance += amount;
        emit FeeCollected(user, false, amount);
    }

    function collectFeeFromMarket(address market, uint256 amount) external {
        if (msg.sender != market) revert NotMarket();
        if (marketBalance[market] < amount) revert InsufficientBalance();

        marketBalance[market] -= amount;
        feeBalance += amount;
        emit FeeCollected(market, true, amount);
    }

    function withdrawFees(uint256 amount) external {
        if (msg.sender != feeRecipient && msg.sender != owner()) revert NotAuthorized();
        if (amount > feeBalance) revert InsufficientBalance();

        feeBalance -= amount;
        collateralToken.safeTransfer(feeRecipient, amount);
    }
}

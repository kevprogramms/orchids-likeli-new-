// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CPMMMath } from "./libraries/CPMMMath.sol";
import { ICollateralVault } from "./interfaces/ICollateralVault.sol";

contract CPMMMarket {
    using CPMMMath for uint256;

    uint8 public constant OUTCOME_YES = 0;
    uint8 public constant OUTCOME_NO = 1;
    uint8 public constant OUTCOME_VOID = 2;

    enum MarketStatus {
        ACTIVE,
        RESOLVED
    }

    uint256 public immutable marketId;
    address public immutable creator;

    string public question;
    string public category;
    uint256 public resolutionDate;
    string public rules;

    address public immutable factory;
    address public immutable collateralVault;
    address public resolutionOracle;

    MarketStatus public status;
    uint8 public winningOutcome;

    uint16 public feeBps;

    uint256 public poolYes;
    uint256 public poolNo;

    uint256 public totalVolume;
    uint256 public tradeCount;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;

    bool public bootstrapped;

    event LiquidityAdded(address indexed provider, uint256 amount);

    event Trade(
        address indexed user,
        uint8 indexed outcome,
        bool isBuy,
        uint256 shares,
        uint256 collateralAmount,
        uint256 feeAmount,
        uint256 yesProbability,
        uint256 noProbability,
        uint256 timestamp
    );

    event MarketResolved(uint8 indexed winningOutcome, uint256 timestamp);
    event PayoutClaimed(address indexed user, uint256 amount);

    error OnlyFactory();
    error OnlyOracle();
    error InvalidOutcome();
    error MarketNotActive();
    error MarketNotResolved();
    error InsufficientShares();
    error AlreadyBootstrapped();

    modifier onlyActive() {
        if (status != MarketStatus.ACTIVE) revert MarketNotActive();
        _;
    }

    modifier onlyResolved() {
        if (status != MarketStatus.RESOLVED) revert MarketNotResolved();
        _;
    }

    constructor(
        uint256 _marketId,
        address _creator,
        string memory _question,
        string memory _category,
        uint256 _resolutionDate,
        string memory _rules,
        address _factory,
        address _collateralVault,
        address _resolutionOracle,
        uint16 _feeBps
    ) {
        marketId = _marketId;
        creator = _creator;

        question = _question;
        category = _category;
        resolutionDate = _resolutionDate;
        rules = _rules;

        factory = _factory;
        collateralVault = _collateralVault;
        resolutionOracle = _resolutionOracle;
        feeBps = _feeBps;

        status = MarketStatus.ACTIVE;
    }

    function bootstrapLiquidity(address provider, uint256 amount) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (bootstrapped) revert AlreadyBootstrapped();
        bootstrapped = true;

        // Liquidity adds equal YES and NO shares to the pools.
        poolYes += amount;
        poolNo += amount;

        emit LiquidityAdded(provider, amount);
    }

    function addLiquidity(uint256 amount) external onlyActive {
        ICollateralVault(collateralVault).moveFromUserToMarket(msg.sender, address(this), amount);

        poolYes += amount;
        poolNo += amount;

        emit LiquidityAdded(msg.sender, amount);
    }

    function getProbabilities() public view returns (uint256 yesProb, uint256 noProb) {
        yesProb = CPMMMath.getProbabilityYes(poolYes, poolNo);
        noProb = CPMMMath.getProbabilityNo(poolYes, poolNo);
    }

    function invariantK() external view returns (uint256) {
        return CPMMMath.invariantK(poolYes, poolNo);
    }

    function buy(uint8 outcome, uint256 collateralIn, uint256 minSharesOut) external onlyActive returns (uint256 sharesOut) {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();

        uint256 feeAmount = (collateralIn * feeBps) / 10_000;
        uint256 netIn = collateralIn - feeAmount;

        ICollateralVault vault = ICollateralVault(collateralVault);
        vault.moveFromUserToMarket(msg.sender, address(this), collateralIn);
        if (feeAmount > 0) {
            vault.collectFeeFromMarket(address(this), feeAmount);
        }

        (uint256 newYes, uint256 newNo, uint256 _sharesOut) = CPMMMath.buy(poolYes, poolNo, outcome, netIn);
        poolYes = newYes;
        poolNo = newNo;
        sharesOut = _sharesOut;

        if (sharesOut < minSharesOut) revert InsufficientShares();

        if (outcome == OUTCOME_YES) {
            yesShares[msg.sender] += sharesOut;
        } else {
            noShares[msg.sender] += sharesOut;
        }

        totalVolume += collateralIn;
        tradeCount += 1;

        (uint256 yesProb, uint256 noProb) = getProbabilities();
        emit Trade(msg.sender, outcome, true, sharesOut, collateralIn, feeAmount, yesProb, noProb, block.timestamp);
    }

    function sell(uint8 outcome, uint256 sharesIn, uint256 minCollateralOut) external onlyActive returns (uint256 collateralOut) {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();

        if (outcome == OUTCOME_YES) {
            if (yesShares[msg.sender] < sharesIn) revert InsufficientShares();
        } else {
            if (noShares[msg.sender] < sharesIn) revert InsufficientShares();
        }

        (uint256 newYes, uint256 newNo, uint256 grossOut) = CPMMMath.sell(poolYes, poolNo, outcome, sharesIn);

        uint256 feeAmount = (grossOut * feeBps) / 10_000;
        collateralOut = grossOut - feeAmount;

        if (collateralOut < minCollateralOut) revert InsufficientShares();

        poolYes = newYes;
        poolNo = newNo;

        if (outcome == OUTCOME_YES) {
            yesShares[msg.sender] -= sharesIn;
        } else {
            noShares[msg.sender] -= sharesIn;
        }

        ICollateralVault vault = ICollateralVault(collateralVault);
        vault.moveFromMarketToUser(address(this), msg.sender, collateralOut);
        if (feeAmount > 0) {
            vault.collectFeeFromMarket(address(this), feeAmount);
        }

        totalVolume += grossOut;
        tradeCount += 1;

        (uint256 yesProb, uint256 noProb) = getProbabilities();
        emit Trade(msg.sender, outcome, false, sharesIn, grossOut, feeAmount, yesProb, noProb, block.timestamp);
    }

    function resolve(uint8 outcome) external {
        if (msg.sender != resolutionOracle) revert OnlyOracle();
        if (status != MarketStatus.ACTIVE) revert MarketNotActive();
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO && outcome != OUTCOME_VOID) revert InvalidOutcome();

        status = MarketStatus.RESOLVED;
        winningOutcome = outcome;

        emit MarketResolved(outcome, block.timestamp);
    }

    function claimPayout() external onlyResolved returns (uint256 amount) {
        ICollateralVault vault = ICollateralVault(collateralVault);

        if (winningOutcome == OUTCOME_YES) {
            amount = yesShares[msg.sender];
            yesShares[msg.sender] = 0;
        } else if (winningOutcome == OUTCOME_NO) {
            amount = noShares[msg.sender];
            noShares[msg.sender] = 0;
        } else {
            uint256 y = yesShares[msg.sender];
            uint256 n = noShares[msg.sender];
            amount = (y + n) / 2;
            yesShares[msg.sender] = 0;
            noShares[msg.sender] = 0;
        }

        if (amount > 0) {
            vault.moveFromMarketToUser(address(this), msg.sender, amount);
        }

        emit PayoutClaimed(msg.sender, amount);
    }

    function setResolutionOracle(address newOracle) external {
        if (msg.sender != factory) revert OnlyFactory();
        resolutionOracle = newOracle;
    }
}

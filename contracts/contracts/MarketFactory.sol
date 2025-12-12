// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { CollateralVault } from "./CollateralVault.sol";
import { CPMMMarket } from "./CPMMMarket.sol";
import { IGraduationHook } from "./interfaces/IGraduationHook.sol";

contract MarketFactory is Ownable {
    mapping(uint256 => address) public markets;
    mapping(address => bool) public isValidMarket;
    uint256 public marketCount;

    CollateralVault public immutable collateralVault;
    address public resolutionOracle;

    uint256 public creationFee; // in collateral token decimals
    uint256 public minInitialLiquidity; // in collateral token decimals
    uint16 public tradingFeeBps; // applied on buys and sells

    address public graduationHook;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed marketAddress,
        address indexed creator,
        string question,
        uint256 resolutionDate
    );

    event MarketGraduated(uint256 indexed marketId, address indexed oldAddress, address indexed newAddress);
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event TradingFeeUpdated(uint16 oldBps, uint16 newBps);
    event MinInitialLiquidityUpdated(uint256 oldAmount, uint256 newAmount);
    event GraduationHookUpdated(address indexed oldHook, address indexed newHook);

    error InsufficientInitialLiquidity();

    constructor(
        address initialOwner,
        address _collateralVault,
        address _resolutionOracle,
        uint256 _creationFee,
        uint256 _minInitialLiquidity,
        uint16 _tradingFeeBps
    ) Ownable(initialOwner) {
        collateralVault = CollateralVault(_collateralVault);
        resolutionOracle = _resolutionOracle;
        creationFee = _creationFee;
        minInitialLiquidity = _minInitialLiquidity;
        tradingFeeBps = _tradingFeeBps;
    }

    function setCreationFee(uint256 newFee) external onlyOwner {
        emit CreationFeeUpdated(creationFee, newFee);
        creationFee = newFee;
    }

    function setTradingFeeBps(uint16 newBps) external onlyOwner {
        emit TradingFeeUpdated(tradingFeeBps, newBps);
        tradingFeeBps = newBps;
    }

    function setMinInitialLiquidity(uint256 newAmount) external onlyOwner {
        emit MinInitialLiquidityUpdated(minInitialLiquidity, newAmount);
        minInitialLiquidity = newAmount;
    }

    function setGraduationHook(address newHook) external onlyOwner {
        emit GraduationHookUpdated(graduationHook, newHook);
        graduationHook = newHook;
    }

    function setResolutionOracle(address newOracle) external onlyOwner {
        resolutionOracle = newOracle;
    }

    function createMarket(
        string memory question,
        string memory category,
        uint256 resolutionDate,
        string memory rules,
        uint256 initialLiquidity
    ) external returns (address marketAddress) {
        if (initialLiquidity < minInitialLiquidity) revert InsufficientInitialLiquidity();

        uint256 marketId = marketCount;

        CPMMMarket market = new CPMMMarket(
            marketId,
            msg.sender,
            question,
            category,
            resolutionDate,
            rules,
            address(this),
            address(collateralVault),
            resolutionOracle,
            tradingFeeBps
        );

        marketAddress = address(market);

        markets[marketId] = marketAddress;
        isValidMarket[marketAddress] = true;
        marketCount = marketId + 1;

        collateralVault.setMarketAllowed(marketAddress, true);

        if (creationFee > 0) {
            collateralVault.collectFeeFromUser(msg.sender, creationFee);
        }

        if (initialLiquidity > 0) {
            collateralVault.moveFromUserToMarket(msg.sender, marketAddress, initialLiquidity);
            market.bootstrapLiquidity(msg.sender, initialLiquidity);
        }

        emit MarketCreated(marketId, marketAddress, msg.sender, question, resolutionDate);
    }

    function graduateMarket(uint256 marketId, address newMarket) external onlyOwner {
        address oldMarket = markets[marketId];
        markets[marketId] = newMarket;

        isValidMarket[oldMarket] = false;
        isValidMarket[newMarket] = true;

        if (graduationHook != address(0)) {
            IGraduationHook(graduationHook).onMarketGraduated(marketId, oldMarket, newMarket);
        }

        emit MarketGraduated(marketId, oldMarket, newMarket);
    }
}

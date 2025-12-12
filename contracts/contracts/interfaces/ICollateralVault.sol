// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICollateralVault {
    function collateralToken() external view returns (address);

    function userBalance(address user) external view returns (uint256);
    function marketBalance(address market) external view returns (uint256);
    function feeBalance() external view returns (uint256);

    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;

    function moveFromUserToMarket(address user, address market, uint256 amount) external;
    function moveFromMarketToUser(address market, address user, uint256 amount) external;

    function collectFeeFromUser(address user, uint256 amount) external;
    function collectFeeFromMarket(address market, uint256 amount) external;
}

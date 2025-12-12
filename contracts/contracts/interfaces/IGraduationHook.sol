// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGraduationHook {
    function onMarketGraduated(uint256 marketId, address oldMarket, address newMarket) external;
}

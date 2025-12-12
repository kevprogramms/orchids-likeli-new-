// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IResolutionOracle {
    function getResolution(address market) external view returns (bool isResolved, uint8 outcome);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ICPMMMarket } from "./interfaces/ICPMMMarket.sol";
import { IResolutionOracle } from "./interfaces/IResolutionOracle.sol";

contract ResolutionOracle is Ownable, IResolutionOracle {
    struct Resolution {
        bool isResolved;
        uint8 outcome;
    }

    mapping(address => Resolution) private resolutions;

    event OracleResolutionSet(address indexed market, uint8 indexed outcome);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function resolveMarket(address market, uint8 outcome) external onlyOwner {
        resolutions[market] = Resolution({ isResolved: true, outcome: outcome });
        emit OracleResolutionSet(market, outcome);

        ICPMMMarket(market).resolve(outcome);
    }

    function getResolution(address market) external view returns (bool isResolved, uint8 outcome) {
        Resolution memory r = resolutions[market];
        return (r.isResolved, r.outcome);
    }
}

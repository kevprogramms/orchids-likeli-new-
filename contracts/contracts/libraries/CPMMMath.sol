// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

library CPMMMath {
    uint8 internal constant OUTCOME_YES = 0;
    uint8 internal constant OUTCOME_NO = 1;

    error InvalidOutcome();
    error InsufficientLiquidity();

    function getProbabilityYes(uint256 poolYes, uint256 poolNo) internal pure returns (uint256) {
        uint256 denom = poolYes + poolNo;
        if (denom == 0) return 0;
        return Math.mulDiv(poolNo, 1e18, denom);
    }

    function getProbabilityNo(uint256 poolYes, uint256 poolNo) internal pure returns (uint256) {
        uint256 denom = poolYes + poolNo;
        if (denom == 0) return 0;
        return Math.mulDiv(poolYes, 1e18, denom);
    }

    function invariantK(uint256 poolYes, uint256 poolNo) internal pure returns (uint256) {
        return poolYes * poolNo;
    }

    function buy(
        uint256 poolYes,
        uint256 poolNo,
        uint8 outcome,
        uint256 amountIn
    ) internal pure returns (uint256 newPoolYes, uint256 newPoolNo, uint256 sharesOut) {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();
        if (poolYes == 0 || poolNo == 0) revert InsufficientLiquidity();

        uint256 k = poolYes * poolNo;

        if (outcome == OUTCOME_YES) {
            // Mint amountIn YES+NO shares; send minted YES to user, add minted NO to pool.
            newPoolNo = poolNo + amountIn;
            newPoolYes = Math.mulDiv(k, 1, newPoolNo, Math.Rounding.Ceil);

            uint256 yesFromPool = poolYes - newPoolYes;
            sharesOut = amountIn + yesFromPool;
        } else {
            // outcome == NO
            newPoolYes = poolYes + amountIn;
            newPoolNo = Math.mulDiv(k, 1, newPoolYes, Math.Rounding.Ceil);

            uint256 noFromPool = poolNo - newPoolNo;
            sharesOut = amountIn + noFromPool;
        }
    }

    function sell(
        uint256 poolYes,
        uint256 poolNo,
        uint8 outcome,
        uint256 sharesIn
    ) internal pure returns (uint256 newPoolYes, uint256 newPoolNo, uint256 amountOut) {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();
        if (poolYes == 0 || poolNo == 0) revert InsufficientLiquidity();

        // Solve quadratic for amountOut (collateral) when fully exiting sharesIn of one outcome.
        // YES: (poolYes + sharesIn - amountOut) * (poolNo - amountOut) = poolYes * poolNo
        // NO : (poolNo + sharesIn - amountOut) * (poolYes - amountOut) = poolYes * poolNo

        uint256 a = poolYes + poolNo + sharesIn;
        uint256 b = outcome == OUTCOME_YES ? sharesIn * poolNo : sharesIn * poolYes;

        // discriminant = a^2 - 4b
        uint256 disc = a * a - 4 * b;
        uint256 sqrtDisc = Math.sqrt(disc);

        amountOut = (a - sqrtDisc) / 2;

        if (outcome == OUTCOME_YES) {
            if (poolNo < amountOut) revert InsufficientLiquidity();
            newPoolNo = poolNo - amountOut;
            newPoolYes = poolYes + (sharesIn - amountOut);
        } else {
            if (poolYes < amountOut) revert InsufficientLiquidity();
            newPoolYes = poolYes - amountOut;
            newPoolNo = poolNo + (sharesIn - amountOut);
        }
    }
}

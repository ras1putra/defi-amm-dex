// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRewarder {
    function rewardToken() external view returns (address);
    function pendingReward(address user, uint256 userAmount, uint256 totalStaked) external view returns (uint256);
    function beforeStakeChange(address user, uint256 userAmount, uint256 totalStaked) external returns (uint256 reward);
    function afterStakeChange(address user, uint256 userAmount, uint256 totalStaked) external;
    function setRewardPerSecond(uint256 rewardPerSecond, uint256 totalStaked) external;
    function setRewardCap(uint256 totalRewardCap, uint256 totalStaked) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IRewarder.sol";

contract Rewarder is IRewarder {
    using SafeERC20 for IERC20;

    address public immutable chef;
    IERC20 public immutable _rewardToken;
    uint256 public rewardPerSecond;
    uint256 public totalRewardCap;
    uint256 public rewardDistributed;
    uint64 public lastUpdateTime;
    uint256 public accRewardPerShare;
    uint256 public constant ACC_REWARD_PRECISION = 1e18;

    mapping(address => uint256) public rewardDebt;

    event RewardPerSecondUpdated(uint256 rewardPerSecond);
    event RewardCapUpdated(uint256 cap);
    event RewardsClaimed(address indexed user, uint256 amount);

    modifier onlyChef() {
        require(msg.sender == chef, "NOT_CHEF");
        _;
    }

    constructor(
        address _chef,
        address _rewardToken_,
        uint256 _rewardPerSecond,
        uint256 _totalRewardCap
    ) {
        chef = _chef;
        _rewardToken = IERC20(_rewardToken_);
        rewardPerSecond = _rewardPerSecond;
        totalRewardCap = _totalRewardCap;
        lastUpdateTime = uint64(block.timestamp);
    }

    function rewardToken() external view override returns (address) {
        return address(_rewardToken);
    }

    function _updatePool(uint256 totalStaked) internal {
        if (block.timestamp <= lastUpdateTime) return;
        if (totalStaked == 0) {
            lastUpdateTime = uint64(block.timestamp);
            return;
        }

        unchecked {
            uint256 elapsed = block.timestamp - lastUpdateTime;
            uint256 reward = elapsed * rewardPerSecond;

            if (
                totalRewardCap > 0 &&
                rewardDistributed + reward > totalRewardCap
            ) {
                reward = totalRewardCap - rewardDistributed;
                if (reward == 0) return;
            }

            accRewardPerShare += (reward * ACC_REWARD_PRECISION) / totalStaked;
            rewardDistributed += reward;
        }
        lastUpdateTime = uint64(block.timestamp);
    }

    function setRewardPerSecond(uint256 _rewardPerSecond, uint256 totalStaked) external onlyChef {
        _updatePool(totalStaked);
        rewardPerSecond = _rewardPerSecond;
        emit RewardPerSecondUpdated(_rewardPerSecond);
    }

    function setRewardCap(uint256 _totalRewardCap, uint256 totalStaked) external onlyChef {
        _updatePool(totalStaked);
        totalRewardCap = _totalRewardCap;
        emit RewardCapUpdated(_totalRewardCap);
    }

    function beforeStakeChange(
        address user,
        uint256 userAmount,
        uint256 totalStaked
    ) external override onlyChef returns (uint256 reward) {
        _updatePool(totalStaked);

        unchecked {
            reward =
                ((userAmount * accRewardPerShare) / ACC_REWARD_PRECISION) -
                rewardDebt[user];
        }

        if (reward > 0) {
            uint256 balance = _rewardToken.balanceOf(address(this));
            if (balance < reward) {
                reward = balance;
            }
            if (reward > 0) {
                _rewardToken.safeTransfer(user, reward);
                emit RewardsClaimed(user, reward);
            }
        }

        unchecked {
            rewardDebt[user] =
                (userAmount * accRewardPerShare) /
                ACC_REWARD_PRECISION;
        }
    }

    function afterStakeChange(
        address user,
        uint256 userAmount,
        uint256
    ) external override onlyChef {
        unchecked {
            rewardDebt[user] =
                (userAmount * accRewardPerShare) /
                ACC_REWARD_PRECISION;
        }
    }

    function pendingReward(
        address user,
        uint256 userAmount,
        uint256 totalStaked
    ) external view override returns (uint256) {
        if (userAmount == 0 || totalStaked == 0) return 0;

        uint256 _accRewardPerShare = accRewardPerShare;
        uint64 _lastUpdateTime = lastUpdateTime;

        if (block.timestamp > _lastUpdateTime) {
            unchecked {
                uint256 elapsed = block.timestamp - _lastUpdateTime;
                uint256 reward = elapsed * rewardPerSecond;

                if (
                    totalRewardCap > 0 &&
                    rewardDistributed + reward > totalRewardCap
                ) {
                    reward = totalRewardCap - rewardDistributed;
                }

                if (reward > 0) {
                    _accRewardPerShare +=
                        (reward * ACC_REWARD_PRECISION) /
                        totalStaked;
                }
            }
        }

        unchecked {
            return
                ((userAmount * _accRewardPerShare) / ACC_REWARD_PRECISION) -
                rewardDebt[user];
        }
    }
}

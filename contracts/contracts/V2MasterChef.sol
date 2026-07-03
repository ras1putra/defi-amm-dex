// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IRewarder.sol";
import "./Rewarder.sol";

contract V2MasterChef is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant STAKING_ADMIN_ROLE = keccak256("STAKING_ADMIN_ROLE");

    struct PoolInfo {
        IERC20 lpToken;
        IRewarder rewarder;
        uint256 totalStaked;
    }

    struct UserInfo {
        uint256 amount;
    }

    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    event PoolAdded(uint256 indexed pid, address indexed lpToken, address indexed rewarder);
    event Deposited(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdrawn(address indexed user, uint256 indexed pid, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 indexed pid, uint256 amount);

    error PoolExists();
    error InvalidPool();
    error ZeroAmount();
    error InsufficientBalance();

    constructor(address _initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(STAKING_ADMIN_ROLE, _initialOwner);
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function add(address _lpToken, address _rewarder) external onlyRole(STAKING_ADMIN_ROLE) {
        uint256 len = poolInfo.length;
        for (uint256 i = 0; i < len; ) {
            if (address(poolInfo[i].lpToken) == _lpToken) revert PoolExists();
            unchecked { ++i; }
        }
        poolInfo.push(PoolInfo({
            lpToken: IERC20(_lpToken),
            rewarder: IRewarder(_rewarder),
            totalStaked: 0
        }));
        emit PoolAdded(len, _lpToken, _rewarder);
    }

    function addPoolWithRewarder(
        address _lpToken,
        address _rewardToken,
        uint256 _rewardPerSecond,
        uint256 _totalRewardCap
    ) external onlyRole(STAKING_ADMIN_ROLE) {
        uint256 len = poolInfo.length;
        for (uint256 i = 0; i < len; ) {
            if (address(poolInfo[i].lpToken) == _lpToken) revert PoolExists();
            unchecked { ++i; }
        }
        Rewarder rewarder = new Rewarder(address(this), _rewardToken, _rewardPerSecond, _totalRewardCap);
        poolInfo.push(PoolInfo({
            lpToken: IERC20(_lpToken),
            rewarder: IRewarder(address(rewarder)),
            totalStaked: 0
        }));
        emit PoolAdded(len, _lpToken, address(rewarder));
    }

    function setPoolRewardRate(uint256 _pid, uint256 _rewardPerSecond) external onlyRole(STAKING_ADMIN_ROLE) {
        if (_pid >= poolInfo.length) revert InvalidPool();
        PoolInfo storage pool = poolInfo[_pid];
        pool.rewarder.setRewardPerSecond(_rewardPerSecond, pool.totalStaked);
    }

    function setPoolRewardCap(uint256 _pid, uint256 _totalRewardCap) external onlyRole(STAKING_ADMIN_ROLE) {
        if (_pid >= poolInfo.length) revert InvalidPool();
        PoolInfo storage pool = poolInfo[_pid];
        pool.rewarder.setRewardCap(_totalRewardCap, pool.totalStaked);
    }

    function deposit(uint256 _pid, uint256 _amount) external nonReentrant {
        if (_amount == 0) revert ZeroAmount();
        if (_pid >= poolInfo.length) revert InvalidPool();

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 pending = pool.rewarder.beforeStakeChange(msg.sender, user.amount, pool.totalStaked);
        if (pending > 0) emit RewardsClaimed(msg.sender, _pid, pending);

        pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);

        unchecked {
            user.amount += _amount;
            pool.totalStaked += _amount;
        }

        pool.rewarder.afterStakeChange(msg.sender, user.amount, pool.totalStaked);

        emit Deposited(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        if (_amount == 0) revert ZeroAmount();
        if (_pid >= poolInfo.length) revert InvalidPool();

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.amount < _amount) revert InsufficientBalance();

        uint256 pending = pool.rewarder.beforeStakeChange(msg.sender, user.amount, pool.totalStaked);
        if (pending > 0) emit RewardsClaimed(msg.sender, _pid, pending);

        unchecked {
            user.amount -= _amount;
            pool.totalStaked -= _amount;
        }

        pool.rewarder.afterStakeChange(msg.sender, user.amount, pool.totalStaked);

        pool.lpToken.safeTransfer(msg.sender, _amount);

        emit Withdrawn(msg.sender, _pid, _amount);
    }

    function harvest(uint256 _pid) external nonReentrant {
        if (_pid >= poolInfo.length) revert InvalidPool();

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.amount == 0) revert ZeroAmount();

        uint256 pending = pool.rewarder.beforeStakeChange(msg.sender, user.amount, pool.totalStaked);
        if (pending > 0) emit RewardsClaimed(msg.sender, _pid, pending);

        pool.rewarder.afterStakeChange(msg.sender, user.amount, pool.totalStaked);
    }

    function pendingRewards(uint256 _pid, address _user) external view returns (uint256) {
        if (_pid >= poolInfo.length) return 0;
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        if (user.amount == 0) return 0;
        return pool.rewarder.pendingReward(_user, user.amount, pool.totalStaked);
    }
}

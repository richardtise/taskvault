export const TASK_VAULT_ABI = [
  { inputs: [{ name: "user", type: "address" }], name: "getUserInfo", outputs: [{ name: "exists", type: "bool" }, { name: "tierIndex", type: "uint8" }, { name: "balance", type: "uint256" }, { name: "lifetimeEarned", type: "uint256" }, { name: "referralEarnings", type: "uint256" }, { name: "referralCount", type: "uint256" }, { name: "tasksCompleted", type: "uint256" }, { name: "vaultBalance", type: "uint256" }, { name: "vaultMultiplier", type: "uint256" }, { name: "activeStreams", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "modality", type: "bytes32" }], name: "getBadge", outputs: [{ name: "level", type: "uint8" }, { name: "tasksCompleted", type: "uint256" }, { name: "tasksCorrect", type: "uint256" }, { name: "lastUpgraded", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "getAllBadges", outputs: [{ name: "modalities", type: "bytes32[]" }, { name: "badges", type: "tuple[]", components: [{ name: "level", type: "uint8" }, { name: "tasksCompleted", type: "uint256" }, { name: "tasksCorrect", type: "uint256" }, { name: "lastUpgraded", type: "uint256" }] }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getRegisteredModalities", outputs: [{ name: "", type: "bytes32[]" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "index", type: "uint256" }], name: "tiers", outputs: [{ name: "name", type: "string" }, { name: "minTasks", type: "uint256" }, { name: "minAccuracy", type: "uint256" }, { name: "multiplier", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getTierCount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "count", type: "uint256" }], name: "getLeaderboard", outputs: [{ name: "addresses", type: "address[]" }, { name: "scores", type: "uint256[]" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "requiredTier", type: "uint8" }, { name: "requiredModality", type: "bytes32" }, { name: "requiredBadge", type: "uint8" }], name: "canAccessTask", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "referrer", type: "address" }], name: "register", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "worker", type: "address" }, { name: "taskId", type: "bytes32" }, { name: "basePoints", type: "uint256" }, { name: "correct", type: "bool" }], name: "completeTask", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "worker", type: "address" }, { name: "taskId", type: "bytes32" }, { name: "basePoints", type: "uint256" }, { name: "correct", type: "bool" }, { name: "modality", type: "bytes32" }], name: "completeTaskWithModality", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "depositToVault", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "withdrawFromVault", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }, { name: "durationSeconds", type: "uint256" }], name: "createStream", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "streamIndex", type: "uint256" }], name: "claimStream", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "streamIndex", type: "uint256" }], name: "cancelStream", outputs: [], stateMutability: "nonpayable", type: "function" },
]

export const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "faucet", outputs: [], stateMutability: "nonpayable", type: "function" },
]

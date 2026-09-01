import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const robinhoodChain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com']
    },
    public: {
      http: [import.meta.env.VITE_ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com']
    },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://robinhoodchain.blockscout.com'
    },
  },
}

export const robinhoodTestnet = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: {
    name: 'Test Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_ROBINHOOD_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com']
    },
    public: {
      http: [import.meta.env.VITE_ROBINHOOD_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com']
    },
  },
  blockExplorers: {
    default: {
      name: 'Testnet Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com'
    },
  },
  testnet: true,
}

export const config = createConfig({
  chains: [robinhoodTestnet, robinhoodChain],
  connectors: [injected()],
  transports: {
    [robinhoodChain.id]: http(),
    [robinhoodTestnet.id]: http(),
  },
})

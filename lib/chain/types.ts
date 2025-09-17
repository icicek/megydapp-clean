export type Chain = 'solana' | 'ethereum' | 'bsc' | 'polygon' | 'base';

export interface ChainAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getAddress: () => Promise<string | null>;
  getIcon?: () => string | undefined;
}

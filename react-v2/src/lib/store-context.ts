import { createContext, useContext } from 'react';
import type { RootStore } from '@/stores/root-store';

const StoreContext = createContext<RootStore | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore(): RootStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return store;
}

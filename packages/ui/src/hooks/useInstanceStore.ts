import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RedisInstanceDTO } from '../services/Api';

interface InstanceStoreState {
  activeInstanceId: string | null;
  activeDb: number;
  instances: RedisInstanceDTO[];
  setActiveInstance: (instanceId: string | null, db?: number) => void;
  setActiveDb: (db: number) => void;
  setInstances: (instances: RedisInstanceDTO[]) => void;
  clearActiveInstance: () => void;
}

export const useInstanceStore = create<InstanceStoreState>()(
  persist(
    (set) => ({
      activeInstanceId: null,
      activeDb: 0,
      instances: [],

      setActiveInstance: (instanceId, db = 0) =>
        set((state) => ({
          activeInstanceId: instanceId,
          activeDb: db !== undefined ? db : state.activeDb,
        })),

      setActiveDb: (db) => set({ activeDb: db }),

      setInstances: (instances) => set({ instances }),

      clearActiveInstance: () =>
        set({
          activeInstanceId: null,
          activeDb: 0,
        }),
    }),
    {
      name: 'bull-board:instance-state',
      partialize: (state) => ({
        activeInstanceId: state.activeInstanceId,
        activeDb: state.activeDb,
      }),
    }
  )
);

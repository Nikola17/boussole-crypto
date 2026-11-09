// État (non persistant) du brief quotidien en cours, partagé entre le Cockpit, la page IA et le lancement automatique.

import { create } from 'zustand';
import type { Progress } from '../ai/tasks';

interface BriefingRunState {
  running: boolean;
  progress: Progress | null;
  error: string | null;
  controller: AbortController | null;
  set: (patch: Partial<Omit<BriefingRunState, 'set'>>) => void;
}

export const useBriefingRun = create<BriefingRunState>()((set) => ({
  running: false,
  progress: null,
  error: null,
  controller: null,
  set: (patch) => set(patch),
}));

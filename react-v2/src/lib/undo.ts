import { useEffect } from 'react';
import { undoStore } from '@/stores';

/**
 * Hook: registers Ctrl+Z / Ctrl+Y keyboard shortcuts for undo/redo.
 */
export function useUndoKeyboard(): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStore.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoStore.redo();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

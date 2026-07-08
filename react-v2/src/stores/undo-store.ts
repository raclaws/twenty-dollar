import { makeAutoObservable } from 'mobx';
import type { UndoEntry } from '@/types';

const MAX_UNDO_STACK = 50;

export class UndoStore {
  stack: UndoEntry[] = [];
  redoStack: UndoEntry[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get lastAction(): string | undefined {
    return this.stack[this.stack.length - 1]?.description;
  }

  push(description: string, redo: () => void, undo: () => void): void {
    const entry: UndoEntry = {
      id: crypto.randomUUID(),
      description,
      redo,
      undo,
      timestamp: Date.now(),
    };
    this.stack.push(entry);
    if (this.stack.length > MAX_UNDO_STACK) {
      this.stack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
  }

  undo(): void {
    const entry = this.stack.pop();
    if (!entry) return;
    entry.undo();
    this.redoStack.push(entry);
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    entry.redo();
    this.stack.push(entry);
  }

  clear(): void {
    this.stack = [];
    this.redoStack = [];
  }
}

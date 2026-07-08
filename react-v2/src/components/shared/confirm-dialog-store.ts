import { makeAutoObservable } from 'mobx';

interface ConfirmDialogState {
  open: boolean;
  message: string;
  actionLabel: string;
  danger: boolean;
  resolve: ((value: boolean) => void) | null;
}

class ConfirmDialogStore {
  state: ConfirmDialogState = {
    open: false,
    message: '',
    actionLabel: 'Confirm',
    danger: false,
    resolve: null,
  };

  constructor() {
    makeAutoObservable(this);
  }

  show(options: { message: string; actionLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      const isDanger = options.danger ?? /delete|permanently|cannot be undone|remove/i.test(options.message);
      this.state = {
        open: true,
        message: options.message,
        actionLabel: options.actionLabel ?? (isDanger ? 'Delete' : 'Confirm'),
        danger: isDanger,
        resolve,
      };
    });
  }

  confirm(): void {
    this.state.resolve?.(true);
    this.state = { ...this.state, open: false, resolve: null };
  }

  dismiss(): void {
    this.state.resolve?.(false);
    this.state = { ...this.state, open: false, resolve: null };
  }
}

export const confirmDialogStore = new ConfirmDialogStore();

/** Imperative API: await confirmAction({message}) → boolean */
export function confirmAction(options: {
  message: string;
  actionLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return confirmDialogStore.show(options);
}

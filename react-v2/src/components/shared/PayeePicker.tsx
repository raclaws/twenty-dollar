import { useCallback, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { EntityPicker } from './EntityPicker';
import type { PickerSection } from './EntityPicker';

interface PayeePickerProps {
  value: string | null;
  onPick: (payeeId: string | null) => void;
  onCancel: () => void;
  onTab?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export const PayeePicker = observer(function PayeePicker({
  value,
  onPick,
  onCancel,
  onTab,
  triggerRef,
}: PayeePickerProps) {
  const { payeeStore, accountStore } = useStore();

  const sections: PickerSection[] = [
    {
      key: 'none',
      items: [{ id: '__none__', label: 'No payee' }],
    },
    {
      key: 'payees',
      label: 'Payees',
      items: payeeStore.sortedPayees
        .filter((p) => p.type === 'external')
        .map((p) => ({ id: p.id, label: p.name })),
      allowCreate: true,
    },
    {
      key: 'transfer',
      label: 'Transfer to',
      items: accountStore.sortedAccounts.map((a) => ({
        id: a.id,
        label: a.name,
        meta: a.type,
      })),
    },
  ];

  const handlePick = useCallback(
    (id: string | null, sectionKey: string) => {
      if (id === null) {
        onPick(null);
        return;
      }
      if (sectionKey === 'transfer') {
        // For transfer, look up the transfer payee for this account, or use account id
        const transferPayee = payeeStore.transferPayees.find((p) => p.account_id === id);
        if (transferPayee) {
          onPick(transferPayee.id);
        } else {
          // Create a transfer payee for this account
          const account = accountStore.getById(id);
          const newPayee = {
            id: crypto.randomUUID(),
            name: `Transfer: ${account?.name ?? 'Account'}`,
            type: 'account' as const,
            account_id: id,
            created_at: new Date().toISOString(),
          };
          payeeStore.createPayee(newPayee);
          onPick(newPayee.id);
        }
      } else {
        onPick(id);
      }
    },
    [onPick, payeeStore, accountStore],
  );

  const handleCreate = useCallback(
    (name: string, _sectionKey: string) => {
      const newPayee = {
        id: crypto.randomUUID(),
        name,
        type: 'external' as const,
        account_id: null,
        created_at: new Date().toISOString(),
      };
      payeeStore.createPayee(newPayee);
      onPick(newPayee.id);
    },
    [payeeStore, onPick],
  );

  return (
    <EntityPicker
      sections={sections}
      value={value}
      placeholder="Search payees..."
      onPick={handlePick}
      onCreate={handleCreate}
      onCancel={onCancel}
      onTab={onTab}
      triggerRef={triggerRef}
    />
  );
});

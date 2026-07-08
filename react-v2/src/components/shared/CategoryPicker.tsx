import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { EntityPicker } from './EntityPicker';
import type { PickerSection } from './EntityPicker';

interface CategoryPickerProps {
  value: string | null;
  onPick: (categoryId: string | null) => void;
  onCancel: () => void;
  onTab?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export const CategoryPicker = observer(function CategoryPicker({
  value,
  onPick,
  onCancel,
  onTab,
  triggerRef,
}: CategoryPickerProps) {
  const { categoryStore } = useStore();

  const sections: PickerSection[] = [
    {
      key: 'none',
      items: [{ id: '__none__', label: 'No category' }],
    },
    ...categoryStore.sortedGroups.map((group) => ({
      key: group.id,
      label: group.name,
      items: categoryStore.categoriesForGroup(group.id).map((c) => ({
        id: c.id,
        label: c.name,
      })),
      allowCreate: true,
    })),
  ];

  const handlePick = useCallback(
    (id: string | null, _sectionKey: string) => {
      onPick(id);
    },
    [onPick],
  );

  const handleCreate = useCallback(
    (name: string, sectionKey: string) => {
      // sectionKey is the group ID
      const group = categoryStore.getGroup(sectionKey);
      if (!group) return;

      const catsInGroup = categoryStore.categoriesForGroup(sectionKey);
      const newCategory = {
        id: crypto.randomUUID(),
        group_id: sectionKey,
        name,
        sort_order: catsInGroup.length,
        target_type: null,
        target_amount: null,
        target_date: null,
      };
      categoryStore.createCategory(newCategory);
      onPick(newCategory.id);
    },
    [categoryStore, onPick],
  );

  return (
    <EntityPicker
      sections={sections}
      value={value}
      placeholder="Search categories..."
      onPick={handlePick}
      onCreate={handleCreate}
      onCancel={onCancel}
      onTab={onTab}
      triggerRef={triggerRef}
    />
  );
});

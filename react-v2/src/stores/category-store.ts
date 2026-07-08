import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { CategoryGroup, Category } from '@/types';
import { SyncStore, enqueue } from '@/sync';

export class CategoryStore {
  groupItems = observable.map<string, CategoryGroup>();
  categoryItems = observable.map<string, Category>();
  private groupSyncStore: SyncStore<CategoryGroup>;
  private categorySyncStore: SyncStore<Category>;

  constructor(
    groupSyncStore: SyncStore<CategoryGroup>,
    categorySyncStore: SyncStore<Category>
  ) {
    this.groupSyncStore = groupSyncStore;
    this.categorySyncStore = categorySyncStore;
    makeAutoObservable(this, {
      groupItems: false,
      categoryItems: false,
    });
  }

  /** Populate observable maps from IDB-hydrated syncStores */
  hydrate(): void {
    const allGroups = this.groupSyncStore.getAll();
    const allCategories = this.categorySyncStore.getAll();
    runInAction(() => {
      this.groupItems.clear();
      for (const record of allGroups) {
        this.groupItems.set(record.id, record);
      }
      this.categoryItems.clear();
      for (const record of allCategories) {
        this.categoryItems.set(record.id, record);
      }
    });
  }

  get groups(): Map<string, CategoryGroup> {
    return this.groupItems;
  }

  get categories(): Map<string, Category> {
    return this.categoryItems;
  }

  get sortedGroups(): CategoryGroup[] {
    return Array.from(this.groupItems.values()).sort((a, b) => a.sort_order - b.sort_order);
  }

  get flatCategories(): Category[] {
    const groups = this.sortedGroups;
    const result: Category[] = [];
    for (const group of groups) {
      const cats = Array.from(this.categoryItems.values())
        .filter((c) => c.group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      result.push(...cats);
    }
    return result;
  }

  categoriesForGroup(groupId: string): Category[] {
    return Array.from(this.categoryItems.values())
      .filter((c) => c.group_id === groupId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  getCategory(id: string): Category | undefined {
    return this.categoryItems.get(id);
  }

  getGroup(id: string): CategoryGroup | undefined {
    return this.groupItems.get(id);
  }

  groupForCategory(categoryId: string): CategoryGroup | undefined {
    const cat = this.categoryItems.get(categoryId);
    if (!cat) return undefined;
    return this.groupItems.get(cat.group_id);
  }

  createGroup(group: CategoryGroup): void {
    this.groupItems.set(group.id, group);
    this.groupSyncStore.put(group);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/category-groups',
      body: { id: group.id, name: group.name },
      timestamp: Date.now(),
    });
  }

  updateGroup(id: string, patch: Partial<CategoryGroup>): void {
    const existing = this.groupItems.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.groupItems.set(id, updated);
    this.groupSyncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/category-groups/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  deleteGroup(id: string): void {
    this.groupItems.delete(id);
    this.groupSyncStore.delete(id);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/category-groups/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }

  createCategory(category: Category): void {
    this.categoryItems.set(category.id, category);
    this.categorySyncStore.put(category);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/categories',
      body: {
        id: category.id,
        group_id: category.group_id,
        name: category.name,
        target_type: category.target_type,
        target_amount: category.target_amount,
        target_date: category.target_date,
      },
      timestamp: Date.now(),
    });
  }

  updateCategory(id: string, patch: Partial<Category>): void {
    const existing = this.categoryItems.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.categoryItems.set(id, updated);
    this.categorySyncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/categories/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  deleteCategory(id: string): void {
    this.categoryItems.delete(id);
    this.categorySyncStore.delete(id);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/categories/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }

  moveCategory(categoryId: string, toGroupId: string): void {
    this.updateCategory(categoryId, { group_id: toGroupId });
  }

  /** Load groups+categories from server response (groups with nested categories) */
  loadFromServer(groups: Array<CategoryGroup & { categories?: Category[] }>): void {
    const allGroups: CategoryGroup[] = [];
    const allCategories: Category[] = [];
    for (const group of groups) {
      const { categories: cats, ...g } = group;
      allGroups.push(g);
      if (cats) {
        for (const cat of cats) {
          allCategories.push(cat);
        }
      }
    }
    this.groupSyncStore.replaceAll(allGroups);
    this.categorySyncStore.replaceAll(allCategories);
    runInAction(() => {
      this.groupItems.clear();
      for (const record of allGroups) {
        this.groupItems.set(record.id, record);
      }
      this.categoryItems.clear();
      for (const record of allCategories) {
        this.categoryItems.set(record.id, record);
      }
    });
  }

  /** Import groups from file: persist to IDB and update observable map */
  importGroups(groups: CategoryGroup[]): void {
    this.groupSyncStore.replaceAll(groups);
    runInAction(() => {
      this.groupItems.clear();
      for (const record of groups) {
        this.groupItems.set(record.id, record);
      }
    });
  }

  /** Import categories from file: persist to IDB and update observable map */
  importCategories(categories: Category[]): void {
    this.categorySyncStore.replaceAll(categories);
    runInAction(() => {
      this.categoryItems.clear();
      for (const record of categories) {
        this.categoryItems.set(record.id, record);
      }
    });
  }

  reorderGroups(orderedIds: string[]): void {
    const order: { id: string; sort_order: number }[] = [];
    orderedIds.forEach((id, index) => {
      const group = this.groupItems.get(id);
      if (group) {
        const updated = { ...group, sort_order: index };
        this.groupItems.set(id, updated);
        this.groupSyncStore.put(updated);
        order.push({ id, sort_order: index });
      }
    });
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/categories/reorder',
      body: order,
      timestamp: Date.now(),
    });
  }

  reorderCategories(groupId: string, orderedIds: string[]): void {
    const order: { id: string; sort_order: number }[] = [];
    orderedIds.forEach((id, index) => {
      const cat = this.categoryItems.get(id);
      if (cat) {
        const updated = { ...cat, sort_order: index };
        this.categoryItems.set(id, updated);
        this.categorySyncStore.put(updated);
        order.push({ id, sort_order: index });
      }
    });
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/categories/reorder',
      body: order,
      timestamp: Date.now(),
    });
  }
}

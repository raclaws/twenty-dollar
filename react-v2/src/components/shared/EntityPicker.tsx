import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface PickerItem {
  id: string;
  label: string;
  meta?: string;
  icon?: string;
}

export interface PickerSection {
  key: string;
  label?: string;
  items: PickerItem[];
  allowCreate?: boolean;
}

interface EntityPickerProps {
  sections: PickerSection[];
  value: string | null;
  placeholder?: string;
  onPick: (id: string | null, sectionKey: string) => void;
  onCreate?: (name: string, sectionKey: string) => void;
  onCancel: () => void;
  onTab?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EntityPicker({
  sections,
  value,
  placeholder = 'Search...',
  onPick,
  onCreate,
  onCancel,
  onTab,
  triggerRef,
}: EntityPickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute filtered items as a flat list with section info
  const flatItems = useMemo(() => {
    const result: Array<{ item: PickerItem; sectionKey: string; isCreate?: boolean }> = [];
    const lower = query.toLowerCase();

    for (const section of sections) {
      const filtered = query
        ? section.items.filter((item) => item.label.toLowerCase().includes(lower))
        : section.items;

      for (const item of filtered) {
        result.push({ item, sectionKey: section.key });
      }

      // Show "+ New [query]" if allowCreate and query doesn't exactly match any item
      if (
        section.allowCreate &&
        query.trim() &&
        !section.items.some((item) => item.label.toLowerCase() === lower)
      ) {
        result.push({
          item: { id: '__create__', label: `+ New "${query.trim()}"` },
          sectionKey: section.key,
          isCreate: true,
        });
      }
    }

    return result;
  }, [sections, query]);

  // Group flat items by section for rendering
  const groupedItems = useMemo(() => {
    const groups: Array<{
      key: string;
      label?: string;
      items: Array<{ item: PickerItem; flatIndex: number; isCreate?: boolean }>;
    }> = [];

    let flatIndex = 0;
    for (const section of sections) {
      const lower = query.toLowerCase();
      const filtered = query
        ? section.items.filter((item) => item.label.toLowerCase().includes(lower))
        : section.items;

      const sectionItems: Array<{ item: PickerItem; flatIndex: number; isCreate?: boolean }> = [];

      for (const item of filtered) {
        sectionItems.push({ item, flatIndex });
        flatIndex++;
      }

      if (
        section.allowCreate &&
        query.trim() &&
        !section.items.some((item) => item.label.toLowerCase() === lower)
      ) {
        sectionItems.push({
          item: { id: '__create__', label: `+ New "${query.trim()}"` },
          flatIndex,
          isCreate: true,
        });
        flatIndex++;
      }

      if (sectionItems.length > 0) {
        groups.push({ key: section.key, label: section.label, items: sectionItems });
      }
    }

    return groups;
  }, [sections, query]);

  // Position dropdown below trigger
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    } else {
      // Fallback: position at center of viewport
      setPosition({
        top: window.innerHeight / 3,
        left: window.innerWidth / 2 - 150,
        width: 300,
      });
    }
  }, [triggerRef]);

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Clamp active index
  useEffect(() => {
    if (activeIndex >= flatItems.length) {
      setActiveIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onCancel]);

  const handleSelect = useCallback(
    (index: number) => {
      const entry = flatItems[index];
      if (!entry) return;

      if (entry.isCreate && onCreate) {
        onCreate(query.trim(), entry.sectionKey);
      } else if (entry.item.id === '__none__') {
        onPick(null, entry.sectionKey);
      } else {
        onPick(entry.item.id, entry.sectionKey);
      }
    },
    [flatItems, onPick, onCreate, query],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        handleSelect(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        onCancel();
        break;
      case 'Tab':
        e.preventDefault();
        if (onTab) onTab();
        else onCancel();
        break;
    }
  };

  const dropdown = (
    <div
      ref={containerRef}
      className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="p-1.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500"
        />
      </div>
      <div ref={listRef} className="max-h-[300px] overflow-y-auto px-1 pb-1">
        {groupedItems.map((group) => (
          <div key={group.key}>
            {group.label && (
              <div className="px-2 py-1 text-xs uppercase text-zinc-500 font-semibold tracking-wide">
                {group.label}
              </div>
            )}
            {group.items.map(({ item, flatIndex, isCreate }) => (
              <div
                key={`${group.key}-${item.id}`}
                data-active={flatIndex === activeIndex}
                onClick={() => handleSelect(flatIndex)}
                onMouseEnter={() => setActiveIndex(flatIndex)}
                className={`px-2 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2 ${
                  flatIndex === activeIndex
                    ? 'bg-indigo-600/20 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800'
                } ${isCreate ? 'italic text-indigo-400' : ''}`}
              >
                {item.icon && <span className="text-xs">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
                {item.meta && (
                  <span className="ml-auto text-xs text-zinc-500">{item.meta}</span>
                )}
                {item.id === value && !isCreate && (
                  <span className="ml-auto text-xs text-indigo-400">✓</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {flatItems.length === 0 && (
          <div className="px-2 py-3 text-sm text-zinc-500 text-center">No results</div>
        )}
      </div>
    </div>
  );

  return createPortal(dropdown, document.body);
}

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { ICON_GROUPS, getIconComponent, getInitial, getInitialColor } from '@/lib/icons';

interface IconPickerProps {
  value: string | null;
  entityName: string;
  onPick: (iconId: string | null) => void;
  onCancel: () => void;
}

export function IconPicker({ value, entityName, onPick, onCancel }: IconPickerProps) {
  const [selected, setSelected] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    }

    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [onCancel]);

  function pick(iconId: string | null) {
    setSelected(iconId);
    onPick(iconId);
  }

  return (
    <div ref={ref} className="icon-picker">
      <div className="icon-picker__header">
        <span className="icon-picker__title">Choose icon</span>
        <button className="icon-picker__clear" onClick={() => pick(null)} title="Remove icon">
          <X size={14} />
        </button>
      </div>
      <div className="icon-picker__grid">
        {ICON_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="icon-picker__group-label">{group.label}</div>
            <div className="icon-picker__group-icons">
              {group.icons.map((def) => {
                const Icon = def.icon;
                return (
                  <button
                    key={def.id}
                    className={`icon-picker__item ${selected === def.id ? 'icon-picker__item--selected' : ''}`}
                    onClick={() => pick(def.id)}
                    title={def.id}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EntityIconProps {
  icon: string | null | undefined;
  name: string;
  size?: number;
}

export function EntityIcon({ icon, name, size = 16 }: EntityIconProps) {
  const IconComp = getIconComponent(icon as string);

  if (IconComp) {
    return (
      <span className="entity-icon entity-icon--lucide">
        <IconComp size={size} />
      </span>
    );
  }

  return (
    <span
      className="entity-icon entity-icon--initial"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: getInitialColor(name),
        fontSize: `${size * 0.55}px`,
      }}
    >
      {getInitial(name)}
    </span>
  );
}

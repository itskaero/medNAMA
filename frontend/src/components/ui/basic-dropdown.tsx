"use client"

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface BasicDropdownProps {
  items: DropdownItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  dropUp?: boolean;
}

const BasicDropdown: React.FC<BasicDropdownProps> = ({
  items,
  value,
  onChange,
  className,
  style,
  ariaLabel,
  dropUp = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedItem = items.find(item => item.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        const activeIdx = items.findIndex(item => item.value === value);
        setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          onChange(items[focusedIndex].value);
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={className}
      style={{ position: 'relative', display: 'inline-block', ...style }}
    >
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || `Selected: ${selectedItem?.label || ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 12px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'border-color 0.15s',
          outline: 'none',
          width: '100%',
          justifyContent: 'space-between',
          minWidth: '140px',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--sky)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--sky)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {selectedItem?.icon}
          <span>{selectedItem?.label}</span>
        </span>
        <ChevronDown
          size={13}
          style={{
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            ...(dropUp ? { bottom: 'calc(100% + 4px)', top: 'auto' } : { top: 'calc(100% + 4px)' }),
            left: 0,
            minWidth: '100%',
            background: 'var(--surface-3)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000,
            padding: '4px',
            overflow: 'hidden',
            animation: 'dropdownFadeIn 0.12s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {items.map((item, index) => {
            const isSelected = item.value === value;
            const isFocused = index === focusedIndex;
            return (
              <button
                key={item.value}
                ref={el => { itemRefs.current[index] = el; }}
                role="option"
                aria-selected={isSelected}
                aria-label={item.label}
                onClick={() => {
                  onChange(item.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 10px',
                  background: isSelected
                    ? 'var(--sky-dim)'
                    : isFocused
                    ? 'var(--surface-2)'
                    : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: isSelected ? 'var(--sky)' : 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  outline: 'none',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--surface-2)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {isSelected && (
                  <Check size={13} style={{ color: 'var(--sky)', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BasicDropdown;

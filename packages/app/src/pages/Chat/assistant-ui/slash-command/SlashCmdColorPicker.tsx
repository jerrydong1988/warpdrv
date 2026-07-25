import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { ColorPicker } from "@chakra-ui/react";

type SlashCmdColorPickerProps = {
  value: string;
  placeholder: string;
  inputRef: (el: HTMLSpanElement | null) => void;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent) => void;
};

export const SlashCmdColorPicker: React.FC<SlashCmdColorPickerProps> = ({
  value,
  inputRef,
  onChange,
  onFocus,
  onBlur,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const ignoreNextBlurRef = useRef(false);

  const color = value || "#a78bfa";

  useEffect(() => {
    inputRef(triggerRef.current);
  }, [inputRef]);

  const handleTriggerMouseDown = (e: React.MouseEvent) => {
    if (isOpen) {
      e.preventDefault();
      return;
    }
  };

  const handleTriggerFocus = () => {
    if (!isOpen) {
      setIsOpen(true);
      onFocus();
    }
  };

  const handleTriggerBlur = (e: React.FocusEvent) => {
    if (ignoreNextBlurRef.current) {
      ignoreNextBlurRef.current = false;
      return;
    }
    const relatedTarget = e.relatedTarget as Node | null;
    if (pickerRef.current && relatedTarget && pickerRef.current.contains(relatedTarget)) {
      return;
    }
    if (isOpen) {
      setIsOpen(false);
    }
    onBlur(e);
  };

  const handleColorChange = (next: string) => {
    onChange(next);
    ignoreNextBlurRef.current = true;
    setIsOpen(false);
    onBlur({} as React.FocusEvent);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        onBlur({} as React.FocusEvent);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (!pickerRef.current || !triggerRef.current) return;
      if (pickerRef.current.contains(e.target as Node) || triggerRef.current.contains(e.target as Node)) return;
      setIsOpen(false);
      onBlur({} as React.FocusEvent);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onBlur]);

  useEffect(() => {
    if (!isOpen || !triggerRef.current || !pickerRef.current) return;
    computePosition(triggerRef.current, pickerRef.current, {
      placement: "bottom-start",
      middleware: [offset(6), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!pickerRef.current) return;
      pickerRef.current.style.left = `${x}px`;
      pickerRef.current.style.top = `${y}px`;
    });
  }, [isOpen]);

  return (
    <>
      <span
        ref={triggerRef}
        contentEditable={false}
        tabIndex={0}
        onMouseDown={handleTriggerMouseDown}
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            onFocus();
          }
        }}
        onFocus={handleTriggerFocus}
        onBlur={handleTriggerBlur}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 6px",
          borderRadius: "4px",
          background: "var(--wc-bg-subtle)",
          border: "1px solid var(--wc-border-subtle)",
          cursor: "pointer",
          fontSize: "0.75rem",
          fontFamily: "var(--wc-font-mono, monospace)",
        }}
      >
        <span
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "3px",
            background: color,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        />
        {color}
      </span>

      {isOpen && createPortal(
        <div
          ref={pickerRef}
          style={{
            position: "absolute",
            zIndex: 10001,
          }}
        >
          <ColorPicker.Root value={color} onValueChange={handleColorChange}>
            <ColorPicker.HiddenInput />
            <ColorPicker.Positioner>
              <ColorPicker.Content>
                <ColorPicker.Area />
                <ColorPicker.Sliders />
              </ColorPicker.Content>
            </ColorPicker.Positioner>
          </ColorPicker.Root>
        </div>,
        document.body,
      )}
    </>
  );
};

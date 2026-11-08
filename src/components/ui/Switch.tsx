"use client";

import { useEffect, useRef } from "react";

interface Props {
  isOn: boolean;
  label: string;
  onChange: (isOn: boolean) => void;
  isLocked?: boolean;
}

/** Moves at the click and settles on what the phone then says. */
export function Switch({ isOn, label, onChange, isLocked = false }: Props) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.checked = isOn;
  }, [isOn]);
  return (
    <label className="switch">
      <input ref={box} type="checkbox" role="switch" aria-label={label} defaultChecked={isOn} disabled={isLocked}
        onChange={(event) => onChange(event.target.checked)} />
      <span />
    </label>
  );
}

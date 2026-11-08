"use client";

import { type InputHTMLAttributes, type TextareaHTMLAttributes, useEffect, useRef } from "react";

type Shared = { value: string; onCommit: (text: string) => void };
type Props = (Shared & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue">)
  | (Shared & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue">);

/** Sends on the DOM's `change`, once typing is over; React's fires on every key. */
export function CommitField({ value, onCommit, multiline, ...attributes }: Props) {
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  useEffect(() => {
    const part = field.current;
    const send = () => commit.current(part?.value ?? "");
    part?.addEventListener("change", send);
    return () => part?.removeEventListener("change", send);
  }, []);
  useEffect(() => {
    if (field.current && field.current.value !== value) field.current.value = value;
  }, [value]);
  return multiline
    ? <textarea ref={field} defaultValue={value} {...attributes as TextareaHTMLAttributes<HTMLTextAreaElement>} />
    : <input ref={field} defaultValue={value} {...attributes as InputHTMLAttributes<HTMLInputElement>} />;
}

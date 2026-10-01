import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const defaultLevel = 6 as const;

function subscribeLabel(value: string): () => void {
  localStorage.setItem("effect-subscribe", value);
  return () => localStorage.removeItem("effect-subscribe");
}

export function main(): number {
  const [count, setCount] = useState(1);
  const [label] = useState("ready");
  const [enabled] = React.useState(false);
  const [empty] = useState();
  const ref = useRef(3);
  const labelRef = React.useRef("box");
  const bump = useCallback(() => 1, []);
  const ready = React.useCallback(function readyCallback() {
    return 2;
  }, []);
  const memoValue = useMemo(() => 3, []);
  const reactMemoValue = React.useMemo(function readyMemo() {
    return 4;
  }, []);

  useEffect(() => undefined, []);
  React.useEffect(function readyEffect() {
    return;
  }, []);
  useEffect(() => () => undefined, []);
  useEffect(() => {
    localStorage.setItem("effect-label", label);
    return () => localStorage.removeItem("effect-label");
  }, [label]);
  useEffect(() => subscribeLabel(label), [label]);
  useEffect(() => localStorage.removeItem("effect-void"), [label]);
  setCount(count + 1);

  return count + label.length + labelRef.current.length + (enabled ? 1 : 0) + (empty === undefined ? 1 : 0) + ref.current + bump() + ready() + memoValue + reactMemoValue;
}

export function panel(props: { defaultOpen: boolean; label: string }): number {
  const { defaultOpen, label } = props;
  const [open] = React.useState(defaultOpen);
  const [title] = useState(label);
  const [level] = useState<6 | 8>(defaultLevel);
  const [lazyOpen] = useState(() => defaultOpen);
  const [lazyTitle] = React.useState(() => (defaultOpen ? label : "closed"));
  const [lazyLevel] = useState(function lazyLevel() {
    return defaultOpen ? defaultLevel : 8;
  });
  const optionalLabel: string | undefined = defaultOpen ? label : undefined;
  const optionalLabelRef = useRef(optionalLabel);
  return (open ? 1 : 0) +
    (lazyOpen ? 1 : 0) +
    title.length +
    lazyTitle.length +
    level +
    lazyLevel +
    (optionalLabelRef.current ? optionalLabelRef.current.length : 0);
}

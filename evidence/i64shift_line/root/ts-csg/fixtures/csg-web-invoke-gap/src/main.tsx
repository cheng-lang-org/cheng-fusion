import { useCallback, useState } from "react";

// Lane M invoke-gap focused fixture: the four structural site classes that the
// retained-parity gate caught as permanent `invoke:` residuals, plus a floor of
// already-supported named DOM handlers. Not a name whitelist: every class below
// must compile through generic rules only.

interface ArchiveRecord {
  id: string;
  label: string;
}

// Class A child — destructured zero-arg callback prop; internal trigger is a
// bare identifier prop reference (BaziPage.tsx `onClick={onRecalculate}`).
function CalcActions({ onRecalculate }: { onRecalculate: () => void }) {
  return <button data-testid="m-recalc" onClick={onRecalculate}>Recalc</button>;
}

// Class B child — one-arg callback prop; internal trigger is a single-call
// arrow (BaziPage.tsx `onClick={() => onLoad(record)}`).
function ArchiveTable({ onLoad }: { onLoad: (record: ArchiveRecord) => void }) {
  const firstRecord: ArchiveRecord = { id: "a1", label: "Alpha" };
  return <button data-testid="m-archive-open" onClick={() => onLoad(firstRecord)}>Open</button>;
}

// Class C child — destructured callback prop whose parent passes an inline
// multi-statement void-call arrow (NodesPage.tsx onRefresh).
function NodeToolbar({ onRefresh }: { onRefresh: () => void }) {
  return <button data-testid="m-node-refresh" onClick={onRefresh}>Refresh</button>;
}

export function InvokeGapHome() {
  const [result, setResult] = useState(0);
  const [loadedLabel, setLoadedLabel] = useState("");
  const [archiveOpens, setArchiveOpens] = useState(0);
  const [contentsCount, setContentsCount] = useState(0);
  const [rwadBalance, setRwadBalance] = useState(0);

  // Named DOM-handler regression floor classes (each previously compiled).
  const [toggled, setToggled] = useState(false);
  const [counter, setCounter] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [pressedKey, setPressedKey] = useState("");
  const [detailId, setDetailId] = useState("");

  function handleCalculate() {
    setResult(1 + 2);
  }

  function handleLoadArchive(record: ArchiveRecord) {
    setLoadedLabel(record.label);
    setArchiveOpens(record.id.length);
  }

  async function refreshSelectedNodeContents(peerId: string, useNetwork: boolean) {
    if (useNetwork && peerId.length > 0) {
      setContentsCount(peerId.length + archiveOpens);
    } else {
      setContentsCount(0);
    }
  }

  const refreshRwadBalance = useCallback(async () => {
    setRwadBalance(result + contentsCount);
  }, [result, contentsCount]);

  function handleToggleFlag() {
    setToggled(!toggled);
  }

  function handleBumpCounter() {
    setCounter(counter + 1);
  }

  function handleSelectAlpha() {
    setSelectedLabel("alpha");
  }

  function handleSelectBeta() {
    setSelectedLabel("beta");
  }

  function handleResetAll() {
    setResetCount(0);
    setToggled(false);
    setSelectedLabel("");
  }

  function handleEscapeKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setPressedKey("esc");
    }
  }

  function handleClickStop(e: React.MouseEvent) {
    e.stopPropagation();
    setPressedKey("stopped");
  }

  function handleOpenDetail() {
    setDetailId("d-7");
  }

  function handleCloseDetail() {
    setDetailId("");
  }

  function handleDoubleIncrement() {
    setCounter(counter + 2);
    setResetCount(resetCount + 1);
  }

  function handleMarkTouched() {
    setArchiveOpens(archiveOpens + 1);
  }

  function handleClearContents() {
    void refreshSelectedNodeContents("", false);
  }

  return (
    <section data-testid="invoke-gap-home">
      <CalcActions onRecalculate={handleCalculate} />
      <ArchiveTable onLoad={handleLoadArchive} />
      <NodeToolbar
        onRefresh={() => {
          void refreshSelectedNodeContents("peer-1", true);
        }}
      />
      <button data-testid="m-balance-refresh" onClick={() => { void refreshRwadBalance(); }}>
        Balance {rwadBalance}
      </button>
      <button data-testid="m-toggle" onClick={handleToggleFlag}>{toggled ? "On" : "Off"}</button>
      <button data-testid="m-bump" onClick={handleBumpCounter}>Bump {counter}</button>
      <button data-testid="m-alpha" onClick={handleSelectAlpha}>Alpha</button>
      <button data-testid="m-beta" onClick={handleSelectBeta}>Beta</button>
      <button data-testid="m-reset" onClick={handleResetAll}>Reset</button>
      <input data-testid="m-key" onKeyDown={handleEscapeKey} />
      <button data-testid="m-stop" onClick={handleClickStop}>Stop</button>
      <button data-testid="m-open" onClick={handleOpenDetail}>Open {detailId}</button>
      <button data-testid="m-close" onClick={handleCloseDetail}>Close</button>
      <button data-testid="m-double" onClick={handleDoubleIncrement}>Double</button>
      <button data-testid="m-touch" onClick={handleMarkTouched}>Touch</button>
      <button data-testid="m-clear" onClick={handleClearContents}>Clear</button>
    </section>
  );
}

export function main(): number {
  return 0;
}

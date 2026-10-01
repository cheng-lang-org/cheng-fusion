// Focused invoke-gap fixture: mirrors the four real uncompiled CHT handler shapes
// from UniMaker (BaziPage/ZiweiPage/NodesPage/ProfilePage) at minimum size.
// Consumed by scripts/m-invoke-gap-smoke.mjs (extract -> materialize scene facts ->
// buildCompiledHandlerTable -> assert compiled / diagnose skips).
import { useState, useCallback } from "./react";

export interface AstrologyRecord {
    label: string;
    year: number;
    month: number;
    day: number;
}

export interface BaziResult {
    summary: string;
    dayunStart: number;
    dayunEnd: number;
}

function calculateGapBazi(year: number, month: number, day: number): BaziResult {
    return { summary: `chart-${year}-${month}-${day}`, dayunStart: year + 1, dayunEnd: year + 11 };
}

export function SettingsView({ onRecalculate, onLoad }: { onRecalculate: () => void; onLoad: (record: AstrologyRecord) => void }) {
    const record: AstrologyRecord = { label: "saved", year: 2000, month: 8, day: 1 };
    return (
        <div className="settings">
            <button className="recalc" onClick={onRecalculate}>重排</button>
            <button className="load" onClick={() => onLoad(record)}>加载档案</button>
        </div>
    );
}

export function GapPage() {
    const [year, setYear] = useState(1990);
    const [month, setMonth] = useState(1);
    const [day, setDay] = useState(1);
    const [gender, setGender] = useState('男');
    const [result, setResult] = useState<BaziResult | null>(null);
    const [activeDayunIdx, setActiveDayunIdx] = useState(0);
    const [archiveHint, setArchiveHint] = useState('');

    const handleCalculate = () => {
        const r = calculateGapBazi(year, month, day);
        setResult(r);
        const idx = r.dayunStart;
        if (idx >= 0) setActiveDayunIdx(idx);
    };

    const handleLoadArchive = (record: AstrologyRecord) => {
        setYear(record.year);
        setMonth(record.month);
        setDay(record.day);
        const loaded = calculateGapBazi(record.year, record.month, record.day);
        setResult(loaded);
        setGender('女');
        setArchiveHint('已加载档案并重新排盘');
    };

    return (
        <div className="gap">
            <button className="direct-calc" onClick={handleCalculate}>直接排盘</button>
            <SettingsView onRecalculate={handleCalculate} onLoad={handleLoadArchive} />
        </div>
    );
}

declare function fetchNodeContents(peerId: string, force: boolean): Promise<string[]>;

export function NodeContentPage({ onRefresh }: { onRefresh: () => void }) {
    return (
        <div className="node-content">
            <button className="refresh" onClick={onRefresh}>刷新</button>
        </div>
    );
}

export function NodesPage() {
    const [ownerPeerId, setOwnerPeerId] = useState('peer-1');
    const [selectedNodeContentOwner, setSelectedNodeContentOwner] = useState<{ peerId: string }>({ peerId: 'peer-1' });
    const [nodeContents, setNodeContents] = useState<string[]>([]);

    const refreshSelectedNodeContents = useCallback(async (peerId: string, force: boolean) => {
        const items = await fetchNodeContents(peerId, force);
        setNodeContents(items);
        setOwnerPeerId(peerId);
    }, [setNodeContents, setOwnerPeerId]);

    return (
        <div className="nodes">
            <NodeContentPage onRefresh={() => {
                void refreshSelectedNodeContents(selectedNodeContentOwner.peerId, true);
            }} />
            <button className="open-owner" onClick={() => setOwnerPeerId(selectedNodeContentOwner.peerId)}>打开</button>
            <button className="close-owner" onClick={() => setSelectedNodeContentOwner(null)}>关闭</button>
        </div>
    );
}

declare function fetchGapRwadBalance(identity: string): Promise<{ raw: number }>;

export function ProfilePage() {
    const [peerId] = useState('self-peer');
    const [rwadBalance, setRwadBalance] = useState(0);
    const [rwadSyncHint, setRwadSyncHint] = useState('');

    const refreshRwadBalance = useCallback(async () => {
        const balance = await fetchGapRwadBalance(peerId);
        setRwadBalance(balance.raw);
        setRwadSyncHint('');
    }, [peerId, setRwadBalance, setRwadSyncHint]);

    return (
        <div className="profile">
            <button className="rwad-refresh" onClick={() => { void refreshRwadBalance(); }}>同步余额</button>
        </div>
    );
}

export function App() {
    return (
        <div className="app">
            <GapPage />
            <NodesPage />
            <ProfilePage />
        </div>
    );
}

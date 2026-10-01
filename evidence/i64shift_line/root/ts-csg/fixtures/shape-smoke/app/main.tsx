import { useState } from 'react';

const TABS = ['inbox', 'sent'];

export default function ShapeSmokePage() {
  const [active, setActive] = useState('inbox');
  const [pulse, setPulse] = useState(0);
  const [stamp, setStamp] = useState('none');

  const handleSelectTab = (tab: string) => {
    setActive(tab);
  };
  const handleReset = () => {
    setPulse(0);
    setActive('inbox');
  };
  const handlePulse = () => {
    setPulse(pulse + 1);
  };
  const handleLabel = () => {
    const label = `tab-${active}-${pulse}`;
    setStamp(label);
  };

  return (
    <div className="page">
      <h1>shape smoke</h1>
      {TABS.map((tab) => (
        <button key={tab} onClick={() => handleSelectTab(tab)} className={tab === active ? 'on' : ''}>
          {tab}
        </button>
      ))}
      <button onClick={handleReset} className="reset">reset</button>
      <button onClick={handlePulse} className="pulse">pulse</button>
      <button onClick={handleLabel} className="label">label</button>
      <p>{`active: ${active} pulses: ${pulse}`}</p>
      <p>count: {Array.from({ length: 3 }, (_, i) => (
        <span key={i}>{i}</span>
      ))}</p>
      <p>stamp: {stamp}</p>
    </div>
  );
}

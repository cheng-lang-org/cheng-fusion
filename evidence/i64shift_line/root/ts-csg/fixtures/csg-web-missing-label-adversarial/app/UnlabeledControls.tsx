export {};

export function UnlabeledControls(): unknown {
  return (
    <div>
      <button onClick="deleteDraft" />
      <input type="text" />
      <input type="file" />
      <select>
        <option />
      </select>
    </div>
  );
}

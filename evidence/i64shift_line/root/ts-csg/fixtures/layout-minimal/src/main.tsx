/* minimal-oracle: exact oracle-real-page structure, no events/draw */
export function main(): number {
  const app = (
    <div className="container" style={{ width: "800px" }}>
      <h1 id="header" style={{ height: "24px" }}>Oracle Real Page</h1>
      <p style={{ margin: "4px 0", padding: "4px", color: "#444", height: "20px" }}>
        This page tests multiple features.
      </p>

      <div className="flex-row" style={{ display: "flex", flexDirection: "row", height: "80px" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "8px", padding: "16px", height: "60px" }}>
          <span className="highlight" style={{ background: "#ffff00", color: "#000" }}>Card A</span>
          <p>Content with margin and padding</p>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "8px", padding: "16px", height: "60px" }}>
          <span className="highlight" style={{ background: "#ffff00", color: "#000" }}>Card B</span>
          <p>Second card in flex row</p>
        </div>
      </div>

      <ul className="list" style={{ margin: "8px", paddingLeft: "20px", height: "60px" }}>
        <li style={{ color: "#aa0000", height: "20px" }}>Red item</li>
        <li style={{ color: "#00aa00", height: "20px" }}>Green item</li>
        <li style={{ color: "#0000aa", height: "20px" }}>Blue item</li>
      </ul>

      <table className="data" style={{ margin: "8px", padding: "4px", height: "60px" }}>
        <tr>
          <td style={{ fontWeight: "bold", height: "30px" }}>Name</td>
          <td style={{ height: "30px" }}>Value</td>
        </tr>
      </table>

      <button
        style={{ margin: "8px", padding: "8px 16px", background: "#0088cc", color: "#fff", border: "none", borderRadius: "4px", height: "36px" }}
      >
        Click
      </button>

      <div className="canvas-wrap" style={{ margin: "10px 0", padding: "5px", background: "#eee", height: "220px" }}>
        <canvas id="testCanvas" width={300} height={200} style={{ border: "1px solid #333", background: "#fff" }} />
      </div>

      <div className="form-group" style={{ display: "flex", flexDirection: "column", margin: "8px 0", padding: "8px", background: "#fafafa", height: "80px" }}>
        <label>Name:</label>
        <input id="nameInput" type="text" placeholder="Enter name" style={{ margin: "4px 0", padding: "4px", height: "24px" }} />
        <button type="submit" style={{ margin: "4px 0", padding: "4px 12px", height: "24px" }}>Submit</button>
      </div>

      <div id="absContainer" style={{ position: "relative", height: "150px", margin: "8px 0", background: "#ddd", width: "800px" }}>
        <div className="absolute-box" style={{ position: "absolute", top: "100px", left: "50px", width: "200px", height: "100px", background: "rgba(255,0,0,0.5)" }} />
      </div>

      <div className="hidden" style={{ display: "none" }}>
        Hidden content.
      </div>
    </div>
  );

  return 0;
}

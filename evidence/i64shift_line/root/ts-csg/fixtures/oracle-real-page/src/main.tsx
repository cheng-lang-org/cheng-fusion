/* oracle-real-page: 包含多种 DOM/CSS/Canvas/Form/Event 特性的测试页面 */
// All styles use direct inline style={{...}} format since CSG
// does not capture CSS class rules or variable initializer values.

// ── 事件处理 ──

let clickCount = 0;

function handleButtonClick(event: MouseEvent): void {
  clickCount++;
  const target = event.target as HTMLElement;
  target.textContent = `Clicked ${clickCount} times`;
}

function handleMouseOver(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  target.style.backgroundColor = "#ffcc00";
}

// ── Canvas 绘制 ──

function drawCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 填充矩形
  ctx.fillStyle = "#ff6600";
  ctx.fillRect(10, 10, 100, 60);

  // 描边矩形
  ctx.strokeStyle = "#0033cc";
  ctx.lineWidth = 2;
  ctx.strokeRect(130, 10, 100, 60);

  // 路径绘制
  ctx.beginPath();
  ctx.moveTo(10, 90);
  ctx.lineTo(60, 140);
  ctx.lineTo(110, 90);
  ctx.closePath();
  ctx.fillStyle = "#33aa33";
  ctx.fill();

  // 文字
  ctx.fillStyle = "#000000";
  ctx.font = "14px sans-serif";
  ctx.fillText("Hello Canvas", 10, 170);

  // 圆
  ctx.beginPath();
  ctx.arc(200, 120, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#9933ff";
  ctx.fill();
}

// ── 主函数 ──

export function main(): number {
  const app = (
    <div className="container" style={{ width: "800px" }}>
      <h1 id="header" style={{ height: "24px" }}>Oracle Real Page</h1>
      <p style={{ margin: "4px 0", padding: "4px", color: "#444", height: "20px" }}>
        This page tests multiple DOM/CSS/Canvas/Form/Event features.
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
        <tr>
          <td style={{ fontWeight: "bold", height: "30px" }}>Count</td>
          <td style={{ height: "30px" }}>42</td>
        </tr>
      </table>

      <button
        id="clickBtn"
        onClick={handleButtonClick}
        onMouseOver={handleMouseOver}
        style={{
          margin: "8px",
          padding: "8px 16px",
          background: "#0088cc",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          height: "36px",
        }}
      >
        Click 0 times
      </button>

      <div className="canvas-wrap" style={{ margin: "10px 0", padding: "5px", background: "#eee", height: "220px" }}>
        <canvas
          id="testCanvas"
          width={300}
          height={200}
          style={{ border: "1px solid #333", background: "#fff" }}
        />
      </div>

      <div className="form-group" style={{ display: "flex", flexDirection: "column", margin: "8px 0", padding: "8px", background: "#fafafa", height: "80px" }}>
        <label htmlFor="nameInput">Name:</label>
        <input
          id="nameInput"
          type="text"
          placeholder="Enter name"
          style={{ margin: "4px 0", padding: "4px", height: "24px" }}
        />
        <button
          type="submit"
          style={{ margin: "4px 0", padding: "4px 12px", height: "24px" }}
        >
          Submit
        </button>
      </div>

      <div id="absContainer" style={{ position: "relative", height: "150px", margin: "8px 0", background: "#ddd", width: "800px" }}>
        <div className="absolute-box" style={{ position: "absolute", top: "100px", left: "50px", width: "200px", height: "100px", background: "rgba(255,0,0,0.5)" }} />
      </div>

      <div className="hidden" style={{ display: "none" }}>
        This should not be visible.
      </div>
    </div>
  );

  /* 在页面附加时绘制 Canvas */
  const canvas = document.getElementById("testCanvas") as HTMLCanvasElement | null;
  if (canvas) {
    drawCanvas(canvas);
  }

  return 0;
}

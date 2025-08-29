import { Fragment, useEffect, useMemo, useState } from "react";
import type { MessagePayload, Ship } from "./utils";
import { cellKey, CellState } from "./utils";
import SampleWorker from "./worker/sampler?worker";

// Helper to create a range of numbers [0, n)
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const fmt = (v: number) => `${Math.round(v * 10000) / 100}%`;

export default function BattleshipHeatmap() {
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(10);
  const [ships, setShips] = useState<Ship[]>([
    { id: Date.now(), h: 2, w: 5, sunk: false },
    { id: Date.now() - 1, h: 1, w: 5, sunk: false },
    { id: Date.now() - 2, h: 1, w: 4, sunk: false },
    { id: Date.now() - 3, h: 1, w: 3, sunk: false },
    { id: Date.now() - 4, h: 1, w: 2, sunk: false },
    { id: Date.now() - 5, h: 1, w: 2, sunk: false },
  ]);
  const [samples, setSamples] = useState(10000000);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const [boardState, setBoardState] = useState<number[][]>(() =>
    range(rows).map(() => range(cols).map(() => CellState.Unknown))
  );
  const [probabilities, setProbabilities] = useState<number[][]>(() =>
    range(rows).map(() => range(cols).map(() => 0))
  );
  const [acceptedSamples, setAcceptedSamples] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const [newShipH, setNewShipH] = useState(1);
  const [newShipW, setNewShipW] = useState(1);

  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  function addShip() {
    setShips((prev) => [
      ...prev,
      { id: Date.now(), h: newShipH, w: newShipW, sunk: false },
    ]);
  }

  function removeShip(id: number) {
    setShips((prev) => prev.filter((s) => s.id !== id));
  }

  function updateShip(id: number, h: number, w: number, sunk: boolean) {
    setShips((prev) =>
      prev.map((s) => (s.id === id ? { ...s, h, w, sunk } : s))
    );
  }

  useEffect(() => {
    setBoardState(
      range(rows).map(() => range(cols).map(() => CellState.Unknown))
    );
    setProbabilities(range(rows).map(() => range(cols).map(() => 0)));
  }, [rows, cols]);

  function cycleCell(r: number, c: number) {
    setBoardState((prev) => {
      const copy = prev.map((row) => row.slice());
      copy[r][c] = (copy[r][c] + 1) % 3;
      return copy;
    });
  }

  const [knownHits, knownMisses] = useMemo(() => {
    const hits = new Set<string>();
    const misses = new Set<string>();
    for (let r = 0; r < boardState.length; r++)
      for (let c = 0; c < boardState[r].length; c++) {
        if (boardState[r][c] === CellState.Hit) {
          hits.add(cellKey(r, c));
        } else if (boardState[r][c] === CellState.Miss) {
          misses.add(cellKey(r, c));
        }
      }
    return [hits, misses];
  }, [boardState]);

  const [sampleWorker, setSampleWorker] = useState<Worker | null>(null);

  function runSampler() {
    setRunning(true);
    setProgress(0);
    setAcceptedSamples(0);
    setFailedAttempts(0);

    let worker = sampleWorker;
    if (!worker) {
      worker = new SampleWorker();
      setSampleWorker(worker);
    }

    worker.postMessage({
      rows,
      cols,
      ships,
      samples,
      knownHits: Array.from(knownHits),
      knownMisses: Array.from(knownMisses),
    } as MessagePayload);

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      setProgress(msg.progress);
      setAcceptedSamples(msg.accepted);
      setFailedAttempts(msg.failed);
      setProbabilities(msg.probabilities);
      if (msg.type === "done") {
        terminateSampler();
      }
    };
  }

  function terminateSampler() {
    setRunning(false);
    if (sampleWorker) sampleWorker.terminate();
    setSampleWorker(null);
  }

  const topCells = useMemo(() => {
    const flat: { p: number; r: number; c: number }[] = [];
    for (let r = 0; r < probabilities.length; r++)
      for (let c = 0; c < probabilities[r].length; c++) {
        if (!knownHits.has(cellKey(r, c)))
          flat.push({ p: probabilities[r][c] || 0, r, c });
      }
    flat.sort((a, b) => b.p - a.p);
    return flat.slice(0, 10);
  }, [probabilities, knownHits]);

  const letters = range(rows).map((i) => String.fromCharCode(65 + i));

  return (
    <div className="p-4 mx-auto">
      <h1 className="text-2xl flex justify-center font-bold mb-3">
        Battleship Calculator
      </h1>

      <div className="overflow-auto flex flex-col-reverse gap-x-2 md:flex-row justify-center md:items-start">
        <div
          className="inline-grid w-full max-w-3xl"
          style={{
            gridTemplateColumns: `40px repeat(${cols}, minmax(24px, 1fr))`,
            gridTemplateRows: `40px repeat(${rows}, minmax(24px, 1fr))`,
          }}
        >
          <div></div> {/* Empty top-left corner */}
          {/* Top row with numbers */}
          {range(cols).map((c) => (
            <div
              key={`top-${c}`}
              className="flex items-center justify-center text-xs font-bold"
            >
              {c + 1}
            </div>
          ))}
          {/* Rows with letters and cells */}
          {range(boardState.length).map((r) => (
            <Fragment key={`row-${r}`}>
              <div
                key={`row-label-${r}`}
                className="flex items-center justify-center text-xs font-bold"
              >
                {letters[r]}
              </div>
              {range(boardState[r].length).map((c) => {
                const p = probabilities[r]?.[c] ?? 0;
                const intensity = Math.min(1, p * 2.5);
                const bg = `rgba(244,63,94,${intensity})`;
                const state = boardState[r][c];
                const key = cellKey(r, c);
                const isHovered = hoveredCell === key;
                return (
                  <button
                    key={key}
                    className={`aspect-square border ${
                      isHovered ? "border-4 border-yellow-400" : ""
                    }`}
                    style={{
                      minWidth: "24px",
                      minHeight: "24px",
                      background:
                        state === 1 ? "#cbd5e1" : state === 2 ? "#86efac" : bg,
                    }}
                    title={`${key} — ${fmt(p)}`}
                    onClick={() => {
                      cycleCell(r, c);
                      if (running) {
                        terminateSampler();
                      }
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        <div>
          <div className="flex flex-col mx-auto items-center gap-x-2 md:items-start mb-2">
            <h2 className="text-l font-bold mb-2">Grid Size</h2>
            <div className="flex justify-around gap-x-2">
              <div className="flex gap-x-2 items-center">
                <label htmlFor="gridRows">Rows:</label>
                <input
                  id="gridRows"
                  name="gridRows"
                  type="number"
                  min={6}
                  max={20}
                  className="border p-1 w-16"
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  placeholder="Rows"
                />
              </div>
              <div className="flex gap-x-2 items-center">
                <label htmlFor="gridCols">Cols:</label>
                <input
                  id="gridCols"
                  name="gridCols"
                  type="number"
                  min={6}
                  max={20}
                  className="border p-1 w-16"
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                  placeholder="Cols"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col mx-auto items-center gap-x-2 md:items-start">
            <h2 className="text-l font-bold mb-2">Manage Ships</h2>
            {ships.length < 10 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <input
                  type="number"
                  min={1}
                  className="border p-1 w-16"
                  value={newShipH}
                  onChange={(e) => setNewShipH(Number(e.target.value))}
                  placeholder="H"
                />
                <input
                  type="number"
                  min={1}
                  className="border p-1 w-16"
                  value={newShipW}
                  onChange={(e) => setNewShipW(Number(e.target.value))}
                  placeholder="W"
                />
                <button
                  className="px-3 py-1 bg-green-600 text-white rounded"
                  onClick={addShip}
                >
                  Add Ship
                </button>
              </div>
            )}
            {ships.length >= 10 && <p className="text-sm mb-4">Maximum number of ships reached.</p>}
            <div>
              {ships.map((ship) => (
                <div key={ship.id} className="flex items-center gap-2 mb-1">
                  <input
                    type="number"
                    min={1}
                    max={Math.min(rows, cols)}
                    className="border p-1 w-16"
                    value={ship.h}
                    onChange={(e) =>
                      updateShip(
                        ship.id,
                        Number(e.target.value),
                        ship.w,
                        ship.sunk
                      )
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    max={Math.min(rows, cols)}
                    className="border p-1 w-16"
                    value={ship.w}
                    onChange={(e) =>
                      updateShip(
                        ship.id,
                        ship.h,
                        Number(e.target.value),
                        ship.sunk
                      )
                    }
                  />
                  <label className="flex items-center gap-1">
                    Sunk
                    <input
                      type="checkbox"
                      checked={ship.sunk}
                      onChange={(e) =>
                        updateShip(ship.id, ship.h, ship.w, e.target.checked)
                      }
                    />
                  </label>
                  <button
                    className="px-2 py-1 bg-red-600 text-white rounded"
                    onClick={() => removeShip(ship.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center md:items-start">
            <h2 className="font-semibold">Top 10 cells</h2>
            <ul className="text-sm mt-2">
              {topCells.map((t) => {
                const key = cellKey(t.r, t.c);
                return (
                  <li
                    key={key}
                    onMouseEnter={() => setHoveredCell(key)}
                    onMouseLeave={() => setHoveredCell(null)}
                    className="cursor-pointer hover:underline"
                  >
                    {key}: {fmt(t.p)}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto flex p-4 flex-col overflow-auto max-w-3xl items-center">
        <div className="mb-4 flex gap-4 items-center">
          <label className="text-sm">Number of Samples</label>
          <input
            type="number"
            className="border p-1"
            value={samples}
            onChange={(e) => setSamples(Number(e.target.value) || 10000000)}
          />
          <button
            className={`px-4 py-2 rounded text-white ${
              running ? "bg-red-500" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={() => {
              if (!running) {
                runSampler();
              } else {
                terminateSampler();
              }
            }}
          >
            {running ? "Terminate sampler" : "Run sampler"}
          </button>
        </div>
        <progress value={progress} />
        <div className="mt-4 text-sm">
          Accepted: {acceptedSamples} — Failed: {failedAttempts}
        </div>
      </div>
    </div>
  );
}

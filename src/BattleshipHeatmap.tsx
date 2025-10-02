import { Fragment, useEffect, useMemo, useState } from "react";
import type { /*MessagePayload,*/ Ship } from "./utils";
import { cellKey, CellState } from "./utils";
// import SampleWorker from "./worker/sampler?worker";
type Cell = [number, number];

// Helper to create a range of numbers [0, n)
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const fmt = (v: number) => `${Math.round(v * 10000) / 100}%`;

const DEFAULT_NUM_SAMPLES = 1000;

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
  const [samples, setSamples] = useState(DEFAULT_NUM_SAMPLES);
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
      copy[r][c] = (copy[r][c] + 1) % 4;
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
        } else if (
          boardState[r][c] === CellState.Miss ||
          // treat Sunk cells as if they are misses so we don't re-count
          boardState[r][c] === CellState.Sunk
        ) {
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

    // Generate all possible placements for a given ship height and width
    function generatePlacements(shipH: number, shipW: number): Cell[][] {
      const placements: Cell[][] = [];
      // Horizontal and vertical placements
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r + shipH <= rows && c + shipW <= cols) {
            const coords: Cell[] = [];
            for (let dr = 0; dr < shipH; dr++) {
              for (let dc = 0; dc < shipW; dc++) {
                coords.push([r + dr, c + dc]);
              }
            }
            if (!coords.some(([rr, cc]) => knownMisses.has(cellKey(rr, cc)))) {
              placements.push(coords);
            }
          }
          if (shipH !== shipW && r + shipW <= rows && c + shipH <= cols) {
            const coords: Cell[] = [];
            for (let dr = 0; dr < shipW; dr++) {
              for (let dc = 0; dc < shipH; dc++) {
                coords.push([r + dr, c + dc]);
              }
            }
            if (!coords.some(([rr, cc]) => knownMisses.has(cellKey(rr, cc)))) {
              placements.push(coords);
            }
          }
        }
      }
      return placements;
    }

    // Build placement lists for each ship
    const shipPlacements: Cell[][][] = [];
    for (const s of ships) {
      if (s.sunk) continue;
      shipPlacements.push(generatePlacements(s.h, s.w));
    }

    // console.log(shipPlacements)

    // Precompute incompatibilities
    const incompatible = new Map<string, Set<string>>();
    function placementKey(p: Cell[]): string {
      return p.map(([r, c]) => `${r},${c}`).join(";");
    }

    for (let shipI = 0; shipI < shipPlacements.length; shipI++) {
      for (const p1 of shipPlacements[shipI]) {
        const k1 = placementKey(p1);
        for (let shipJ = shipI + 1; shipJ < shipPlacements.length; shipJ++) {
          for (const p2 of shipPlacements[shipJ]) {
            const k2 = placementKey(p2);
            if (
              p1.some(([r, c]) => p2.some(([rr, cc]) => r === rr && c === cc))
            ) {
              if (!incompatible.has(k1)) incompatible.set(k1, new Set());
              if (!incompatible.has(k2)) incompatible.set(k2, new Set());
              incompatible.get(k1)!.add(k2);
              incompatible.get(k2)!.add(k1);
            }
          }
        }
      }
    }

    // console.log(incompatible)

    // Frequencies
    const locationFrequencies = new Map<string, number>();
    let validConfigurations = 0;

    const iterStart = performance.timeOrigin + performance.now();
    let lastMessageTime = iterStart;

    while (validConfigurations < 1) {
      for (let iter = 0; iter < samples; iter++) {
        const chosen: string[] = [];
        const occupied = new Set<string>();
        let failed = false;

        for (const plist of shipPlacements) {
          if (plist.length === 0) {
            failed = true;
            break;
          }
          const choice = plist[Math.floor(Math.random() * plist.length)];
          const k = placementKey(choice);
          if (chosen.some((c) => incompatible.get(c)?.has(k))) {
            failed = true;
            break;
          }
          chosen.push(k);
          for (const [r, c] of choice) occupied.add(cellKey(r, c));
        }

        if (failed) continue;

        // Check hits are covered
        if ([...knownHits].some((h) => !occupied.has(h))) continue;

        for (const k of chosen)
          locationFrequencies.set(k, (locationFrequencies.get(k) ?? 0) + 1);

        validConfigurations++;

        const currentTime = performance.timeOrigin + performance.now();
        if (currentTime - 100 > lastMessageTime || iter - 1 >= samples) {
          const squareFreq = Array.from({ length: rows }, () =>
            Array(cols).fill(0)
          );
          for (const [k, freq] of locationFrequencies) {
            const cells = k
              .split(";")
              .map((p) => p.split(",").map(Number) as [number, number]);
            for (const [r, c] of cells) squareFreq[r][c] += freq;
          }

          setProgress(iter / samples);
          setAcceptedSamples(validConfigurations);
          setFailedAttempts(iter + 1 - validConfigurations);
          setProbabilities(
            squareFreq.map((row) =>
              row.map((v) =>
                validConfigurations > 0 ? v / validConfigurations : 0
              )
            )
          );

          console.log(iter / samples);
          lastMessageTime = currentTime;
        }
      }
    }

    const squareFreq = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const [k, freq] of locationFrequencies) {
      const cells = k
        .split(";")
        .map((p) => p.split(",").map(Number) as [number, number]);
      for (const [r, c] of cells) squareFreq[r][c] += freq;
    }

    setRunning(false);
    setProgress(1);
    setAcceptedSamples(validConfigurations);
    setFailedAttempts(samples - validConfigurations);
    setProbabilities(
      squareFreq.map((row) =>
        row.map((v) => (validConfigurations > 0 ? v / validConfigurations : 0))
      )
    );
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
        if (!knownHits.has(cellKey(r, c)) && !knownMisses.has(cellKey(r, c)))
          flat.push({ p: probabilities[r][c] || 0, r, c });
      }
    flat.sort((a, b) => b.p - a.p);
    return flat.slice(0, 10);
  }, [probabilities, knownHits, knownMisses]);

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
                        state === 1
                          ? "#cbd5e1"
                          : state === 2
                          ? "#86efac"
                          : state === CellState.Sunk
                          ? "#fcc201"
                          : bg,
                    }}
                    title={`${key} — ${fmt(p)}`}
                    onClick={() => {
                      cycleCell(r, c);
                      if (running) {
                        terminateSampler();
                      }
                    }}
                  >
                    {state === CellState.Hit && "H"}
                    {state === CellState.Miss && "M"}
                    {state === CellState.Sunk && "S"}
                  </button>
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
            {ships.length >= 10 && (
              <p className="text-sm mb-4">Maximum number of ships reached.</p>
            )}
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
            onChange={(e) =>
              setSamples(Number(e.target.value) || DEFAULT_NUM_SAMPLES)
            }
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
      <div className="flex justify-center">
        <p className="text-sm">
          <a
            className="font-medium text-blue-600 dark:text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://github.com/awwong1/battleship-calculator"
          >
            Source Code
          </a>
        </p>
      </div>
    </div>
  );
}

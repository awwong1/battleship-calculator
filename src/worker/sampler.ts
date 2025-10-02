import type { MessagePayload } from "../utils";
import { cellKey } from "../utils";

type Cell = [number, number];

self.onmessage = (e: MessageEvent<MessagePayload>) => {
  const { rows, cols, ships, samples, knownHits, knownMisses } = e.data;
  const hitSet = new Set(knownHits);
  const missSet = new Set(knownMisses);

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
          if (!coords.some(([rr, cc]) => missSet.has(cellKey(rr, cc)))) {
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
          if (!coords.some(([rr, cc]) => missSet.has(cellKey(rr, cc)))) {
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
      if ([...hitSet].some((h) => !occupied.has(h))) continue;

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
        self.postMessage({
          type: "progress",
          progress: iter / samples,
          accepted: validConfigurations,
          failed: iter + 1 - validConfigurations,
          probabilities: squareFreq.map((row) =>
            row.map((v) =>
              validConfigurations > 0 ? v / validConfigurations : 0
            )
          ),
        });
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

  self.postMessage({
    type: "done",
    progress: 1,
    accepted: validConfigurations,
    failed: samples - validConfigurations,
    probabilities: squareFreq.map((row) =>
      row.map((v) => (validConfigurations > 0 ? v / validConfigurations : 0))
    ),
  });
};

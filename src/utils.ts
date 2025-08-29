export type Ship = { id: number; h: number; w: number; sunk: boolean };

export const cellKey = (r: number, c: number) =>
  `${String.fromCharCode(65 + r)}${c+1}`;

export interface MessagePayload {
  rows: number;
  cols: number;
  ships: { h: number; w: number; sunk: boolean }[];
  samples: number;
  knownHits: string[];
  knownMisses: string[];
}

export const CellState = {
  Unknown: 0 as const,
  Miss: 1 as const,
  Hit: 2 as const,
};

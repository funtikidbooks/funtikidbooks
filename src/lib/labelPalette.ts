// Swatch colors offered when creating or recoloring a board label. Labels
// themselves are free-text rows in board_labels (see lib/actions/board.ts
// and components/workspace/LabelPicker.tsx) — this is just the picker's
// fixed color choices, not the labels.
export const LABEL_SWATCHES = [
  "#3F9E52",
  "#D6A400",
  "#FF7A3D",
  "#E5484D",
  "#8B5CF6",
  "#4F80D9",
  "#3B98BE",
  "#EC4899",
  "#78776F",
] as const;

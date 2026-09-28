// Board backgrounds. The default is the site's own page colour — white by
// day, dark at night, following the theme (sếp Phúc preferred it to a
// gradient). The others are Trello-style gradients the lists float on.
// Stored in boards.color as "bg:<id>" so everyone on the board sees the same
// one; an old plain hex colour (what the column held before) means default.
export type BoardBackground = { id: string; name: string; css: string; plain?: boolean };

export const BOARD_BACKGROUNDS: BoardBackground[] = [
  { id: "web", name: "Màu web (sáng/tối)", css: "var(--color-bg)", plain: true },
  { id: "violet", name: "Tím hồng", css: "linear-gradient(135deg, #5b3fd6 0%, #8f4fcf 45%, #d9559d 100%)" },
  { id: "ocean", name: "Biển xanh", css: "linear-gradient(135deg, #0c66e4 0%, #1f8fd8 50%, #37b4c3 100%)" },
  { id: "sunset", name: "Hoàng hôn", css: "linear-gradient(135deg, #e2483d 0%, #f5813f 55%, #f8c050 100%)" },
  { id: "forest", name: "Rừng", css: "linear-gradient(135deg, #1b6b46 0%, #2c9c62 55%, #8ccf6a 100%)" },
  { id: "peach", name: "Đào", css: "linear-gradient(135deg, #f38b76 0%, #f6a98c 50%, #f9d5a7 100%)" },
  { id: "berry", name: "Dâu rừng", css: "linear-gradient(135deg, #7a1f5c 0%, #b8336a 55%, #ec6f8f 100%)" },
  { id: "night", name: "Đêm", css: "linear-gradient(135deg, #0b1b3f 0%, #22306b 55%, #4b3c8f 100%)" },
];

export const backgroundKey = (id: string) => `bg:${id}`;

export function boardBackground(color: string | null | undefined): BoardBackground {
  const id = color?.startsWith("bg:") ? color.slice(3) : null;
  return BOARD_BACKGROUNDS.find((b) => b.id === id) ?? BOARD_BACKGROUNDS[0];
}

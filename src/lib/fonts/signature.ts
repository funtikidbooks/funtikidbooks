import { Dancing_Script } from "next/font/google";

// Used only for the typed-signature preview/render (see SignaturePad) — a
// cursive look for staff signing from a mouse-only computer, where drawing
// a signature by hand is clumsy. Needs the vietnamese subset since every
// employee's name carries dấu.
export const signatureFont = Dancing_Script({
  subsets: ["vietnamese", "latin"],
  weight: ["600", "700"],
  display: "swap",
});

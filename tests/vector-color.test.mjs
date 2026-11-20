// "Chuyển line sang vector": the colour staff type or pick for the lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brightness, isPale, normalizeHex, snapToInk } from "../src/lib/vector/color.ts";

test("hex codes: with or without #, any case, short form", () => {
  assert.equal(normalizeHex("#ec008c"), "#EC008C");
  assert.equal(normalizeHex("EC008C"), "#EC008C");
  assert.equal(normalizeHex("  #Ec008C "), "#EC008C");
  assert.equal(normalizeHex("#f0c"), "#FF00CC");
  assert.equal(normalizeHex("000"), "#000000");
});

test("hex codes: half-typed or wrong text is refused", () => {
  for (const bad of ["", "#", "#12", "#1234", "#12345", "#1234567", "#gggggg", "ec008", "hồng", "rgb(1,2,3)", "#ec 008c"]) {
    assert.equal(normalizeHex(bad), null, JSON.stringify(bad));
  }
});

test("brightness runs from black to white", () => {
  assert.equal(brightness("#000000"), 0);
  assert.equal(brightness("#FFFFFF"), 1);
  assert.ok(brightness("#EC008C") < brightness("#00AEEF"));
  assert.equal(brightness("not a colour"), 0);
});

test("only white-ish colours are pale on a white screen", () => {
  assert.equal(isPale("#FFFFFF"), true);
  assert.equal(isPale("#FFF200"), true);
  for (const c of ["#000000", "#EC008C", "#ED1C24", "#00A651", "#00AEEF", "#2E3192", "#F7941D"]) {
    assert.equal(isPale(c), false, c);
  }
});

test("lines drawn in a printing ink get exactly that ink's colour", () => {
  // a measured average that is a hair off the pink
  assert.equal(snapToInk("#ec018c", false), "#EC008C");
  assert.equal(snapToInk("#EE0090", false), "#EC008C");
  assert.equal(snapToInk("#00aef0", false), "#00AEEF");
});

test("a CMYK file read without a profile: 100% magenta is the die-line pink", () => {
  assert.equal(snapToInk("#ff00ff", true), "#EC008C");
  assert.equal(snapToInk("#00ffff", true), "#00AEEF");
  assert.equal(snapToInk("#ff0000", true), "#ED1C24");
  // the same colour in an RGB picture is the artist's own colour: left alone
  assert.equal(snapToInk("#ff00ff", false), "#FF00FF");
});

test("other colours stay as they are", () => {
  assert.equal(snapToInk("#000000", false), "#000000");
  assert.equal(snapToInk("#336699", true), "#336699");
  assert.equal(snapToInk("#7a1fa2", false), "#7A1FA2");
  assert.equal(snapToInk("hồng", false), "hồng");
});

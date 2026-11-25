import test from "node:test";
import assert from "node:assert/strict";
import {
  getWardrobePhotoEvents,
  reconcileWardrobePhotoEvents,
  sanitizeWardrobeSide,
  withWardrobePhotoEvents,
} from "./wardrobe.ts";

test("wardrobe sanitization keeps optional labels aligned and preserves existing wardrobe details", () => {
  const side = sanitizeWardrobeSide({
    notes: "Ivory silk",
    links: ["https://example.com/look"],
    photos: ["first.jpg", "", "second.jpg"],
    photoEvents: ["Mehendi", "Ignored invalid photo", "Cocktail"],
  });

  assert.deepEqual(side, {
    notes: "Ivory silk",
    links: ["https://example.com/look"],
    photos: ["first.jpg", "second.jpg"],
    photoEvents: ["Mehendi", "Cocktail"],
  });
});

test("older wardrobe records remain valid and photo labels follow photos when one is removed", () => {
  const legacy = sanitizeWardrobeSide({
    notes: "Classic tailoring",
    links: [],
    photos: ["first.jpg", "second.jpg", "third.jpg"],
  });
  assert.deepEqual(getWardrobePhotoEvents(legacy), ["", "", ""]);
  assert.deepEqual(
    reconcileWardrobePhotoEvents(legacy.photos, ["Mehendi", "Wedding", "Cocktail"], ["first.jpg", "third.jpg", "new.jpg"]),
    ["Mehendi", "Cocktail", ""],
  );
  assert.deepEqual(
    withWardrobePhotoEvents(legacy, ["", "", ""]),
    { notes: "Classic tailoring", links: [], photos: ["first.jpg", "second.jpg", "third.jpg"], photoEvents: undefined },
  );
});

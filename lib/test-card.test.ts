import { expect, it } from "vitest";
import { testCardFor } from "./test-card";
it("test card numbers are valid, stable and end in the card's last 4", () => {
  const a = testCardFor("sim_abc", "1116");
  const b = testCardFor("sim_abc", "1116");
  expect(a).toEqual(b);
  expect(a.number).toMatch(/^4000\d{8}1116$/);
  let sum = 0;
  [...a.number].reverse().forEach((c, i) => { let x = Number(c); if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; });
  expect(sum % 10).toBe(0);
  expect(a.cvc).toMatch(/^\d{3}$/);
});

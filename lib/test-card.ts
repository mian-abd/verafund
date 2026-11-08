import { createHash } from "node:crypto";

// Cards our own rules enforce (when the card network wasn't available) still get a card
// number for display: a Luhn-valid number in the 4000 test range, ending in the card's
// last 4, with an expiry and CVC. Derived from the card id, so it never changes.
export function testCardFor(cardId: string, last4: string) {
  const h = createHash("sha256").update(cardId).digest();
  const digits = (n: number, from: number) => Array.from({ length: n }, (_, i) => String(h[from + i] % 10)).join("");
  const body = `4000${digits(7, 0)}`; // 11 digits; one free digit, then the last 4
  const tail = last4.padStart(4, "0").slice(-4);
  let number = "";
  for (let d = 0; d <= 9; d++) {
    const candidate = `${body}${d}${tail}`;
    if (luhnValid(candidate)) {
      number = candidate;
      break;
    }
  }
  return {
    number,
    cvc: digits(3, 10),
    expMonth: (h[14] % 12) + 1,
    expYear: new Date().getFullYear() + 3,
    brand: "visa",
    last4: tail,
  };
}

function luhnValid(n: string): boolean {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let x = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
  }
  return sum % 10 === 0;
}

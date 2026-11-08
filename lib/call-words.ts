// Reads a spoken answer to "was this you?". Objections win, so "no, that wasn't me"
// can never read as a yes. Anything unclear returns null and the caller asks again.
const NO = /\b(no|nope|nah|not me|wasn'?t me|was not me|block|fraud|stop it)\b/i;
const YES = /\b(yes|yeah|yep|yup|it was me|that was me|that's me|mine|correct|i did|approve|go ahead|sure|okay|ok)\b/i;

export function heardDecision(text: string): "yes" | "no" | null {
  if (NO.test(text)) return "no";
  if (YES.test(text)) return "yes";
  return null;
}

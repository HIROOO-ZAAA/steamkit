export function parseAbaMessage(text) {
  if (!text) return null;
  const source = String(text);

  const amountRe = /(\$|៛|USD|KHR)\s*([0-9][0-9,]*)(?:\.([0-9]+))?/i;
  const amountFirstRe = /([0-9][0-9,]*)(?:\.([0-9]+))?\s*(\$|៛|USD|KHR)/i;
  const donorRe = /(?:paid\s+by|from|donor|payer)\s*:?\s*([\p{L}\p{M}\p{N}_'-]+(?:\s+[\p{L}\p{M}\p{N}_'-]+)*?)(?=\s+(?:on|at|via|time|date)\b|\s*\(|$)/iu;
  const noteRe = /(?:message|remark|note|memo)\s*[:\-]\s*([^\n]+)/i;

  let m = source.match(amountRe);
  let currency = null;
  let amountText = null;
  if (m) {
    currency = m[1];
    amountText = m[2] + (m[3] ? `.${m[3]}` : "");
  } else {
    m = source.match(amountFirstRe);
    if (m) {
      currency = m[3];
      amountText = m[1] + (m[2] ? `.${m[2]}` : "");
    }
  }

  if (m === null) return null;

  const amount = Number(amountText.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let cur = String(currency).toUpperCase();
  if (cur === "$") cur = "USD";
  else if (cur === "៛") cur = "KHR";
  if (cur !== "USD" && cur !== "KHR") cur = "USD";

  let donor = "";
  const dm = source.match(donorRe);
  if (dm) donor = dm[1].replace(/[\s()]+$/g, "").trim().slice(0, 60);

  let note = "";
  const nm = source.match(noteRe);
  if (nm) note = nm[1].replace(/\s+$/g, "").trim().slice(0, 300);

  return {
    amount,
    currency: cur,
    donor: donor || "Anonymous",
    message: note || null,
  };
}

if (process.argv.includes("--test")) {
  const khmerName = String.fromCodePoint(0x179F, 0x17BB, 0x1781);
  const cases = [
    ["$0.20 paid by CHEA LYHENG (*678) on Oct 07, 03:48 PM via ABA KHQR (ACLEDA Bank Plc.)", "USD", 0.2, "CHEA LYHENG", undefined],
    ["KHR 40,000 from JOHN DOE on Oct 07", "KHR", 40000, "JOHN DOE", undefined],
    ["៛40,000 via ABA", "KHR", 40000, "Anonymous", undefined],
    ["40000 KHR", "KHR", 40000, "Anonymous", undefined],
    ["$ 10.00 message: Thanks for stream", "USD", 10, "Anonymous", "Thanks for stream"],
    ["10 USD paid by M SOKUN time: 02:13 PM", "USD", 10, "M SOKUN", undefined],
    ["$25.00 from NITA (paying rent) message: keep it up", "USD", 25, "NITA", "keep it up"],
    [`KHR 40,000 paid by ${khmerName} on Nov 15`, "KHR", 40000, khmerName, undefined],
    [`KHR 40,000 paid by JOHN ${khmerName} on Nov 15`, "KHR", 40000, `JOHN ${khmerName}`, undefined],
    [`KHR 40,000 from ${khmerName} on Nov 15`, "KHR", 40000, khmerName, undefined],
    [`KHR 40,000 donor: ${khmerName} via ABA`, "KHR", 40000, khmerName, undefined],
  ];
  let failed = 0;
  for (const [input, cur, amt, donor, note] of cases) {
    const r = parseAbaMessage(input);
    const pass =
      r !== null &&
      r.currency === cur &&
      r.amount === amt &&
      r.donor === donor &&
      (note === undefined ? true : r.message === note);
    console.log(`${pass ? "PASS" : "FAIL"}  ${JSON.stringify(input)}`);
    if (!pass) failed += 1;
  }
  process.exit(failed === 0 ? 0 : 1);
}
// Field extraction for the DeepL baseline.
//
// DeepL translates raw text, not structured JSON — so to give it a fair shot we
// pull out exactly the fields production translates (tasks: title, description,
// checklistItems[].title; rooms: name, description; roomItems: title, notes),
// send them as one ordered batch, and reassemble the SAME structure with ids
// intact. That means structure always passes for DeepL by construction — so the
// head-to-head measures what actually differs: verbatim color-code preservation
// and instruction meaning, not JSON shape.

// Returns { strings, rebuild }. `strings` is the ordered list of translatable
// values; `rebuild(translated)` returns an output object (deep copy of input)
// with each string swapped for translated[i] in the same order.
export function collectStrings(input) {
  const out = JSON.parse(JSON.stringify(input));
  const strings = [];
  const slots = []; // setters applied in order during rebuild

  const take = (obj, key) => {
    if (obj && typeof obj[key] === "string" && obj[key].trim() !== "") {
      const i = strings.length;
      strings.push(obj[key]);
      slots.push((arr) => { obj[key] = arr[i]; });
    }
  };

  for (const t of out.tasks || []) {
    take(t, "title");
    take(t, "description");
    for (const ci of t.checklistItems || []) take(ci, "title");
  }
  for (const r of out.rooms || []) {
    take(r, "name");
    take(r, "description");
  }
  for (const ri of out.roomItems || []) {
    take(ri, "title");
    take(ri, "notes");
  }

  const rebuild = (translated) => {
    for (const set of slots) set(translated);
    return out;
  };

  return { strings, rebuild };
}

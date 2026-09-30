self.GRCON_ASSET_BASE = "../";
importScripts("../grcon_utils.js", "../grcon_contracts.js", "../discipline_resolver.js", "../core.js", "../xlsx.full.min.js", "../posting_conference_core.js");
self.onmessage = (event) => {
  try {
    const parsed = self.GrconPostingConference.parseWorkbook(self.XLSX.read(event.data.buffer, { type: "array", dense: false }), event.data.meta);
    if (!parsed.ok) throw new Error(parsed.errors.join(" "));
    self.postMessage({ ok: true, base: { meta: parsed.meta, records: parsed.records } });
  } catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); }
};

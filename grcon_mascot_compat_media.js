/* GRCON — fallback H.264 local do Mascote da Qualidade.
 * Os MP4 compactos ficam divididos em partes Base64 para permanecerem 100% no
 * mesmo deploy estático do GRCON. Eles só são baixados/reconstruídos quando o
 * WebM/VP9 falha, portanto não impactam o carregamento normal.
 */
(function (root) {
  "use strict";

  const REVISION = "20260916.3";
  const PARTS = Object.freeze({
    wave: [1, 2, 3, 4].map((part) => `assets/mascot/compat/wave-h264-144.part${part}.b64?v=${REVISION}`),
    processing: [1, 2, 3, 4].map((part) => `assets/mascot/compat/processing-h264-128.part${part}.b64?v=${REVISION}`),
  });
  const urls = new Map();
  const promises = new Map();

  async function fetchPart(path) {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw Object.assign(new Error(`compat-part-http-${response.status}`), { status: response.status });
    const text = (await response.text()).trim();
    if (!text || !/^[A-Za-z0-9+/=]+$/.test(text)) throw new Error("compat-part-invalid");
    return text;
  }

  function decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function getUrl(name) {
    if (urls.has(name)) return urls.get(name);
    if (promises.has(name)) return promises.get(name);
    if (!PARTS[name]) throw new Error(`compat-animation-unknown:${name}`);
    const promise = Promise.all(PARTS[name].map(fetchPart)).then((chunks) => {
      const bytes = decodeBase64(chunks.join(""));
      if (bytes.byteLength < 10_000) throw new Error("compat-video-too-small");
      const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
      urls.set(name, url);
      return url;
    }).finally(() => promises.delete(name));
    promises.set(name, promise);
    return promise;
  }

  function revokeAll() {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  }

  root.addEventListener("pagehide", revokeAll, { once: true });
  root.GRCONMascotCompatMedia = Object.freeze({
    version: "1.0.0",
    revision: REVISION,
    getUrl,
    revokeAll,
    diagnostics: () => ({ revision: REVISION, ready: [...urls.keys()], loading: [...promises.keys()] }),
  });
})(window);

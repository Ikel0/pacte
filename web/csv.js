// Sérialisation du lot modifié par le visiteur. Le contrôle lui-même reste côté serveur :
// ce module ne fait que reconstruire un CSV fidèle à ce qui est affiché dans le tableau.
(function (root) {
  "use strict";

  function quote(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function toCsv(headers, rows) {
    const lines = [headers.map(quote).join(",")];
    for (const row of rows) lines.push(headers.map((_, index) => quote(row[index])).join(","));
    return `${lines.join("\n")}\n`;
  }

  const api = { quote, toCsv };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PacteCsv = api;
})(typeof window !== "undefined" ? window : globalThis);

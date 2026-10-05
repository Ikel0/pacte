// node --test tests/ : sérialisation du lot modifié dans la page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { quote, toCsv } = require("../web/csv.js");

test("une valeur simple reste telle quelle", () => {
  assert.equal(quote("ord-1001"), "ord-1001");
  assert.equal(quote(""), "");
  assert.equal(quote(undefined), "");
});

test("virgules, guillemets et retours à la ligne sont protégés", () => {
  assert.equal(quote("a,b"), '"a,b"');
  assert.equal(quote('dit "oui"'), '"dit ""oui"""');
  assert.equal(quote("l1\nl2"), '"l1\nl2"');
});

test("le CSV suit l'ordre des en-têtes et complète les cellules manquantes", () => {
  const csv = toCsv(["order_id", "status"], [["ord-1", "paid"], ["ord-2"]]);
  assert.equal(csv, "order_id,status\nord-1,paid\nord-2,\n");
});

test("balises et formules sont transmises comme du texte, sans transformation", () => {
  const csv = toCsv(["a", "b"], [["<script>alert(1)</script>", "=1+1"]]);
  assert.equal(csv, "a,b\n<script>alert(1)</script>,=1+1\n");
});

test("la page n'injecte jamais de HTML", () => {
  for (const file of ["app.js", "csv.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "web", file), "utf8");
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  }
});

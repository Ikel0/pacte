(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elements = {
    batch: $("batch"),
    checksBody: $("checksBody"),
    contractConsumers: $("contractConsumers"),
    contractDescription: $("contractDescription"),
    contractFields: $("contractFields"),
    contractMeta: $("contractMeta"),
    contractRules: $("contractRules"),
    contractTitle: $("contract-title"),
    decision: $("decision"),
    decisionBlock: $("decisionBlock"),
    decisionReason: $("decisionReason"),
    freshnessNote: $("freshnessNote"),
    history: $("history"),
    impactBody: $("impactBody"),
    linesNote: $("linesNote"),
    linesTable: $("linesTable"),
    pvMeta: $("pvMeta"),
    receiptBody: $("receiptBody"),
    receiptNote: $("receiptNote"),
    refreshAudit: $("refreshAudit"),
    requestStatus: $("requestStatus"),
    result: $("result"),
    validate: $("validate"),
    addRow: $("addRow"),
    backToReference: $("backToReference"),
    announce: $("announce"),
    editTools: $("editTools"),
    paste: $("paste"),
    pasteArea: $("pasteArea"),
    pasteForm: $("pasteForm"),
    reset: $("reset"),
    scenario: $("scenario"),
    trialStatus: $("trialStatus"),
  };

  const DEFAULT_BATCH = "orders_quality_issues.csv";

  const decisionWords = {
    accept: "accepté",
    review: "à revoir",
    accept_with_warnings: "à revoir",
    quarantine: "refusé, en quarantaine",
  };
  const controlWords = { passed: "passé", review: "à revoir", failed: "échec" };
  const actionWords = { clear: "reçoit le lot", review: "attend la revue", blocked: "ne reçoit pas le lot" };
  const tierWords = { critical: "critique", high: "élevé", medium: "moyen", low: "faible" };
  const typeWords = { string: "texte", number: "nombre", date: "date (AAAA-MM-JJ)" };
  const batchWords = {
    "orders_clean.csv": "Commandes, export conforme",
    "orders_quality_issues.csv": "Commandes, valeurs et clés invalides",
    "orders_schema_drift.csv": "Commandes, colonne non prévue",
  };

  let contract = null;

  function count(n, singular, plural) {
    const value = Number(n) || 0;
    return `${value} ${value < 2 ? singular : plural}`;
  }

  function el(tag, text, className, attributes) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (attributes) for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  }

  function row(cells) {
    const tr = el("tr");
    for (const cell of cells) tr.append(cell instanceof Node ? cell : el("td", cell));
    return tr;
  }

  function table(headers, rows, className = "plain") {
    const t = el("table", null, className);
    const head = el("tr");
    for (const h of headers) head.append(el("th", h, null, { scope: "col" }));
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    for (const r of rows) tbody.append(r);
    t.append(thead, tbody);
    return t;
  }

  function code(text) {
    return el("code", text);
  }

  function codeCell(text) {
    const td = el("td");
    td.append(code(text));
    return td;
  }

  function batchLabel(batch) {
    return batchWords[batch] || batch;
  }

  function decisionWord(decision) {
    return decisionWords[decision] || decision || "inconnue";
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "le service n’a pas répondu correctement");
    return data;
  }

  function setStatus(message = "", isError = false) {
    elements.requestStatus.textContent = message;
    elements.requestStatus.classList.toggle("is-error", isError);
  }

  /* Contrat */

  function ruleSentences(fields) {
    const rules = [
      "Les en-têtes du lot correspondent aux champs ci-dessus. Un champ absent, un en-tête dupliqué ou une valeur sans en-tête refusent le lot ; une colonne non prévue le met à revoir.",
      "Le lot contient au moins une ligne de données.",
    ];
    const required = fields.filter((f) => f.required).map((f) => f.name);
    if (required.length === 1) rules.push(`${required[0]} est renseigné sur chaque ligne.`);
    if (required.length > 1) rules.push(`${listWords(required)} sont renseignés sur chaque ligne.`);
    for (const field of fields) {
      if (field.unique) rules.push(`${field.name} est unique dans le lot.`);
      if (field.min !== undefined) rules.push(`${field.name} est un nombre supérieur ou égal à ${field.min}.`);
      if (field.type === "date") rules.push(`${field.name} est une date valide au format AAAA-MM-JJ.`);
      if (Array.isArray(field.allowed)) rules.push(`${field.name} prend l’une des valeurs ${field.allowed.join(", ")}.`);
    }
    rules.push("Une valeur obligatoire invalide ou une clé en double refusent le lot et le mettent en quarantaine.");
    return rules;
  }

  function renderContract(data) {
    contract = data;
    const fields = Array.isArray(data.fields) ? data.fields : [];
    elements.contractTitle.textContent = `Contrat ${data.name || "sans nom"}, version ${data.version || "?"}`;
    elements.contractMeta.replaceChildren(
      document.createTextNode(`Responsable ${data.owner || "non attribué"}. Empreinte SHA-256 `),
      el("code", data.fingerprint || "non calculée", "hash"),
      document.createTextNode(".")
    );
    elements.contractDescription.textContent = data.description || "";

    elements.contractFields.replaceChildren(
      fields.length
        ? table(
            ["Nom", "Type", "Obligatoire"],
            fields.map((f) => row([codeCell(f.name), typeWords[f.type] || f.type, f.required ? "oui" : "non"]))
          )
        : el("p", "Le contrat ne déclare aucun champ.")
    );

    elements.contractRules.replaceChildren(...ruleSentences(fields).map((text) => el("li", text)));

    elements.freshnessNote.textContent = data.freshness_hours
      ? `Le contrat déclare un délai de fraîcheur de ${data.freshness_hours} h. Ce délai n’est pas mesuré : les CSV de démonstration ne portent pas d’horodatage de livraison, Pacte ne le contrôle donc pas.`
      : "Le contrat ne déclare pas de délai de fraîcheur.";

    const consumers = Array.isArray(data.downstream) ? data.downstream : [];
    elements.contractConsumers.replaceChildren(
      consumers.length
        ? table(
            ["Consommateur", "Niveau", "Usage"],
            consumers.map((c) => row([codeCell(c.asset), tierWords[c.tier] || c.tier, c.reason || ""]))
          )
        : el("p", "Aucun consommateur n’est déclaré.")
    );
  }

  function renderBatches(batches) {
    const list = Array.isArray(batches) ? batches : [];
    elements.batch.replaceChildren();
    if (!list.length) {
      elements.batch.append(el("option", "Aucun lot disponible", null, { value: "" }));
      elements.batch.disabled = true;
      elements.validate.disabled = true;
      return;
    }
    elements.batch.disabled = false;
    elements.validate.disabled = false;
    for (const batch of list) elements.batch.append(el("option", batchLabel(batch), null, { value: batch }));
  }

  /* Procès-verbal */

  function listWords(items) {
    if (items.length < 2) return items.join("");
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
  }

  // Regroupe les écarts par nature pour que le motif tienne en une phrase.
  function issueSummary(issues) {
    const invalid = issues.filter((i) => i.check.startsWith("field.")).map((i) => i.check.slice(6));
    const duplicated = issues.filter((i) => i.check.startsWith("uniqueness.")).map((i) => i.check.slice(11));
    const named = (i) => i.message.split(" : ").slice(1).join(" : ");
    const parts = issues
      .filter((i) => !i.check.startsWith("field.") && !i.check.startsWith("uniqueness."))
      .map((i) => {
        if (i.check === "schema.unexpected_fields") return `colonne ${named(i)} absente du contrat`;
        if (i.check === "schema.missing_fields") return `champ ${named(i)} absent du lot`;
        return i.message.charAt(0).toLowerCase() + i.message.slice(1);
      });
    if (duplicated.length) parts.unshift(`clé ${listWords(duplicated)} en double`);
    if (invalid.length) parts.push(`${invalid.length > 1 ? "valeurs invalides" : "valeur invalide"} pour ${listWords(invalid)}`);
    return parts.join(" ; ");
  }

  function faultyLines(data) {
    const lines = (Array.isArray(data.lines) ? data.lines : []).filter((l) => (l.findings || []).length).map((l) => l.line);
    if (!lines.length) return "";
    return lines.length > 1 ? `, lignes ${listWords(lines.map(String))}` : `, ligne ${lines[0]}`;
  }

  function decisionReason(data, issues) {
    const decision = data.decision;
    const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
    const critical = issues.filter((i) => i.severity === "critical");
    const warnings = issues.filter((i) => i.severity !== "critical");
    if (decision === "quarantine") {
      return `Motif : ${count(summary.critical ?? critical.length, "écart bloquant", "écarts bloquants")}${faultyLines(data)} (${issueSummary(critical)}). Aucun consommateur déclaré ne reçoit cette version.`;
    }
    if (decision === "review" || decision === "accept_with_warnings") {
      return `Motif : ${issueSummary(warnings)}. Aucun écart bloquant, mais la publication attend la revue du responsable du contrat, ${data.contract_owner || "non attribué"}.`;
    }
    const controls = Array.isArray(data.controls) ? data.controls.length : 0;
    return `Les ${controls} contrôles sont passés sur ${count(data.rows, "ligne", "lignes")}. Le lot peut être publié vers les consommateurs déclarés.`;
  }

  /* Lot de travail : copie modifiable du lot contrôlé.
     Elle ne vit que dans cette page ; chaque calcul renvoie la copie entière au serveur. */

  const work = {
    reference: null, // réponse du contrôle du fichier d'origine
    referenceAudit: null,
    headers: [],
    rows: [],
    originalRows: [],
    modified: false,
    sequence: 0,
    timer: 0,
    lastDecision: "",
  };

  function loadWork(data) {
    work.headers = Array.isArray(data.headers) ? [...data.headers] : [];
    work.rows = (Array.isArray(data.lines) ? data.lines : []).map((line) => [...(line.values || [])]);
  }

  function isEdited(rowIndex, colIndex) {
    const original = work.originalRows[rowIndex];
    return !original || original[colIndex] !== work.rows[rowIndex][colIndex];
  }

  function cellInput(rowIndex, colIndex) {
    const value = work.rows[rowIndex][colIndex] ?? "";
    const header = work.headers[colIndex] || "";
    const input = el("input", null, "cell", {
      type: "text",
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": `Ligne ${rowIndex + 2}, ${header}`,
      size: Math.max(4, value.length + 1),
      placeholder: "vide",
    });
    input.value = value; // propriété value : la saisie reste du texte, jamais du HTML
    input.dataset.row = rowIndex;
    input.dataset.col = colIndex;
    return input;
  }

  function buildLinesTable() {
    const expected = new Set((contract?.fields || []).map((f) => f.name));
    const thead = el("thead");
    const head = el("tr");
    head.append(el("th", "Ligne", "num", { scope: "col" }));
    work.headers.forEach((h, colIndex) => {
      const th = el("th", null, contract && !expected.has(h) ? "is-unexpected" : null, { scope: "col" });
      th.append(el("span", h));
      if (contract && !expected.has(h)) {
        th.append(el("button", "retirer", "inline-action", { type: "button", "data-remove-col": colIndex, "aria-label": `Retirer la colonne ${h}` }));
      }
      head.append(th);
    });
    const marginHead = el("th", null, "margin", { scope: "col" });
    marginHead.append(el("span", "Écart"), el("span", "", "margin-note", { id: "headerNote" }));
    head.append(marginHead);
    thead.append(head);

    const tbody = el("tbody");
    work.rows.forEach((values, rowIndex) => {
      const tr = el("tr");
      const lineCell = el("th", null, "num", { scope: "row", "data-label": "Ligne" });
      lineCell.append(el("span", rowIndex + 2, "line-number"));
      lineCell.append(el("button", "retirer", "inline-action", { type: "button", "data-remove-row": rowIndex, "aria-label": `Retirer la ligne ${rowIndex + 2}` }));
      tr.append(lineCell);
      work.headers.forEach((h, colIndex) => {
        const td = el("td", null, null, { "data-field": h });
        td.append(cellInput(rowIndex, colIndex));
        tr.append(td);
      });
      tr.append(el("td", null, "margin"));
      tbody.append(tr);
    });
    if (!work.rows.length) {
      const tr = el("tr");
      tr.append(el("td", "Le lot ne contient aucune ligne de données.", null, { colspan: work.headers.length + 2 }));
      tbody.append(tr);
    }
    elements.linesTable.replaceChildren(thead, tbody);
  }

  // Applique au tableau existant les écarts calculés par le serveur, sans le reconstruire (le focus reste en place).
  function applyFindings(data) {
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const body = elements.linesTable.tBodies[0];
    if (!body) return;
    lines.forEach((line, rowIndex) => {
      const tr = body.rows[rowIndex];
      if (!tr) return;
      const findings = Array.isArray(line.findings) ? line.findings : [];
      const faulty = new Map(findings.map((f) => [f.field, f.severity]));
      tr.querySelectorAll("input.cell").forEach((input) => {
        const col = Number(input.dataset.col);
        const severity = faulty.get(work.headers[col]);
        input.parentElement.className = [severity ? `is-faulty is-${severity}` : "", input.value === "" ? "is-empty" : "", isEdited(rowIndex, col) ? "is-edited" : ""].filter(Boolean).join(" ");
        input.setAttribute("aria-invalid", severity ? "true" : "false");
      });
      const margin = tr.cells[tr.cells.length - 1];
      margin.replaceChildren(...findings.map((f) => el("span", f.message, `finding is-${f.severity}`)));
    });
    const unexpected = work.headers.filter((h) => contract && !new Set(contract.fields.map((f) => f.name)).has(h));
    const note = document.getElementById("headerNote");
    if (note) note.textContent = unexpected.length ? `${listWords(unexpected)} absent du contrat` : "";

    const withFindings = lines.filter((l) => (l.findings || []).length).length;
    elements.linesNote.textContent = `${count(data.rows, "ligne contrôlée", "lignes contrôlées")}, ${withFindings ? count(withFindings, "porte un écart", "portent des écarts") : "aucune ne porte d’écart"}. Corrigez une valeur : le contrôle se relance, rien n’est conservé.`;
  }

  function renderReceipt(data, receipt) {
    const controls = Array.isArray(data.controls) ? data.controls : [];
    const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
    const passed = controls.filter((c) => c.state === "passed").length;
    const decision = String(data.decision || "");
    const record = data.trial
      ? [
          ["Date", "essai non enregistré"],
          ["Lot", `copie modifiée de ${work.reference?.batch || "?"}, ${count(data.rows, "ligne", "lignes")}`],
          ["Empreinte du lot", el("code", data.batch_fingerprint || "?", "hash")],
        ]
      : [
          ["Date", receipt?.recorded_at ? `${receipt.recorded_at} UTC` : "non enregistrée"],
          ["Lot", `${data.batch}, ${count(data.rows, "ligne", "lignes")}`],
          ["Empreinte du lot", el("code", data.batch_fingerprint || "?", "hash")],
        ];
    record.push(
      ["Contrat", `${data.contract} v${data.contract_version}, responsable ${data.contract_owner || "non attribué"}`],
      ["Empreinte du contrat", el("code", data.contract_fingerprint || "?", "hash")],
      ["Contrôles passés", `${passed} sur ${controls.length}`],
      ["Écarts", `${count(summary.critical, "écart bloquant", "écarts bloquants")}, ${count(summary.warnings, "à revoir", "à revoir")}, ${count(summary.affected_values, "valeur signalée", "valeurs signalées")}`],
      ["Décision", `lot ${decisionWord(decision)}`],
      ["Référence", data.trial ? "aucune, l’essai n’entre pas au journal" : el("code", receipt?.run_id || data.run_id || "?")]
    );
    elements.receiptBody.replaceChildren(
      ...record.map(([label, value]) => {
        const tr = el("tr");
        const td = el("td");
        td.append(value instanceof Node ? value : document.createTextNode(value));
        tr.append(el("th", label, null, { scope: "row" }), td);
        return tr;
      })
    );
    elements.receiptNote.textContent = data.trial
      ? "Essai calculé en mémoire avec les règles du contrat. Ni le contenu du lot ni ce reçu ne sont conservés, et aucun autre visiteur ne les voit."
      : receipt?.replayed
        ? "Ce fichier avait déjà été contrôlé avec ce contrat : le reçu existant est repris tel quel, sans nouvelle entrée au journal."
        : "Reçu enregistré dans le journal local. Rejouer le même fichier avec le même contrat retrouvera ce reçu.";
  }

  function renderVerdict(data, receipt) {
    const decision = String(data.decision || "");
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const controls = Array.isArray(data.controls) ? data.controls : [];
    const impact = Array.isArray(data.impact) ? data.impact : [];

    elements.pvMeta.textContent = data.trial
      ? `Copie de ${work.reference?.batch || "?"} modifiée par vous, contrôlée contre ${data.contract} v${data.contract_version}.`
      : `Lot ${data.batch}, contrôlé contre ${data.contract} v${data.contract_version}.`;
    elements.scenario.hidden = !data.trial;

    elements.decisionBlock.className = `decision is-${decision.replaceAll("_", "-")}`;
    elements.decision.replaceChildren(document.createTextNode("Décision : "), el("strong", `lot ${decisionWord(decision)}.`));
    elements.decisionReason.textContent = decisionReason(data, issues);

    elements.checksBody.replaceChildren(
      ...controls.map((c) => row([c.label || c.id, el("td", controlWords[c.state] || c.state, `state is-${c.state}`), el("td", c.issues || 0, "num")]))
    );
    elements.impactBody.replaceChildren(
      ...impact.map((a) => row([codeCell(a.asset), tierWords[a.tier] || a.tier, el("td", actionWords[a.action] || a.action, `state is-${a.action}`)]))
    );
    applyFindings(data);
    renderReceipt(data, receipt);

    // Annonce aux lecteurs d'écran seulement quand la décision change, pas à chaque frappe.
    if (work.lastDecision && work.lastDecision !== decision) {
      elements.announce.textContent = `Décision mise à jour : lot ${decisionWord(decision)}.`;
    }
    work.lastDecision = decision;
  }

  function renderReference(data, receipt) {
    work.reference = data;
    work.referenceAudit = receipt;
    loadWork(data);
    work.originalRows = work.rows.map((r) => [...r]);
    work.modified = false;
    work.lastDecision = "";
    elements.trialStatus.textContent = "";
    elements.reset.disabled = true;
    const tooLong = (data.rows || 0) > work.rows.length;
    elements.editTools.hidden = tooLong;
    buildLinesTable();
    elements.linesTable.querySelectorAll("input, button").forEach((n) => (n.disabled = tooLong));
    renderVerdict(data, receipt);
    elements.result.hidden = false;
  }

  /* Essais : chaque modification relance le vrai contrôle côté serveur, en mémoire. */

  function scheduleTrial(delay = 350) {
    window.clearTimeout(work.timer);
    work.timer = window.setTimeout(runTrial, delay);
  }

  async function runTrial(csvText) {
    const sequence = ++work.sequence;
    const text = typeof csvText === "string" ? csvText : window.PacteCsv.toCsv(work.headers, work.rows);
    try {
      const data = await request("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (sequence !== work.sequence) return; // une saisie plus récente est déjà partie
      work.modified = true;
      elements.reset.disabled = false;
      if (typeof csvText === "string") {
        loadWork(data);
        buildLinesTable();
      }
      renderVerdict(data);
      elements.trialStatus.textContent = "";
      elements.trialStatus.classList.remove("is-error");
    } catch (error) {
      if (sequence !== work.sequence) return;
      const message = `Essai non contrôlé : ${error.message}. La décision affichée est celle du dernier essai valide.`;
      elements.trialStatus.textContent = message;
      elements.trialStatus.classList.add("is-error");
      elements.announce.textContent = message;
    }
  }

  function structureChanged(focusSelector) {
    buildLinesTable();
    if (focusSelector) elements.linesTable.querySelector(focusSelector)?.focus();
    scheduleTrial(0);
  }

  function resetWork() {
    window.clearTimeout(work.timer);
    work.sequence += 1;
    if (work.reference) renderReference(work.reference, work.referenceAudit);
    elements.announce.textContent = "Lot de référence rétabli.";
    elements.pasteArea.value = "";
    elements.paste.open = false;
  }

  elements.linesTable.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches("input.cell")) return;
    work.rows[Number(input.dataset.row)][Number(input.dataset.col)] = input.value;
    input.size = Math.max(4, input.value.length + 1);
    scheduleTrial();
  });

  elements.linesTable.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.removeRow !== undefined) {
      const index = Number(button.dataset.removeRow);
      work.rows.splice(index, 1);
      work.originalRows.splice(index, 1);
      const next = Math.min(index, work.rows.length - 1);
      structureChanged(next >= 0 ? `[data-remove-row="${next}"]` : null);
      if (next < 0) elements.addRow.focus();
    } else if (button.dataset.removeCol !== undefined) {
      const col = Number(button.dataset.removeCol);
      work.headers.splice(col, 1);
      work.rows.forEach((r) => r.splice(col, 1));
      work.originalRows.forEach((r) => r.splice(col, 1));
      structureChanged();
      elements.linesTable.querySelector("input.cell")?.focus();
    }
  });

  elements.addRow.addEventListener("click", () => {
    if (work.rows.length >= 200) {
      elements.trialStatus.textContent = "Le lot d’essai est limité à 200 lignes.";
      return;
    }
    work.rows.push(work.headers.map(() => ""));
    structureChanged(`input[data-row="${work.rows.length - 1}"][data-col="0"]`);
  });

  elements.reset.addEventListener("click", resetWork);
  elements.backToReference.addEventListener("click", resetWork);

  elements.pasteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = elements.pasteArea.value;
    if (!text.trim()) {
      elements.trialStatus.textContent = "Collez d’abord un CSV avec sa ligne d’en-tête.";
      return;
    }
    work.originalRows = [];
    runTrial(text.endsWith("\n") ? text : `${text}\n`);
  });

  elements.paste.addEventListener("toggle", () => {
    if (elements.paste.open && !elements.pasteArea.value) {
      elements.pasteArea.value = window.PacteCsv.toCsv(work.headers, work.rows);
    }
  });

  /* Journal */

  function renderHistory(runs) {
    const list = Array.isArray(runs) ? runs : [];
    if (!list.length) {
      const tr = el("tr");
      tr.append(el("td", "Aucun contrôle enregistré pour l’instant.", null, { colspan: 4 }));
      elements.history.replaceChildren(tr);
      return;
    }
    elements.history.replaceChildren(
      ...list.map((run) => {
        const s = run.summary && typeof run.summary === "object" ? run.summary : {};
        const gaps = s.critical || s.warnings ? `${count(s.critical, "bloquant", "bloquants")}, ${s.warnings || 0} à revoir` : "aucun";
        const decision = String(run.decision || "");
        return row([el("td", run.created_at || "?", "num"), codeCell(run.batch || "?"), el("td", decisionWord(decision), `state is-${decision}`), gaps]);
      })
    );
  }

  async function refreshAudit() {
    elements.refreshAudit.disabled = true;
    try {
      renderHistory(await request("/api/audit"));
    } catch (error) {
      setStatus(`Journal illisible : ${error.message}.`, true);
    } finally {
      elements.refreshAudit.disabled = false;
    }
  }

  async function validateBatch() {
    if (!elements.batch.value) return;
    elements.validate.disabled = true;
    elements.validate.textContent = "Contrôle en cours";
    setStatus(`Contrôle de ${elements.batch.value} contre le contrat.`);
    try {
      const data = await request("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: elements.batch.value }),
      });
      const audit = await request("/api/audit").catch(() => null);
      if (audit) renderHistory(audit);
      renderReference(data, data.audit || audit?.find((entry) => entry.run_id === data.run_id));
      setStatus("");
    } catch (error) {
      setStatus(`Le contrôle n’a pas abouti : ${error.message}.`, true);
    } finally {
      elements.validate.disabled = false;
      elements.validate.textContent = "Lancer les contrôles";
    }
  }

  async function load() {
    // Sur l'offre gratuite de Render, le service s'endort : le premier appel peut attendre son réveil.
    const wake = window.setTimeout(() => setStatus("Le service démarre, comptez environ 40 secondes."), 2500);
    try {
      const data = await request("/api/overview");
      window.clearTimeout(wake);
      setStatus("");
      renderContract(data.contract || {});
      renderBatches(data.batches);
      renderHistory(data.recent);
      // La page s'ouvre sur un procès-verbal complet : le lot refusé, ou celui demandé par ?lot=.
      const batches = data.batches || [];
      const wanted = new URLSearchParams(window.location.search).get("lot");
      const initial = batches.includes(wanted) ? wanted : batches.includes(DEFAULT_BATCH) ? DEFAULT_BATCH : batches[0];
      if (initial) {
        elements.batch.value = initial;
        await validateBatch();
      }
    } catch (error) {
      window.clearTimeout(wake);
      setStatus(`Le contrat n’a pas pu être lu : ${error.message}. Vérifiez que le service Pacte est lancé.`, true);
      elements.contractTitle.textContent = "Contrat indisponible";
      elements.contractMeta.textContent = "";
      elements.validate.disabled = true;
    }
  }

  elements.validate.addEventListener("click", validateBatch);
  elements.refreshAudit.addEventListener("click", refreshAudit);
  load();
})();

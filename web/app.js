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
  };

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

  function renderLines(data) {
    const headers = Array.isArray(data.headers) ? data.headers : [];
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const expected = new Set((contract?.fields || []).map((f) => f.name));
    const unexpected = headers.filter((h) => h && contract && !expected.has(h));

    const thead = el("thead");
    const head = el("tr");
    head.append(el("th", "Ligne", "num", { scope: "col" }));
    for (const h of headers) head.append(el("th", h, unexpected.includes(h) ? "is-unexpected" : null, { scope: "col" }));
    const marginHead = el("th", null, "margin", { scope: "col" });
    marginHead.append(el("span", "Écart"));
    if (unexpected.length) {
      marginHead.append(el("span", `${listWords(unexpected)} absent du contrat`, "margin-note"));
    }
    head.append(marginHead);
    thead.append(head);

    const tbody = el("tbody");
    for (const line of lines) {
      const findings = Array.isArray(line.findings) ? line.findings : [];
      const faulty = new Map(findings.map((f) => [f.field, f.severity]));
      const tr = el("tr", null, findings.length ? "has-findings" : null);
      tr.append(el("th", line.line, "num", { scope: "row", "data-label": "Ligne" }));
      (line.values || []).forEach((value, index) => {
        const severity = faulty.get(headers[index]);
        const td = el("td", value === "" ? "vide" : value, severity ? `is-faulty is-${severity}` : value === "" ? "is-empty" : null, { "data-field": headers[index] || "" });
        tr.append(td);
      });
      const margin = el("td", null, "margin");
      for (const f of findings) margin.append(el("span", f.message, `finding is-${f.severity}`));
      tr.append(margin);
      tbody.append(tr);
    }
    if (!lines.length) {
      const tr = el("tr");
      tr.append(el("td", "Le lot ne contient aucune ligne de données.", null, { colspan: headers.length + 2 }));
      tbody.append(tr);
    }
    elements.linesTable.replaceChildren(thead, tbody);

    const withFindings = lines.filter((l) => (l.findings || []).length).length;
    const shown = lines.length < (data.rows || 0) ? ` Seules les ${lines.length} premières sont affichées.` : "";
    elements.linesNote.textContent = `${count(data.rows, "ligne contrôlée", "lignes contrôlées")}, ${withFindings ? count(withFindings, "porte un écart", "portent des écarts") : "aucune ne porte d’écart"}.${shown} La numérotation suit le fichier, en-tête en ligne 1.`;
  }

  function renderPv(data, auditEntry) {
    const decision = String(data.decision || "");
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const controls = Array.isArray(data.controls) ? data.controls : [];
    const impact = Array.isArray(data.impact) ? data.impact : [];
    const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
    const receipt = data.audit && typeof data.audit === "object" ? data.audit : auditEntry || {};
    const passed = controls.filter((c) => c.state === "passed").length;

    elements.pvMeta.textContent = `Lot ${data.batch}, contrôlé contre ${data.contract} v${data.contract_version}.`;

    elements.decisionBlock.className = `decision is-${decision.replaceAll("_", "-")}`;
    elements.decision.replaceChildren(document.createTextNode("Décision : "), el("strong", `lot ${decisionWord(decision)}.`));
    elements.decisionReason.textContent = decisionReason(data, issues);

    renderLines(data);

    elements.checksBody.replaceChildren(
      ...controls.map((c) => {
        const result = el("td", controlWords[c.state] || c.state, `state is-${c.state}`);
        return row([c.label || c.id, result, el("td", c.issues || 0, "num")]);
      })
    );

    elements.impactBody.replaceChildren(
      ...impact.map((a) => row([codeCell(a.asset), tierWords[a.tier] || a.tier, el("td", actionWords[a.action] || a.action, `state is-${a.action}`)]))
    );

    const record = [
      ["Date", receipt.recorded_at ? `${receipt.recorded_at} UTC` : "non enregistrée"],
      ["Lot", `${data.batch}, ${count(data.rows, "ligne", "lignes")}`],
      ["Empreinte du lot", el("code", data.batch_fingerprint || "?", "hash")],
      ["Contrat", `${data.contract} v${data.contract_version}, responsable ${data.contract_owner || "non attribué"}`],
      ["Empreinte du contrat", el("code", data.contract_fingerprint || "?", "hash")],
      ["Contrôles passés", `${passed} sur ${controls.length}`],
      ["Écarts", `${count(summary.critical, "écart bloquant", "écarts bloquants")}, ${count(summary.warnings, "à revoir", "à revoir")}, ${count(summary.affected_values, "valeur signalée", "valeurs signalées")}`],
      ["Décision", `lot ${decisionWord(decision)}`],
      ["Référence", el("code", receipt.run_id || data.run_id || "?")],
    ];
    elements.receiptBody.replaceChildren(
      ...record.map(([label, value]) => {
        const tr = el("tr");
        const td = el("td");
        td.append(value instanceof Node ? value : document.createTextNode(value));
        tr.append(el("th", label, null, { scope: "row" }), td);
        return tr;
      })
    );
    elements.receiptNote.textContent = receipt.replayed
      ? "Ce fichier avait déjà été contrôlé avec ce contrat : le reçu existant est repris tel quel, sans nouvelle entrée au journal."
      : "Reçu enregistré dans le journal local. Rejouer le même fichier avec le même contrat retrouvera ce reçu.";

    elements.result.hidden = false;
    const top = elements.result.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.result.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

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
      renderPv(data, audit?.find((entry) => entry.run_id === data.run_id));
      setStatus("");
    } catch (error) {
      setStatus(`Le contrôle n’a pas abouti : ${error.message}.`, true);
    } finally {
      elements.validate.disabled = false;
      elements.validate.textContent = "Lancer les contrôles";
    }
  }

  async function load() {
    try {
      const data = await request("/api/overview");
      renderContract(data.contract || {});
      renderBatches(data.batches);
      renderHistory(data.recent);
      // ?lot=fichier.csv relance directement le contrôle : lien partageable vers un procès-verbal.
      const wanted = new URLSearchParams(window.location.search).get("lot");
      if (wanted && (data.batches || []).includes(wanted)) {
        elements.batch.value = wanted;
        await validateBatch();
      }
    } catch (error) {
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

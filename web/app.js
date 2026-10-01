(() => {
  "use strict";

  const elements = {
    batch: document.getElementById("batch"),
    checksSummary: document.getElementById("checksSummary"),
    contractControls: document.getElementById("contractControls"),
    contractDescription: document.getElementById("contractDescription"),
    contractFacts: document.getElementById("contractFacts"),
    contractTitle: document.getElementById("contract-title"),
    contractVersion: document.getElementById("contractVersion"),
    decision: document.getElementById("decision"),
    decisionCard: document.getElementById("decisionCard"),
    decisionExplanation: document.getElementById("decisionExplanation"),
    decisionFacts: document.getElementById("decisionFacts"),
    decisionState: document.getElementById("decisionState"),
    history: document.getElementById("history"),
    impact: document.getElementById("impact"),
    issues: document.getElementById("issues"),
    receiptId: document.getElementById("receiptId"),
    receiptText: document.getElementById("receiptText"),
    refreshAudit: document.getElementById("refreshAudit"),
    requestStatus: document.getElementById("requestStatus"),
    result: document.getElementById("result"),
    validate: document.getElementById("validate"),
  };

  const labels = {
    accept: "Accepté",
    accept_with_warnings: "Accepté sous réserve",
    quarantine: "Quarantaine",
    blocked: "Bloqué",
    clear: "Autorisé",
    review: "À examiner",
    open: "Ouverte",
    closed: "Fermée",
    critical: "Critique",
    warning: "Vigilance",
    failed: "Échec",
    pass: "Conforme",
    passed: "Validé",
  };

  function words(value) {
    const key = String(value || "");
    return labels[key] || key.replaceAll("_", " ");
  }

  function clear(node) {
    node.replaceChildren();
  }

  function element(tag, { className, text, attributes } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (attributes) {
      for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, String(value));
      }
    }
    return node;
  }

  function append(parent, ...children) {
    parent.append(...children.filter(Boolean));
    return parent;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "La requête n'a pas abouti.");
    return data;
  }

  function setStatus(message = "", isError = false) {
    elements.requestStatus.textContent = message;
    elements.requestStatus.classList.toggle("is-error", isError);
  }

  function fact(label, value) {
    const item = element("div");
    append(item, element("dt", { text: label }), element("dd", { text: value }));
    return item;
  }

  function renderContract(contract) {
    elements.contractTitle.textContent = contract.name || "Contrat non disponible";
    elements.contractDescription.textContent = contract.description || "Aucune description fournie.";
    elements.contractVersion.textContent = `v${contract.version || "?"}`;
    clear(elements.contractFacts);
    elements.contractFacts.append(
      fact("Version", `v${contract.version || "?"}`),
      fact("Responsable", contract.owner || "Non attribué"),
      fact("Fraîcheur", contract.freshness_hours ? `${contract.freshness_hours} h` : "Non définie"),
      fact("Champs", Array.isArray(contract.fields) ? contract.fields.length : 0)
    );

    clear(elements.contractControls);
    const fields = Array.isArray(contract.fields) ? contract.fields : [];
    if (!fields.length) {
      elements.contractControls.append(element("p", { className: "empty-copy", text: "Aucun contrôle de champ n'est disponible." }));
      return;
    }

    for (const field of fields) {
      const card = element("article", { className: "contract-control" });
      const required = field.required ? "Obligatoire" : "Optionnel";
      const constraints = [];
      if (field.unique) constraints.push("unique");
      if (field.min !== undefined) constraints.push(`minimum ${field.min}`);
      if (Array.isArray(field.allowed)) constraints.push(`${field.allowed.length} valeurs admises`);
      append(
        card,
        element("strong", { text: field.name || "champ" }),
        element("p", { text: `${field.type || "type non défini"}${constraints.length ? ` · ${constraints.join(", ")}` : ""}` }),
        element("span", { className: `field-mark${field.required ? " is-required" : ""}`, text: required })
      );
      elements.contractControls.append(card);
    }
  }

  function renderBatches(batches) {
    clear(elements.batch);
    const list = Array.isArray(batches) ? batches : [];
    if (!list.length) {
      const option = element("option", { text: "Aucun lot disponible", attributes: { value: "" } });
      elements.batch.append(option);
      elements.batch.disabled = true;
      elements.validate.disabled = true;
      return;
    }
    elements.batch.disabled = false;
    for (const batch of list) {
      elements.batch.append(element("option", { text: batch, attributes: { value: batch } }));
    }
  }

  function createCheckRow(issue) {
    const row = element("article", { className: "check-row" });
    const severity = String(issue.severity || "warning").toLowerCase();
    const state = element("span", { className: `check-state is-${severity}`, text: words(severity) });
    const copy = element("div", { className: "check-copy" });
    append(
      copy,
      element("strong", { text: issue.message || "Contrôle signalé" }),
      element("p", { text: issue.affected ? `${issue.affected} valeur(s) concernée(s).` : "Le contrôle exige une revue." }),
      element("small", { text: issue.check || "contrôle du contrat" })
    );
    return append(row, state, copy);
  }

  function createControlRow(control, issues) {
    const row = element("article", { className: "check-row" });
    const stateName = String(control.state || "review").toLowerCase();
    const state = element("span", { className: `check-state is-${stateName}`, text: words(stateName) });
    const related = issues.filter((issue) => String(issue.check || "").startsWith(String(control.id || "")));
    const copy = element("div", { className: "check-copy" });
    const detail = related.length
      ? related.map((issue) => issue.message).join(" · ")
      : control.issues
        ? `${control.issues} écart(s) détecté(s).`
        : "Aucun écart détecté pour ce contrôle.";
    append(
      copy,
      element("strong", { text: control.label || "Contrôle du contrat" }),
      element("p", { text: detail }),
      element("small", { text: control.id || "contrôle" })
    );
    return append(row, state, copy);
  }

  function createPassingRow() {
    const row = element("article", { className: "check-row" });
    const state = element("span", { className: "check-state is-pass", text: "Conforme" });
    const copy = element("div", { className: "check-copy" });
    append(
      copy,
      element("strong", { text: "Tous les contrôles du contrat sont valides." }),
      element("p", { text: "Le lot respecte les contraintes de schéma, de qualité et d'unicité définies." }),
      element("small", { text: "contrat vérifié" })
    );
    return append(row, state, copy);
  }

  function createImpactRow(asset) {
    const row = element("article", { className: "impact-row" });
    const action = String(asset.action || "review").toLowerCase();
    const state = element("span", { className: `impact-action is-${action}`, text: words(action) });
    const copy = element("div", { className: "impact-copy" });
    append(
      copy,
      element("strong", { text: asset.asset || "Actif aval" }),
      element("p", { text: asset.reason || "Consommateur identifié par le contrat." }),
      element("small", { text: `niveau ${asset.tier || "non défini"}` })
    );
    return append(row, state, copy);
  }

  function explanationFor(decision, issueCount) {
    if (decision === "quarantine") return "Le lot reste hors de la plateforme : un contrôle critique du contrat n'est pas satisfait.";
    if (decision === "accept_with_warnings") return `Le lot attend une revue : ${issueCount} écart(s) non bloquant(s) reste(nt) visible(s).`;
    return "Le lot satisfait les règles définies dans le contrat et peut rejoindre les actifs aval.";
  }

  function renderDecision(data, auditEntry) {
    const decision = String(data.decision || "");
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const impact = Array.isArray(data.impact) ? data.impact : [];
    const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
    const controls = Array.isArray(data.controls) ? data.controls : [];
    const gate = data.gate && typeof data.gate === "object" ? data.gate : {};
    const gateState = String(gate.state || decision || "review");

    elements.decisionCard.className = `decision-card is-${decision.replaceAll("_", "-")}`;
    elements.decision.textContent = words(decision);
    elements.decisionState.textContent = decision ? `Porte : ${words(gateState)}` : "En attente";
    elements.decisionExplanation.textContent = gate.message || explanationFor(decision, issues.length);
    clear(elements.decisionFacts);
    elements.decisionFacts.append(
      fact("Score qualité", `${data.score ?? "?"}/100`),
      fact("Lignes contrôlées", data.rows ?? "?"),
      fact("Version du contrat", `v${data.contract_version || "?"}`),
      fact("Écriture", gate.allows_write ? "Autorisée" : "Suspendue")
    );

    const passedControls = controls.filter((control) => control.state === "passed").length;
    elements.checksSummary.textContent = controls.length ? `${passedControls}/${controls.length} validés` : issues.length ? `${issues.length} écart(s)` : "Aucun écart";
    clear(elements.issues);
    if (controls.length) {
      for (const control of controls) elements.issues.append(createControlRow(control, issues));
    } else if (issues.length) {
      for (const issue of issues) elements.issues.append(createCheckRow(issue));
    } else {
      elements.issues.append(createPassingRow());
    }

    clear(elements.impact);
    if (impact.length) {
      for (const asset of impact) elements.impact.append(createImpactRow(asset));
    } else {
      elements.impact.append(element("p", { className: "empty-copy", text: "Aucun actif aval n'est associé à ce contrat." }));
    }

    const receipt = data.audit && typeof data.audit === "object" ? data.audit : auditEntry;
    const receiptLabel = receipt?.run_id || receipt?.id ? `Reçu ${receipt.run_id || `#${receipt.id}`}` : "Audit local";
    elements.receiptId.textContent = receiptLabel;
    elements.receiptText.textContent = receipt
      ? `Lot ${data.batch} contrôlé le ${receipt.recorded_at || receipt.created_at}. Décision ${words(decision).toLowerCase()}, score ${data.score}/100, ${criticalCount} contrôle(s) critique(s).${receipt.payload_hash ? ` Empreinte ${receipt.payload_hash.slice(0, 12)}.` : ""}`
      : `Lot ${data.batch} contrôlé. Le journal d'audit local est actualisé après chaque décision.`;
    elements.result.hidden = false;
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createAuditRow(run) {
    const row = element("article", { className: "audit-row" });
    const time = element("time", { text: run.created_at || "Date non enregistrée" });
    const batch = element("strong", { text: run.batch || "Lot inconnu" });
    const decision = String(run.decision || "");
    const status = element("span", { className: `audit-decision is-${decision.replaceAll("_", "-")}`, text: words(decision) });
    const score = element("span", { text: run.score !== undefined ? `${run.score}/100` : "Score inconnu" });
    return append(row, time, batch, status, score);
  }

  function renderHistory(runs) {
    clear(elements.history);
    const list = Array.isArray(runs) ? runs : [];
    if (!list.length) {
      elements.history.append(element("p", { className: "empty-copy", text: "Pas encore de validation enregistrée." }));
      return;
    }
    for (const run of list) elements.history.append(createAuditRow(run));
  }

  async function refreshAudit() {
    elements.refreshAudit.disabled = true;
    elements.refreshAudit.textContent = "Actualisation";
    try {
      const audit = await request("/api/audit");
      renderHistory(audit);
    } catch (error) {
      setStatus(`Journal indisponible : ${error.message}`, true);
    } finally {
      elements.refreshAudit.disabled = false;
      elements.refreshAudit.textContent = "Actualiser";
    }
  }

  async function load() {
    try {
      const data = await request("/api/overview");
      renderContract(data.contract || {});
      renderBatches(data.batches);
      renderHistory(data.recent);
    } catch (error) {
      setStatus(`Pacte ne peut pas charger le contrat : ${error.message}`, true);
      elements.contractTitle.textContent = "Contrat indisponible";
      elements.contractDescription.textContent = "Vérifiez que le service Pacte est lancé.";
      elements.contractControls.replaceChildren(element("p", { className: "empty-copy", text: "Les contrôles ne sont pas disponibles." }));
    }
  }

  async function validateBatch() {
    if (!elements.batch.value) return;
    const label = elements.validate.querySelector("span");
    const originalLabel = label?.textContent || "Contrôler le lot";
    elements.validate.disabled = true;
    if (label) label.textContent = "Contrôle en cours";
    setStatus("Évaluation du lot contre le contrat actif...");

    try {
      const data = await request("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: elements.batch.value }),
      });
      const audit = await request("/api/audit");
      renderHistory(audit);
      const receipt = audit.find((entry) => entry.batch === data.batch && entry.decision === data.decision) || audit[0];
      renderDecision(data, receipt);
      setStatus("Contrôle terminé. La décision et son reçu sont disponibles.");
    } catch (error) {
      setStatus(`Le contrôle a échoué : ${error.message}`, true);
    } finally {
      elements.validate.disabled = false;
      if (label) label.textContent = originalLabel;
    }
  }

  elements.validate.addEventListener("click", validateBatch);
  elements.refreshAudit.addEventListener("click", refreshAudit);
  load();
})();

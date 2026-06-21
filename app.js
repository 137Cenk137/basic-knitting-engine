(function () {
  "use strict";

  const Gulsen = window.Gulsen = {};
  const STORAGE_KEY = "gulsen-knitting-engine-v1";
  const SIZE_CODES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
  const PIECE_LABELS = { front: "Front", back: "Back", sleeve: "Sleeve · make two" };
  const SYMBOLS = ["", "knit", "purl", "yo", "k2tog", "ssk", "C4F", "C4B", "no-stitch"];
  const SYMBOL_META = {
    "": { mark: "", name: "Blank", abbreviation: "" },
    knit: { mark: "│", name: "Knit", abbreviation: "k" },
    purl: { mark: "—", name: "Purl", abbreviation: "p" },
    yo: { mark: "○", name: "Yarn over", abbreviation: "yo" },
    k2tog: { mark: "╱", name: "Knit two together", abbreviation: "k2tog" },
    ssk: { mark: "╲", name: "Slip, slip, knit", abbreviation: "ssk" },
    C4F: { mark: "⌝", name: "Four-stitch front cable", abbreviation: "C4F" },
    C4B: { mark: "⌞", name: "Four-stitch back cable", abbreviation: "C4B" },
    "no-stitch": { mark: "×", name: "No stitch", abbreviation: "—" }
  };

  const Utils = Gulsen.utils = {
    uid(prefix) {
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    },
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },
    escape(value) {
      return String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
      })[char]);
    },
    round(value, places = 2) {
      const scale = 10 ** places;
      return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
    },
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    stableStringify(value) {
      if (Array.isArray(value)) return `[${value.map(Utils.stableStringify).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${Utils.stableStringify(value[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    },
    hash(value) {
      const text = Utils.stableStringify(value);
      let hash = 5381;
      for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
      return (hash >>> 0).toString(16);
    },
    get(object, path) {
      return path.split(".").reduce((current, key) => current == null ? undefined : current[key], object);
    },
    set(object, path, value) {
      const keys = path.split(".");
      const finalKey = keys.pop();
      const target = keys.reduce((current, key) => current[key], object);
      target[finalKey] = value;
    },
    formatNumber(value, places = 1) {
      if (!Number.isFinite(Number(value))) return "—";
      return Number(value).toLocaleString("en-US", { maximumFractionDigits: places });
    }
  };

  const Units = Gulsen.units = {
    cmToInches: cm => Number(cm) / 2.54,
    inchesToCm: inches => Number(inches) * 2.54,
    gaugeToImperial: per10cm => Number(per10cm) * 1.016,
    gaugeToMetric: per4in => Number(per4in) / 1.016,
    displayMeasurement(cm, unit) {
      return Utils.round(unit === "imperial" ? Units.cmToInches(cm) : Number(cm), 2);
    },
    canonicalMeasurement(value, unit) {
      return Utils.round(unit === "imperial" ? Units.inchesToCm(value) : Number(value), 4);
    },
    displayGauge(per10cm, unit) {
      return Utils.round(unit === "imperial" ? Units.gaugeToImperial(per10cm) : Number(per10cm), 2);
    },
    canonicalGauge(value, unit) {
      return Utils.round(unit === "imperial" ? Units.gaugeToMetric(value) : Number(value), 4);
    },
    label(unit) { return unit === "imperial" ? "in" : "cm"; },
    gaugeLabel(unit) { return unit === "imperial" ? "per 4 in" : "per 10 cm"; }
  };

  function makeLaceCells(width, height) {
    const cells = [];
    for (let row = 0; row < height; row += 1) {
      const line = [];
      for (let column = 0; column < width; column += 1) {
        const center = Math.abs(column - Math.floor(width / 2));
        let symbol = "knit";
        if ((column + row) % 11 === 0) symbol = "purl";
        if (center === (row % 4) + 1) symbol = column < width / 2 ? "yo" : "ssk";
        if (center === (row % 4)) symbol = column < width / 2 ? "k2tog" : "yo";
        line.push(symbol);
      }
      cells.push(line);
    }
    return cells;
  }

  const Defaults = Gulsen.defaults = {
    createProject() {
      const chartId = "chart-alpine-lace";
      const sizes = {
        XS: { bustCm: 73.5, bodyLengthCm: 55, upperArmCm: 28, sleeveLengthCm: 43, shoulderWidthCm: 36, armholeDepthCm: 18, neckWidthCm: 16 },
        S: { bustCm: 83.5, bodyLengthCm: 57, upperArmCm: 30, sleeveLengthCm: 45, shoulderWidthCm: 38, armholeDepthCm: 19, neckWidthCm: 17 },
        M: { bustCm: 94, bodyLengthCm: 59, upperArmCm: 32, sleeveLengthCm: 46, shoulderWidthCm: 40, armholeDepthCm: 20, neckWidthCm: 18 },
        L: { bustCm: 104.5, bodyLengthCm: 61, upperArmCm: 34, sleeveLengthCm: 47, shoulderWidthCm: 42, armholeDepthCm: 21, neckWidthCm: 19 },
        XL: { bustCm: 114.5, bodyLengthCm: 63, upperArmCm: 36, sleeveLengthCm: 48, shoulderWidthCm: 44, armholeDepthCm: 22, neckWidthCm: 20 },
        "2XL": { bustCm: 124.5, bodyLengthCm: 65, upperArmCm: 38, sleeveLengthCm: 49, shoulderWidthCm: 46, armholeDepthCm: 23, neckWidthCm: 21 },
        "3XL": { bustCm: 134.5, bodyLengthCm: 67, upperArmCm: 40, sleeveLengthCm: 50, shoulderWidthCm: 48, armholeDepthCm: 24, neckWidthCm: 22 },
        "4XL": { bustCm: 144.5, bodyLengthCm: 69, upperArmCm: 42, sleeveLengthCm: 51, shoulderWidthCm: 50, armholeDepthCm: 25, neckWidthCm: 23 },
        "5XL": { bustCm: 154.5, bodyLengthCm: 71, upperArmCm: 44, sleeveLengthCm: 52, shoulderWidthCm: 52, armholeDepthCm: 26, neckWidthCm: 24 }
      };
      const dynamicConstraints = [{ type: "min_stitches", value: 4 }, { type: "edge_stitches", value: 1 }];
      return {
        schemaVersion: 1,
        metadata: {
          patternName: "Alpine Lace Drop-Shoulder",
          designerName: "Gulsen Studio",
          description: "A quietly oversized sweater built around a fixed alpine lace panel, balanced by clean stockinette fields and simple drop-shoulder shaping.",
          yarn: "DK weight wool, approximately 950–1850 m",
          needles: "4 mm circular and straight needles, or size needed to obtain gauge",
          notions: "Stitch markers, tapestry needle, waste yarn",
          skillLevel: "Intermediate",
          copyright: "© 2026 Gulsen Studio. For personal use only.",
          notes: "Work a blocked gauge swatch before beginning. Sleeve instructions are worked twice.",
          constructionType: "Bottom-up, seamed drop-shoulder sweater"
        },
        settings: { displayUnit: "metric", pageSize: "A4", template: "classic" },
        gauge: { stitchGaugePer10cm: 22, rowGaugePer10cm: 30 },
        sizes,
        ease: { bustEaseCm: 10, sleeveEaseCm: 4 },
        pieces: {
          front: {
            blocks: [
              { id: "front-left", type: "dynamic", label: "Left stockinette", position: 0, widthRatio: 1, mirrorGroupId: "front-sides", constraints: Utils.clone(dynamicConstraints) },
              { id: "front-lace", type: "static", label: "Alpine lace panel", position: 1, staticStitchCount: 43, chartId, constraints: [] },
              { id: "front-right", type: "dynamic", label: "Right stockinette", position: 2, widthRatio: 1, mirrorGroupId: "front-sides", constraints: Utils.clone(dynamicConstraints) }
            ]
          },
          back: {
            blocks: [{ id: "back-main", type: "dynamic", label: "Back stockinette", position: 0, widthRatio: 1, mirrorGroupId: "", constraints: [{ type: "parity", value: 2 }, ...Utils.clone(dynamicConstraints)] }]
          },
          sleeve: {
            blocks: [{ id: "sleeve-main", type: "dynamic", label: "Sleeve stockinette", position: 0, widthRatio: 1, mirrorGroupId: "", constraints: [{ type: "parity", value: 2 }, ...Utils.clone(dynamicConstraints)] }]
          }
        },
        charts: {
          [chartId]: { id: chartId, name: "Alpine lace", width: 43, height: 8, repeatRows: 8, cells: makeLaceCells(43, 8) }
        },
        shaping: {
          front: { openingInsetCm: 2, openingDepthCm: 20, openingBindOffWidthCm: 1.5, neckWidthCm: 18, neckDepthCm: 8, centerBindOffWidthCm: 12, shoulderEnabled: true, shoulderNarrowingCm: 3, shoulderSlopeDepthCm: 3 },
          back: { openingInsetCm: 1, openingDepthCm: 20, openingBindOffWidthCm: 1, neckWidthCm: 18, neckDepthCm: 3, centerBindOffWidthCm: 15, shoulderEnabled: true, shoulderNarrowingCm: 2, shoulderSlopeDepthCm: 2 },
          sleeve: { cuffWidthCm: 19, increaseLengthCm: 40 }
        },
        branding: { accentColor: "#7c2938", fontPair: "editorial", coverImage: "", logoImage: "" },
        graded: null
      };
    }
  };

  const Validation = Gulsen.validation = {
    project(project) {
      const errors = [];
      const add = (path, message) => errors.push({ path, message });
      if (!project || project.schemaVersion !== 1) add("schemaVersion", "This project does not use schema version 1.");
      if (!project?.metadata?.patternName?.trim()) add("metadata.patternName", "Pattern name is required.");
      if (!project?.metadata?.designerName?.trim()) add("metadata.designerName", "Designer name is required.");
      if (!(project?.gauge?.stitchGaugePer10cm > 0)) add("gauge.stitchGaugePer10cm", "Stitch gauge must be greater than zero.");
      if (!(project?.gauge?.rowGaugePer10cm > 0)) add("gauge.rowGaugePer10cm", "Row gauge must be greater than zero.");
      let previousBust = -Infinity;
      SIZE_CODES.forEach(size => {
        const measurements = project?.sizes?.[size];
        if (!measurements) return add(`sizes.${size}`, `${size} measurements are missing.`);
        ["bustCm", "bodyLengthCm", "upperArmCm", "sleeveLengthCm", "shoulderWidthCm", "armholeDepthCm", "neckWidthCm"].forEach(field => {
          if (!(Number(measurements[field]) > 0)) add(`sizes.${size}.${field}`, `${size} ${field.replace("Cm", "")} must be greater than zero.`);
        });
        if (measurements.bustCm <= previousBust) add(`sizes.${size}.bustCm`, "Bust measurements must increase from XS through 5XL.");
        previousBust = measurements.bustCm;
      });
      ["front", "back", "sleeve"].forEach(pieceId => {
        const blocks = project?.pieces?.[pieceId]?.blocks || [];
        if (!blocks.length) add(`pieces.${pieceId}`, `${PIECE_LABELS[pieceId]} needs at least one block.`);
        if (!blocks.some(block => block.type === "dynamic")) add(`pieces.${pieceId}`, `${PIECE_LABELS[pieceId]} needs a dynamic block.`);
        blocks.forEach(block => {
          if (!block.label?.trim()) add(`blocks.${block.id}.label`, "Every block needs a label.");
          if (block.type === "static") {
            if (!(Number.isInteger(Number(block.staticStitchCount)) && Number(block.staticStitchCount) >= 1)) add(`blocks.${block.id}.staticStitchCount`, `${block.label} needs a positive integer stitch count.`);
            const chart = project.charts?.[block.chartId];
            if (!chart) add(`blocks.${block.id}.chartId`, `${block.label} needs an associated chart.`);
            else if (chart.width !== Number(block.staticStitchCount)) add(`charts.${chart.id}.width`, `${chart.name} width must match ${block.label}.`);
          } else if (!(Number(block.widthRatio) > 0)) add(`blocks.${block.id}.widthRatio`, `${block.label} needs a positive width ratio.`);
          (block.constraints || []).forEach(constraint => {
            if (constraint.type === "modulus" && !(Number(constraint.value) >= 2)) add(`blocks.${block.id}.modulus`, `${block.label} modulus must be at least 2.`);
            if (["min_stitches", "edge_stitches"].includes(constraint.type) && Number(constraint.value) < 0) add(`blocks.${block.id}.${constraint.type}`, `${block.label} cannot use a negative constraint.`);
          });
        });
        const groups = {};
        blocks.filter(block => block.type === "dynamic" && block.mirrorGroupId).forEach(block => {
          (groups[block.mirrorGroupId] ||= []).push(block);
        });
        Object.entries(groups).forEach(([groupId, groupBlocks]) => {
          if (groupBlocks.length !== 2) add(`pieces.${pieceId}.mirror.${groupId}`, `Mirror group “${groupId}” must contain exactly two dynamic blocks.`);
          if (groupBlocks.length === 2) {
            const [first, second] = groupBlocks;
            if (Number(first.widthRatio) !== Number(second.widthRatio) || Utils.stableStringify(first.constraints) !== Utils.stableStringify(second.constraints)) {
              add(`pieces.${pieceId}.mirror.${groupId}`, `Mirror group “${groupId}” needs matching ratios and constraints.`);
            }
          }
        });
      });
      Object.values(project?.charts || {}).forEach(chart => {
        if (!(Number.isInteger(Number(chart.width)) && chart.width >= 1)) add(`charts.${chart.id}.width`, `${chart.name || "Chart"} needs a positive integer width.`);
        if (!(Number.isInteger(Number(chart.height)) && chart.height >= 1)) add(`charts.${chart.id}.height`, `${chart.name || "Chart"} needs at least one row.`);
        if (!(Number.isInteger(Number(chart.repeatRows)) && chart.repeatRows >= 1 && chart.repeatRows <= chart.height)) add(`charts.${chart.id}.repeatRows`, `${chart.name || "Chart"} repeat must be between 1 and its chart height.`);
        if (!Array.isArray(chart.cells) || chart.cells.length !== chart.height || chart.cells.some(row => !Array.isArray(row) || row.length !== chart.width)) add(`charts.${chart.id}.cells`, `${chart.name || "Chart"} grid dimensions are inconsistent.`);
      });
      return errors;
    },
    importPayload(payload) {
      if (!payload || typeof payload !== "object") return ["The selected file is not a project object."];
      if (payload.schemaVersion > 1) return ["This project was created by a newer version of Gulsen."];
      if (payload.schemaVersion !== 1) return ["Only schema version 1 projects can be imported."];
      const required = ["metadata", "settings", "gauge", "sizes", "ease", "pieces", "charts", "shaping", "branding"];
      const missing = required.filter(key => !payload[key]);
      if (missing.length) return [`Project is missing: ${missing.join(", ")}.`];
      return Validation.project(payload).map(error => error.message);
    }
  };

  const Store = Gulsen.store = {
    state: null,
    saveTimer: null,
    load() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return Defaults.createProject();
        const parsed = JSON.parse(saved);
        return Validation.importPayload(parsed).length ? Defaults.createProject() : parsed;
      } catch (error) {
        Store.storageError = error.message;
        return Defaults.createProject();
      }
    },
    saveSoon() {
      clearTimeout(Store.saveTimer);
      const status = document.getElementById("save-status");
      if (status) status.textContent = "Saving…";
      Store.saveTimer = setTimeout(Store.save, 500);
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.state));
        Store.storageError = "";
        const status = document.getElementById("save-status");
        if (status) status.textContent = "Saved locally";
      } catch (error) {
        Store.storageError = error.message;
        const status = document.getElementById("save-status");
        if (status) status.textContent = "Save failed";
        Render.errorSummary([{ path: "storage", message: "Local save failed. Your current session is still available; export JSON before closing." }]);
      }
    },
    inputFingerprint(project = Store.state) {
      const copy = Utils.clone(project);
      delete copy.graded;
      copy.settings && delete copy.settings.displayUnit;
      copy.settings && delete copy.settings.pageSize;
      copy.settings && delete copy.settings.template;
      copy.branding && delete copy.branding.coverImage;
      copy.branding && delete copy.branding.logoImage;
      return Utils.hash(copy);
    },
    markChanged({ affectsGrading = true } = {}) {
      if (affectsGrading && Store.state.graded) Store.state.graded.stale = Store.state.graded.inputHash !== Store.inputFingerprint();
      Store.saveSoon();
      Render.projectStatus();
    }
  };

  const Shaping = Gulsen.shaping = {
    distribute(events, rows) {
      events = Math.trunc(events);
      rows = Math.trunc(rows);
      if (events <= 0) return { schedule: [], groups: [], error: "" };
      if (rows < events) return { schedule: [], groups: [], error: `${events} shaping events cannot fit within ${rows} rows.` };
      const base = Math.floor(rows / events);
      const remainder = rows - base * events;
      const schedule = [];
      let error = 0;
      for (let index = 0; index < events; index += 1) {
        error += remainder;
        let interval = base;
        if (error >= events) { interval += 1; error -= events; }
        schedule.push(interval);
      }
      const counts = schedule.reduce((result, interval) => {
        result[interval] = (result[interval] || 0) + 1;
        return result;
      }, {});
      const groups = Object.entries(counts).map(([interval, count]) => ({ interval: Number(interval), count }));
      return { schedule, groups, error: "" };
    },
    sentence(verb, edgeText, distribution) {
      if (!distribution.groups.length) return "No shaping required.";
      const phrases = distribution.groups.sort((a, b) => a.interval - b.interval).map(group => `every ${Utils.ordinal(group.interval)} row ${group.count} ${group.count === 1 ? "time" : "times"}`);
      return `${verb} 1 st ${edgeText} ${phrases.join(", then ")}.`;
    },
    piece(pieceId, castOnSts, totalRows, size, config, gauge) {
      const instructions = [];
      const errors = [];
      const warnings = [];
      const stitchesPerCm = gauge.stitchGaugePer10cm / 10;
      const rowsPerCm = gauge.rowGaugePer10cm / 10;
      const roundSts = cm => Math.max(0, Math.round(cm * stitchesPerCm));
      const roundRows = cm => Math.max(1, Math.round(cm * rowsPerCm));
      if (pieceId === "sleeve") {
        let cuffSts = roundSts(config.cuffWidthCm);
        let delta = castOnSts - cuffSts;
        if (delta < 0) errors.push("Cuff width produces more stitches than the graded upper arm.");
        if (delta % 2 !== 0) {
          cuffSts += delta > 0 ? 1 : -1;
          delta = castOnSts - cuffSts;
          warnings.push(`Cuff was adjusted to ${cuffSts} sts to preserve paired sleeve increases.`);
        }
        const rows = Math.min(totalRows, roundRows(config.increaseLengthCm));
        const distribution = Shaping.distribute(Math.max(0, delta / 2), rows);
        if (distribution.error) errors.push(distribution.error);
        instructions.push({ zone: "sleeve_increase", text: `Cast on ${cuffSts} sts. ${Shaping.sentence("Increase", "at each end", distribution)}`, events: distribution.schedule, startSts: cuffSts, endSts: castOnSts, rows });
        return { instructions, errors, warnings };
      }

      const openingRows = Math.min(totalRows, roundRows(config.openingDepthCm));
      const bindOffEach = roundSts(config.openingBindOffWidthCm);
      const insetEach = roundSts(config.openingInsetCm);
      const afterBindOff = castOnSts - 2 * bindOffEach;
      let targetOpening = castOnSts - 2 * insetEach;
      if ((afterBindOff - targetOpening) % 2 !== 0) {
        targetOpening -= 1;
        warnings.push(`Opening target was adjusted to ${targetOpening} sts to preserve paired decreases.`);
      }
      const openingEvents = Math.max(0, (afterBindOff - targetOpening) / 2);
      const openingDistribution = Shaping.distribute(openingEvents, Math.max(1, openingRows - 1));
      if (openingDistribution.error) errors.push(`Body opening: ${openingDistribution.error}`);
      instructions.push({
        zone: "body_opening",
        text: `Bind off ${bindOffEach} sts at each armhole edge. ${Shaping.sentence("Decrease", "at each end", openingDistribution)}`,
        events: openingDistribution.schedule, startSts: castOnSts, endSts: targetOpening, rows: openingRows
      });

      const centerBindOff = roundSts(config.centerBindOffWidthCm);
      const neckTarget = roundSts(config.neckWidthCm);
      let neckDelta = Math.max(0, neckTarget - centerBindOff);
      if (neckDelta % 2 !== 0) {
        neckDelta += 1;
        warnings.push(`Neck opening was adjusted by 1 st to preserve paired neck-edge decreases.`);
      }
      const neckEvents = Math.ceil(neckDelta / 2);
      const neckRows = roundRows(config.neckDepthCm);
      const neckDistribution = Shaping.distribute(neckEvents, neckRows);
      if (neckDistribution.error) errors.push(`Neck: ${neckDistribution.error}`);
      instructions.push({
        zone: "neck",
        text: `Bind off the center ${centerBindOff} sts. ${Shaping.sentence("Decrease", "at each neck edge", neckDistribution)}`,
        events: neckDistribution.schedule, startSts: targetOpening, endSts: Math.max(0, targetOpening - centerBindOff - neckEvents * 2), rows: neckRows
      });

      if (config.shoulderEnabled) {
        const shoulderEvents = roundSts(config.shoulderNarrowingCm);
        const shoulderRows = roundRows(config.shoulderSlopeDepthCm);
        const shoulderDistribution = Shaping.distribute(shoulderEvents, shoulderRows);
        if (shoulderDistribution.error) errors.push(`Shoulder: ${shoulderDistribution.error}`);
        instructions.push({
          zone: "shoulder",
          text: Shaping.sentence("Bind off", "at each shoulder edge", shoulderDistribution),
          events: shoulderDistribution.schedule, startSts: targetOpening, endSts: Math.max(0, targetOpening - shoulderEvents * 2), rows: shoulderRows
        });
      }
      return { instructions, errors, warnings };
    }
  };

  Utils.ordinal = function (number) {
    const value = Number(number);
    const suffixes = ["th", "st", "nd", "rd"];
    const modulo100 = value % 100;
    return `${value}${suffixes[(modulo100 - 20) % 10] || suffixes[modulo100] || suffixes[0]}`;
  };

  const Engine = Gulsen.engine = {
    satisfies(count, constraints) {
      if (!Number.isInteger(count) || count < 0) return false;
      return (constraints || []).every(constraint => {
        const value = Number(constraint.value);
        if (constraint.type === "modulus") return value >= 2 && count % value === 0;
        if (constraint.type === "parity") return value === 1 ? count % 2 === 1 : count % 2 === 0;
        if (constraint.type === "edge_stitches") return count >= value * 2;
        if (constraint.type === "min_stitches") return count >= value;
        return true;
      });
    },
    candidates(raw, constraints, radius = 20) {
      const start = Math.max(0, Math.floor(raw) - radius);
      const end = Math.ceil(raw) + radius;
      const candidates = [];
      for (let value = start; value <= end; value += 1) if (Engine.satisfies(value, constraints)) candidates.push(value);
      return candidates.sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw) || b - a);
    },
    nearestMultiple(raw, modulus) {
      if (!(modulus > 1)) return Math.round(raw);
      const lower = Math.floor(raw / modulus) * modulus;
      const upper = Math.ceil(raw / modulus) * modulus;
      return Math.abs(upper - raw) <= Math.abs(raw - lower) ? upper : lower;
    },
    solvePiece(project, pieceId, sizeCode) {
      const piece = project.pieces[pieceId];
      const measurements = project.sizes[sizeCode];
      const gauge = project.gauge;
      const targetWidthCm = pieceId === "sleeve"
        ? measurements.upperArmCm + project.ease.sleeveEaseCm
        : (measurements.bustCm + project.ease.bustEaseCm) / 2;
      const targetHeightCm = pieceId === "sleeve" ? measurements.sleeveLengthCm : measurements.bodyLengthCm;
      const targetStitches = targetWidthCm / 10 * gauge.stitchGaugePer10cm;
      const targetRowsRaw = targetHeightCm / 10 * gauge.rowGaugePer10cm;
      const blocks = piece.blocks.slice().sort((a, b) => a.position - b.position);
      const staticBlocks = blocks.filter(block => block.type === "static");
      const dynamicBlocks = blocks.filter(block => block.type === "dynamic");
      const staticStitches = staticBlocks.reduce((sum, block) => sum + Number(block.staticStitchCount), 0);
      if (staticStitches >= targetStitches) {
        return { error: `Static blocks use ${staticStitches} sts, leaving no dynamic width for a ${Utils.round(targetWidthCm)} cm ${PIECE_LABELS[pieceId].toLowerCase()}.` };
      }
      const totalRatio = dynamicBlocks.reduce((sum, block) => sum + Number(block.widthRatio), 0);
      const rawTotalDynamic = targetStitches - staticStitches;
      const rawByBlock = Object.fromEntries(dynamicBlocks.map(block => [block.id, rawTotalDynamic * Number(block.widthRatio) / totalRatio]));
      const grouped = new Set();
      const groups = [];
      dynamicBlocks.forEach(block => {
        if (grouped.has(block.id)) return;
        const members = block.mirrorGroupId ? dynamicBlocks.filter(candidate => candidate.mirrorGroupId === block.mirrorGroupId) : [block];
        members.forEach(member => grouped.add(member.id));
        const raw = members.reduce((sum, member) => sum + rawByBlock[member.id], 0) / members.length;
        groups.push({ key: block.mirrorGroupId || block.id, members, raw, candidates: Engine.candidates(raw, block.constraints) });
      });
      const impossible = groups.find(group => !group.candidates.length);
      if (impossible) return { error: `No valid stitch count was found within ±20 stitches for ${impossible.members.map(block => block.label).join(" / ")}.` };

      let states = new Map([[0, { contribution: 0, deviation: 0, assignments: {} }]]);
      groups.forEach(group => {
        const next = new Map();
        states.forEach(state => {
          group.candidates.forEach(candidate => {
            const contribution = state.contribution + candidate * group.members.length;
            const deviation = state.deviation + Math.abs(candidate - group.raw) * group.members.length;
            const assignments = { ...state.assignments };
            group.members.forEach(member => { assignments[member.id] = candidate; });
            const current = next.get(contribution);
            if (!current || deviation < current.deviation) next.set(contribution, { contribution, deviation, assignments });
          });
        });
        states = next;
      });
      const solutions = [...states.values()].sort((first, second) => {
        const firstDelta = Math.abs(staticStitches + first.contribution - targetStitches);
        const secondDelta = Math.abs(staticStitches + second.contribution - targetStitches);
        return firstDelta - secondDelta || first.deviation - second.deviation || second.contribution - first.contribution;
      });
      const selected = solutions[0];
      const castOnSts = staticStitches + selected.contribution;
      const resolvedWidthCm = castOnSts / gauge.stitchGaugePer10cm * 10;
      const widthDeltaCm = Math.abs(resolvedWidthCm - targetWidthCm);
      const totalRows = Math.round(targetRowsRaw);
      const sections = blocks.map(block => {
        const stitchCount = block.type === "static" ? Number(block.staticStitchCount) : selected.assignments[block.id];
        const chart = block.chartId ? project.charts[block.chartId] : null;
        const rowCount = chart ? Engine.nearestMultiple(totalRows, Number(chart.repeatRows) || chart.height) : totalRows;
        return { blockId: block.id, label: block.label, type: block.type, stitchCount, rowCount, chartId: block.chartId || "", rawStitches: block.type === "dynamic" ? rawByBlock[block.id] : stitchCount, constraints: block.constraints || [] };
      });
      const shaping = Shaping.piece(pieceId, castOnSts, totalRows, measurements, project.shaping[pieceId], gauge);
      const warnings = shaping.warnings.map(message => ({ message, requiresAcknowledgement: false }));
      if (widthDeltaCm > 0.5) warnings.push({ message: `Resolved width differs from target by ${Utils.round(widthDeltaCm)} cm.`, requiresAcknowledgement: true });
      return {
        pieceId, sizeCode, targetWidthCm, targetHeightCm, targetStitches, castOnSts, totalRows,
        resolvedWidthCm, widthDeltaCm, sections, shapingInstructions: shaping.instructions,
        warnings, errors: shaping.errors,
        audit: { staticStitches, rawTotalDynamic, candidateGroups: groups.map(group => ({ key: group.key, raw: group.raw, selected: selected.assignments[group.members[0].id], validCandidates: group.candidates.slice(0, 12) })) }
      };
    },
    grade(project) {
      const validationErrors = Validation.project(project);
      if (validationErrors.length) return { validationErrors };
      const pieces = { front: {}, back: {}, sleeve: {} };
      const warnings = [];
      const errors = [];
      SIZE_CODES.forEach(size => {
        Object.keys(pieces).forEach(pieceId => {
          const result = Engine.solvePiece(project, pieceId, size);
          if (result.error) {
            errors.push({ id: `${pieceId}-${size}-engine`, pieceId, size, message: result.error });
          } else {
            pieces[pieceId][size] = result;
            result.warnings.forEach((warning, index) => warnings.push({ id: `${pieceId}-${size}-warning-${index}`, pieceId, size, message: warning.message, requiresAcknowledgement: warning.requiresAcknowledgement, acknowledged: false }));
            result.errors.forEach((message, index) => errors.push({ id: `${pieceId}-${size}-shaping-${index}`, pieceId, size, message }));
          }
        });
      });
      return {
        computedAt: new Date().toISOString(), inputHash: Store.inputFingerprint(project), stale: false,
        sizes: SIZE_CODES.slice(), pieces, warnings, errors
      };
    }
  };

  const Charts = Gulsen.charts = {
    resize(chart, width, height) {
      width = Math.max(1, Math.trunc(width));
      height = Math.max(1, Math.trunc(height));
      const cells = [];
      for (let row = 0; row < height; row += 1) {
        const source = chart.cells[row] || [];
        const line = [];
        for (let column = 0; column < width; column += 1) line.push(source[column] || "");
        cells.push(line);
      }
      chart.width = width;
      chart.height = height;
      chart.cells = cells;
      if (chart.repeatRows > height) chart.repeatRows = height;
      return chart;
    },
    svg(chart, cellSize = 18) {
      if (!chart) return "";
      const width = chart.width * cellSize;
      const height = chart.height * cellSize;
      const content = chart.cells.map((row, rowIndex) => row.map((symbol, columnIndex) => {
        const x = columnIndex * cellSize;
        const y = rowIndex * cellSize;
        const fill = symbol === "no-stitch" ? "#b9b4ae" : "#fffdf8";
        const mark = Utils.escape(SYMBOL_META[symbol]?.mark || "");
        return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="#8d877f" stroke-width=".5"/><text x="${x + cellSize / 2}" y="${y + cellSize * .69}" text-anchor="middle" font-family="Georgia,serif" font-size="${cellSize * .62}" fill="#2b2825">${mark}</text>`;
      }).join("")).join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${Utils.escape(chart.name)} knitting chart">${content}</svg>`;
    }
  };

  const UI = Gulsen.ui = {
    activePiece: "front",
    activeChart: "chart-alpine-lace",
    confirmAction: null,
    status(message) {
      const node = document.getElementById("live-status");
      if (node) node.textContent = message;
    },
    confirm(title, copy, action, destructiveLabel = "Confirm") {
      const dialog = document.getElementById("confirm-dialog");
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-copy").textContent = copy;
      document.getElementById("confirm-accept").textContent = destructiveLabel;
      UI.confirmAction = action;
      if (dialog?.showModal) dialog.showModal();
      else if (window.confirm(`${title}\n\n${copy}`)) action();
    }
  };

  const Render = Gulsen.render = {
    field({ label, path, value, type = "text", wide = false, help = "", options = [], measure = false, gauge = false, rows = 0, readonly = false }) {
      const id = `field-${path.replace(/[^a-z0-9]+/gi, "-")}`;
      const classes = `field${wide ? " field-wide" : ""}`;
      const dataType = type === "number" ? "number" : type === "checkbox" ? "checkbox" : "string";
      if (type === "checkbox") {
        return `<div class="field checkbox-field${wide ? " field-wide" : ""}"><input id="${id}" type="checkbox" data-path="${path}" data-type="checkbox" ${value ? "checked" : ""}><label for="${id}">${Utils.escape(label)}</label></div>`;
      }
      let control = "";
      if (options.length) {
        control = `<select id="${id}" data-path="${path}" data-type="${dataType}">${options.map(option => `<option value="${Utils.escape(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${Utils.escape(option.label)}</option>`).join("")}</select>`;
      } else if (rows) {
        control = `<textarea id="${id}" rows="${rows}" data-path="${path}" data-type="string" ${readonly ? "readonly" : ""}>${Utils.escape(value)}</textarea>`;
      } else {
        const attributes = [
          `id="${id}"`, `type="${type}"`, `value="${Utils.escape(value)}"`, `data-path="${path}"`, `data-type="${dataType}"`,
          measure ? "data-measurement" : "", gauge ? "data-gauge" : "", readonly ? "readonly" : "",
          type === "number" ? "step=\"0.01\"" : ""
        ].filter(Boolean).join(" ");
        const suffix = measure ? Units.label(Store.state.settings.displayUnit) : gauge ? Units.gaugeLabel(Store.state.settings.displayUnit) : "";
        control = suffix ? `<div class="input-with-unit"><input ${attributes}><span>${suffix}</span></div>` : `<input ${attributes}>`;
      }
      return `<div class="${classes}"><label for="${id}">${Utils.escape(label)}</label>${control}${help ? `<small>${Utils.escape(help)}</small>` : ""}</div>`;
    },
    projectFields() {
      const metadata = Store.state.metadata;
      const fields = [
        { label: "Pattern name", path: "metadata.patternName", value: metadata.patternName },
        { label: "Designer / studio", path: "metadata.designerName", value: metadata.designerName },
        { label: "Construction", path: "metadata.constructionType", value: metadata.constructionType, readonly: true },
        { label: "Skill level", path: "metadata.skillLevel", value: metadata.skillLevel, options: ["Beginner", "Confident beginner", "Intermediate", "Advanced"].map(value => ({ value, label: value })) },
        { label: "Pattern description", path: "metadata.description", value: metadata.description, wide: true, rows: 4 },
        { label: "Yarn", path: "metadata.yarn", value: metadata.yarn, wide: true },
        { label: "Needles", path: "metadata.needles", value: metadata.needles },
        { label: "Notions", path: "metadata.notions", value: metadata.notions },
        { label: "Pattern notes", path: "metadata.notes", value: metadata.notes, wide: true, rows: 3 },
        { label: "Copyright line", path: "metadata.copyright", value: metadata.copyright, wide: true }
      ];
      document.getElementById("project-fields").innerHTML = fields.map(Render.field).join("");
    },
    gaugeFields() {
      const unit = Store.state.settings.displayUnit;
      const gauge = Store.state.gauge;
      const ease = Store.state.ease;
      const fields = [
        { label: `Stitch gauge ${Units.gaugeLabel(unit)}`, path: "gauge.stitchGaugePer10cm", value: Units.displayGauge(gauge.stitchGaugePer10cm, unit), type: "number", gauge: true, help: gauge.stitchGaugePer10cm < 10 ? "Unusually loose gauge—verify this value." : "" },
        { label: `Row gauge ${Units.gaugeLabel(unit)}`, path: "gauge.rowGaugePer10cm", value: Units.displayGauge(gauge.rowGaugePer10cm, unit), type: "number", gauge: true },
        { label: "Bust ease", path: "ease.bustEaseCm", value: Units.displayMeasurement(ease.bustEaseCm, unit), type: "number", measure: true, help: "Positive values add room; negative values create a fitted result." },
        { label: "Sleeve ease", path: "ease.sleeveEaseCm", value: Units.displayMeasurement(ease.sleeveEaseCm, unit), type: "number", measure: true }
      ];
      document.getElementById("gauge-fields").innerHTML = `<div class="input-row">${fields.map(Render.field).join("")}</div>`;
      const measurements = [
        ["bustCm", "Bust"], ["bodyLengthCm", "Body length"], ["upperArmCm", "Upper arm"], ["sleeveLengthCm", "Sleeve length"],
        ["shoulderWidthCm", "Shoulder"], ["armholeDepthCm", "Armhole"], ["neckWidthCm", "Neck"]
      ];
      const head = `<thead><tr><th>Size</th>${measurements.map(([, label]) => `<th>${label} (${Units.label(unit)})</th>`).join("")}</tr></thead>`;
      const body = `<tbody>${SIZE_CODES.map(size => `<tr><td class="size-code">${size}</td>${measurements.map(([key]) => `<td><label class="sr-only" for="size-${size}-${key}">${size} ${key}</label><input id="size-${size}-${key}" type="number" step="0.01" data-path="sizes.${size}.${key}" data-type="number" data-measurement value="${Units.displayMeasurement(Store.state.sizes[size][key], unit)}"></td>`).join("")}</tr>`).join("")}</tbody>`;
      document.getElementById("size-table").innerHTML = head + body;
    },
    tabs(active, values, attribute) {
      return `<div class="piece-tabs" role="tablist">${values.map(value => `<button class="tab" type="button" role="tab" ${attribute}="${value.id}" aria-selected="${value.id === active}">${Utils.escape(value.label)}</button>`).join("")}</div>`;
    },
    constraintValue(block, type, fallback = "") {
      const found = (block.constraints || []).find(constraint => constraint.type === type);
      return found ? found.value : fallback;
    },
    blueprint() {
      const pieceId = UI.activePiece;
      const piece = Store.state.pieces[pieceId];
      const tabs = Render.tabs(pieceId, Object.entries(PIECE_LABELS).map(([id, label]) => ({ id, label })), "data-piece-tab");
      const cards = piece.blocks.slice().sort((a, b) => a.position - b.position).map((block, index, blocks) => {
        const valueField = block.type === "static"
          ? `<div class="field"><label>Fixed stitches</label><input class="inline-input" type="number" min="1" step="1" data-static-count="${block.id}" value="${block.staticStitchCount}"></div>`
          : `<div class="field"><label>Width ratio</label><input class="inline-input" type="number" min="0.01" step="0.1" data-block-field="widthRatio" data-block-id="${block.id}" value="${block.widthRatio}"></div>`;
        const chartField = block.type === "static"
          ? `<div class="field"><label>Chart</label><select data-block-field="chartId" data-block-id="${block.id}">${Object.values(Store.state.charts).map(chart => `<option value="${chart.id}" ${chart.id === block.chartId ? "selected" : ""}>${Utils.escape(chart.name)}</option>`).join("")}</select></div>`
          : `<div class="field"><label>Mirror group</label><input class="inline-input" data-block-field="mirrorGroupId" data-block-id="${block.id}" value="${Utils.escape(block.mirrorGroupId || "")}" placeholder="Optional"></div>`;
        const parity = Render.constraintValue(block, "parity", "");
        return `<article class="block-card ${block.type}">
          <span class="block-index">${String(index + 1).padStart(2, "0")}</span>
          <div class="field"><label>Block label</label><input class="inline-input" data-block-field="label" data-block-id="${block.id}" value="${Utils.escape(block.label)}"></div>
          <div class="field"><label>Type</label><select data-block-type="${block.id}"><option value="dynamic" ${block.type === "dynamic" ? "selected" : ""}>Dynamic</option><option value="static" ${block.type === "static" ? "selected" : ""}>Static</option></select></div>
          ${valueField}${chartField}
          <div class="block-actions">
            <button class="icon-button" type="button" data-move-block="up" data-block-id="${block.id}" ${index === 0 ? "disabled" : ""} aria-label="Move ${Utils.escape(block.label)} up">↑</button>
            <button class="icon-button" type="button" data-move-block="down" data-block-id="${block.id}" ${index === blocks.length - 1 ? "disabled" : ""} aria-label="Move ${Utils.escape(block.label)} down">↓</button>
            <button class="icon-button danger" type="button" data-delete-block="${block.id}" aria-label="Delete ${Utils.escape(block.label)}">×</button>
          </div>
          <div class="constraint-panel">
            <div class="field"><label>Repeat modulus</label><input class="inline-input" type="number" min="0" step="1" data-constraint="modulus" data-block-id="${block.id}" value="${Render.constraintValue(block, "modulus", 0)}"><small>0 = none</small></div>
            <div class="field"><label>Parity</label><select data-constraint="parity" data-block-id="${block.id}"><option value="" ${parity === "" ? "selected" : ""}>Any</option><option value="2" ${Number(parity) === 2 ? "selected" : ""}>Even</option><option value="1" ${Number(parity) === 1 ? "selected" : ""}>Odd</option></select></div>
            <div class="field"><label>Minimum stitches</label><input class="inline-input" type="number" min="0" step="1" data-constraint="min_stitches" data-block-id="${block.id}" value="${Render.constraintValue(block, "min_stitches", 0)}"></div>
            <div class="field"><label>Edge stitches</label><input class="inline-input" type="number" min="0" step="1" data-constraint="edge_stitches" data-block-id="${block.id}" value="${Render.constraintValue(block, "edge_stitches", 0)}"></div>
            <div class="field"><span class="field-label">Priority</span><small>Modulus → parity → edge → minimum. All configured rules are hard constraints.</small></div>
          </div>
        </article>`;
      }).join("");
      document.getElementById("blueprint-editor").innerHTML = `${tabs}<div class="piece-panel">${cards || `<div class="empty-state"><h3>No blocks yet</h3><p>Add a dynamic block to make this piece gradeable.</p></div>`}</div><div class="add-block-row"><button class="button" type="button" data-add-block="dynamic">+ Dynamic block</button><button class="button" type="button" data-add-block="static">+ Static block</button></div>`;
    },
    chartEditor() {
      const staticBlocks = Object.entries(Store.state.pieces).flatMap(([pieceId, piece]) => piece.blocks.filter(block => block.type === "static").map(block => ({ ...block, pieceId })));
      if (!staticBlocks.length) {
        document.getElementById("chart-editor").innerHTML = `<div class="empty-state"><h3>No static blocks</h3><p>Add a static blueprint block to create its chart.</p></div>`;
        return;
      }
      if (!Store.state.charts[UI.activeChart]) UI.activeChart = staticBlocks[0].chartId;
      const chart = Store.state.charts[UI.activeChart];
      const owner = staticBlocks.find(block => block.chartId === chart.id);
      const tabs = `<div class="chart-tabs" role="tablist">${staticBlocks.map(block => `<button class="tab" type="button" role="tab" data-chart-tab="${block.chartId}" aria-selected="${block.chartId === chart.id}">${Utils.escape(block.label)} · ${PIECE_LABELS[block.pieceId]}</button>`).join("")}</div>`;
      const legend = SYMBOLS.slice(1).map(symbol => `<span class="symbol-chip"><b>${Utils.escape(SYMBOL_META[symbol].mark)}</b>${Utils.escape(SYMBOL_META[symbol].abbreviation)}</span>`).join("");
      const grid = chart.cells.map((row, rowIndex) => row.map((symbol, columnIndex) => `<button class="chart-cell ${symbol === "no-stitch" ? "no-stitch" : ""}" type="button" data-chart-cell="${rowIndex}:${columnIndex}" title="${Utils.escape(SYMBOL_META[symbol]?.name || "Blank")}" aria-label="Row ${rowIndex + 1}, stitch ${columnIndex + 1}: ${Utils.escape(SYMBOL_META[symbol]?.name || "Blank")}">${Utils.escape(SYMBOL_META[symbol]?.mark || "")}</button>`).join("")).join("");
      document.getElementById("chart-editor").innerHTML = `${tabs}<div class="chart-toolbar">
        ${Render.field({ label: "Chart name", path: `charts.${chart.id}.name`, value: chart.name })}
        <div class="field"><label>Rows</label><input class="inline-input" type="number" min="1" max="200" step="1" data-chart-height="${chart.id}" value="${chart.height}"></div>
        ${Render.field({ label: "Vertical repeat", path: `charts.${chart.id}.repeatRows`, value: chart.repeatRows, type: "number" })}
      </div><div class="chart-legend">${legend}<span class="field-help">Click a cell to cycle symbols.</span></div><div class="chart-scroller"><div class="chart-grid" style="grid-template-columns:repeat(${chart.width},29px)">${grid}</div></div><p class="field-help">${chart.width} stitches × ${chart.height} rows · linked to ${Utils.escape(owner?.label || "static block")}</p>`;
    },
    shapingEditor() {
      const unit = Store.state.settings.displayUnit;
      const cards = ["front", "back"].map(pieceId => {
        const config = Store.state.shaping[pieceId];
        const definitions = [
          ["openingInsetCm", "Opening inset per edge"], ["openingDepthCm", "Opening depth"], ["openingBindOffWidthCm", "Initial bind-off width"],
          ["neckWidthCm", "Finished neck width"], ["neckDepthCm", "Neck depth"], ["centerBindOffWidthCm", "Center bind-off width"],
          ["shoulderNarrowingCm", "Shoulder narrowing"], ["shoulderSlopeDepthCm", "Shoulder slope depth"]
        ];
        return `<article class="shaping-card"><h3>${PIECE_LABELS[pieceId]}</h3><p>Opening, neckline, and optional shoulder slope.</p>${definitions.map(([key, label]) => Render.field({ label, path: `shaping.${pieceId}.${key}`, value: Units.displayMeasurement(config[key], unit), type: "number", measure: true })).join("")}${Render.field({ label: "Enable shoulder shaping", path: `shaping.${pieceId}.shoulderEnabled`, value: config.shoulderEnabled, type: "checkbox" })}</article>`;
      });
      const sleeve = Store.state.shaping.sleeve;
      cards.push(`<article class="shaping-card"><h3>Sleeve · make two</h3><p>Increase evenly from cuff to the size-specific upper arm.</p>${Render.field({ label: "Cuff width", path: "shaping.sleeve.cuffWidthCm", value: Units.displayMeasurement(sleeve.cuffWidthCm, unit), type: "number", measure: true })}${Render.field({ label: "Increase-zone length", path: "shaping.sleeve.increaseLengthCm", value: Units.displayMeasurement(sleeve.increaseLengthCm, unit), type: "number", measure: true })}<div class="notice notice-success">The upper-arm target comes from each size plus sleeve ease.</div></article>`);
      document.getElementById("shaping-editor").innerHTML = `<div class="shaping-grid">${cards.join("")}</div>`;
    },
    imagePlaceholder(kind) {
      return `<div class="placeholder-art" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M15 50c18-36 52-36 70 0-18 36-52 36-70 0Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M25 50c13-22 37-22 50 0-13 22-37 22-50 0Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M42 42h16v16H42z" fill="currentColor" opacity=".18"/></svg><span class="sr-only">${kind} placeholder</span></div>`;
    },
    branding() {
      const branding = Store.state.branding;
      const cover = branding.coverImage ? `<img src="${branding.coverImage}" alt="Current cover preview">` : Render.imagePlaceholder("Cover image");
      const logo = branding.logoImage ? `<img src="${branding.logoImage}" alt="Current logo preview">` : Render.imagePlaceholder("Logo");
      const fontOptions = [
        { value: "editorial", label: "Editorial · Georgia + system sans" },
        { value: "classic", label: "Classic · Times + Arial" },
        { value: "modern", label: "Modern · system sans" }
      ];
      document.getElementById("branding-editor").innerHTML = `<div class="branding-layout">
        <label class="upload-card"><span>${cover}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-image-upload="coverImage"><span class="sr-only">Upload cover image</span></label>
        <label class="upload-card logo"><span>${logo}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-image-upload="logoImage"><span class="sr-only">Upload logo</span></label>
      </div><div class="form-grid brand-controls">
        <div class="field"><label for="accent-color">Accent color</label><input id="accent-color" type="color" data-path="branding.accentColor" value="${Utils.escape(branding.accentColor)}"></div>
        ${Render.field({ label: "Font pair", path: "branding.fontPair", value: branding.fontPair, options: fontOptions })}
      </div>`;
    },
    errorSummary(errors) {
      const node = document.getElementById("error-summary");
      if (!node) return;
      if (!errors?.length) { node.hidden = true; node.innerHTML = ""; return; }
      node.hidden = false;
      node.innerHTML = `<h2>Review ${errors.length} ${errors.length === 1 ? "issue" : "issues"}</h2><ul>${errors.map(error => `<li>${Utils.escape(error.message || error)}</li>`).join("")}</ul>`;
    },
    projectStatus() {
      const graded = Store.state.graded;
      const dot = document.getElementById("project-state-dot");
      const label = document.getElementById("project-state-label");
      const copy = document.getElementById("project-state-copy");
      if (!dot || !label || !copy) return;
      dot.className = "status-dot";
      if (!graded) { label.textContent = "Ready to grade"; copy.textContent = "Inputs have not been calculated"; return; }
      if (graded.stale) { dot.classList.add("stale"); label.textContent = "Results are stale"; copy.textContent = "Recalculate after input changes"; return; }
      if (graded.errors.length) { dot.classList.add("error"); label.textContent = "Conflicts found"; copy.textContent = `${graded.errors.length} blocking ${graded.errors.length === 1 ? "issue" : "issues"}`; return; }
      label.textContent = "Grading current";
      copy.textContent = `${graded.warnings.length} ${graded.warnings.length === 1 ? "warning" : "warnings"}`;
    },
    results() {
      const node = document.getElementById("results-view");
      const graded = Store.state.graded;
      if (!graded) {
        node.innerHTML = `<div class="empty-state"><h3>Ready when your blueprint is.</h3><p>Calculate all sizes to see stitch counts, shaping instructions, and auditable grading decisions.</p><button class="button button-primary" type="button" data-calculate>Calculate all sizes</button></div>`;
        return;
      }
      const validResults = Object.values(graded.pieces).flatMap(results => Object.values(results));
      const maxDelta = validResults.length ? Math.max(...validResults.map(result => result.widthDeltaCm)) : 0;
      const hero = `<div class="results-hero"><div><p class="eyebrow">Computed ${new Date(graded.computedAt).toLocaleString()}</p><h2>${graded.stale ? "Results need recalculation" : graded.errors.length ? "Conflicts need attention" : "All sizes resolved"}</h2><p>${graded.stale ? "Inputs have changed since this snapshot." : "Deterministic counts for front, back, and sleeve."}</p></div><div class="stat-row"><div class="stat"><strong>${validResults.length}</strong><span>piece results</span></div><div class="stat"><strong>${Utils.formatNumber(maxDelta, 2)}</strong><span>max Δ cm</span></div><div class="stat"><strong>${graded.warnings.length}</strong><span>warnings</span></div></div></div>`;
      const notices = [
        ...(graded.stale ? [`<div class="notice notice-warning">These results are stale. Recalculate before printing.</div>`] : []),
        ...graded.errors.map(error => `<div class="notice notice-error"><strong>${error.size} · ${PIECE_LABELS[error.pieceId]}</strong><br>${Utils.escape(error.message)}</div>`),
        ...graded.warnings.map(warning => `<div class="notice notice-warning"><strong>${warning.size} · ${PIECE_LABELS[warning.pieceId]}</strong><br>${Utils.escape(warning.message)}${warning.requiresAcknowledgement ? `<label><input type="checkbox" data-ack-warning="${warning.id}" ${warning.acknowledged ? "checked" : ""}> I reviewed this width decision</label>` : ""}</div>`)
      ].join("");
      const table = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Size</th><th>Front CO</th><th>Back CO</th><th>Sleeve upper</th><th>Body rows</th><th>Sleeve rows</th><th>Largest Δ</th></tr></thead><tbody>${SIZE_CODES.map(size => {
        const front = graded.pieces.front[size]; const back = graded.pieces.back[size]; const sleeve = graded.pieces.sleeve[size];
        const deltas = [front, back, sleeve].filter(Boolean).map(result => result.widthDeltaCm);
        return `<tr><td class="size-code">${size}</td><td>${front?.castOnSts ?? "—"}</td><td>${back?.castOnSts ?? "—"}</td><td>${sleeve?.castOnSts ?? "—"}</td><td>${front?.totalRows ?? "—"}</td><td>${sleeve?.totalRows ?? "—"}</td><td>${deltas.length ? `${Utils.formatNumber(Math.max(...deltas), 2)} cm` : "—"}</td></tr>`;
      }).join("")}</tbody></table></div>`;
      const details = SIZE_CODES.map(size => `<details class="result-details"><summary>${size} calculation details</summary><div class="result-detail-body">${["front", "back", "sleeve"].map(pieceId => Render.resultPiece(graded.pieces[pieceId][size], pieceId)).join("")}</div></details>`).join("");
      node.innerHTML = hero + notices + table + details;
    },
    resultPiece(result, pieceId) {
      if (!result) return `<div class="notice notice-error"><strong>${PIECE_LABELS[pieceId]}</strong> could not be resolved.</div>`;
      const sections = result.sections.map(section => `<tr><td>${Utils.escape(section.label)}</td><td>${Utils.formatNumber(section.rawStitches, 2)}</td><td>${section.stitchCount}</td><td>${section.rowCount}</td><td>${section.constraints.map(constraint => `${constraint.type}: ${constraint.value}`).join(", ") || "None"}</td></tr>`).join("");
      return `<h3>${PIECE_LABELS[pieceId]}</h3><div class="audit-grid"><div class="audit-item"><strong>${Utils.formatNumber(result.targetWidthCm)} cm</strong><span>Target width</span></div><div class="audit-item"><strong>${Utils.formatNumber(result.targetStitches, 2)}</strong><span>Raw target sts</span></div><div class="audit-item"><strong>${result.castOnSts} sts</strong><span>Resolved cast-on</span></div><div class="audit-item"><strong>${Utils.formatNumber(result.widthDeltaCm, 2)} cm</strong><span>Width delta</span></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Section</th><th>Raw</th><th>Resolved</th><th>Rows</th><th>Constraints</th></tr></thead><tbody>${sections}</tbody></table></div><ul class="instruction-list">${result.shapingInstructions.map(instruction => `<li>${Utils.escape(instruction.text)}</li>`).join("")}</ul>`;
    },
    previewControls() {
      const graded = Store.state.graded;
      const unacknowledged = graded?.warnings?.some(warning => warning.requiresAcknowledgement && !warning.acknowledged);
      const blocked = !graded || graded.stale || graded.errors.length || unacknowledged;
      document.getElementById("preview-controls").innerHTML = `<div class="preview-toolbar"><div class="fields">
        ${Render.field({ label: "Template", path: "settings.template", value: Store.state.settings.template, options: [{ value: "classic", label: "Classic" }, { value: "modern", label: "Modern two-column" }] })}
        ${Render.field({ label: "Page size", path: "settings.pageSize", value: Store.state.settings.pageSize, options: [{ value: "A4", label: "A4" }, { value: "letter", label: "US Letter" }] })}
      </div><div><button class="button button-primary" id="print-button" type="button" ${blocked ? "disabled" : ""}>Print / Save PDF</button>${blocked ? `<p class="field-help">${!graded ? "Calculate first." : graded.stale ? "Recalculate stale results." : graded.errors.length ? "Resolve blocking conflicts." : "Acknowledge all warnings."}</p>` : ""}</div></div>`;
    },
    printDocument() {
      const project = Store.state;
      const graded = project.graded;
      const documentNode = document.getElementById("print-document");
      document.body.dataset.pageSize = project.settings.pageSize.toLowerCase();
      documentNode.style.setProperty("--brand", project.branding.accentColor);
      documentNode.className = `print-document template-${project.settings.template}`;
      if (!graded) {
        documentNode.innerHTML = `<div class="empty-state"><h3>Pattern preview unavailable</h3><p>Calculate the project to assemble the printable pattern.</p></div>`;
        return;
      }
      const metadata = project.metadata;
      const coverStyle = project.branding.coverImage ? ` style="background-image:url('${project.branding.coverImage}')"` : "";
      const cover = `<header class="document-cover ${project.branding.coverImage ? "has-image" : ""}"${coverStyle}><div>${project.branding.logoImage ? `<img class="document-logo" src="${project.branding.logoImage}" alt="${Utils.escape(metadata.designerName)} logo">` : `<span class="document-kicker">${Utils.escape(metadata.designerName)}</span>`}</div><h1>${Utils.escape(metadata.patternName)}</h1><footer><span>${Utils.escape(metadata.constructionType)}</span><span>${Utils.escape(metadata.skillLevel)}</span></footer></header>`;
      const sizingRows = SIZE_CODES.map(size => `<tr><td>${size}</td><td>${Utils.formatNumber(project.sizes[size].bustCm)} cm</td><td>${Utils.formatNumber(project.sizes[size].bustCm + project.ease.bustEaseCm)} cm</td><td>${Utils.formatNumber(project.sizes[size].bodyLengthCm)} cm</td><td>${Utils.formatNumber(project.sizes[size].upperArmCm + project.ease.sleeveEaseCm)} cm</td></tr>`).join("");
      const overview = `<section class="document-page"><p class="document-kicker">Pattern overview</p><h2>About this design</h2><p>${Utils.escape(metadata.description)}</p><div class="document-meta"><div><strong>${Utils.escape(metadata.yarn)}</strong><span>Yarn</span></div><div><strong>${Utils.escape(metadata.needles)}</strong><span>Needles</span></div><div><strong>${Utils.escape(metadata.notions)}</strong><span>Notions</span></div></div><h3>Gauge</h3><p>${Utils.formatNumber(project.gauge.stitchGaugePer10cm)} stitches and ${Utils.formatNumber(project.gauge.rowGaugePer10cm)} rows = 10 cm / 4 in.</p><h3>Finished sizing</h3><table class="data-table"><thead><tr><th>Size</th><th>Body bust</th><th>Finished bust</th><th>Length</th><th>Upper arm</th></tr></thead><tbody>${sizingRows}</tbody></table><h3>Notes</h3><p>${Utils.escape(metadata.notes)}</p></section>`;
      const instructions = `<section class="document-page"><p class="document-kicker">Written pattern</p><h2>Body &amp; sleeves</h2>${["front", "back", "sleeve"].map(pieceId => Render.documentPiece(pieceId, graded)).join("")}</section>`;
      const charts = Object.values(project.charts).map(chart => `<h3>${Utils.escape(chart.name)}</h3><p>Work the ${chart.width}-stitch chart over ${chart.height} rows; repeat every ${chart.repeatRows} rows as established.</p><div class="document-chart">${Charts.svg(chart)}</div>`).join("");
      const usedSymbols = new Set(Object.values(project.charts).flatMap(chart => chart.cells.flat()));
      const glossary = [...usedSymbols].filter(Boolean).map(symbol => `<li><strong>${Utils.escape(SYMBOL_META[symbol].abbreviation)}</strong> — ${Utils.escape(SYMBOL_META[symbol].name)}</li>`).join("");
      const chartPage = `<section class="document-page"><p class="document-kicker">Charts &amp; reference</p><h2>Stitch charts</h2>${charts || "<p>No charts are used in this pattern.</p>"}<h3>Abbreviations</h3><ul>${glossary}</ul><p>${Utils.escape(metadata.copyright)}</p></section>`;
      documentNode.innerHTML = cover + overview + instructions + chartPage;
    },
    documentPiece(pieceId, graded) {
      const results = graded.pieces[pieceId];
      const counts = SIZE_CODES.map(size => results[size]?.castOnSts ?? "—");
      const normalizedCounts = `${counts[0]} (${counts.slice(1).join(", ")})`;
      const sample = SIZE_CODES.map(size => results[size]).find(Boolean);
      if (!sample) return `<h3>${PIECE_LABELS[pieceId]}</h3><p>This piece contains unresolved grading conflicts.</p>`;
      const shapingByZone = sample.shapingInstructions.map((instruction, index) => {
        const texts = SIZE_CODES.map(size => results[size]?.shapingInstructions[index]?.text || "Unresolved");
        const same = texts.every(text => text === texts[0]);
        return same ? `<li>${Utils.escape(texts[0])}</li>` : `<li><strong>${Utils.escape(instruction.zone.replace("_", " "))}:</strong><ul>${SIZE_CODES.map((size, sizeIndex) => `<li>${size}: ${Utils.escape(texts[sizeIndex])}</li>`).join("")}</ul></li>`;
      }).join("");
      return `<h3>${PIECE_LABELS[pieceId]}</h3><p>Cast on ${normalizedCounts} sts for XS (S, M, L, XL, 2XL, 3XL, 4XL, 5XL).</p><ul>${shapingByZone}</ul>`;
    },
    all() {
      Render.projectFields();
      Render.gaugeFields();
      Render.blueprint();
      Render.chartEditor();
      Render.shapingEditor();
      Render.branding();
      Render.results();
      Render.previewControls();
      Render.printDocument();
      Render.projectStatus();
      document.querySelectorAll("[data-unit]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.unit === Store.state.settings.displayUnit)));
    }
  };

  const Images = Gulsen.images = {
    read(file, kind) {
      return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("No image was selected."));
        if (file.size > 10 * 1024 * 1024) return reject(new Error("Images must be smaller than 10 MB."));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.onload = () => {
          if (file.type === "image/svg+xml" && kind === "logoImage") return resolve(reader.result);
          const image = new Image();
          image.onerror = () => reject(new Error("The selected file is not a supported image."));
          image.onload = () => {
            const maximum = kind === "coverImage" ? { width: 1600, height: 1200 } : { width: 800, height: 500 };
            const scale = Math.min(1, maximum.width / image.width, maximum.height / image.height);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", .82));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const Files = Gulsen.files = {
    exportProject() {
      const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${Store.state.metadata.patternName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gulsen-project"}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      UI.status("Project exported as JSON.");
    },
    async importProject(file) {
      try {
        const parsed = JSON.parse(await file.text());
        const errors = Validation.importPayload(parsed);
        if (errors.length) throw new Error(errors.join(" "));
        Store.state = parsed;
        Store.save();
        Render.errorSummary([]);
        Render.all();
        UI.status("Project imported successfully.");
      } catch (error) {
        Render.errorSummary([{ message: `Import failed: ${error.message}` }]);
        UI.status("Project import failed.");
      }
    }
  };

  const Events = Gulsen.events = {
    affectsGrading(path) {
      return /^(gauge|sizes|ease|pieces|charts|shaping)\./.test(path);
    },
    updatePath(target) {
      const path = target.dataset.path;
      if (!path) return;
      let value = target.dataset.type === "checkbox" ? target.checked : target.dataset.type === "number" ? Number(target.value) : target.value;
      if (target.hasAttribute("data-measurement")) value = Units.canonicalMeasurement(value, Store.state.settings.displayUnit);
      if (target.hasAttribute("data-gauge")) value = Units.canonicalGauge(value, Store.state.settings.displayUnit);
      Utils.set(Store.state, path, value);
      Store.markChanged({ affectsGrading: Events.affectsGrading(path) });
      if (/^(metadata|branding|settings)\./.test(path)) {
        Render.previewControls();
        Render.printDocument();
      }
    },
    findBlock(id) {
      const pieceId = Object.keys(Store.state.pieces).find(key => Store.state.pieces[key].blocks.some(block => block.id === id));
      return pieceId ? { pieceId, piece: Store.state.pieces[pieceId], block: Store.state.pieces[pieceId].blocks.find(item => item.id === id) } : null;
    },
    updateConstraint(block, type, rawValue) {
      const numeric = rawValue === "" ? 0 : Number(rawValue);
      block.constraints ||= [];
      block.constraints = block.constraints.filter(constraint => constraint.type !== type);
      if (numeric > 0) block.constraints.push({ type, value: numeric });
    },
    addBlock(type) {
      const piece = Store.state.pieces[UI.activePiece];
      const id = Utils.uid(`${UI.activePiece}-${type}`);
      if (type === "static") {
        const chartId = Utils.uid("chart");
        Store.state.charts[chartId] = { id: chartId, name: "New motif", width: 12, height: 8, repeatRows: 8, cells: Array.from({ length: 8 }, () => Array(12).fill("")) };
        piece.blocks.push({ id, type, label: "New static motif", position: piece.blocks.length, staticStitchCount: 12, chartId, constraints: [] });
        UI.activeChart = chartId;
      } else {
        piece.blocks.push({ id, type, label: "New dynamic filler", position: piece.blocks.length, widthRatio: 1, mirrorGroupId: "", constraints: [{ type: "min_stitches", value: 2 }] });
      }
      Store.markChanged();
      Render.blueprint(); Render.chartEditor(); Render.results(); Render.previewControls(); Render.printDocument();
    },
    removeBlock(id) {
      const found = Events.findBlock(id);
      if (!found) return;
      UI.confirm("Delete this block?", `${found.block.label} will be removed from the ${PIECE_LABELS[found.pieceId].toLowerCase()}.`, () => {
        found.piece.blocks = found.piece.blocks.filter(block => block.id !== id);
        found.piece.blocks.forEach((block, index) => { block.position = index; });
        if (found.block.chartId && !Object.values(Store.state.pieces).some(piece => piece.blocks.some(block => block.chartId === found.block.chartId))) delete Store.state.charts[found.block.chartId];
        Store.markChanged(); Render.blueprint(); Render.chartEditor(); Render.results(); Render.previewControls(); Render.printDocument();
      }, "Delete block");
    },
    moveBlock(id, direction) {
      const found = Events.findBlock(id);
      if (!found) return;
      const blocks = found.piece.blocks.sort((a, b) => a.position - b.position);
      const index = blocks.findIndex(block => block.id === id);
      const next = direction === "up" ? index - 1 : index + 1;
      if (next < 0 || next >= blocks.length) return;
      [blocks[index], blocks[next]] = [blocks[next], blocks[index]];
      blocks.forEach((block, blockIndex) => { block.position = blockIndex; });
      Store.markChanged(); Render.blueprint();
    },
    changeBlockType(id, type) {
      const found = Events.findBlock(id);
      if (!found || found.block.type === type) return;
      if (type === "static") {
        const chartId = Utils.uid("chart");
        Object.assign(found.block, { type: "static", staticStitchCount: 12, chartId });
        delete found.block.widthRatio; delete found.block.mirrorGroupId;
        Store.state.charts[chartId] = { id: chartId, name: found.block.label, width: 12, height: 8, repeatRows: 8, cells: Array.from({ length: 8 }, () => Array(12).fill("")) };
        UI.activeChart = chartId;
      } else {
        const oldChart = found.block.chartId;
        Object.assign(found.block, { type: "dynamic", widthRatio: 1, mirrorGroupId: "" });
        delete found.block.staticStitchCount; delete found.block.chartId;
        if (oldChart && !Object.values(Store.state.pieces).some(piece => piece.blocks.some(block => block.chartId === oldChart))) delete Store.state.charts[oldChart];
      }
      Store.markChanged(); Render.blueprint(); Render.chartEditor();
    },
    resizeStaticBlock(id, nextWidth) {
      const found = Events.findBlock(id);
      if (!found) return;
      nextWidth = Math.max(1, Math.trunc(Number(nextWidth)));
      const chart = Store.state.charts[found.block.chartId];
      const apply = () => {
        found.block.staticStitchCount = nextWidth;
        Charts.resize(chart, nextWidth, chart.height);
        Store.markChanged(); Render.blueprint(); Render.chartEditor();
      };
      if (nextWidth < chart.width) UI.confirm("Trim this chart?", `Reducing the block from ${chart.width} to ${nextWidth} stitches will permanently remove ${chart.width - nextWidth} chart columns.`, apply, "Trim chart");
      else apply();
    },
    resizeChartHeight(chartId, nextHeight) {
      const chart = Store.state.charts[chartId];
      nextHeight = Math.max(1, Math.min(200, Math.trunc(Number(nextHeight))));
      const apply = () => { Charts.resize(chart, chart.width, nextHeight); Store.markChanged(); Render.chartEditor(); };
      if (nextHeight < chart.height) UI.confirm("Trim chart rows?", `Reducing this chart to ${nextHeight} rows will remove ${chart.height - nextHeight} rows.`, apply, "Trim rows");
      else apply();
    },
    calculate() {
      Render.errorSummary([]);
      const result = Engine.grade(Store.state);
      if (result.validationErrors) {
        Render.errorSummary(result.validationErrors);
        UI.status(`Calculation stopped with ${result.validationErrors.length} validation issues.`);
        document.getElementById("error-summary")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      Store.state.graded = result;
      Store.saveSoon();
      Render.results(); Render.previewControls(); Render.printDocument(); Render.projectStatus();
      UI.status(result.errors.length ? `Calculation completed with ${result.errors.length} conflicts.` : "All nine sizes calculated.");
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    },
    bind() {
      document.addEventListener("input", event => {
        const target = event.target;
        if (target.dataset.path) Events.updatePath(target);
        if (target.dataset.blockField) {
          const found = Events.findBlock(target.dataset.blockId);
          if (found) {
            found.block[target.dataset.blockField] = target.dataset.blockField === "widthRatio" ? Number(target.value) : target.value;
            Store.markChanged();
          }
        }
      });
      document.addEventListener("change", async event => {
        const target = event.target;
        if (target.dataset.path) {
          Events.updatePath(target);
          if (target.dataset.path.startsWith("charts.")) Render.chartEditor();
          if (/^(metadata|branding|settings)\./.test(target.dataset.path)) { Render.previewControls(); Render.printDocument(); }
        }
        if (target.dataset.blockField) {
          const found = Events.findBlock(target.dataset.blockId);
          if (found) {
            found.block[target.dataset.blockField] = target.dataset.blockField === "widthRatio" ? Number(target.value) : target.value;
            Store.markChanged();
          }
        }
        if (target.dataset.constraint) {
          const found = Events.findBlock(target.dataset.blockId);
          if (found) { Events.updateConstraint(found.block, target.dataset.constraint, target.value); Store.markChanged(); }
        }
        if (target.dataset.blockType) Events.changeBlockType(target.dataset.blockType, target.value);
        if (target.dataset.staticCount) Events.resizeStaticBlock(target.dataset.staticCount, target.value);
        if (target.dataset.chartHeight) Events.resizeChartHeight(target.dataset.chartHeight, target.value);
        if (target.dataset.ackWarning) {
          const warning = Store.state.graded?.warnings.find(item => item.id === target.dataset.ackWarning);
          if (warning) { warning.acknowledged = target.checked; Store.saveSoon(); Render.previewControls(); }
        }
        if (target.dataset.imageUpload && target.files[0]) {
          try {
            document.getElementById("save-status").textContent = "Optimizing…";
            Store.state.branding[target.dataset.imageUpload] = await Images.read(target.files[0], target.dataset.imageUpload);
            Store.markChanged({ affectsGrading: false }); Render.branding(); Render.printDocument();
            UI.status("Image optimized and saved locally.");
          } catch (error) { Render.errorSummary([{ message: error.message }]); }
        }
      });
      document.addEventListener("click", event => {
        const target = event.target.closest("button, a");
        if (!target) return;
        if (target.matches(".section-heading")) {
          const section = target.closest(".editor-section");
          section.classList.toggle("section-open");
          const open = section.classList.contains("section-open");
          target.setAttribute("aria-expanded", String(open));
          target.querySelector(".section-toggle").textContent = open ? "−" : "+";
        }
        if (target.dataset.unit) {
          Store.state.settings.displayUnit = target.dataset.unit;
          Store.markChanged({ affectsGrading: false }); Render.all();
        }
        if (target.dataset.pieceTab) { UI.activePiece = target.dataset.pieceTab; Render.blueprint(); }
        if (target.dataset.chartTab) { UI.activeChart = target.dataset.chartTab; Render.chartEditor(); }
        if (target.dataset.addBlock) Events.addBlock(target.dataset.addBlock);
        if (target.dataset.deleteBlock) Events.removeBlock(target.dataset.deleteBlock);
        if (target.dataset.moveBlock) Events.moveBlock(target.dataset.blockId, target.dataset.moveBlock);
        if (target.dataset.chartCell) {
          const chart = Store.state.charts[UI.activeChart];
          const [row, column] = target.dataset.chartCell.split(":").map(Number);
          const current = SYMBOLS.indexOf(chart.cells[row][column]);
          chart.cells[row][column] = SYMBOLS[(current + 1) % SYMBOLS.length];
          Store.markChanged(); Render.chartEditor(); Render.printDocument();
        }
        if (target.id === "calculate-button" || target.hasAttribute("data-calculate")) Events.calculate();
        if (target.id === "export-button") Files.exportProject();
        if (target.id === "import-button") document.getElementById("import-input").click();
        if (target.id === "reset-button") UI.confirm("Reset the demo project?", "All locally saved edits will be replaced by the original Alpine Lace demo.", () => { Store.state = Defaults.createProject(); Store.save(); Render.errorSummary([]); Render.all(); UI.status("Demo project restored."); }, "Reset project");
        if (target.id === "print-button" && !target.disabled) window.print();
      });
      document.getElementById("import-input").addEventListener("change", event => { if (event.target.files[0]) Files.importProject(event.target.files[0]); event.target.value = ""; });
      document.getElementById("confirm-dialog").addEventListener("close", event => {
        if (event.target.returnValue === "confirm" && UI.confirmAction) UI.confirmAction();
        else { Render.blueprint(); Render.chartEditor(); }
        UI.confirmAction = null;
      });
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          document.querySelectorAll("[data-section-link]").forEach(link => link.classList.toggle("active", link.dataset.sectionLink === entry.target.id));
        }), { rootMargin: "-20% 0px -70% 0px" });
        document.querySelectorAll(".editor-section").forEach(section => observer.observe(section));
      }
    }
  };

  const Tests = Gulsen.tests = {
    cases: [],
    test(name, callback) { Tests.cases.push({ name, callback }); },
    assert(condition, message = "Assertion failed") { if (!condition) throw new Error(message); },
    equal(actual, expected, message = "Values differ") { if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`); },
    close(actual, expected, tolerance = .0001, message = "Values are not close") { if (Math.abs(actual - expected) > tolerance) throw new Error(`${message}: expected ${expected}, received ${actual}`); },
    define() {
      Tests.test("Metric and imperial measurements round-trip", () => Tests.close(Units.inchesToCm(Units.cmToInches(42)), 42));
      Tests.test("Gauge converts between per-10-cm and per-4-inch", () => Tests.close(Units.gaugeToMetric(Units.gaugeToImperial(22)), 22));
      Tests.test("Constraint solver enforces modulus and parity", () => Tests.equal(Engine.candidates(13.7, [{ type: "modulus", value: 4 }, { type: "parity", value: 2 }])[0], 12));
      Tests.test("Equal-distance ties prefer the larger count", () => Tests.equal(Engine.candidates(5.5, [])[0], 6));
      Tests.test("Edge and minimum constraints are hard", () => Tests.equal(Engine.candidates(2, [{ type: "edge_stitches", value: 3 }, { type: "min_stitches", value: 8 }])[0], 8));
      Tests.test("Front width uses formula-first bust ease", () => {
        const project = Defaults.createProject();
        const result = Engine.solvePiece(project, "front", "M");
        Tests.close(result.targetWidthCm, (project.sizes.M.bustCm + project.ease.bustEaseCm) / 2);
      });
      Tests.test("Sleeve width uses upper-arm ease", () => {
        const project = Defaults.createProject();
        const result = Engine.solvePiece(project, "sleeve", "M");
        Tests.close(result.targetWidthCm, project.sizes.M.upperArmCm + project.ease.sleeveEaseCm);
      });
      Tests.test("Mirror-paired dynamic blocks resolve equally", () => {
        const project = Defaults.createProject();
        const result = Engine.solvePiece(project, "front", "L");
        const left = result.sections.find(section => section.blockId === "front-left");
        const right = result.sections.find(section => section.blockId === "front-right");
        Tests.equal(left.stitchCount, right.stitchCount);
      });
      Tests.test("Out-of-tolerance reconciliation requires acknowledgement", () => {
        const project = Defaults.createProject();
        project.pieces.front.blocks.filter(block => block.type === "dynamic").forEach(block => block.constraints.unshift({ type: "modulus", value: 4 }));
        const result = Engine.solvePiece(project, "front", "S");
        Tests.assert(result.warnings.some(warning => warning.requiresAcknowledgement));
      });
      Tests.test("Row repeats prefer the larger equal-distance multiple", () => Tests.equal(Engine.nearestMultiple(12, 8), 16));
      Tests.test("Shaping distributes every event across available rows", () => {
        const result = Shaping.distribute(3, 10);
        Tests.equal(result.schedule.length, 3); Tests.equal(result.schedule.reduce((sum, value) => sum + value, 0), 10);
      });
      Tests.test("Shaping detects insufficient rows", () => Tests.assert(Boolean(Shaping.distribute(11, 10).error)));
      Tests.test("Chart growth preserves existing symbols", () => {
        const chart = { width: 2, height: 1, repeatRows: 1, cells: [["knit", "yo"]] };
        Charts.resize(chart, 3, 2); Tests.equal(chart.cells[0][1], "yo"); Tests.equal(chart.cells[1][2], "");
      });
      Tests.test("Chart shrink trims overflow", () => {
        const chart = { width: 3, height: 2, repeatRows: 2, cells: [["knit", "yo", "ssk"], ["purl", "", "knit"]] };
        Charts.resize(chart, 2, 1); Tests.equal(chart.cells.length, 1); Tests.equal(chart.cells[0].length, 2);
      });
      Tests.test("Import rejects future schema versions", () => Tests.assert(Validation.importPayload({ schemaVersion: 2 }).length > 0));
      Tests.test("Project JSON survives a serialization round-trip", () => {
        const project = Defaults.createProject();
        const restored = JSON.parse(JSON.stringify(project));
        Tests.equal(Validation.importPayload(restored).length, 0);
        Tests.equal(restored.metadata.patternName, project.metadata.patternName);
      });
      Tests.test("Size validation catches non-monotonic bust values", () => {
        const project = Defaults.createProject(); project.sizes.M.bustCm = project.sizes.S.bustCm;
        Tests.assert(Validation.project(project).some(error => error.path === "sizes.M.bustCm"));
      });
      Tests.test("Static-width conflicts fail the affected piece", () => {
        const project = Defaults.createProject(); project.pieces.front.blocks.find(block => block.type === "static").staticStitchCount = 200;
        Tests.assert(Boolean(Engine.solvePiece(project, "front", "XS").error));
      });
      Tests.test("Nine-size formula-first golden fixture", () => {
        const project = Defaults.createProject(); Store.state = project;
        const graded = Engine.grade(project);
        Tests.assert(!graded.validationErrors); Tests.equal(graded.errors.length, 0);
        const expected = {
          front: [91, 103, 115, 125, 137, 147, 159, 169, 181],
          back: [92, 102, 114, 126, 136, 148, 158, 170, 180],
          sleeve: [70, 74, 80, 84, 88, 92, 96, 102, 106]
        };
        Object.entries(expected).forEach(([pieceId, values]) => SIZE_CODES.forEach((size, index) => Tests.equal(graded.pieces[pieceId][size].castOnSts, values[index], `${pieceId} ${size}`)));
      });
      Tests.test("Golden fixture produces all shaping zones without conflicts", () => {
        const project = Defaults.createProject(); Store.state = project;
        const graded = Engine.grade(project);
        Tests.equal(graded.errors.length, 0);
        Tests.equal(graded.pieces.front.M.shapingInstructions.length, 3);
        Tests.equal(graded.pieces.sleeve.M.shapingInstructions[0].zone, "sleeve_increase");
      });
    },
    runBrowser() {
      Tests.define();
      const results = Tests.cases.map(test => {
        try { test.callback(); return { name: test.name, passed: true }; }
        catch (error) { return { name: test.name, passed: false, error: error.message }; }
      });
      const passed = results.filter(result => result.passed).length;
      document.body.innerHTML = `<main class="test-runner"><p class="eyebrow">Dependency-free diagnostics</p><h1>Gulsen test harness</h1><p><strong>${passed}/${results.length}</strong> tests passed.</p><ol>${results.map(result => `<li class="${result.passed ? "test-pass" : "test-fail"}"><strong>${result.passed ? "PASS" : "FAIL"}</strong> — ${Utils.escape(result.name)}${result.error ? `<br><code>${Utils.escape(result.error)}</code>` : ""}</li>`).join("")}</ol><p><a href="${location.pathname}">Return to the application</a></p></main>`;
      console.table(results);
      document.title = `${passed === results.length ? "PASS" : "FAIL"} · Gulsen tests`;
      return results;
    }
  };

  function init() {
    Store.state = Store.load();
    if (location.hash === "#tests") { Tests.runBrowser(); return; }
    Render.all();
    Events.bind();
    if (Store.storageError) Render.errorSummary([{ message: "Saved data could not be loaded; the demo project was restored." }]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());

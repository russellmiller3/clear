const DEFAULT_SATURATION_RATE = 0.9;
const DEFAULT_MIN_TRIALS_PER_ARM = 10;
const DEFAULT_MIN_SATURATION_TRIALS = 3;
const DEFAULT_MIN_AVG_TRIAL_MS = 10_000;
const DEFAULT_ALPHA = 0.05;

function emptyArm() {
  return {
    trials: 0,
    passes: 0,
    timedOut: 0,
    elapsedMsTotal: 0,
    passRate: 0,
    avgElapsedMs: 0,
  };
}

function finalizeArm(arm) {
  arm.passRate = arm.trials > 0 ? arm.passes / arm.trials : 0;
  arm.avgElapsedMs = arm.trials > 0 ? arm.elapsedMsTotal / arm.trials : 0;
  return arm;
}

function cloneBucket(bucket) {
  const on = finalizeArm({ ...emptyArm(), ...(bucket?.hint_on || {}) });
  const off = finalizeArm({ ...emptyArm(), ...(bucket?.hint_off || {}) });
  return {
    hint_on: on,
    hint_off: off,
    lift: on.passRate - off.passRate,
  };
}

function addArm(target, source) {
  target.trials += source.trials || 0;
  target.passes += source.passes || 0;
  target.timedOut += source.timedOut || 0;
  target.elapsedMsTotal += source.elapsedMsTotal || ((source.avgElapsedMs || 0) * (source.trials || 0));
}

function totalTrialsFromSummary(summary = {}) {
  let total = 0;
  for (const bucket of Object.values(summary || {})) {
    total += (bucket?.hint_on?.trials || 0) + (bucket?.hint_off?.trials || 0);
  }
  return total;
}

export function summarizeTaskBuckets(trials = []) {
  const byTask = {};
  for (const row of trials || []) {
    const taskId = row?.taskId || row?.task || 'unknown';
    const condition = row?.condition;
    if (condition !== 'hint_on' && condition !== 'hint_off') continue;
    if (!byTask[taskId]) byTask[taskId] = { hint_on: emptyArm(), hint_off: emptyArm(), lift: 0 };
    const arm = byTask[taskId][condition];
    arm.trials += 1;
    if (row.ok) arm.passes += 1;
    if (row.timedOut) arm.timedOut += 1;
    arm.elapsedMsTotal += Number.isFinite(row.elapsedMs) ? row.elapsedMs : 0;
  }
  for (const taskId of Object.keys(byTask)) {
    finalizeArm(byTask[taskId].hint_on);
    finalizeArm(byTask[taskId].hint_off);
    byTask[taskId].lift = byTask[taskId].hint_on.passRate - byTask[taskId].hint_off.passRate;
  }
  return byTask;
}

export function classifySweepArtifact(artifact, {
  minAvgTrialMs = DEFAULT_MIN_AVG_TRIAL_MS,
} = {}) {
  const summary = artifact?.summary || summarizeTaskBuckets(artifact?.trials || []);
  const totalTrials = Array.isArray(artifact?.trials) && artifact.trials.length > 0
    ? artifact.trials.length
    : totalTrialsFromSummary(summary);
  if (totalTrials === 0) {
    return { status: 'invalid', reason: 'empty', totalTrials };
  }

  const elapsedValues = Array.isArray(artifact?.trials)
    ? artifact.trials.map(t => t.elapsedMs).filter(Number.isFinite)
    : [];
  const avgTrialMs = elapsedValues.length > 0
    ? elapsedValues.reduce((sum, n) => sum + n, 0) / elapsedValues.length
    : (Number.isFinite(artifact?.elapsedMs) ? artifact.elapsedMs / totalTrials : null);
  if (avgTrialMs !== null && avgTrialMs < minAvgTrialMs) {
    return { status: 'invalid', reason: 'suspicious_fast', totalTrials, avgTrialMs };
  }

  return { status: 'valid', reason: 'ok', totalTrials, avgTrialMs };
}

function logChoose(n, k) {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  const m = Math.min(k, n - k);
  let out = 0;
  for (let i = 1; i <= m; i++) {
    out += Math.log(n - m + i) - Math.log(i);
  }
  return out;
}

function hypergeometricProbability({ successes, draws, populationSuccesses, populationSize }) {
  const logP =
    logChoose(populationSuccesses, successes) +
    logChoose(populationSize - populationSuccesses, draws - successes) -
    logChoose(populationSize, draws);
  return Math.exp(logP);
}

export function fisherExactTwoSided({ onPasses, onTrials, offPasses, offTrials }) {
  const rowDraws = onTrials;
  const populationSize = onTrials + offTrials;
  const populationSuccesses = onPasses + offPasses;
  const observed = hypergeometricProbability({
    successes: onPasses,
    draws: rowDraws,
    populationSuccesses,
    populationSize,
  });

  const min = Math.max(0, rowDraws - (populationSize - populationSuccesses));
  const max = Math.min(rowDraws, populationSuccesses);
  let pValue = 0;
  for (let successes = min; successes <= max; successes++) {
    const p = hypergeometricProbability({
      successes,
      draws: rowDraws,
      populationSuccesses,
      populationSize,
    });
    if (p <= observed + 1e-12) pValue += p;
  }
  return Math.min(1, pValue);
}

function diffConfidenceInterval({ onPasses, onTrials, offPasses, offTrials, z = 1.96 }) {
  if (onTrials === 0 || offTrials === 0) return { low: null, high: null };
  const p1 = onPasses / onTrials;
  const p2 = offPasses / offTrials;
  const diff = p1 - p2;
  const stderr = Math.sqrt((p1 * (1 - p1)) / onTrials + (p2 * (1 - p2)) / offTrials);
  return {
    low: Math.max(-1, diff - z * stderr),
    high: Math.min(1, diff + z * stderr),
  };
}

function isSaturatedTask(bucket, {
  saturationRate = DEFAULT_SATURATION_RATE,
  minSaturationTrials = DEFAULT_MIN_SATURATION_TRIALS,
} = {}) {
  const on = bucket.hint_on;
  const off = bucket.hint_off;
  return on.trials >= minSaturationTrials &&
    off.trials >= minSaturationTrials &&
    on.passRate >= saturationRate &&
    off.passRate >= saturationRate;
}

function taskSummary(taskId, bucket, saturated) {
  return {
    taskId,
    saturated,
    hint_on: bucket.hint_on,
    hint_off: bucket.hint_off,
    lift: bucket.lift,
  };
}

export function analyzeHintArtifacts(artifacts = [], {
  minTrialsPerArm = DEFAULT_MIN_TRIALS_PER_ARM,
  alpha = DEFAULT_ALPHA,
  saturationRate = DEFAULT_SATURATION_RATE,
  minSaturationTrials = DEFAULT_MIN_SATURATION_TRIALS,
} = {}) {
  const artifactReport = { valid: [], invalid: [] };
  const merged = {};

  for (const artifact of artifacts) {
    const classification = classifySweepArtifact(artifact);
    const entry = {
      path: artifact?.path || null,
      startedAt: artifact?.startedAt || null,
      ...classification,
    };
    artifactReport[classification.status === 'valid' ? 'valid' : 'invalid'].push(entry);
    if (classification.status !== 'valid') continue;

    const summary = artifact.summary || summarizeTaskBuckets(artifact.trials || []);
    for (const [taskId, rawBucket] of Object.entries(summary)) {
      const bucket = cloneBucket(rawBucket);
      if (!merged[taskId]) merged[taskId] = { hint_on: emptyArm(), hint_off: emptyArm(), lift: 0 };
      addArm(merged[taskId].hint_on, bucket.hint_on);
      addArm(merged[taskId].hint_off, bucket.hint_off);
    }
  }

  const includedTasks = [];
  const saturatedTasks = [];
  const headlineOn = emptyArm();
  const headlineOff = emptyArm();

  for (const [taskId, bucket] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
    finalizeArm(bucket.hint_on);
    finalizeArm(bucket.hint_off);
    bucket.lift = bucket.hint_on.passRate - bucket.hint_off.passRate;
    const saturated = isSaturatedTask(bucket, { saturationRate, minSaturationTrials });
    const summary = taskSummary(taskId, bucket, saturated);
    if (saturated) {
      saturatedTasks.push(summary);
    } else {
      includedTasks.push(summary);
      addArm(headlineOn, bucket.hint_on);
      addArm(headlineOff, bucket.hint_off);
    }
  }

  finalizeArm(headlineOn);
  finalizeArm(headlineOff);
  const lift = headlineOn.passRate - headlineOff.passRate;
  const pValue = headlineOn.trials > 0 && headlineOff.trials > 0
    ? fisherExactTwoSided({
        onPasses: headlineOn.passes,
        onTrials: headlineOn.trials,
        offPasses: headlineOff.passes,
        offTrials: headlineOff.trials,
      })
    : null;
  const confidenceInterval = headlineOn.trials > 0 && headlineOff.trials > 0
    ? diffConfidenceInterval({
        onPasses: headlineOn.passes,
        onTrials: headlineOn.trials,
        offPasses: headlineOff.passes,
        offTrials: headlineOff.trials,
      })
    : { low: null, high: null };

  let verdict = 'underpowered';
  if (headlineOn.trials >= minTrialsPerArm && headlineOff.trials >= minTrialsPerArm && includedTasks.length > 0) {
    if (pValue < alpha && confidenceInterval.low > 0) verdict = 'significant_positive';
    else if (pValue < alpha && confidenceInterval.high < 0) verdict = 'significant_negative';
    else verdict = 'inconclusive';
  }

  return {
    headline: {
      includedTasks,
      hintOn: headlineOn,
      hintOff: headlineOff,
      lift,
      pValue,
      confidenceInterval,
      verdict,
      requiredTrialsPerArm: minTrialsPerArm,
    },
    appendix: {
      saturatedTasks,
    },
    artifacts: artifactReport,
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function pValueText(value) {
  return value === null ? 'n/a' : value.toFixed(4);
}

function ciText(ci) {
  if (ci.low === null || ci.high === null) return 'n/a';
  return `[${pct(ci.low)}, ${pct(ci.high)}]`;
}

export function formatHintEffectReport(report) {
  const lines = [];
  const h = report.headline;
  lines.push('# Hint Effect Report');
  lines.push('');
  lines.push(`Verdict: **${h.verdict}**`);
  lines.push(`Headline tasks: **${h.includedTasks.length}**`);
  lines.push(`Saturated appendix tasks: **${report.appendix.saturatedTasks.length}**`);
  lines.push(`Hint on: **${h.hintOn.passes}/${h.hintOn.trials}** (${pct(h.hintOn.passRate)})`);
  lines.push(`Hint off: **${h.hintOff.passes}/${h.hintOff.trials}** (${pct(h.hintOff.passRate)})`);
  lines.push(`Lift: **${pct(h.lift)}**`);
  lines.push(`p-value: **${pValueText(h.pValue)}**`);
  lines.push(`95% CI: **${ciText(h.confidenceInterval)}**`);
  lines.push('');
  lines.push('## Included Hard Tasks');
  lines.push('');
  lines.push('| task | hint_on | hint_off | lift |');
  lines.push('|---|---:|---:|---:|');
  for (const task of h.includedTasks) {
    lines.push(`| ${task.taskId} | ${task.hint_on.passes}/${task.hint_on.trials} | ${task.hint_off.passes}/${task.hint_off.trials} | ${pct(task.lift)} |`);
  }
  if (h.includedTasks.length === 0) lines.push('| - | - | - | - |');
  lines.push('');
  lines.push('## Saturated Appendix');
  lines.push('');
  lines.push('| task | hint_on | hint_off | lift |');
  lines.push('|---|---:|---:|---:|');
  for (const task of report.appendix.saturatedTasks) {
    lines.push(`| ${task.taskId} | ${task.hint_on.passes}/${task.hint_on.trials} | ${task.hint_off.passes}/${task.hint_off.trials} | ${pct(task.lift)} |`);
  }
  if (report.appendix.saturatedTasks.length === 0) lines.push('| - | - | - | - |');
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- Valid: **${report.artifacts.valid.length}**`);
  lines.push(`- Invalid: **${report.artifacts.invalid.length}**`);
  for (const invalid of report.artifacts.invalid) {
    lines.push(`- Excluded ${invalid.path || '(unknown)'}: ${invalid.reason}`);
  }
  return lines.join('\n');
}

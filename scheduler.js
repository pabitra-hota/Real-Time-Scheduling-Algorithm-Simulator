(function () {
  'use strict';

  // ─── Task Colors ───
  const TASK_COLORS = [
    '#00e5ff', '#ffab00', '#aa66ff',
    '#00e676', '#ff5c8a', '#ff8a50'
  ];

  // ─────────────────────────────────────────────
  // --- TASK MANAGER ---
  // ─────────────────────────────────────────────
  const TaskManager = (() => {
    let tasks = [];

    function add(name, wcet, period) {
      if (tasks.length >= 6) return false;
      tasks.push({ name, wcet, period, color: TASK_COLORS[tasks.length] });
      return true;
    }

    function remove(index) {
      tasks.splice(index, 1);
      tasks.forEach((t, i) => t.color = TASK_COLORS[i]);
    }

    function clear() { tasks = []; }
    function getAll() { return tasks.slice(); }
    function count() { return tasks.length; }

    return { add, remove, clear, getAll, count };
  })();

  // ─────────────────────────────────────────────
  // --- MATH HELPERS ---
  // ─────────────────────────────────────────────
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function lcm(a, b) { return (a / gcd(a, b)) * b; }
  function lcmArray(arr) { return arr.reduce((a, b) => lcm(a, b)); }

  // ─────────────────────────────────────────────
  // --- BUG FIX #1: HARMONIC CHECK (from Python reference)
  // Python code: `if T[i] % T[0] == 0` for all i → count == len(T)
  // If all periods are multiples of the shortest period, RM is always
  // schedulable regardless of utilization factor.
  // The original JS code was MISSING this check entirely.
  // ─────────────────────────────────────────────
  function isHarmonicTaskSet(tasks) {
    const minPeriod = Math.min(...tasks.map(t => t.period));
    return tasks.every(t => t.period % minPeriod === 0);
  }

  // ─────────────────────────────────────────────
  // --- BUG FIX #2: EXACT SCHEDULABILITY TEST (from flowchart)
  // The flowchart shows: if Liu-Layland bound FAILS →
  // "Perform exact schedulability test" → if True → simulate, else error.
  // The original JS code was MISSING this entire stage.
  //
  // This implements Response Time Analysis (RTA) — the standard exact test:
  //   R_i = C_i + Σ ceil(R_i / T_j) * C_j   for all j with higher priority
  // Iterate until R_i converges. If R_i > T_i (period) → NOT schedulable.
  // Reference: Audsley et al. 1993, Liu & Layland 1973.
  // ─────────────────────────────────────────────
  function rmResponseTimeAnalysis(tasks) {
    // Sort by period ascending = highest priority first (RM rule)
    const sorted = [...tasks].sort(
      (a, b) => a.period - b.period || tasks.indexOf(a) - tasks.indexOf(b)
    );

    for (let i = 0; i < sorted.length; i++) {
      let R = sorted[i].wcet;  // Initial estimate = own WCET
      let prevR;

      do {
        prevR = R;
        let interference = 0;
        // Sum blocking from all higher-priority tasks (j < i in sorted order)
        for (let j = 0; j < i; j++) {
          interference += Math.ceil(prevR / sorted[j].period) * sorted[j].wcet;
        }
        R = sorted[i].wcet + interference;

        // Early exit: response time already exceeds this task's period (deadline)
        if (R > sorted[i].period) {
          return { schedulable: false, failedTask: sorted[i].name };
        }
      } while (R !== prevR);  // Iterate until fixed point
    }

    return { schedulable: true, failedTask: null };
  }

  // ─────────────────────────────────────────────
  // --- RM SCHEDULER ---
  // BUG FIX #3: Stable priority tie-breaking by original task index.
  //
  // Old code used `j.releaseTime < best.releaseTime` as the ONLY tie-breaker.
  // Problem: when two DIFFERENT tasks have the same period (same RM rank),
  // this could pick the wrong task if their release times happened to differ.
  // Fix: primary tie-break by taskIdx (lower idx = higher priority, matching
  // Python dict insertion order). Release-time tie-break kept for same-task
  // multiple jobs (i.e., old job still running when new instance is released).
  // ─────────────────────────────────────────────
  function simulateRM(tasks, hyperperiod) {
    // Sort by period ascending, ties broken by original index (stable)
    const sorted = tasks
      .map((t, i) => ({ ...t, origIndex: i }))
      .sort((a, b) => a.period - b.period || a.origIndex - b.origIndex);

    const priorityRank = {};
    sorted.forEach((t, rank) => { priorityRank[t.origIndex] = rank; });

    let jobs = [];
    const log = [];
    const schedule = [];
    let preemptions = 0;
    const missedDeadlines = [];

    for (let t = 0; t < hyperperiod; t++) {

      // Step 1: Release new job instances at period boundaries
      tasks.forEach((task, idx) => {
        if (t % task.period === 0) {
          jobs.push({
            taskIdx:     idx,
            releaseTime: t,
            deadline:    t + task.period,
            remaining:   task.wcet
          });
        }
      });

      // Step 2: Detect missed deadlines — jobs whose deadline == t with remaining work
      jobs = jobs.filter(j => {
        if (j.deadline === t && j.remaining > 0) {
          missedDeadlines.push({ taskIdx: j.taskIdx, time: t });
          return false;
        }
        return true;
      });

      // Step 3: Remove jobs completed in the previous tick (remaining == 0)
      jobs = jobs.filter(j => j.remaining > 0);

      // Step 4: Select highest-priority ready job (RM = shortest original period)
      // Tie-break order:
      //   1. priorityRank (lower = higher RM priority)
      //   2. taskIdx (lower original index = higher priority among equal-period tasks)
      //   3. releaseTime (older job of the SAME task runs first — sooner deadline)
      let best = null;
      for (const j of jobs) {
        if (!best) {
          best = j;
        } else {
          const rJ = priorityRank[j.taskIdx];
          const rB = priorityRank[best.taskIdx];
          if (
            rJ < rB ||
            (rJ === rB && j.taskIdx  < best.taskIdx) ||
            (rJ === rB && j.taskIdx === best.taskIdx && j.releaseTime < best.releaseTime)
          ) {
            best = j;
          }
        }
      }

      // Step 5: Detect preemption
      const prevRunning = t > 0 ? schedule[t - 1] : -1;
      let preempted = false;
      if (best && t > 0 && prevRunning !== -1 && prevRunning !== best.taskIdx) {
        if (jobs.some(j => j.taskIdx === prevRunning)) {
          preempted = true;
          preemptions++;
        }
      }

      // Step 6: Execute — decrement remaining WCET of selected job
      if (best) {
        best.remaining--;
        schedule.push(best.taskIdx);
      } else {
        schedule.push(-1);  // CPU idle
      }

      // Step 7: Build waiting queue for the execution log
      const queue = jobs
        .filter(j => j !== best && j.remaining > 0)
        .map(j => tasks[j.taskIdx].name);

      log.push({
        time:       t,
        running:    best ? tasks[best.taskIdx].name : 'Idle',
        runningIdx: best ? best.taskIdx : -1,
        queue,
        preempted,
        missed: missedDeadlines.filter(m => m.time === t).map(m => tasks[m.taskIdx].name)
      });
    }

    // Final deadline check at the hyperperiod boundary
    jobs.forEach(j => {
      if (j.deadline <= hyperperiod && j.remaining > 0) {
        missedDeadlines.push({ taskIdx: j.taskIdx, time: hyperperiod });
      }
    });

    return { schedule, log, preemptions, missedDeadlines, priorityRank };
  }

  // ─────────────────────────────────────────────
  // --- EDF SCHEDULER ---
  // Earliest Deadline First: dynamic priority = nearest absolute deadline
  // ─────────────────────────────────────────────
  function simulateEDF(tasks, hyperperiod) {
    let jobs = [];
    const log = [];
    const schedule = [];
    let preemptions = 0;
    const missedDeadlines = [];

    for (let t = 0; t < hyperperiod; t++) {
      tasks.forEach((task, idx) => {
        if (t % task.period === 0) {
          jobs.push({
            taskIdx:     idx,
            releaseTime: t,
            deadline:    t + task.period,
            remaining:   task.wcet
          });
        }
      });

      jobs = jobs.filter(j => {
        if (j.deadline === t && j.remaining > 0) {
          missedDeadlines.push({ taskIdx: j.taskIdx, time: t });
          return false;
        }
        return true;
      });

      jobs = jobs.filter(j => j.remaining > 0);

      // EDF: pick job with earliest absolute deadline; ties by lower task index
      let best = null;
      for (const j of jobs) {
        if (!best ||
          j.deadline < best.deadline ||
          (j.deadline === best.deadline && j.taskIdx < best.taskIdx)) {
          best = j;
        }
      }

      const prevRunning = t > 0 ? schedule[t - 1] : -1;
      let preempted = false;
      if (best && t > 0 && prevRunning !== -1 && prevRunning !== best.taskIdx) {
        if (jobs.some(j => j.taskIdx === prevRunning)) {
          preempted = true;
          preemptions++;
        }
      }

      if (best) {
        best.remaining--;
        schedule.push(best.taskIdx);
      } else {
        schedule.push(-1);
      }

      const queue = jobs
        .filter(j => j !== best && j.remaining > 0)
        .map(j => tasks[j.taskIdx].name);

      log.push({
        time:       t,
        running:    best ? tasks[best.taskIdx].name : 'Idle',
        runningIdx: best ? best.taskIdx : -1,
        queue,
        preempted,
        missed: missedDeadlines.filter(m => m.time === t).map(m => tasks[m.taskIdx].name)
      });
    }

    jobs.forEach(j => {
      if (j.deadline <= hyperperiod && j.remaining > 0) {
        missedDeadlines.push({ taskIdx: j.taskIdx, time: hyperperiod });
      }
    });

    return { schedule, log, preemptions, missedDeadlines };
  }

  // ─────────────────────────────────────────────
  // --- STATS CALCULATOR ---
  // Now implements the FULL 3-stage schedulability check matching the flowchart:
  //   Stage 1 → Liu-Layland sufficient bound: U <= n(2^(1/n) - 1)
  //   Stage 2 → Harmonic check (from Python):  all Ti % Tmin == 0
  //   Stage 3 → Exact Response Time Analysis (RTA) — flowchart "exact test"
  // ─────────────────────────────────────────────
  function computeStats(tasks, simResult, algorithm) {
    const n = tasks.length;
    const utilization = tasks.reduce((s, t) => s + t.wcet / t.period, 0);
    const rmBound = n * (Math.pow(2, 1 / n) - 1);

    let schedulableByTest = false;
    let schedulabilityMethod = '';
    let rtaResult = null;

    if (algorithm === 'RM') {
      if (utilization <= rmBound) {
        // Stage 1: Liu & Layland sufficient condition passes
        schedulableByTest = true;
        schedulabilityMethod = 'Liu-Layland';
      } else if (isHarmonicTaskSet(tasks)) {
        // Stage 2: Harmonic tasks → always schedulable under RM
        schedulableByTest = true;
        schedulabilityMethod = 'Harmonic';
      } else {
        // Stage 3: Exact Response Time Analysis (matches flowchart "exact schedulability test")
        rtaResult = rmResponseTimeAnalysis(tasks);
        schedulableByTest = rtaResult.schedulable;
        schedulabilityMethod = 'RTA';
      }
    } else {
      // EDF: schedulable iff U <= 1.0 (necessary AND sufficient for implicit-deadline tasks)
      schedulableByTest = utilization <= 1.0;
      schedulabilityMethod = 'EDF';
    }

    return {
      totalTasks: n,
      preemptions: simResult.preemptions,
      missedDeadlines: simResult.missedDeadlines,
      utilization,
      rmBound,
      schedulableByTest,
      schedulabilityMethod,
      rtaResult,
      noMisses: simResult.missedDeadlines.length === 0
    };
  }

  // ─────────────────────────────────────────────
  // --- SIMULATION RUNNER ---
  // BUG FIX #4: stepForward() was calling finish() TWICE.
  //
  // Old code had two paths that could both call finish():
  //   Path A — top of stepForward() if currentStep >= hyperperiod
  //   Path B — bottom of stepForward() after incrementing currentStep
  // This meant deadline markers were appended to Gantt cells twice,
  // causing DOUBLED visual markers on screen (the main visible glitch).
  //
  // Fix: Guard at the top returns false WITHOUT calling finish().
  // finish() is now called in EXACTLY ONE PLACE: after the last step.
  // ─────────────────────────────────────────────
  const SimRunner = (() => {
    let simResult   = null;
    let tasks       = [];
    let hyperperiod = 0;
    let currentStep = 0;
    let animTimer   = null;
    let isRunning   = false;
    let isPaused    = false;

    function prepare() {
      tasks = TaskManager.getAll();
      if (tasks.length === 0) return false;

      hyperperiod = lcmArray(tasks.map(t => t.period));
      if (hyperperiod > 500) {
        alert('Hyperperiod (' + hyperperiod + ') is too large. Please use smaller periods (LCM ≤ 500).');
        return false;
      }

      const algo = UIController.getAlgorithm();
      simResult = algo === 'RM'
        ? simulateRM(tasks, hyperperiod)
        : simulateEDF(tasks, hyperperiod);

      currentStep = 0;
      isRunning   = false;
      isPaused    = false;

      GanttRenderer.init(tasks, hyperperiod);
      LogRenderer.clear();
      StatsRenderer.hide();
      UIController.updateHyperperiodBadge(hyperperiod);

      return true;
    }

    function stepForward() {
      // FIXED: If already done, simply return false — do NOT re-call finish()
      if (!simResult || currentStep >= hyperperiod) return false;

      const entry   = simResult.log[currentStep];
      const taskIdx = simResult.schedule[currentStep];

      GanttRenderer.fillStep(currentStep, taskIdx, tasks);
      LogRenderer.addEntry(entry);   // FIXED: removed the always-true `currentStep === currentStep` argument
      currentStep++;

      if (currentStep >= hyperperiod) {
        finish();   // Called EXACTLY ONCE — only here
        return false;
      }
      return true;
    }

    function run() {
      if (!simResult) { if (!prepare()) return; }
      if (currentStep >= hyperperiod) return; // Already finished

      isRunning = true;
      isPaused  = false;
      UIController.setRunningState(true);

      function tick() {
        if (!isRunning || isPaused) return;
        const more = stepForward();
        if (more) {
          animTimer = setTimeout(tick, UIController.getSpeed());
        }
      }
      tick();
    }

    function pause() {
      isPaused  = true;
      isRunning = false;
      clearTimeout(animTimer);
      UIController.setPausedState();
    }

    function reset() {
      clearTimeout(animTimer);
      simResult   = null;
      currentStep = 0;
      isRunning   = false;
      isPaused    = false;
      GanttRenderer.clear();
      LogRenderer.clear();
      StatsRenderer.hide();
      UIController.setResetState();
      UIController.updateHyperperiodBadge(0);
    }

    function finish() {
      isRunning = false;
      clearTimeout(animTimer);
      const stats = computeStats(tasks, simResult, UIController.getAlgorithm());
      StatsRenderer.show(stats, tasks);
      UIController.setFinishedState();
      // Deadline markers rendered ONCE here, after Gantt is fully drawn
      GanttRenderer.renderDeadlineMarkers(tasks, hyperperiod, simResult.missedDeadlines);
    }

    function doSingleStep() {
      if (!simResult) { if (!prepare()) return; }
      isPaused  = true;
      isRunning = false;
      UIController.setSteppingState();
      stepForward();
    }

    return { prepare, run, pause, reset, doSingleStep };
  })();

  // ─────────────────────────────────────────────
  // --- GANTT RENDERER ---
  // ─────────────────────────────────────────────
  const GanttRenderer = (() => {
    const container  = document.getElementById('gantt-chart');
    const emptyState = document.getElementById('gantt-empty');
    let cellMap = {};

    function init(tasks, hyperperiod) {
      container.innerHTML = '';
      cellMap = {};

      tasks.forEach((task, idx) => {
        cellMap[idx] = {};
        const row = document.createElement('div');
        row.className = 'gantt-row';

        const label = document.createElement('div');
        label.className = 'gantt-label';
        label.innerHTML = `<span class="task-color-dot" style="background:${task.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;"></span>${task.name}`;
        row.appendChild(label);

        const track = document.createElement('div');
        track.className = 'gantt-track';

        for (let t = 0; t < hyperperiod; t++) {
          const cell = document.createElement('div');
          cell.className = 'gantt-cell';
          cell.style.background = 'transparent';
          cell.title = `${task.name} @ t=${t}`;
          track.appendChild(cell);
          cellMap[idx][t] = cell;
        }

        row.appendChild(track);
        container.appendChild(row);
      });

      // Time axis
      const axis = document.createElement('div');
      axis.className = 'gantt-time-axis';
      for (let t = 0; t < hyperperiod; t++) {
        const lbl = document.createElement('div');
        lbl.className = 'gantt-time-label';
        lbl.textContent = t;
        axis.appendChild(lbl);
      }
      container.appendChild(axis);
    }

    function fillStep(timeStep, taskIdx, tasks) {
      if (taskIdx === -1) return;
      const cell = cellMap[taskIdx] && cellMap[taskIdx][timeStep];
      if (!cell) return;
      cell.style.background = tasks[taskIdx].color;
      cell.style.boxShadow  = `0 0 8px ${tasks[taskIdx].color}44, inset 0 0 6px rgba(255,255,255,0.1)`;
      cell.classList.add('filled', 'active-anim');
    }

    // FIXED: Removed the unused `markerTime` variable (was dead code)
    function renderDeadlineMarkers(tasks, hyperperiod, missedDeadlines) {
      tasks.forEach((task, idx) => {
        for (let d = task.period; d <= hyperperiod; d += task.period) {
          if (d < hyperperiod && cellMap[idx][d]) {
            const cell   = cellMap[idx][d];
            const marker = document.createElement('div');
            marker.className       = 'deadline-marker';
            marker.style.borderColor = task.color;
            marker.style.left      = '-1px';
            cell.style.position    = 'relative';
            cell.appendChild(marker);
          } else if (d === hyperperiod && cellMap[idx][d - 1]) {
            const cell   = cellMap[idx][d - 1];
            const marker = document.createElement('div');
            marker.className       = 'deadline-marker';
            marker.style.borderColor = task.color;
            marker.style.right     = '-1px';
            marker.style.left      = 'auto';
            cell.style.position    = 'relative';
            cell.appendChild(marker);
          }
        }
      });

      // Missed deadline ❌ markers
      missedDeadlines.forEach(m => {
        const t        = m.time;
        const tIdx     = m.taskIdx;
        const cellTime = t < hyperperiod ? t : t - 1;
        if (cellMap[tIdx] && cellMap[tIdx][cellTime]) {
          const cell   = cellMap[tIdx][cellTime];
          cell.style.position = 'relative';
          const xMark  = document.createElement('div');
          xMark.className    = 'missed-marker';
          xMark.textContent  = '❌';
          xMark.style.right  = '-4px';
          cell.appendChild(xMark);
        }
      });
    }

    function clear() {
      container.innerHTML = '';
      container.appendChild(emptyState);
      cellMap = {};
    }

    clear();
    return { init, fillStep, renderDeadlineMarkers, clear };
  })();

  // ─────────────────────────────────────────────
  // --- LOG RENDERER ---
  // ─────────────────────────────────────────────
  const LogRenderer = (() => {
    const logEl   = document.getElementById('exec-log');
    const emptyEl = document.getElementById('log-empty');
    const badge   = document.getElementById('log-count-badge');
    let entryCount = 0;

    function addEntry(entry) {
      if (entryCount === 0) emptyEl.style.display = 'none';

      const prev = logEl.querySelector('.log-entry.highlight');
      if (prev) prev.classList.remove('highlight');

      const div      = document.createElement('div');
      div.className  = 'log-entry highlight';

      const timeSpan = document.createElement('span');
      timeSpan.className   = 'log-time';
      timeSpan.textContent = `[t=${entry.time}]`;

      const detail = document.createElement('span');
      detail.className = 'log-detail';

      const runHtml = entry.running === 'Idle'
        ? `<span class="idle-text">Idle</span>`
        : `<span class="running">${entry.running}</span>`;

      const parts = [`Running: ${runHtml}`];

      if (entry.queue.length > 0) {
        parts.push(`Queue: <span class="waiting">${entry.queue.join(', ')}</span>`);
      }
      if (entry.preempted) {
        parts.push(`<span class="preempted">⚡ Preemption</span>`);
      }
      if (entry.missed.length > 0) {
        parts.push(`<span class="missed">❌ Missed: ${entry.missed.join(', ')}</span>`);
      }

      detail.innerHTML = parts.join(' │ ');
      div.appendChild(timeSpan);
      div.appendChild(detail);
      logEl.appendChild(div);
      entryCount++;
      badge.textContent = `${entryCount} steps`;
      logEl.scrollTop   = logEl.scrollHeight;
    }

    function clear() {
      logEl.innerHTML = '';
      logEl.appendChild(emptyEl);
      emptyEl.style.display = '';
      entryCount = 0;
      badge.textContent = '';
    }

    return { addEntry, clear };
  })();

  // ─────────────────────────────────────────────
  // --- STATS RENDERER ---
  // Updated: shows which schedulability test was applied (Liu-Layland / Harmonic / RTA)
  // ─────────────────────────────────────────────
  const StatsRenderer = (() => {
    const panel = document.getElementById('stats-panel');
    const grid  = document.getElementById('stats-grid');

    function show(stats, tasks) {
      grid.innerHTML = '';

      const algo = UIController.getAlgorithm();

      // Determine the test label/value to display based on which stage was used
      let testLabel, testValue, testCls;
      if (algo === 'RM') {
        if (stats.schedulabilityMethod === 'Liu-Layland') {
          testLabel = 'RM Bound (Liu-Layland)';
          testValue = (stats.rmBound * 100).toFixed(1) + '%';
          testCls   = '';
        } else if (stats.schedulabilityMethod === 'Harmonic') {
          testLabel = 'Harmonic Check';
          testValue = '✓ Periods harmonic';
          testCls   = 'pass';
        } else {
          testLabel = 'RTA Exact Test';
          testValue = stats.schedulableByTest ? '✓ PASS' : '✗ FAIL';
          testCls   = stats.schedulableByTest ? 'pass' : 'fail';
        }
      } else {
        testLabel = 'EDF Bound';
        testValue = '100.0%';
        testCls   = '';
      }

      const items = [
        { label: 'Total Tasks',      value: stats.totalTasks,                          cls: '' },
        { label: 'Preemptions',      value: stats.preemptions,                         cls: '' },
        {
          label: 'Missed Deadlines',
          value: stats.missedDeadlines.length,
          cls:   stats.missedDeadlines.length > 0 ? 'fail' : 'pass'
        },
        {
          label: 'CPU Utilization',
          value: (stats.utilization * 100).toFixed(1) + '%',
          cls:   stats.utilization > 1 ? 'fail' : ''
        },
        { label: testLabel, value: testValue, cls: testCls },
        {
          label:     'Schedulability',
          value:     '',
          cls:       stats.noMisses ? 'pass' : 'fail',
          badge:     true,
          badgeText: stats.noMisses ? '✅ PASS' : '❌ FAIL',
          badgeCls:  stats.noMisses ? 'badge-pass' : 'badge-fail'
        }
      ];

      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stat-item ' + item.cls;

        div.innerHTML = item.badge
          ? `<div class="stat-value"><span class="badge ${item.badgeCls}">${item.badgeText}</span></div>
             <div class="stat-label">${item.label}</div>`
          : `<div class="stat-value">${item.value}</div>
             <div class="stat-label">${item.label}</div>`;

        grid.appendChild(div);
      });

      // Missed deadline detail row
      if (stats.missedDeadlines.length > 0) {
        const missedDiv = document.createElement('div');
        missedDiv.className         = 'stat-item fail';
        missedDiv.style.gridColumn  = '1 / -1';
        missedDiv.innerHTML = `
          <div class="stat-value" style="font-size:0.9rem;">
            ${stats.missedDeadlines.map(m => `${tasks[m.taskIdx].name}@t=${m.time}`).join(', ')}
          </div>
          <div class="stat-label">Missed Deadline Details</div>`;
        grid.appendChild(missedDiv);
      }

      // RTA note row (only when exact test was used)
      if (stats.schedulabilityMethod === 'RTA') {
        const noteDiv = document.createElement('div');
        noteDiv.className        = 'stat-item';
        noteDiv.style.gridColumn = '1 / -1';
        const note = stats.schedulableByTest
          ? 'Liu-Layland bound exceeded, but Response Time Analysis confirms schedulability.'
          : `RTA failed${stats.rtaResult && stats.rtaResult.failedTask
              ? ` — Task ${stats.rtaResult.failedTask} cannot meet its deadline.` : '.'}`;
        noteDiv.innerHTML = `
          <div class="stat-value" style="font-size:0.72rem;color:var(--text-secondary);">${note}</div>
          <div class="stat-label">RTA Analysis Note</div>`;
        grid.appendChild(noteDiv);
      }

      panel.classList.add('visible');
    }

    function hide() {
      panel.classList.remove('visible');
    }

    return { show, hide };
  })();

  // ─────────────────────────────────────────────
  // --- UI CONTROLLER ---
  // ─────────────────────────────────────────────
  const UIController = (() => {
    let algorithm = 'RM';

    const btnRM          = document.getElementById('btn-rm');
    const btnEDF         = document.getElementById('btn-edf');
    const algoDesc       = document.getElementById('algo-description');
    const inpName        = document.getElementById('inp-name');
    const inpWcet        = document.getElementById('inp-wcet');
    const inpPeriod      = document.getElementById('inp-period');
    const btnAdd         = document.getElementById('btn-add-task');
    const btnClear       = document.getElementById('btn-clear-tasks');
    const tableBody      = document.getElementById('task-table-body');
    const tableEmpty     = document.getElementById('task-table-empty');
    const taskCountBadge = document.getElementById('task-count-badge');
    const btnRun         = document.getElementById('btn-run');
    const btnPause       = document.getElementById('btn-pause');
    const btnStep        = document.getElementById('btn-step');
    const btnReset       = document.getElementById('btn-reset');
    const speedSlider    = document.getElementById('speed-slider');
    const speedVal       = document.getElementById('speed-val');
    const hpBadge        = document.getElementById('hyperperiod-badge');

    const ALGO_DESCRIPTIONS = {
      RM:  '<strong>Rate Monotonic (RM):</strong> Fixed-priority preemptive scheduling. Tasks with shorter periods receive higher priority. Optimal among all fixed-priority algorithms. Schedulable if U ≤ n(2<sup>1/n</sup>−1), or all periods are harmonic, or Response Time Analysis (RTA) passes.',
      EDF: '<strong>Earliest Deadline First (EDF):</strong> Dynamic-priority scheduling. At each time step, the task closest to its absolute deadline runs. Theoretically schedulable if U ≤ 1.0.'
    };

    function init() {
      btnRM.addEventListener('click',  () => setAlgorithm('RM'));
      btnEDF.addEventListener('click', () => setAlgorithm('EDF'));

      btnAdd.addEventListener('click', addTask);
      [inpName, inpWcet, inpPeriod].forEach(el => {
        el.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
      });

      btnClear.addEventListener('click', () => {
        TaskManager.clear();
        renderTable();
        SimRunner.reset();
      });

      btnRun.addEventListener('click',   () => SimRunner.run());
      btnPause.addEventListener('click', () => SimRunner.pause());
      btnStep.addEventListener('click',  () => SimRunner.doSingleStep());
      btnReset.addEventListener('click', () => SimRunner.reset());

      speedSlider.addEventListener('input', () => {
        speedVal.textContent = speedSlider.value + 'ms';
      });

      renderTable();
    }

    function setAlgorithm(algo) {
      algorithm = algo;
      btnRM.classList.toggle('active',  algo === 'RM');
      btnEDF.classList.toggle('active', algo === 'EDF');
      algoDesc.innerHTML = ALGO_DESCRIPTIONS[algo];
      SimRunner.reset();
    }

    function getAlgorithm() { return algorithm; }

    function addTask() {
      const name   = inpName.value.trim() || ('T' + (TaskManager.count() + 1));
      const wcet   = parseInt(inpWcet.value);
      const period = parseInt(inpPeriod.value);

      if (isNaN(wcet)   || wcet < 1)   { shakeInput(inpWcet);   return; }
      if (isNaN(period) || period < 1) { shakeInput(inpPeriod); return; }
      if (wcet > period) {
        shakeInput(inpWcet);
        shakeInput(inpPeriod);
        return;
      }

      if (!TaskManager.add(name, wcet, period)) {
        alert('Maximum 6 tasks allowed.');
        return;
      }

      inpName.value   = '';
      inpWcet.value   = '';
      inpPeriod.value = '';
      inpName.focus();

      renderTable();
      SimRunner.reset();
    }

    function shakeInput(el) {
      el.style.borderColor = 'var(--danger)';
      el.style.animation   = 'none';
      el.offsetHeight;
      el.style.animation   = '';
      setTimeout(() => { el.style.borderColor = ''; }, 1200);
    }

    function renderTable() {
      const tasks = TaskManager.getAll();
      taskCountBadge.textContent = `${tasks.length} / 6 tasks`;

      if (tasks.length === 0) {
        tableBody.innerHTML = '';
        tableEmpty.style.display = '';
        updateControlState();
        return;
      }

      tableEmpty.style.display = 'none';

      const sorted = tasks.map((t, i) => ({ ...t, origIdx: i })).sort((a, b) => a.period - b.period);
      const priorityMap = {};
      sorted.forEach((t, rank) => { priorityMap[t.origIdx] = rank + 1; });

      tableBody.innerHTML = tasks.map((t, i) => `
        <tr>
          <td><span class="task-color-dot" style="background:${t.color}"></span></td>
          <td>${t.name}</td>
          <td>${t.wcet}</td>
          <td>${t.period}</td>
          <td>${algorithm === 'RM' ? priorityMap[i] : '—'}</td>
          <td><button class="remove-btn" data-idx="${i}" title="Remove task">✕</button></td>
        </tr>
      `).join('');

      tableBody.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          TaskManager.remove(parseInt(btn.dataset.idx));
          renderTable();
          SimRunner.reset();
        });
      });

      updateControlState();
    }

    function updateControlState() {
      const hasTasks    = TaskManager.count() > 0;
      btnRun.disabled   = !hasTasks;
      btnStep.disabled  = !hasTasks;
      btnReset.disabled = false;
      btnPause.disabled = true;
    }

    function setRunningState() {
      btnRun.disabled   = true;
      btnPause.disabled = false;
      btnStep.disabled  = true;
      btnReset.disabled = false;
    }

    function setPausedState() {
      btnRun.disabled   = false;
      btnPause.disabled = true;
      btnStep.disabled  = false;
      btnReset.disabled = false;
    }

    function setSteppingState() {
      btnRun.disabled   = false;
      btnPause.disabled = true;
      btnStep.disabled  = false;
      btnReset.disabled = false;
    }

    function setFinishedState() {
      btnRun.disabled   = true;
      btnPause.disabled = true;
      btnStep.disabled  = true;
      btnReset.disabled = false;
    }

    function setResetState() {
      updateControlState();
    }

    function getSpeed() {
      return parseInt(speedSlider.value);
    }

    function updateHyperperiodBadge(hp) {
      hpBadge.textContent = hp > 0 ? `Hyperperiod: ${hp}` : '';
    }

    return {
      init, getAlgorithm, setRunningState, setPausedState,
      setSteppingState, setFinishedState, setResetState,
      getSpeed, updateHyperperiodBadge, renderTable
    };
  })();

  // ── Initialize ──
  UIController.init();

})();

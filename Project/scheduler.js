(function() {
  'use strict';

  // ─── Task Colors ───
  const TASK_COLORS = [
    '#00e5ff', '#ffab00', '#aa66ff',
    '#00e676', '#ff5c8a', '#ff8a50'
  ];

  // ─────────────────────────────────────────────
  // --- TASK MANAGER ---
  // Manages the list of tasks (add, remove, clear)
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
      // Re-assign colors so they stay contiguous
      tasks.forEach((t, i) => t.color = TASK_COLORS[i]);
    }

    function clear() { tasks = []; }
    function getAll() { return tasks.slice(); }
    function count() { return tasks.length; }

    return { add, remove, clear, getAll, count };
  })();

  // ─────────────────────────────────────────────
  // --- MATH HELPERS ---
  // GCD / LCM for hyperperiod calculation
  // ─────────────────────────────────────────────
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function lcm(a, b) { return (a / gcd(a, b)) * b; }
  function lcmArray(arr) { return arr.reduce((a, b) => lcm(a, b)); }

  // ─────────────────────────────────────────────
  // --- RM SCHEDULER ---
  // Rate Monotonic: fixed priority = shorter period → higher priority
  // ─────────────────────────────────────────────
  function simulateRM(tasks, hyperperiod) {
    // Assign priority: index in sorted-by-period order (0 = highest)
    const sorted = tasks.map((t, i) => ({ ...t, origIndex: i }))
                        .sort((a, b) => a.period - b.period);
    // Priority map: origIndex → priority rank (lower = higher)
    const priorityRank = {};
    sorted.forEach((t, rank) => { priorityRank[t.origIndex] = rank; });

    // Job queue: active job instances
    // Each job: { taskIdx, releaseTime, deadline, remaining }
    let jobs = [];
    const log = [];         // per time-unit execution log
    const schedule = [];    // schedule[t] = taskIdx or -1 (idle)
    let preemptions = 0;
    const missedDeadlines = []; // { taskIdx, time }

    for (let t = 0; t < hyperperiod; t++) {
      // Release new jobs at this time
      tasks.forEach((task, idx) => {
        if (t % task.period === 0) {
          jobs.push({
            taskIdx: idx,
            releaseTime: t,
            deadline: t + task.period,
            remaining: task.wcet
          });
        }
      });

      // Check for missed deadlines (jobs whose deadline == t and remaining > 0)
      jobs = jobs.filter(j => {
        if (j.deadline === t && j.remaining > 0) {
          missedDeadlines.push({ taskIdx: j.taskIdx, time: t });
          return false; // remove the missed job
        }
        return true;
      });

      // Also remove completed jobs (remaining == 0)
      jobs = jobs.filter(j => j.remaining > 0);

      // Pick highest priority job (lowest priorityRank)
      // Among same priority, pick earliest released
      let best = null;
      for (const j of jobs) {
        if (!best ||
            priorityRank[j.taskIdx] < priorityRank[best.taskIdx] ||
            (priorityRank[j.taskIdx] === priorityRank[best.taskIdx] && j.releaseTime < best.releaseTime)) {
          best = j;
        }
      }

      const prevRunning = t > 0 ? schedule[t - 1] : -1;
      let preempted = false;

      if (best) {
        // Check preemption: was a DIFFERENT task running before, and the previous task still has remaining work?
        if (t > 0 && prevRunning !== -1 && prevRunning !== best.taskIdx) {
          // Check if the previously running task still has a live job
          const prevStillActive = jobs.some(j => j.taskIdx === prevRunning && j.remaining > 0);
          if (prevStillActive) {
            preempted = true;
            preemptions++;
          }
        }
        best.remaining--;
        schedule.push(best.taskIdx);
      } else {
        schedule.push(-1); // idle
      }

      // Build queue string (tasks with remaining > 0, excluding the running one)
      const queue = jobs
        .filter(j => best ? j !== best : true)
        .filter(j => j.remaining > 0)
        .map(j => tasks[j.taskIdx].name);

      log.push({
        time: t,
        running: best ? tasks[best.taskIdx].name : 'Idle',
        runningIdx: best ? best.taskIdx : -1,
        queue,
        preempted,
        missed: missedDeadlines.filter(m => m.time === t).map(m => tasks[m.taskIdx].name)
      });
    }

    // Final deadline check at hyperperiod end
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
      // Release new jobs
      tasks.forEach((task, idx) => {
        if (t % task.period === 0) {
          jobs.push({
            taskIdx: idx,
            releaseTime: t,
            deadline: t + task.period,
            remaining: task.wcet
          });
        }
      });

      // Check missed deadlines
      jobs = jobs.filter(j => {
        if (j.deadline === t && j.remaining > 0) {
          missedDeadlines.push({ taskIdx: j.taskIdx, time: t });
          return false;
        }
        return true;
      });

      // Remove completed jobs
      jobs = jobs.filter(j => j.remaining > 0);

      // Pick job with earliest deadline; ties broken by task index (lower = higher)
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

      if (best) {
        if (t > 0 && prevRunning !== -1 && prevRunning !== best.taskIdx) {
          const prevStillActive = jobs.some(j => j.taskIdx === prevRunning && j.remaining > 0);
          if (prevStillActive) {
            preempted = true;
            preemptions++;
          }
        }
        best.remaining--;
        schedule.push(best.taskIdx);
      } else {
        schedule.push(-1);
      }

      const queue = jobs
        .filter(j => best ? j !== best : true)
        .filter(j => j.remaining > 0)
        .map(j => tasks[j.taskIdx].name);

      log.push({
        time: t,
        running: best ? tasks[best.taskIdx].name : 'Idle',
        runningIdx: best ? best.taskIdx : -1,
        queue,
        preempted,
        missed: missedDeadlines.filter(m => m.time === t).map(m => tasks[m.taskIdx].name)
      });
    }

    // Final check
    jobs.forEach(j => {
      if (j.deadline <= hyperperiod && j.remaining > 0) {
        missedDeadlines.push({ taskIdx: j.taskIdx, time: hyperperiod });
      }
    });

    return { schedule, log, preemptions, missedDeadlines };
  }

  // ─────────────────────────────────────────────
  // --- STATS CALCULATOR ---
  // Computes utilization, schedulability, etc.
  // ─────────────────────────────────────────────
  function computeStats(tasks, simResult, algorithm) {
    const n = tasks.length;
    // CPU utilization: U = Σ(Ci / Ti)
    const utilization = tasks.reduce((s, t) => s + t.wcet / t.period, 0);

    // RM schedulability bound: n(2^(1/n) - 1)
    const rmBound = n * (Math.pow(2, 1 / n) - 1);

    let schedulable;
    if (algorithm === 'RM') {
      // Sufficient (but not necessary) condition
      schedulable = utilization <= rmBound;
    } else {
      // EDF: schedulable if U <= 1.0
      schedulable = utilization <= 1.0;
    }

    return {
      totalTasks: n,
      preemptions: simResult.preemptions,
      missedDeadlines: simResult.missedDeadlines,
      utilization,
      rmBound,
      schedulable,
      noMisses: simResult.missedDeadlines.length === 0
    };
  }

  // ─────────────────────────────────────────────
  // --- SIMULATION RUNNER ---
  // Orchestrates the simulation, controls stepping/animation
  // ─────────────────────────────────────────────
  const SimRunner = (() => {
    let simResult = null;
    let tasks = [];
    let hyperperiod = 0;
    let currentStep = 0;
    let animTimer = null;
    let isRunning = false;
    let isPaused = false;

    function prepare() {
      tasks = TaskManager.getAll();
      if (tasks.length === 0) return false;

      hyperperiod = lcmArray(tasks.map(t => t.period));
      // Safety cap to prevent extremely long simulations
      if (hyperperiod > 500) {
        alert('Hyperperiod (' + hyperperiod + ') is too large. Please use smaller periods (LCM ≤ 500).');
        return false;
      }

      const algo = UIController.getAlgorithm();
      if (algo === 'RM') {
        simResult = simulateRM(tasks, hyperperiod);
      } else {
        simResult = simulateEDF(tasks, hyperperiod);
      }

      currentStep = 0;
      isRunning = false;
      isPaused = false;

      GanttRenderer.init(tasks, hyperperiod);
      LogRenderer.clear();
      StatsRenderer.hide();
      UIController.updateHyperperiodBadge(hyperperiod);

      return true;
    }

    function stepForward() {
      if (!simResult || currentStep >= hyperperiod) {
        finish();
        return false;
      }

      const entry = simResult.log[currentStep];
      const taskIdx = simResult.schedule[currentStep];

      GanttRenderer.fillStep(currentStep, taskIdx, tasks);
      LogRenderer.addEntry(entry, currentStep === currentStep); // highlight last
      currentStep++;

      if (currentStep >= hyperperiod) {
        finish();
      }
      return currentStep < hyperperiod;
    }

    function run() {
      if (!simResult) { if (!prepare()) return; }
      isRunning = true;
      isPaused = false;
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
      isPaused = true;
      isRunning = false;
      clearTimeout(animTimer);
      UIController.setPausedState();
    }

    function reset() {
      clearTimeout(animTimer);
      simResult = null;
      currentStep = 0;
      isRunning = false;
      isPaused = false;
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

      // Render all deadline markers (after Gantt is fully drawn)
      GanttRenderer.renderDeadlineMarkers(tasks, hyperperiod, simResult.missedDeadlines);
    }

    function doSingleStep() {
      if (!simResult) { if (!prepare()) return; }
      isPaused = true;
      isRunning = false;
      UIController.setSteppingState();
      stepForward();
    }

    return { prepare, run, pause, reset, doSingleStep };
  })();

  // ─────────────────────────────────────────────
  // --- GANTT RENDERER ---
  // Builds and animates the Gantt chart
  // ─────────────────────────────────────────────
  const GanttRenderer = (() => {
    const container = document.getElementById('gantt-chart');
    const emptyState = document.getElementById('gantt-empty');
    let cellMap = {}; // cellMap[taskIdx][timeStep] = cellElement

    function init(tasks, hyperperiod) {
      container.innerHTML = '';
      cellMap = {};

      tasks.forEach((task, idx) => {
        cellMap[idx] = {};
        const row = document.createElement('div');
        row.className = 'gantt-row';

        // Label
        const label = document.createElement('div');
        label.className = 'gantt-label';
        label.innerHTML = `<span class="task-color-dot" style="background:${task.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;"></span>${task.name}`;
        row.appendChild(label);

        // Track
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
      if (taskIdx === -1) return; // idle, leave blank
      const cell = cellMap[taskIdx][timeStep];
      cell.style.background = tasks[taskIdx].color;
      cell.style.boxShadow = `0 0 8px ${tasks[taskIdx].color}44, inset 0 0 6px rgba(255,255,255,0.1)`;
      cell.classList.add('filled', 'active-anim');
    }

    function renderDeadlineMarkers(tasks, hyperperiod, missedDeadlines) {
      // For each task, place deadline markers at period boundaries
      tasks.forEach((task, idx) => {
        for (let d = task.period; d <= hyperperiod; d += task.period) {
          const markerTime = d; // deadline is AT time d
          // Place marker on the cell boundary (after cell d-1)
          if (d < hyperperiod && cellMap[idx][d]) {
            const cell = cellMap[idx][d];
            const marker = document.createElement('div');
            marker.className = 'deadline-marker';
            marker.style.borderColor = task.color;
            marker.style.left = '-1px';
            cell.style.position = 'relative';
            cell.appendChild(marker);
          } else if (d === hyperperiod && cellMap[idx][d - 1]) {
            // End of hyperperiod marker
            const cell = cellMap[idx][d - 1];
            const marker = document.createElement('div');
            marker.className = 'deadline-marker';
            marker.style.borderColor = task.color;
            marker.style.right = '-1px';
            marker.style.left = 'auto';
            cell.style.position = 'relative';
            cell.appendChild(marker);
          }
        }
      });

      // Place missed deadline ❌ markers
      missedDeadlines.forEach(m => {
        const t = m.time;
        const tIdx = m.taskIdx;
        const cellTime = t < hyperperiod ? t : t - 1;
        if (cellMap[tIdx] && cellMap[tIdx][cellTime]) {
          const cell = cellMap[tIdx][cellTime];
          cell.style.position = 'relative';
          const xMark = document.createElement('div');
          xMark.className = 'missed-marker';
          xMark.textContent = '❌';
          xMark.style.right = '-4px';
          cell.appendChild(xMark);
        }
      });
    }

    function clear() {
      container.innerHTML = '';
      container.appendChild(emptyState);
      cellMap = {};
    }

    // Show empty initially
    clear();

    return { init, fillStep, renderDeadlineMarkers, clear };
  })();

  // ─────────────────────────────────────────────
  // --- LOG RENDERER ---
  // Builds the step-by-step execution log
  // ─────────────────────────────────────────────
  const LogRenderer = (() => {
    const logEl = document.getElementById('exec-log');
    const emptyEl = document.getElementById('log-empty');
    const badge = document.getElementById('log-count-badge');
    let entryCount = 0;

    function addEntry(entry) {
      if (entryCount === 0) {
        emptyEl.style.display = 'none';
      }

      // Remove highlight from previous entry
      const prev = logEl.querySelector('.log-entry.highlight');
      if (prev) prev.classList.remove('highlight');

      const div = document.createElement('div');
      div.className = 'log-entry highlight';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = `[t=${entry.time}]`;

      const detail = document.createElement('span');
      detail.className = 'log-detail';

      let runHtml;
      if (entry.running === 'Idle') {
        runHtml = `<span class="idle-text">Idle</span>`;
      } else {
        runHtml = `<span class="running">${entry.running}</span>`;
      }

      let parts = [`Running: ${runHtml}`];

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

      // Auto-scroll to bottom
      logEl.scrollTop = logEl.scrollHeight;
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
  // Displays the statistics summary card
  // ─────────────────────────────────────────────
  const StatsRenderer = (() => {
    const panel = document.getElementById('stats-panel');
    const grid = document.getElementById('stats-grid');

    function show(stats, tasks) {
      grid.innerHTML = '';

      const items = [
        { label: 'Total Tasks', value: stats.totalTasks, cls: '' },
        { label: 'Preemptions', value: stats.preemptions, cls: '' },
        {
          label: 'Missed Deadlines',
          value: stats.missedDeadlines.length,
          cls: stats.missedDeadlines.length > 0 ? 'fail' : 'pass'
        },
        {
          label: 'CPU Utilization',
          value: (stats.utilization * 100).toFixed(1) + '%',
          cls: stats.utilization > 1 ? 'fail' : ''
        },
        {
          label: UIController.getAlgorithm() === 'RM' ? 'RM Bound' : 'EDF Bound',
          value: UIController.getAlgorithm() === 'RM'
            ? (stats.rmBound * 100).toFixed(1) + '%'
            : '100.0%',
          cls: ''
        },
        {
          label: 'Schedulability',
          value: '',
          cls: stats.noMisses ? 'pass' : 'fail',
          badge: true,
          badgeText: stats.noMisses ? '✅ PASS' : '❌ FAIL',
          badgeCls: stats.noMisses ? 'badge-pass' : 'badge-fail'
        }
      ];

      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stat-item ' + item.cls;

        if (item.badge) {
          div.innerHTML = `
            <div class="stat-value"><span class="badge ${item.badgeCls}">${item.badgeText}</span></div>
            <div class="stat-label">${item.label}</div>
          `;
        } else {
          div.innerHTML = `
            <div class="stat-value">${item.value}</div>
            <div class="stat-label">${item.label}</div>
          `;
        }

        grid.appendChild(div);
      });

      // If missed deadlines, list them
      if (stats.missedDeadlines.length > 0) {
        const missedDiv = document.createElement('div');
        missedDiv.className = 'stat-item fail';
        missedDiv.style.gridColumn = '1 / -1';
        const missedNames = [...new Set(stats.missedDeadlines.map(m => tasks[m.taskIdx].name))];
        missedDiv.innerHTML = `
          <div class="stat-value" style="font-size:0.9rem;">
            ${stats.missedDeadlines.map(m => `${tasks[m.taskIdx].name}@t=${m.time}`).join(', ')}
          </div>
          <div class="stat-label">Missed Deadline Details</div>
        `;
        grid.appendChild(missedDiv);
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
  // Wires up all DOM events, manages UI state
  // ─────────────────────────────────────────────
  const UIController = (() => {
    let algorithm = 'RM';

    // Cache DOM elements
    const btnRM = document.getElementById('btn-rm');
    const btnEDF = document.getElementById('btn-edf');
    const algoDesc = document.getElementById('algo-description');
    const inpName = document.getElementById('inp-name');
    const inpWcet = document.getElementById('inp-wcet');
    const inpPeriod = document.getElementById('inp-period');
    const btnAdd = document.getElementById('btn-add-task');
    const btnClear = document.getElementById('btn-clear-tasks');
    const tableBody = document.getElementById('task-table-body');
    const tableEmpty = document.getElementById('task-table-empty');
    const taskCountBadge = document.getElementById('task-count-badge');
    const btnRun = document.getElementById('btn-run');
    const btnPause = document.getElementById('btn-pause');
    const btnStep = document.getElementById('btn-step');
    const btnReset = document.getElementById('btn-reset');
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    const hpBadge = document.getElementById('hyperperiod-badge');

    const ALGO_DESCRIPTIONS = {
      RM: '<strong>Rate Monotonic (RM):</strong> Fixed-priority preemptive scheduling. Tasks with shorter periods receive higher priority. Optimal among all fixed-priority algorithms. Schedulable if U ≤ n(2<sup>1/n</sup> − 1).',
      EDF: '<strong>Earliest Deadline First (EDF):</strong> Dynamic-priority scheduling. At each time step, the task closest to its absolute deadline runs. Theoretically schedulable if U ≤ 1.0.'
    };

    function init() {
      // Algorithm toggle
      btnRM.addEventListener('click', () => setAlgorithm('RM'));
      btnEDF.addEventListener('click', () => setAlgorithm('EDF'));

      // Add task
      btnAdd.addEventListener('click', addTask);
      // Allow Enter key in inputs
      [inpName, inpWcet, inpPeriod].forEach(el => {
        el.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
      });

      // Clear tasks
      btnClear.addEventListener('click', () => {
        TaskManager.clear();
        renderTable();
        SimRunner.reset();
      });

      // Simulation controls
      btnRun.addEventListener('click', () => SimRunner.run());
      btnPause.addEventListener('click', () => SimRunner.pause());
      btnStep.addEventListener('click', () => SimRunner.doSingleStep());
      btnReset.addEventListener('click', () => SimRunner.reset());

      // Speed slider
      speedSlider.addEventListener('input', () => {
        speedVal.textContent = speedSlider.value + 'ms';
      });

      renderTable();
    }

    function setAlgorithm(algo) {
      algorithm = algo;
      btnRM.classList.toggle('active', algo === 'RM');
      btnEDF.classList.toggle('active', algo === 'EDF');
      algoDesc.innerHTML = ALGO_DESCRIPTIONS[algo];
      // Reset sim if algo changes
      SimRunner.reset();
    }

    function getAlgorithm() { return algorithm; }

    function addTask() {
      const name = inpName.value.trim() || ('T' + (TaskManager.count() + 1));
      const wcet = parseInt(inpWcet.value);
      const period = parseInt(inpPeriod.value);

      if (isNaN(wcet) || wcet < 1) { shakeInput(inpWcet); return; }
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

      // Clear inputs
      inpName.value = '';
      inpWcet.value = '';
      inpPeriod.value = '';
      inpName.focus();

      renderTable();
      SimRunner.reset();
    }

    function shakeInput(el) {
      el.style.borderColor = 'var(--danger)';
      el.style.animation = 'none';
      el.offsetHeight; // force reflow
      el.style.animation = '';
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

      // Sort by period for priority display
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

      // Wire remove buttons
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
      const hasTasks = TaskManager.count() > 0;
      btnRun.disabled = !hasTasks;
      btnStep.disabled = !hasTasks;
      btnReset.disabled = false;
      btnPause.disabled = true;
    }

    function setRunningState(running) {
      btnRun.disabled = true;
      btnPause.disabled = false;
      btnStep.disabled = true;
      btnReset.disabled = false;
    }

    function setPausedState() {
      btnRun.disabled = false;
      btnPause.disabled = true;
      btnStep.disabled = false;
      btnReset.disabled = false;
    }

    function setSteppingState() {
      btnRun.disabled = false;
      btnPause.disabled = true;
      btnStep.disabled = false;
      btnReset.disabled = false;
    }

    function setFinishedState() {
      btnRun.disabled = true;
      btnPause.disabled = true;
      btnStep.disabled = true;
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
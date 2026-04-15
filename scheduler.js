document.addEventListener("DOMContentLoaded", function() {

  // =========================
  // 🔥 PART 1: TASK HANDLING
  // =========================
  let tasks = [];

  document.getElementById("btn-add-task").addEventListener("click", function() {

    let name = document.getElementById("inp-name").value;
    let wcet = parseInt(document.getElementById("inp-wcet").value);
    let period = parseInt(document.getElementById("inp-period").value);

    if (!name || !wcet || !period) {
      alert("Fill all fields");
      return;
    }

    tasks.push({ name, wcet, period });

    console.log("Tasks:", tasks);
  });


  // =========================
  // 🔥 PART 2: MATH + ALGO
  // =========================

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  function lcm(a, b) {
    return (a / gcd(a, b)) * b;
  }

  function lcmArray(arr) {
    return arr.reduce((a, b) => lcm(a, b));
  }

  function simulateRM(tasks, hyper) {
    return tasks.map((_, i) => i); // placeholder logic
  }

  function simulateEDF(tasks, hyper) {
    return tasks.map((_, i) => i); // placeholder logic
  }

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


 // =========================
  // 🔥 PART 3: RUN INTEGRATION
  // =========================

  document.getElementById("btn-run").addEventListener("click", function() {

    if (tasks.length === 0) {
      alert("Add tasks first");
      return;
    }

    let hyper = lcmArray(tasks.map(t => t.period));

    let algo = document.querySelector(".algo-btn.active").dataset.algo;

    let result;

    if (algo === "RM") {
      result = simulateRM(tasks, hyper);
    } else {
      result = simulateEDF(tasks, hyper);
    }

    console.log("FINAL RESULT:", result);
  });

});

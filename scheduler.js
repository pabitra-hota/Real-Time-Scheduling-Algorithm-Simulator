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

  // Algorithm toggle (RM / EDF)
  document.querySelectorAll(".algo-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".algo-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
    });
  });


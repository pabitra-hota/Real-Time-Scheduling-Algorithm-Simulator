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


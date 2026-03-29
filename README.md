# ⚡ Real-Time Scheduling Algorithm Simulator

> 🎓 **Mentor: Shruti Jairath**

An interactive, browser-based simulator designed to visualize and analyze real-time scheduling algorithms with precision and clarity.
---
## 📌 Project Overview

The **Real-Time Scheduling Algorithm Simulator** is a web-based tool that enables users to explore how real-time systems schedule tasks under strict timing constraints.

Built using **pure HTML, CSS, and JavaScript**, the simulator provides a dynamic and visually rich interface to study scheduling behavior in real time.

It supports:

- **Rate Monotonic Scheduling (RM)** – fixed-priority
- **Earliest Deadline First (EDF)** – dynamic-priority

The system computes scheduling decisions, tracks execution flow, and renders results using an animated **Gantt chart visualization**. :contentReference[oaicite:0]{index=0}

---

## 🚀 Key Features

- 🎯 **Interactive UI** with modern dark-themed design  
- ⚙️ Implementation of **RM & EDF scheduling algorithms**  
- 📊 **Real-time Gantt chart visualization** of task execution  
- 🔄 Detection of **task preemption events**  
- ❌ Identification and marking of **missed deadlines**  
- 📜 Step-by-step **execution log tracking**  
- 📈 Automatic calculation of:
  - CPU Utilization  
  - Schedulability  
  - Preemptions  
  - Deadline misses  
- ⏱️ Adjustable simulation **speed control**  
- 🔢 Hyperperiod calculation using **LCM logic**  

---

## 🧠 Algorithms Implemented

### 🔹 Rate Monotonic Scheduling (RM)
- Fixed-priority algorithm  
- Tasks with shorter periods receive higher priority  
- Uses schedulability bound:  
  **U ≤ n(2^(1/n) − 1)**  

### 🔹 Earliest Deadline First (EDF)
- Dynamic-priority scheduling  
- Task with nearest deadline executes first  
- Theoretically optimal if:  
  **U ≤ 1.0**

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3  
- **Logic Engine:** Vanilla JavaScript (ES6)  
- **Visualization:** Custom DOM-based Gantt rendering  
- **Styling:** Modern UI with CSS variables & responsive layout  

---

## ⚙️ How It Works

1. Define tasks with:
   - WCET (Execution Time)
   - Period
2. Select scheduling algorithm (RM / EDF)
3. Run simulation
4. Observe:
   - Execution timeline
   - Task switching (preemption)
   - Deadline events
5. Analyze statistics after completion

---

## 📂 Project Structure
📁 Real-Time-Scheduling-Algorithm-Simulator
┣ 📄 index.html # Complete simulator (UI + logic)
┗ 📄 README.md

📸 Visualization Highlights
Gantt Chart Timeline
Deadline Markers (│)
Missed Deadline Indicators (❌)
Execution Log Panel
Simulation Statistics Dashboard

👥 Team
👨‍🏫 Mentor: 
Shruti Jairath
👨‍💻 Collaborators :
Pabitra Ranjan Hota, 
Ayush Kumar, 
Krishna Sharma

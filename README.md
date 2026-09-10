# Scrutiny Academy NEET Flashcards Platform

> **Brand Tagline:** LEARN • UNDERSTAND • PRACTICE • MASTER  
> **Target Exam:** NEET UG (National Eligibility cum Entrance Test)  
> **Official Repository:** [https://github.com/scrutinyacademy/Flashcards-for-NEET-](https://github.com/scrutinyacademy/Flashcards-for-NEET-)  
> **Copyright:** © 2026 SCRUTINY ACADEMY | ALL RIGHTS RESERVED  

---

## 1. Overview & Pedagogical Philosophy

The **Scrutiny Academy NEET Flashcards Platform** is a mobile-first, high-yield active recall and spaced repetition web application specifically architected for NEET UG aspirants preparing across **Physics**, **Chemistry**, and **Biology** for both **Class 11** and **Class 12**.

### Core Standard & The "Target 180" Rule
* **Target per chapter:** Exactly 180 high-yield, NCERT-grounded flashcards per chapter.
* **Transparent Published Counts:** The user interface displays **real published counts** (`Published: X / chapter target`). It strictly never invents cards or shows fabricated completion counters. Unpopulated chapters display a zero count with a clean `CONTENT COMING SOON` badge.
* **Zero Fabrication Academic Standard:**
  * 100% verified concepts, definitions, and equations.
  * No invented page numbers or fabricated NCERT quotes.
  * No fake PYQs (Previous Year Questions) or made-up statistics.
  * Common NEET traps and question-setter tricks explicitly highlighted on each card.

---

## 2. Directory & File Architecture

```text
/
├── index.html                   # Core single-page application shell
├── styles.css                   # Medical/science design system, dark/light theme, 3D flip card
├── app.js                       # NeetDataService, UserProgressStore (localStorage), routing
├── manifest.webmanifest         # PWA Manifest for mobile standalone installation
├── sw.js                        # Cache-first service worker for offline learning
├── README.md                    # Platform documentation & publishing guide
│
├── assets/
│   └── logo/
│       └── logo.jpg             # Official Scrutiny Academy circular logo
│
├── data/
│   ├── catalog.json             # Comprehensive curriculum map (83 chapters across Class 11 & 12)
│   └── neet/
│       ├── class11/
│       │   ├── biology/
│       │   │   ├── cell-the-unit-of-life.json           # 250 NCERT Active-Recall Cards
│       │   │   └── biomolecules.json                    # 250 NCERT Active-Recall Cards
│       │   ├── physics/
│       │   │   └── units-and-measurements.json         # 15 Published High-Yield Cards
│       │   └── chemistry/
│       │       └── some-basic-concepts-of-chemistry.json# 15 Published High-Yield Cards
│       └── class12/
│           ├── biology/
│           ├── physics/
│           └── chemistry/
```

---

## 3. Flashcard Schema Specification

Each chapter data file resides in `data/neet/class{11|12}/{subject}/{slug}.json` adhering strictly to this JSON format:

```json
{
  "id": "neet-c11-bio-cell-the-unit-of-life",
  "class": "11",
  "exam": "NEET UG",
  "subject": "Biology",
  "chapter": "Cell: The Unit of Life",
  "targetFlashcards": 180,
  "publishedCount": 25,
  "cards": [
    {
      "id": "NEET-C11-BIO-CELL-FC001",
      "front": "What is the fundamental structural and functional unit of all living organisms?",
      "back": "The cell.",
      "explanation": "Unicellular organisms are capable of independent existence and performing the essential functions of life.",
      "category": "Core Concept",
      "difficulty": "Easy",
      "tags": ["Cell Theory", "NCERT Basics"],
      "neetPriority": "High",
      "sourceType": "NCERT Class 11 Biology, Chapter 8",
      "commonTrap": "Do not confuse viruses with cellular units; viruses are acellular particles lacking independent metabolism.",
      "memoryTrick": "C-E-L-L: Complete Entities Living Life."
    }
  ]
}
```

### 10 Pedagogical Categories
To ensure comprehensive mastery rather than simplistic one-line definitions, cards are distributed across:
1. **Core Concepts (40 cards):** Fundamental principles and mechanistic insights.
2. **Fact Recall (20 cards):** High-yield scientist names, years, and specific terminology.
3. **Formula / Equation (20 cards):** Governing physical equations, conditions, and constants.
4. **Application (20 cards):** Conceptual problem solving and scenarios.
5. **Common NEET Traps (15 cards):** Tricky phrasings, exceptions, and subtle distractors.
6. **Assertion / Statement Analysis (15 cards):** Rigorous practice for NTA's Assertion-Reason question patterns.
7. **Diagram / Image Based (15 cards):** Structural labels and organelle morphology.
8. **Table / Comparison (10 cards):** Clean HTML tables comparing contrasting biological structures or chemical processes.
9. **Numerical Step Recall (15 cards):** Step-by-step guidance on calculation methodologies and unit conversions.
10. **High-Yield Rapid Revision (10 cards):** High-density summary cards ideal for revision right before exam day.

---

## 4. Spaced Repetition & Student Tracking

The platform implements an efficient client-side spaced repetition algorithm inspired by SuperMemo (SM-2):
* **AGAIN (Key 1):** Rating indicates recall failure. Interval is reset to 0 minutes; card is marked as **Weak** and queued for same-session practice.
* **HARD (Key 2):** Challenging recall. Interval is set to **1 day**; card remains in the weak list.
* **GOOD (Key 3):** Confident recall. Interval expands to **3 days** (multiplied by ~2.2 on subsequent reviews).
* **EASY (Key 4):** Effortless recall. Interval expands to **7 days** (multiplied by ~2.8 on subsequent reviews).

All user progress, daily goals, study streaks, and bookmarks are persistently saved in the student's browser `localStorage` under `scrutiny_neet_progress_v1`.

---

## 5. Official Scrutiny Academy Links & Support

* **YouTube Channel:** [https://m.youtube.com/@ScrutinyAcademy](https://m.youtube.com/@ScrutinyAcademy)
* **Instagram Handle:** [https://www.instagram.com/scrutinyacademy](https://www.instagram.com/scrutinyacademy)
* **Help Desk Email:** [scrutinyacademy@gmail.com](mailto:scrutinyacademy@gmail.com)

---

## 6. How to Publish to GitHub & Deploy to GitHub Pages

### Step 1: Clone or initialize the repository locally
```bash
git clone https://github.com/scrutinyacademy/Flashcards-for-NEET-.git
cd Flashcards-for-NEET-
```

### Step 2: Copy all platform files into the repository folder
Ensure your folder contains:
* `index.html`
* `styles.css`
* `app.js`
* `manifest.webmanifest`
* `sw.js`
* `assets/` (with the official `logo/`)
* `data/` (with `catalog.json` and chapter JSONs)

### Step 3: Commit and Push to GitHub
```bash
git add .
git commit -m "feat: Initial release of Scrutiny Academy NEET Flashcards Platform with 180-target architecture"
git branch -M main
git push -u origin main
```

### Step 4: Enable Free Live Hosting via GitHub Pages
1. Open your repository on GitHub: `https://github.com/scrutinyacademy/Flashcards-for-NEET-`
2. Go to **Settings** > **Pages** (in the left sidebar).
3. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder, then click **Save**.
5. Within 1–2 minutes, your platform will be live at:
   `https://scrutinyacademy.github.io/Flashcards-for-NEET-/`

/**
 * SCRUTINY ACADEMY - NEET UG FLASHCARDS PLATFORM
 * Brand Tagline: LEARN • UNDERSTAND • PRACTICE • MASTER
 * 
 * Core Architecture:
 * - Configurable Syllabus Engine (CURRENT_NEET_SYLLABUS_VERSION)
 * - NeetDataService: Modular lazy loading of chapter JSON files
 * - UserProgressStore: LocalStorage-driven spaced repetition & streak tracking
 * - Mobile-First Touch & Keyboard Interaction Controller
 * - 100% Real Published Count Guarantee (X / chapter target)
 */

// Global Configuration
const CURRENT_NEET_SYLLABUS_VERSION = "NEET UG 2026";

/* ==========================================================================
   DATA SERVICE (Lazy Loading & Catalog Management)
   ========================================================================== */
class NeetDataService {
  constructor() {
    this.catalog = null;
    this.chaptersCache = new Map(); // slug -> full chapter data
  }

  async init() {
    try {
      const res = await fetch('data/catalog.json');
      this.catalog = await res.json();
      return this.catalog;
    } catch (err) {
      console.error('Failed to load catalog.json:', err);
      return null;
    }
  }

  getCatalog() {
    return this.catalog;
  }

  getChaptersBySubjectAndClass(subject, classNum) {
    if (!this.catalog) return [];
    return this.catalog.chapters.filter(ch => {
      const matchSubj = !subject || ch.subject.toLowerCase() === subject.toLowerCase();
      const matchCls = !classNum || ch.class === String(classNum);
      return matchSubj && matchCls;
    });
  }

  getChapterBySlug(slug) {
    if (!this.catalog) return null;
    return this.catalog.chapters.find(ch => ch.slug === slug);
  }

  async getFlashcardsForChapter(slug) {
    if (this.chaptersCache.has(slug)) {
      return this.chaptersCache.get(slug);
    }
    const chMeta = this.getChapterBySlug(slug);
    if (!chMeta || !chMeta.dataFile) return null;

    try {
      const res = await fetch(chMeta.dataFile);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      this.chaptersCache.set(slug, data);
      return data;
    } catch (err) {
      console.warn(`Flashcards file not found or empty for ${slug} (${chMeta.dataFile}):`, err);
      return null;
    }
  }

  // Preloads all published sample chapters into cache for instant search & global stats
  async preloadPublishedChapters() {
    if (!this.catalog) return;
    const published = this.catalog.chapters.filter(ch => ch.publishedCount > 0);
    for (const ch of published) {
      await this.getFlashcardsForChapter(ch.slug);
    }
  }

  getAllCachedCards() {
    const all = [];
    for (const [slug, data] of this.chaptersCache.entries()) {
      if (data && data.cards) {
        data.cards.forEach(c => {
          all.push({
            ...c,
            chapterSlug: slug,
            chapterTitle: data.chapter,
            subject: data.subject,
            class: data.class
          });
        });
      }
    }
    return all;
  }
}

/* ==========================================================================
   USER PROGRESS & SPACED REPETITION STORE (localStorage)
   ========================================================================== */
class UserProgressStore {
  constructor() {
    this.storageKey = 'scrutiny_neet_progress_v1';
    this.state = this.load();
  }

  getDefaultState() {
    return {
      cards: {}, // cardId -> { cardId, chapterSlug, subject, classId, category, views, mastered, isWeak, bookmarked, intervalDays, nextDueDate, history }
      dailyGoal: 60,
      dailyCounts: {}, // 'YYYY-MM-DD' -> number of cards rated today
      streak: {
        current: 0,
        longest: 0,
        lastDate: null,
        totalDays: 0
      },
      lastSession: null
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign(this.getDefaultState(), parsed);
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
    return this.getDefaultState();
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.error('Error writing localStorage:', e);
    }
  }

  getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getCardState(cardId) {
    return this.state.cards[cardId] || null;
  }

  isBookmarked(cardId) {
    return !!(this.state.cards[cardId] && this.state.cards[cardId].bookmarked);
  }

  toggleBookmark(card, chapterMeta) {
    const cardId = card.id;
    if (!this.state.cards[cardId]) {
      this.state.cards[cardId] = {
        cardId: card.id,
        chapterSlug: chapterMeta.slug,
        chapterTitle: chapterMeta.title,
        subject: chapterMeta.subject,
        class: chapterMeta.class,
        category: card.category || 'Core Concept',
        views: 0,
        mastered: false,
        isWeak: false,
        bookmarked: false,
        intervalDays: 0,
        nextDueDate: null,
        history: []
      };
    }
    this.state.cards[cardId].bookmarked = !this.state.cards[cardId].bookmarked;
    this.save();
    return this.state.cards[cardId].bookmarked;
  }

  /**
   * Spaced repetition rating handler:
   * again -> interval 0, marked weak
   * hard -> interval 1 day, marked weak
   * good -> interval 3 days (or scaled)
   * easy -> interval 7 days (or scaled)
   */
  rateCard(card, chapterMeta, rating) {
    const cardId = card.id;
    const today = this.getTodayString();

    if (!this.state.cards[cardId]) {
      this.state.cards[cardId] = {
        cardId: card.id,
        chapterSlug: chapterMeta.slug,
        chapterTitle: chapterMeta.title,
        subject: chapterMeta.subject,
        class: chapterMeta.class,
        category: card.category || 'Core Concept',
        views: 0,
        mastered: false,
        isWeak: false,
        bookmarked: false,
        intervalDays: 0,
        nextDueDate: null,
        history: []
      };
    }

    const rec = this.state.cards[cardId];
    rec.views += 1;
    rec.history.push({ rating, timestamp: Date.now() });

    let nextInterval = 0;
    if (rating === 'again') {
      nextInterval = 0;
      rec.isWeak = true;
      rec.mastered = false;
    } else if (rating === 'hard') {
      nextInterval = 1;
      rec.isWeak = true;
      rec.mastered = false;
    } else if (rating === 'good') {
      nextInterval = rec.intervalDays === 0 ? 3 : Math.max(3, Math.round(rec.intervalDays * 2.2));
      rec.isWeak = false;
      rec.mastered = true;
    } else if (rating === 'easy') {
      nextInterval = rec.intervalDays === 0 ? 7 : Math.max(7, Math.round(rec.intervalDays * 2.8));
      rec.isWeak = false;
      rec.mastered = true;
    }

    rec.intervalDays = nextInterval;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + nextInterval);
    rec.nextDueDate = dueDate.toISOString().split('T')[0];

    // Update Daily Studied Count
    this.state.dailyCounts[today] = (this.state.dailyCounts[today] || 0) + 1;

    // Update Streak
    this.updateStreak(today);

    // Save Last Session Context
    this.state.lastSession = {
      chapterSlug: chapterMeta.slug,
      chapterTitle: chapterMeta.title,
      subject: chapterMeta.subject,
      class: chapterMeta.class,
      timestamp: Date.now()
    };

    this.save();
    return rec;
  }

  updateStreak(today) {
    const s = this.state.streak;
    if (!s.lastDate) {
      s.current = 1;
      s.longest = 1;
      s.totalDays = 1;
      s.lastDate = today;
      return;
    }

    if (s.lastDate === today) {
      // Already recorded today
      return;
    }

    const last = new Date(s.lastDate);
    const curr = new Date(today);
    const diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      s.current += 1;
      s.totalDays += 1;
      if (s.current > s.longest) s.longest = s.current;
    } else if (diffDays > 1) {
      s.current = 1;
      s.totalDays += 1;
    }
    s.lastDate = today;
  }

  getTodayStudiedCount() {
    const today = this.getTodayString();
    return this.state.dailyCounts[today] || 0;
  }

  setDailyGoal(goalNum) {
    this.state.dailyGoal = Number(goalNum);
    this.save();
  }

  getDailyGoal() {
    return this.state.dailyGoal || 60;
  }

  resetAll() {
    this.state = this.getDefaultState();
    this.save();
  }

  getGlobalStats() {
    let viewed = 0;
    let mastered = 0;
    let weak = 0;
    let bookmarked = 0;

    for (const cid in this.state.cards) {
      const c = this.state.cards[cid];
      if (c.views > 0) viewed += 1;
      if (c.mastered) mastered += 1;
      if (c.isWeak) weak += 1;
      if (c.bookmarked) bookmarked += 1;
    }

    return { viewed, mastered, weak, bookmarked };
  }

  getChapterStats(slug) {
    let viewed = 0;
    let mastered = 0;
    let weak = 0;
    let bookmarked = 0;

    for (const cid in this.state.cards) {
      const c = this.state.cards[cid];
      if (c.chapterSlug === slug) {
        if (c.views > 0) viewed += 1;
        if (c.mastered) mastered += 1;
        if (c.isWeak) weak += 1;
        if (c.bookmarked) bookmarked += 1;
      }
    }
    return { viewed, mastered, weak, bookmarked };
  }

  getWeakCardsList() {
    const list = [];
    for (const cid in this.state.cards) {
      const c = this.state.cards[cid];
      if (c.isWeak) list.push(c);
    }
    return list;
  }

  getBookmarkedCardsList() {
    const list = [];
    for (const cid in this.state.cards) {
      const c = this.state.cards[cid];
      if (c.bookmarked) list.push(c);
    }
    return list;
  }

  getRevisionCardsByStatus() {
    const today = this.getTodayString();
    const due = [];
    const overdue = [];
    const tomorrow = [];
    const week = [];

    const dToday = new Date(today);
    const dTomorrow = new Date(today);
    dTomorrow.setDate(dTomorrow.getDate() + 1);
    const tomorrowStr = dTomorrow.toISOString().split('T')[0];

    const dWeek = new Date(today);
    dWeek.setDate(dWeek.getDate() + 7);

    for (const cid in this.state.cards) {
      const c = this.state.cards[cid];
      if (!c.nextDueDate) continue;

      const dueD = new Date(c.nextDueDate);
      if (c.nextDueDate < today) {
        overdue.push(c);
        due.push(c); // Overdue is also due
      } else if (c.nextDueDate === today) {
        due.push(c);
      } else if (c.nextDueDate === tomorrowStr) {
        tomorrow.push(c);
      } else if (dueD <= dWeek) {
        week.push(c);
      }
    }

    return { due, overdue, tomorrow, week };
  }
}

/* ==========================================================================
   APPLICATION CONTROLLER
   ========================================================================== */
class ScrutinyApp {
  constructor() {
    this.dataService = new NeetDataService();
    this.progressStore = new UserProgressStore();

    // Active State
    this.currentView = 'home';
    this.currentSubject = 'physics';
    this.currentClass = '11';
    this.sessionConfig = null;
    this.activeSession = null;
    this.activeCardIndex = 0;
    this.sessionStartTime = null;
    this.sessionStats = {
      studied: 0,
      mastered: 0,
      again: 0,
      cardsRated: new Set(),
      categoryBreakdown: {}
    };

    // Touch swipe coordinates
    this.touchStartX = 0;
    this.touchEndX = 0;
  }

  async init() {
    // 1. Initialize Theme
    this.initTheme();

    // 2. Load Catalog
    await this.dataService.init();
    await this.dataService.preloadPublishedChapters();

    // 3. Bind Global Listeners
    this.bindEvents();

    // 4. Handle Routing
    this.handleRoute();

    // 5. Update UI Stats
    this.updateGlobalCounters();
    this.renderHome();

    console.log(`Scrutiny Academy NEET Platform Initialized [${CURRENT_NEET_SYLLABUS_VERSION}]`);
  }

  /* ---------------- Theme & Header Controls ---------------- */
  initTheme() {
    const savedTheme = localStorage.getItem('scrutiny_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('scrutiny_theme', next);
  }

  toggleMobileNav() {
    const nav = document.getElementById('header-nav');
    const btn = document.getElementById('hamburger-btn');
    const isOpen = nav.classList.toggle('mobile-open');
    btn.setAttribute('aria-expanded', isOpen);
  }

  closeMobileNav() {
    const nav = document.getElementById('header-nav');
    const btn = document.getElementById('hamburger-btn');
    nav.classList.remove('mobile-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- Routing ---------------- */
  bindEvents() {
    // Hash change routing
    window.addEventListener('hashchange', () => this.handleRoute());

    // Theme toggle button
    document.getElementById('theme-toggle-btn').addEventListener('click', () => this.toggleTheme());

    // Hamburger button
    document.getElementById('hamburger-btn').addEventListener('click', () => this.toggleMobileNav());

    // Universal Search button
    const searchToggle = document.getElementById('search-toggle-btn');
    const searchTray = document.getElementById('search-tray');
    const searchInput = document.getElementById('universal-search-input');
    const searchClear = document.getElementById('search-clear-btn');

    searchToggle.addEventListener('click', () => {
      const isHidden = searchTray.hasAttribute('hidden');
      if (isHidden) {
        searchTray.removeAttribute('hidden');
        searchInput.focus();
      } else {
        searchTray.setAttribute('hidden', '');
      }
    });

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      searchClear.hidden = val.length === 0;
      this.performUniversalSearch(val);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.hidden = true;
      document.getElementById('search-results-tray').innerHTML = '';
      searchInput.focus();
    });

    // Search filter dropdowns
    ['search-subject-filter', 'search-class-filter', 'search-category-filter'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.performUniversalSearch(searchInput.value.trim());
      });
    });

    // Hero buttons
    document.getElementById('hero-start-btn').addEventListener('click', () => {
      // Start with Cell: The Unit of Life (Sample Deck)
      this.openSessionConfig('cell-the-unit-of-life');
    });

    document.getElementById('hero-explore-btn').addEventListener('click', () => {
      const el = document.getElementById('explore-subjects-anchor');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });

    // Class toggle pills on Home
    document.querySelectorAll('.class-toggle-pills .class-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const cls = e.target.dataset.class;
        if (cls) {
          document.querySelectorAll('.class-toggle-pills .class-pill').forEach(p => p.classList.remove('active'));
          e.target.classList.add('active');
          this.currentClass = cls === 'class12' ? '12' : '11';
          this.renderPublishedSpotlight();
        }
      });
    });

    // Subject buttons on Home
    document.querySelectorAll('.open-subject-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const subj = e.currentTarget.dataset.subject;
        window.location.hash = `#${subj}`;
      });
    });

    // Subject Class Tabs inside Subject View
    const subjClassTabs = document.querySelectorAll('#subject-class-tabs .class-pill');
    subjClassTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        subjClassTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentClass = e.target.dataset.class;
        this.renderSubjectChapters();
      });
    });

    // Chapter filter search inside Subject View
    const chFilterInput = document.getElementById('chapter-search-filter');
    chFilterInput.addEventListener('input', () => this.renderSubjectChapters());

    // Chapter status radio filter
    document.querySelectorAll('input[name="chapter-status-filter"]').forEach(r => {
      r.addEventListener('change', () => this.renderSubjectChapters());
    });

    // Daily Goal Buttons
    document.querySelectorAll('.goal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const g = e.target.dataset.goal;
        this.progressStore.setDailyGoal(g);
        this.updateDailyGoalWidget();
      });
    });

    // Reset Progress Button
    document.getElementById('reset-progress-btn').addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all your learning records, bookmarks, and streaks?')) {
        this.progressStore.resetAll();
        this.updateGlobalCounters();
        this.renderHome();
        this.renderProgressDashboard();
      }
    });

    // Flashcard Study Interaction & Keyboard Shortcuts
    this.bindStudyEvents();

    // Session Config Modal Events
    this.bindConfigModalEvents();

    // Summary Modal Events
    this.bindSummaryEvents();
  }

  handleRoute() {
    this.closeMobileNav();
    const hash = window.location.hash.replace('#', '') || 'home';
    const validViews = ['home', 'class11', 'class12', 'physics', 'chemistry', 'biology', 'bookmarks', 'weak-cards', 'revision', 'progress', 'about', 'support'];

    // Update nav links active state
    document.querySelectorAll('.nav-link').forEach(link => {
      const target = link.getAttribute('data-nav');
      link.classList.toggle('active', target === hash || (hash.startsWith('class') && target === hash));
    });

    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    if (hash === 'home') {
      document.getElementById('view-home').classList.add('active');
      this.renderHome();
    } else if (hash === 'class11' || hash === 'class12') {
      this.currentClass = hash === 'class12' ? '12' : '11';
      this.currentSubject = 'biology';
      document.getElementById('view-subject').classList.add('active');
      this.renderSubjectDashboard();
    } else if (['physics', 'chemistry', 'biology'].includes(hash)) {
      this.currentSubject = hash;
      document.getElementById('view-subject').classList.add('active');
      this.renderSubjectDashboard();
    } else if (hash === 'bookmarks') {
      document.getElementById('view-bookmarks').classList.add('active');
      this.renderBookmarksView();
    } else if (hash === 'weak-cards') {
      document.getElementById('view-weak-cards').classList.add('active');
      this.renderWeakCardsView();
    } else if (hash === 'revision') {
      document.getElementById('view-revision').classList.add('active');
      this.renderRevisionView();
    } else if (hash === 'progress') {
      document.getElementById('view-progress').classList.add('active');
      this.renderProgressDashboard();
    } else if (hash === 'about') {
      document.getElementById('view-about').classList.add('active');
    } else if (hash === 'support') {
      document.getElementById('view-support').classList.add('active');
    } else {
      document.getElementById('view-home').classList.add('active');
    }

    window.scrollTo(0, 0);
  }

  /* ---------------- Global Counters & Stats ---------------- */
  updateGlobalCounters() {
    const cat = this.dataService.getCatalog();
    if (!cat) return;

    let totalPub = 0;
    let activeCh = 0;

    cat.chapters.forEach(ch => {
      if (ch.publishedCount > 0) {
        totalPub += ch.publishedCount;
        activeCh += 1;
      }
    });

    const gStats = this.progressStore.getGlobalStats();

    document.getElementById('global-published-count').textContent = totalPub;
    document.getElementById('global-chapters-active').textContent = `${activeCh} Active`;
    document.getElementById('user-studied-count').textContent = gStats.viewed;
    document.getElementById('user-mastered-count').textContent = gStats.mastered;

    // Badges in Header
    document.getElementById('nav-bookmarks-count').textContent = gStats.bookmarked;
    document.getElementById('nav-weak-count').textContent = gStats.weak;

    const revGroups = this.progressStore.getRevisionCardsByStatus();
    document.getElementById('nav-due-count').textContent = revGroups.due.length;
  }

  /* ---------------- Home View Rendering ---------------- */
  renderHome() {
    this.updateGlobalCounters();
    this.renderContinueStudyingCard();
    this.renderPublishedSpotlight();
  }

  renderContinueStudyingCard() {
    const cont = document.getElementById('continue-card-container');
    const last = this.progressStore.state.lastSession;
    const revGroups = this.progressStore.getRevisionCardsByStatus();

    if (!last) {
      cont.innerHTML = `
        <div class="continue-card-content">
          <h3>Start your first flashcard session 🚀</h3>
          <p>Practice high-yield questions designed strictly for NEET UG with active recall & trap analysis.</p>
        </div>
        <button type="button" class="btn btn-primary btn-lg" onclick="window.app.openSessionConfig('cell-the-unit-of-life')">
          Begin with Biology (Cell) &rarr;
        </button>
      `;
    } else {
      cont.innerHTML = `
        <div class="continue-card-content">
          <h3>Continue: ${last.chapterTitle}</h3>
          <p>${last.subject.toUpperCase()} • Class ${last.class} &nbsp;|&nbsp; ${revGroups.due.length} cards scheduled for revision</p>
        </div>
        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn btn-primary" onclick="window.app.openSessionConfig('${last.chapterSlug}')">
            Resume Chapter &rarr;
          </button>
          ${revGroups.due.length > 0 ? `
            <button type="button" class="btn btn-secondary" onclick="window.location.hash='#revision'">
              Revise Due (${revGroups.due.length})
            </button>
          ` : ''}
        </div>
      `;
    }
  }

  renderPublishedSpotlight() {
    const grid = document.getElementById('published-chapters-grid');
    if (!grid) return;

    const published = this.dataService.catalog.chapters.filter(ch => ch.publishedCount > 0);
    grid.innerHTML = published.map(ch => this.createChapterCardHTML(ch)).join('');
  }

  /* ---------------- Subject Dashboard Rendering ---------------- */
  renderSubjectDashboard() {
    const subjMeta = this.dataService.catalog.subjects[this.currentSubject];
    if (!subjMeta) return;

    // Header updates
    document.getElementById('subject-dash-breadcrumb').textContent = subjMeta.name;
    document.getElementById('subject-dash-title').textContent = `NEET ${subjMeta.name} Flashcards`;
    document.getElementById('subject-dash-desc').textContent = `${subjMeta.description} Target: 180 high-yield cards per chapter.`;

    // Sync Class Tabs
    const tabs = document.querySelectorAll('#subject-class-tabs .class-pill');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.class === this.currentClass));

    // Stats updates
    const chs = this.dataService.getChaptersBySubjectAndClass(this.currentSubject, this.currentClass);
    let pubCount = 0;
    chs.forEach(c => pubCount += c.publishedCount);

    document.getElementById('subject-dash-total-chapters').textContent = chs.length;
    document.getElementById('subject-dash-published-cards').textContent = `${pubCount} / ${chs.length * 180}`;

    this.renderSubjectChapters();
  }

  renderSubjectChapters() {
    const grid = document.getElementById('subject-chapters-grid');
    if (!grid) return;

    const query = document.getElementById('chapter-search-filter').value.toLowerCase().trim();
    const statusRadio = document.querySelector('input[name="chapter-status-filter"]:checked').value;

    let chs = this.dataService.getChaptersBySubjectAndClass(this.currentSubject, this.currentClass);

    if (query) {
      chs = chs.filter(c => c.title.toLowerCase().includes(query) || String(c.chapterNumber).includes(query));
    }

    if (statusRadio === 'published') {
      chs = chs.filter(c => c.publishedCount > 0);
    }

    if (chs.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">No chapters found matching your filter.</div>`;
      return;
    }

    grid.innerHTML = chs.map(ch => this.createChapterCardHTML(ch)).join('');
  }

  createChapterCardHTML(ch) {
    const stats = this.progressStore.getChapterStats(ch.slug);
    const isPublished = ch.publishedCount > 0;
    const masteryPct = isPublished ? Math.min(100, Math.round((stats.mastered / ch.publishedCount) * 100)) : 0;
    const subjCode = ch.subject.toLowerCase();

    return `
      <div class="chapter-card ${isPublished ? 'is-published' : 'is-empty'}">
        <div class="chapter-card-top">
          <span class="ch-number-badge">CH ${ch.chapterNumber}</span>
          <span class="ch-subject-tag subject-badge ${subjCode}">${ch.subjectName.toUpperCase()} • CL ${ch.class}</span>
        </div>

        <h3 class="ch-title">${ch.title}</h3>

        <div class="ch-count-strip">
          <span class="ch-published-count">Published: <strong>${ch.publishedCount} / ${ch.targetFlashcards}</strong></span>
          <span class="ch-target-count">${masteryPct}% Mastered</span>
        </div>

        <div class="ch-progress-track">
          <div class="ch-progress-bar" style="width: ${masteryPct}%"></div>
        </div>

        <div class="ch-metrics-row">
          <div class="ch-metric-cell">
            <span class="ch-metric-val">${stats.viewed}</span>
            <span class="ch-metric-lbl">Studied</span>
          </div>
          <div class="ch-metric-cell">
            <span class="ch-metric-val text-green">${stats.mastered}</span>
            <span class="ch-metric-lbl">Mastered</span>
          </div>
          <div class="ch-metric-cell">
            <span class="ch-metric-val text-orange">${stats.weak}</span>
            <span class="ch-metric-lbl">Weak</span>
          </div>
          <div class="ch-metric-cell">
            <span class="ch-metric-val">${stats.bookmarked}</span>
            <span class="ch-metric-lbl">Saved</span>
          </div>
        </div>

        <div class="ch-buttons-row">
          ${isPublished ? `
            <button type="button" class="btn btn-primary btn-block" onclick="window.app.openSessionConfig('${ch.slug}')">
              START LEARNING
            </button>
            <div class="ch-sub-actions">
              <button type="button" class="btn btn-secondary" onclick="window.app.startQuickRevision('${ch.slug}')" title="High-yield cards only">
                Quick Rev
              </button>
              <button type="button" class="btn btn-secondary" onclick="window.app.startWeakPractice('${ch.slug}')" title="Practice difficult cards">
                Weak (${stats.weak})
              </button>
            </div>
          ` : `
            <button type="button" class="btn btn-coming-soon btn-block" disabled>
              CONTENT COMING SOON
            </button>
          `}
        </div>
      </div>
    `;
  }

  /* ---------------- Session Configuration Modal ---------------- */
  bindConfigModalEvents() {
    const modal = document.getElementById('config-modal');
    document.getElementById('close-config-btn').addEventListener('click', () => modal.setAttribute('hidden', ''));
    document.getElementById('config-cancel-btn').addEventListener('click', () => modal.setAttribute('hidden', ''));

    // Limit Pills
    const limitPills = document.querySelectorAll('#cfg-card-limit-pills .limit-pill');
    limitPills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        limitPills.forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Start Session Button
    document.getElementById('config-start-session-btn').addEventListener('click', () => {
      this.launchConfiguredSession();
    });
  }

  openSessionConfig(chapterSlug) {
    const chMeta = this.dataService.getChapterBySlug(chapterSlug);
    if (!chMeta || chMeta.publishedCount === 0) {
      alert('This chapter has no published cards yet. Check back soon!');
      return;
    }

    this.sessionConfig = { chapterSlug };

    document.getElementById('cfg-subject-name').textContent = `${chMeta.subjectName} • Class ${chMeta.class}`;
    document.getElementById('cfg-chapter-title').textContent = chMeta.title;
    document.getElementById('cfg-available-count').textContent = `Published: ${chMeta.publishedCount} / ${chMeta.targetFlashcards} cards`;

    document.getElementById('config-modal').removeAttribute('hidden');
  }

  async launchConfiguredSession() {
    const modal = document.getElementById('config-modal');
    modal.setAttribute('hidden', '');

    const slug = this.sessionConfig.chapterSlug;
    const mode = document.querySelector('input[name="cfg-mode"]:checked').value;
    const limitPill = document.querySelector('#cfg-card-limit-pills .limit-pill.active');
    const limit = limitPill ? limitPill.dataset.limit : 'all';
    const cat = document.getElementById('cfg-category-select').value;
    const diff = document.getElementById('cfg-difficulty-select').value;

    const chData = await this.dataService.getFlashcardsForChapter(slug);
    if (!chData || !chData.cards || chData.cards.length === 0) {
      alert('No flashcards found for this chapter.');
      return;
    }

    let cards = [...chData.cards];

    // Filter by Category
    if (cat !== 'all') {
      cards = cards.filter(c => c.category === cat);
    }

    // Filter by Difficulty
    if (diff !== 'all') {
      cards = cards.filter(c => c.difficulty === diff);
    }

    // Apply Mode sorting/filtering
    if (mode === 'rapid') {
      // Prioritize High-Yield Rapid Revision or High NEET priority
      cards = cards.filter(c => c.category === 'High-Yield Rapid Revision' || c.neetPriority === 'High');
    } else if (mode === 'weak') {
      // Prioritize weak cards
      cards.sort((a, b) => {
        const sA = this.progressStore.isCardWeak(a.id) ? -1 : 1;
        const sB = this.progressStore.isCardWeak(b.id) ? -1 : 1;
        return sA - sB;
      });
    } else if (mode === 'random') {
      // Shuffle
      cards.sort(() => Math.random() - 0.5);
    }

    // Card count limit
    if (limit !== 'all') {
      const num = parseInt(limit, 10);
      if (!isNaN(num) && num > 0) {
        cards = cards.slice(0, num);
      }
    }

    if (cards.length === 0) {
      alert('No cards matched your filter criteria. Try broader settings.');
      return;
    }

    this.startStudySession(cards, chData);
  }

  async startQuickRevision(slug) {
    const chData = await this.dataService.getFlashcardsForChapter(slug);
    if (!chData) return;
    const rapidCards = chData.cards.filter(c => c.category === 'High-Yield Rapid Revision' || c.neetPriority === 'High');
    this.startStudySession(rapidCards.length > 0 ? rapidCards : chData.cards, chData);
  }

  async startWeakPractice(slug) {
    const chData = await this.dataService.getFlashcardsForChapter(slug);
    if (!chData) return;
    const weakCards = chData.cards.filter(c => {
      const st = this.progressStore.getCardState(c.id);
      return st && st.isWeak;
    });

    if (weakCards.length === 0) {
      alert('You have no weak cards logged in this chapter! Good job!');
      return;
    }
    this.startStudySession(weakCards, chData);
  }

  /* ---------------- Fullscreen Study Session ---------------- */
  startStudySession(cards, chapterMeta) {
    this.activeSession = {
      cards,
      chapterMeta
    };
    this.activeCardIndex = 0;
    this.sessionStartTime = Date.now();
    this.sessionStats = {
      studied: 0,
      mastered: 0,
      again: 0,
      cardsRated: new Set(),
      categoryBreakdown: {}
    };

    // Header info
    document.getElementById('study-subject-pill').textContent = `${chapterMeta.subject} • Class ${chapterMeta.class}`;
    document.getElementById('study-chapter-title').textContent = chapterMeta.chapter;
    document.getElementById('study-total-cards').textContent = cards.length;

    // Show study modal
    const modal = document.getElementById('study-modal');
    modal.removeAttribute('hidden');

    this.displayCard(this.activeCardIndex);
  }

  displayCard(index) {
    if (!this.activeSession || index < 0 || index >= this.activeSession.cards.length) {
      return;
    }

    this.activeCardIndex = index;
    const card = this.activeSession.cards[index];
    const total = this.activeSession.cards.length;

    // Progress
    document.getElementById('study-current-index').textContent = index + 1;
    const pct = Math.round(((index + 1) / total) * 100);
    document.getElementById('study-progress-bar').style.width = `${pct}%`;

    // Unflip card
    const cardWrapper = document.getElementById('flashcard-wrapper');
    cardWrapper.classList.remove('is-flipped');

    // FRONT
    document.getElementById('card-front-category').textContent = card.category || 'Core Concept';
    document.getElementById('card-front-diff').textContent = card.difficulty || 'Medium';
    document.getElementById('card-front-id').textContent = card.id || '';
    document.getElementById('card-front-question').innerHTML = card.front || '';

    // Formula on front if available
    if (card.formula) {
      document.getElementById('card-front-question').innerHTML += `<div style="margin-top:0.75rem; font-family:var(--font-mono); font-size:1rem; color:var(--color-primary); background:var(--bg-surface-secondary); padding:0.5rem 0.75rem; border-radius:6px;">${card.formula}</div>`;
    }

    // Tags
    const tagsRow = document.getElementById('card-front-tags');
    tagsRow.innerHTML = (card.tags || []).map(t => `<span class="card-tag-pill">#${t}</span>`).join('');

    // BACK
    document.getElementById('card-back-id').textContent = card.id || '';
    document.getElementById('card-back-answer').innerHTML = card.back || '';
    document.getElementById('card-back-explanation').innerHTML = card.explanation || '';

    // NEET Trap Box
    const trapBox = document.getElementById('card-back-trap-box');
    const trapText = document.getElementById('card-back-trap');
    if (card.commonTrap) {
      trapText.innerHTML = card.commonTrap;
      trapBox.removeAttribute('hidden');
    } else {
      trapBox.setAttribute('hidden', '');
    }

    // Memory Trick Box
    const trickBox = document.getElementById('card-back-trick-box');
    const trickText = document.getElementById('card-back-trick');
    if (card.memoryTrick) {
      trickText.innerHTML = card.memoryTrick;
      trickBox.removeAttribute('hidden');
    } else {
      trickBox.setAttribute('hidden', '');
    }

    // Table Box
    const tableBox = document.getElementById('card-back-table-box');
    if (card.table) {
      tableBox.innerHTML = card.table;
      tableBox.removeAttribute('hidden');
    } else {
      tableBox.innerHTML = '';
      tableBox.setAttribute('hidden', '');
    }

    // Bookmark state
    const isBm = this.progressStore.isBookmarked(card.id);
    document.getElementById('study-bookmark-btn').classList.toggle('is-bookmarked', isBm);

    // Nav buttons disable state
    document.getElementById('study-prev-btn').disabled = index === 0;
    document.getElementById('study-next-btn').disabled = index === total - 1;
  }

  flipCard() {
    const cardWrapper = document.getElementById('flashcard-wrapper');
    cardWrapper.classList.toggle('is-flipped');
  }

  rateActiveCard(rating) {
    if (!this.activeSession) return;
    const card = this.activeSession.cards[this.activeCardIndex];
    const chMeta = this.activeSession.chapterMeta;

    this.progressStore.rateCard(card, chMeta, rating);

    // Session stats
    if (!this.sessionStats.cardsRated.has(card.id)) {
      this.sessionStats.cardsRated.add(card.id);
      this.sessionStats.studied += 1;
    }

    if (rating === 'good' || rating === 'easy') {
      this.sessionStats.mastered += 1;
    } else {
      this.sessionStats.again += 1;
    }

    // Track category breakdown
    const cat = card.category || 'Core Concept';
    this.sessionStats.categoryBreakdown[cat] = (this.sessionStats.categoryBreakdown[cat] || 0) + 1;

    // Proceed to next card or complete session
    if (this.activeCardIndex < this.activeSession.cards.length - 1) {
      this.displayCard(this.activeCardIndex + 1);
    } else {
      this.completeSession();
    }
  }

  completeSession() {
    document.getElementById('study-modal').setAttribute('hidden', '');

    const durationSec = Math.round((Date.now() - this.sessionStartTime) / 1000);
    const m = Math.floor(durationSec / 60);
    const s = durationSec % 60;
    const timeStr = `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;

    document.getElementById('summary-chapter-name').textContent = this.activeSession.chapterMeta.chapter;
    document.getElementById('summary-studied-count').textContent = this.sessionStats.studied;
    document.getElementById('summary-mastered-count').textContent = this.sessionStats.mastered;
    document.getElementById('summary-revision-count').textContent = this.sessionStats.again;
    document.getElementById('summary-time-spent').textContent = timeStr;

    // Insights breakdown
    const insightsEl = document.getElementById('summary-insights');
    const cats = Object.keys(this.sessionStats.categoryBreakdown);
    if (cats.length > 0) {
      insightsEl.innerHTML = `
        <div style="font-size:0.85rem; text-align:left; background:var(--bg-surface-secondary); padding:0.75rem 1rem; border-radius:8px;">
          <strong>Category Recall Breakdown:</strong>
          <ul style="margin-top:0.35rem; padding-left:1.2rem;">
            ${cats.map(c => `<li>${c}: ${this.sessionStats.categoryBreakdown[c]} cards practiced</li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      insightsEl.innerHTML = '';
    }

    document.getElementById('summary-modal').removeAttribute('hidden');
    this.updateGlobalCounters();
  }

  bindStudyEvents() {
    const cardWrapper = document.getElementById('flashcard-wrapper');
    const flipActionBtn = document.getElementById('study-flip-action-btn');

    // Click to flip
    cardWrapper.addEventListener('click', () => this.flipCard());
    flipActionBtn.addEventListener('click', () => this.flipCard());

    // Bookmark button
    document.getElementById('study-bookmark-btn').addEventListener('click', () => {
      if (!this.activeSession) return;
      const card = this.activeSession.cards[this.activeCardIndex];
      const chMeta = this.activeSession.chapterMeta;
      const isBm = this.progressStore.toggleBookmark(card, chMeta);
      document.getElementById('study-bookmark-btn').classList.toggle('is-bookmarked', isBm);
      this.updateGlobalCounters();
    });

    // Close study button
    document.getElementById('close-study-btn').addEventListener('click', () => {
      if (confirm('Exit study session? Your progress on rated cards is already saved.')) {
        document.getElementById('study-modal').setAttribute('hidden', '');
        this.updateGlobalCounters();
      }
    });

    // Nav arrows
    document.getElementById('study-prev-btn').addEventListener('click', () => {
      if (this.activeCardIndex > 0) {
        this.displayCard(this.activeCardIndex - 1);
      }
    });

    document.getElementById('study-next-btn').addEventListener('click', () => {
      if (this.activeSession && this.activeCardIndex < this.activeSession.cards.length - 1) {
        this.displayCard(this.activeCardIndex + 1);
      }
    });

    // Rating buttons
    document.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rating = e.currentTarget.dataset.rate;
        this.rateActiveCard(rating);
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const studyModal = document.getElementById('study-modal');
      if (studyModal.hasAttribute('hidden')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.flipCard();
      } else if (e.key === '1') {
        this.rateActiveCard('again');
      } else if (e.key === '2') {
        this.rateActiveCard('hard');
      } else if (e.key === '3') {
        this.rateActiveCard('good');
      } else if (e.key === '4') {
        this.rateActiveCard('easy');
      } else if (e.key === 'ArrowLeft') {
        if (this.activeCardIndex > 0) this.displayCard(this.activeCardIndex - 1);
      } else if (e.key === 'ArrowRight') {
        if (this.activeSession && this.activeCardIndex < this.activeSession.cards.length - 1) {
          this.displayCard(this.activeCardIndex + 1);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        document.getElementById('study-bookmark-btn').click();
      } else if (e.key === 'Escape') {
        document.getElementById('close-study-btn').click();
      }
    });

    // Mobile Swipe Gestures
    cardWrapper.addEventListener('touchstart', (e) => {
      this.touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    cardWrapper.addEventListener('touchend', (e) => {
      this.touchEndX = e.changedTouches[0].screenX;
      this.handleCardSwipe();
    }, { passive: true });
  }

  handleCardSwipe() {
    const diff = this.touchEndX - this.touchStartX;
    const threshold = 60;
    if (diff > threshold) {
      // Swipe Right -> Knew it / Good
      this.rateActiveCard('good');
    } else if (diff < -threshold) {
      // Swipe Left -> Revise again
      this.rateActiveCard('again');
    }
  }

  bindSummaryEvents() {
    document.getElementById('summary-repeat-btn').addEventListener('click', () => {
      document.getElementById('summary-modal').setAttribute('hidden', '');
      this.startStudySession(this.activeSession.cards, this.activeSession.chapterMeta);
    });

    document.getElementById('summary-revise-weak-btn').addEventListener('click', () => {
      document.getElementById('summary-modal').setAttribute('hidden', '');
      this.startWeakPractice(this.activeSession.chapterMeta.slug);
    });

    document.getElementById('summary-done-btn').addEventListener('click', () => {
      document.getElementById('summary-modal').setAttribute('hidden', '');
      this.handleRoute();
    });
  }

  /* ---------------- Dedicated Views Rendering ---------------- */
  renderBookmarksView() {
    const listContainer = document.getElementById('bookmarks-list-container');
    const bookmarked = this.progressStore.getBookmarkedCardsList();
    const btn = document.getElementById('study-all-bookmarks-btn');

    if (bookmarked.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:3rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:16px;">
          <div style="font-size:2.5rem; margin-bottom:0.75rem;">🔖</div>
          <h3>No Bookmarked Cards Yet</h3>
          <p style="color:var(--text-muted); max-width:420px; margin:0.5rem auto 1.5rem;">
            When studying, tap the bookmark icon or press 'B' on difficult cards to collect them here.
          </p>
          <button type="button" class="btn btn-primary" onclick="window.app.openSessionConfig('cell-the-unit-of-life')">
            Explore Biology Flashcards
          </button>
        </div>
      `;
      btn.disabled = true;
      return;
    }

    btn.disabled = false;
    btn.onclick = () => {
      // Gather full card objects
      const allCards = this.dataService.getAllCachedCards();
      const bmIds = new Set(bookmarked.map(b => b.cardId));
      const fullCards = allCards.filter(c => bmIds.has(c.id));
      if (fullCards.length > 0) {
        this.startStudySession(fullCards, { chapter: 'My Bookmarked Cards', subject: 'All', class: '11/12' });
      }
    };

    listContainer.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${bookmarked.map(b => `
          <div style="background:var(--bg-surface); border:1px solid var(--border-color); padding:1rem 1.25rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:0.72rem; font-weight:700; color:var(--color-primary); text-transform:uppercase;">${b.subject} • Class ${b.class} &bull; ${b.category}</span>
              <h4 style="font-size:0.98rem; font-weight:600; margin:0.25rem 0;">${b.cardId}</h4>
              <p style="font-size:0.85rem; color:var(--text-muted);">From chapter: ${b.chapterTitle}</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionConfig('${b.chapterSlug}')">
              Open Chapter
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderWeakCardsView() {
    const listContainer = document.getElementById('weak-cards-list-container');
    const summaryBox = document.getElementById('weak-summary-card');
    const weakList = this.progressStore.getWeakCardsList();
    const btn = document.getElementById('practice-all-weak-btn');

    if (weakList.length === 0) {
      summaryBox.innerHTML = '';
      listContainer.innerHTML = `
        <div style="text-align:center; padding:3rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:16px;">
          <div style="font-size:2.5rem; margin-bottom:0.75rem;">🎯</div>
          <h3>Zero Weak Cards Logged!</h3>
          <p style="color:var(--text-muted); max-width:420px; margin:0.5rem auto 1.5rem;">
            When you mark cards 'Again' or 'Hard', they automatically compile here for focused revision.
          </p>
          <button type="button" class="btn btn-primary" onclick="window.app.openSessionConfig('cell-the-unit-of-life')">
            Start Learning
          </button>
        </div>
      `;
      btn.disabled = true;
      return;
    }

    btn.disabled = false;
    btn.onclick = () => {
      const allCards = this.dataService.getAllCachedCards();
      const weakIds = new Set(weakList.map(w => w.cardId));
      const fullCards = allCards.filter(c => weakIds.has(c.id));
      if (fullCards.length > 0) {
        this.startStudySession(fullCards, { chapter: 'All Weak Cards Practice', subject: 'Targeted Review', class: '11/12' });
      }
    };

    // Summarize weak by chapter
    const byCh = {};
    weakList.forEach(w => {
      byCh[w.chapterTitle] = (byCh[w.chapterTitle] || 0) + 1;
    });

    summaryBox.innerHTML = `
      <div style="background:var(--color-rose-light); border-left:4px solid var(--color-rose); padding:1rem 1.25rem; border-radius:0 8px 8px 0; margin-bottom:1.5rem;">
        <h4 style="color:#B91C1C; font-weight:700; margin-bottom:0.25rem;">Weak Topics Distribution</h4>
        <div style="display:flex; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem;">
          ${Object.entries(byCh).map(([title, cnt]) => `
            <span style="background:#FFFFFF; border:1px solid rgba(239, 68, 68, 0.4); padding:0.25rem 0.6rem; border-radius:999px; font-size:0.8rem; font-weight:600;">
              ${title} &bull; <strong style="color:var(--color-rose);">${cnt} cards</strong>
            </span>
          `).join('')}
        </div>
      </div>
    `;

    listContainer.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${weakList.map(w => `
          <div style="background:var(--bg-surface); border:1px solid var(--border-color); padding:1rem 1.25rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:0.72rem; font-weight:700; color:var(--color-rose); text-transform:uppercase;">NEEDS PRACTICE &bull; ${w.subject}</span>
              <h4 style="font-size:0.98rem; font-weight:600; margin:0.25rem 0;">${w.cardId}</h4>
              <p style="font-size:0.85rem; color:var(--text-muted);">${w.chapterTitle} &bull; Category: ${w.category}</p>
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="window.app.openSessionConfig('${w.chapterSlug}')">
              Revise
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderRevisionView() {
    const revGroups = this.progressStore.getRevisionCardsByStatus();
    document.getElementById('rev-due-count').textContent = revGroups.due.length;
    document.getElementById('rev-overdue-count').textContent = revGroups.overdue.length;
    document.getElementById('rev-tomorrow-count').textContent = revGroups.tomorrow.length;
    document.getElementById('rev-week-count').textContent = revGroups.week.length;

    const btn = document.getElementById('start-due-revision-btn');
    btn.disabled = revGroups.due.length === 0;

    btn.onclick = () => {
      const allCards = this.dataService.getAllCachedCards();
      const dueIds = new Set(revGroups.due.map(d => d.cardId));
      const fullCards = allCards.filter(c => dueIds.has(c.id));
      if (fullCards.length > 0) {
        this.startStudySession(fullCards, { chapter: 'Spaced Repetition Due Today', subject: 'All', class: '11/12' });
      }
    };

    const container = document.getElementById('revision-cards-container');
    if (revGroups.due.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:3rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:16px;">
          <div style="font-size:2.5rem; margin-bottom:0.75rem;">🎉</div>
          <h3>All Caught Up on Revision!</h3>
          <p style="color:var(--text-muted); max-width:420px; margin:0.5rem auto 1.5rem;">
            No cards are due for review right now. Come back tomorrow or start learning a new chapter.
          </p>
          <button type="button" class="btn btn-primary" onclick="window.location.hash='#physics'">
            Practice Physics
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${revGroups.due.map(d => `
          <div style="background:var(--bg-surface); border:1px solid var(--border-color); padding:1rem 1.25rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:0.72rem; font-weight:700; color:var(--color-primary); text-transform:uppercase;">DUE TODAY &bull; ${d.subject}</span>
              <h4 style="font-size:0.98rem; font-weight:600; margin:0.25rem 0;">${d.cardId}</h4>
              <p style="font-size:0.85rem; color:var(--text-muted);">${d.chapterTitle} &bull; Interval: ${d.intervalDays} days</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openSessionConfig('${d.chapterSlug}')">
              Review
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderProgressDashboard() {
    this.updateDailyGoalWidget();

    // Streak
    const s = this.progressStore.state.streak;
    document.getElementById('current-streak-val').textContent = s.current;
    document.getElementById('longest-streak-val').textContent = `${s.longest} Days`;
    document.getElementById('total-days-studied-val').textContent = `${s.totalDays} Days`;

    // Subject Breakdown Progress
    let bioStudied = 0;
    let phyStudied = 0;
    let cheStudied = 0;

    for (const cid in this.progressStore.state.cards) {
      const c = this.progressStore.state.cards[cid];
      if (c.views > 0) {
        if (c.subject.toLowerCase() === 'biology') bioStudied++;
        if (c.subject.toLowerCase() === 'physics') phyStudied++;
        if (c.subject.toLowerCase() === 'chemistry') cheStudied++;
      }
    }

    document.getElementById('progress-bar-bio-val').textContent = `${bioStudied} / 25`;
    document.getElementById('progress-bar-bio-fill').style.width = `${Math.min(100, Math.round((bioStudied / 25) * 100))}%`;

    document.getElementById('progress-bar-phy-val').textContent = `${phyStudied} / 15`;
    document.getElementById('progress-bar-phy-fill').style.width = `${Math.min(100, Math.round((phyStudied / 15) * 100))}%`;

    document.getElementById('progress-bar-che-val').textContent = `${cheStudied} / 15`;
    document.getElementById('progress-bar-che-fill').style.width = `${Math.min(100, Math.round((cheStudied / 15) * 100))}%`;
  }

  updateDailyGoalWidget() {
    const goal = this.progressStore.getDailyGoal();
    const studiedToday = this.progressStore.getTodayStudiedCount();

    document.getElementById('daily-studied-val').textContent = studiedToday;
    document.getElementById('daily-target-val').textContent = `/ ${goal}`;

    // SVG Ring calculation: circumference = 2 * PI * r = 2 * 3.14159 * 58 = 364.4
    const circumference = 364.4;
    const progress = Math.min(1, studiedToday / goal);
    const offset = circumference - (progress * circumference);
    document.getElementById('goal-progress-circle').style.strokeDashoffset = offset;

    // Highlight selected goal pill
    document.querySelectorAll('.goal-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.goal === String(goal));
    });
  }

  /* ---------------- Universal Search ---------------- */
  performUniversalSearch(query) {
    const resultsContainer = document.getElementById('search-results-tray');
    if (!query) {
      resultsContainer.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    const subjFilter = document.getElementById('search-subject-filter').value;
    const clsFilter = document.getElementById('search-class-filter').value;
    const catFilter = document.getElementById('search-category-filter').value;

    const allCards = this.dataService.getAllCachedCards();
    const matched = allCards.filter(c => {
      if (subjFilter !== 'all' && c.subject.toLowerCase() !== subjFilter.toLowerCase()) return false;
      if (clsFilter !== 'all' && String(c.class) !== clsFilter) return false;
      if (catFilter !== 'all' && c.category !== catFilter) return false;

      const inQ = (c.front || '').toLowerCase().includes(q);
      const inA = (c.back || '').toLowerCase().includes(q);
      const inCh = (c.chapterTitle || '').toLowerCase().includes(q);
      const inTags = (c.tags || []).some(t => t.toLowerCase().includes(q));
      return inQ || inA || inCh || inTags;
    });

    if (matched.length === 0) {
      resultsContainer.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted);">No flashcards found matching "${query}".</div>`;
      return;
    }

    resultsContainer.innerHTML = matched.slice(0, 15).map(c => `
      <div class="search-result-item" onclick="window.app.openSessionConfig('${c.chapterSlug}')">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--color-primary); font-weight:700;">
          <span>${c.subject.toUpperCase()} &bull; CL ${c.class} &bull; ${c.chapterTitle}</span>
          <span>${c.category}</span>
        </div>
        <div style="font-weight:600; font-size:0.92rem; margin:0.25rem 0;">${c.front}</div>
        <div style="font-size:0.82rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
          Ans: ${c.back}
        </div>
      </div>
    `).join('');
  }
}

// Global App Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ScrutinyApp();
  window.app.init();
});

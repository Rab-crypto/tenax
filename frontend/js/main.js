/**
 * Project Memory - Main JavaScript
 * Handles theme toggle, copy buttons, smooth scroll, search filter, animations
 */

(function() {
  'use strict';

  // ============================================
  // Theme Toggle
  // ============================================
  const THEME_KEY = 'project-memory-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;

    // Default to dark theme (premium feel)
    return 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    // Update toggle button aria-label
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    }
  }

  function initTheme() {
    setTheme(getPreferredTheme());

    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  }

  // ============================================
  // Navigation Scroll Effect
  // ============================================
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let lastScroll = 0;
    const scrollThreshold = 50;

    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;

      if (currentScroll > scrollThreshold) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }

      lastScroll = currentScroll;
    }, { passive: true });
  }

  // ============================================
  // Copy Buttons for Code Blocks
  // ============================================
  function initCopyButtons() {
    document.querySelectorAll('.code-block__copy').forEach(button => {
      button.addEventListener('click', async () => {
        const codeBlock = button.closest('.code-block');
        const code = codeBlock.querySelector('code');

        if (!code) return;

        try {
          // Get text content, preserving line breaks
          const text = code.textContent;
          await navigator.clipboard.writeText(text);

          // Show feedback
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.classList.add('copied');

          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
          button.textContent = 'Failed';
          setTimeout(() => {
            button.textContent = 'Copy';
          }, 2000);
        }
      });
    });

    // Also handle inline copy buttons in docs
    document.querySelectorAll('[data-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        const text = button.getAttribute('data-copy');

        try {
          await navigator.clipboard.writeText(text);

          const originalHTML = button.innerHTML;
          button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';

          setTimeout(() => {
            button.innerHTML = originalHTML;
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });
    });
  }

  // ============================================
  // Smooth Scroll for Anchor Links
  // ============================================
  function initSmoothScroll() {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();

        const navHeight = document.querySelector('.nav')?.offsetHeight || 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });

        // Update URL without scrolling
        history.pushState(null, '', targetId);
      });
    });
  }

  // ============================================
  // Search Filter (for documentation pages)
  // ============================================
  function initSearch() {
    const searchInput = document.querySelector('.search-input');
    if (!searchInput) return;

    const searchableItems = document.querySelectorAll('[data-searchable]');
    const noResults = document.querySelector('.no-results');

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      let visibleCount = 0;

      searchableItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        const matches = query === '' || text.includes(query);

        item.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;

        // Highlight matching text
        if (query && matches) {
          highlightText(item, query);
        } else {
          removeHighlight(item);
        }
      });

      // Show/hide no results message
      if (noResults) {
        noResults.style.display = (visibleCount === 0 && query !== '') ? 'block' : 'none';
      }
    });
  }

  function highlightText(element, query) {
    // Remove existing highlights first
    removeHighlight(element);

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const matches = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent.toLowerCase().indexOf(query);

      if (index !== -1) {
        matches.push({ node, index, length: query.length });
      }
    }

    // Apply highlights in reverse order to preserve indices
    matches.reverse().forEach(({ node, index, length }) => {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + length);

      const highlight = document.createElement('mark');
      highlight.className = 'search-highlight';
      highlight.style.cssText = 'background: var(--accent-subtle); color: var(--accent); padding: 0.1em 0.2em; border-radius: 2px;';

      range.surroundContents(highlight);
    });
  }

  function removeHighlight(element) {
    element.querySelectorAll('mark.search-highlight').forEach(mark => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  // ============================================
  // Scroll Animations (Intersection Observer)
  // ============================================
  function initScrollAnimations() {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.fade-in').forEach(el => {
        el.classList.add('visible');
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.fade-in').forEach(el => {
      observer.observe(el);
    });
  }

  // ============================================
  // Collapsible Sections
  // ============================================
  function initCollapsibles() {
    document.querySelectorAll('[data-collapse-toggle]').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const targetId = toggle.getAttribute('data-collapse-toggle');
        const target = document.getElementById(targetId);

        if (!target) return;

        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

        toggle.setAttribute('aria-expanded', !isExpanded);
        target.hidden = isExpanded;

        // Animate icon rotation
        const icon = toggle.querySelector('.collapse-icon');
        if (icon) {
          icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      });
    });
  }

  // ============================================
  // Mobile Navigation
  // ============================================
  function initMobileNav() {
    const menuToggle = document.querySelector('.nav__menu-toggle');
    const mobileMenu = document.querySelector('.nav__mobile-menu');

    if (!menuToggle || !mobileMenu) return;

    menuToggle.addEventListener('click', () => {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';

      menuToggle.setAttribute('aria-expanded', !isOpen);
      mobileMenu.hidden = isOpen;
      document.body.style.overflow = isOpen ? '' : 'hidden';
    });

    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
        document.body.style.overflow = '';
      });
    });
  }

  // ============================================
  // Active Navigation Link
  // ============================================
  function initActiveNavLink() {
    const currentPath = window.location.pathname;

    document.querySelectorAll('.docs-sidebar__links a, .nav__link').forEach(link => {
      const href = link.getAttribute('href');

      if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
        link.classList.add('active');
      }
    });
  }

  // ============================================
  // Keyboard Navigation
  // ============================================
  function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // '/' to focus search
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input');
        if (searchInput) searchInput.focus();
      }

      // Escape to unfocus
      if (e.key === 'Escape') {
        document.activeElement.blur();
      }
    });
  }

  function isInputFocused() {
    const active = document.activeElement;
    return active.tagName === 'INPUT' ||
           active.tagName === 'TEXTAREA' ||
           active.isContentEditable;
  }

  // ============================================
  // Reading Progress Bar
  // ============================================
  function initReadingProgress() {
    const progressBar = document.querySelector('.reading-progress');
    if (!progressBar) return;

    window.addEventListener('scroll', () => {
      const winHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight - winHeight;
      const scrolled = window.scrollY;
      const progress = (scrolled / docHeight) * 100;

      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }, { passive: true });
  }

  // ============================================
  // Animated Terminal (Hero Section)
  // ============================================
  function initHeroTerminal() {
    const terminal = document.getElementById('hero-terminal');
    if (!terminal) return;

    const body = terminal.querySelector('.terminal__body');
    if (!body) return;

    // Terminal sequence - demonstrating the plugin
    const sequence = [
      { type: 'command', text: '/project-memory:search "auth"', delay: 0 },
      { type: 'output', text: 'Searching project memory...', delay: 800 },
      { type: 'result', html: `<span class="terminal__badge terminal__badge--decision">DECISION</span> Using JWT for authentication`, delay: 1200 },
      { type: 'result', html: `<span class="terminal__badge terminal__badge--pattern">PATTERN</span> Auth middleware on all /api routes`, delay: 1600 },
      { type: 'result', html: `<span class="terminal__badge terminal__badge--insight">INSIGHT</span> Token refresh needed for mobile`, delay: 2000 },
      { type: 'success', text: 'Found 3 results (12ms)', delay: 2400 },
      { type: 'empty', delay: 3000 },
      { type: 'command', text: '/project-memory:status', delay: 3200 },
      { type: 'output', text: 'Project Memory Status', delay: 3800 },
      { type: 'status', html: `Sessions: <span style="color: #A78BFA;">12</span> | Decisions: <span style="color: #FBBF24;">8</span> | Patterns: <span style="color: #60A5FA;">5</span>`, delay: 4200 },
    ];

    let currentLine = 0;

    function typeCommand(text, element) {
      let i = 0;
      const typing = document.createElement('span');
      typing.className = 'terminal__typing';
      element.appendChild(typing);

      const cursor = document.createElement('span');
      cursor.className = 'terminal__cursor';
      element.appendChild(cursor);

      return new Promise(resolve => {
        const interval = setInterval(() => {
          if (i < text.length) {
            typing.textContent += text[i];
            i++;
          } else {
            clearInterval(interval);
            cursor.remove();
            resolve();
          }
        }, 35);
      });
    }

    async function showLine(item) {
      const line = document.createElement('div');
      line.className = 'terminal__line';

      switch (item.type) {
        case 'command':
          line.innerHTML = `<span class="terminal__prompt">$</span><span class="terminal__command"></span>`;
          body.appendChild(line);
          // Trigger animation
          requestAnimationFrame(() => {
            line.style.animationDelay = '0s';
          });
          await typeCommand(item.text, line.querySelector('.terminal__command'));
          break;

        case 'output':
          line.classList.add('terminal__output');
          line.textContent = item.text;
          body.appendChild(line);
          break;

        case 'result':
          line.classList.add('terminal__output', 'terminal__output--highlight');
          line.innerHTML = item.html;
          body.appendChild(line);
          break;

        case 'success':
          line.classList.add('terminal__output', 'terminal__output--success');
          line.textContent = item.text;
          body.appendChild(line);
          break;

        case 'status':
          line.classList.add('terminal__output');
          line.innerHTML = item.html;
          body.appendChild(line);
          break;

        case 'empty':
          line.innerHTML = '&nbsp;';
          body.appendChild(line);
          break;
      }
    }

    function runSequence() {
      body.innerHTML = '';
      currentLine = 0;

      sequence.forEach((item, index) => {
        setTimeout(() => {
          showLine(item);
        }, item.delay);
      });

      // Loop the animation
      const totalDuration = sequence[sequence.length - 1].delay + 3000;
      setTimeout(runSequence, totalDuration);
    }

    // Start animation when terminal is visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runSequence();
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(terminal);
  }

  // ============================================
  // Hero Morphing Words Animation
  // ============================================
  function initMorphingWords() {
    const container = document.querySelector('.hero__morph-container');
    if (!container) return;

    const words = container.querySelectorAll('.hero__morph-word');
    if (words.length < 2) return;

    let currentIndex = 0;
    const interval = 2500; // Time between word changes

    function cycleWords() {
      const currentWord = words[currentIndex];
      const nextIndex = (currentIndex + 1) % words.length;
      const nextWord = words[nextIndex];

      // Exit current word
      currentWord.classList.remove('active');
      currentWord.classList.add('exit');

      // Enter next word
      setTimeout(() => {
        currentWord.classList.remove('exit');
        nextWord.classList.add('active');
        currentIndex = nextIndex;
      }, 300);
    }

    // Set initial state - first word is active
    words[0].classList.add('active');

    // Start cycling
    setInterval(cycleWords, interval);
  }

  // ============================================
  // Initialize Everything
  // ============================================
  function init() {
    initTheme();
    initNavScroll();
    initCopyButtons();
    initSmoothScroll();
    initSearch();
    initScrollAnimations();
    initCollapsibles();
    initMobileNav();
    initActiveNavLink();
    initKeyboardNav();
    initReadingProgress();
    initHeroTerminal();
    initMorphingWords();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

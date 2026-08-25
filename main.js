function initializeThemeToggle() {
  if (typeof document === "undefined") {
    return;
  }

  const navbarContainer = document.querySelector(".navbar .container-fluid");

  if (!navbarContainer || navbarContainer.querySelector(".theme-toggle-btn")) {
    return;
  }

  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "theme-toggle-btn";
  themeButton.setAttribute("aria-label", "Toggle light and dark mode");
  themeButton.setAttribute("title", "Toggle light and dark mode");
  themeButton.innerHTML = `
    <img class="theme-toggle-icon theme-icon-sun" src="/Assets/Icons/sun.svg" alt="Sun" aria-hidden="true" />
    <img class="theme-toggle-icon theme-icon-moon" src="/Assets/Icons/moon.svg" alt="Moon" aria-hidden="true" />
  `;

  // Insert as a list item in the navbar menu for desktop
  const navbarNav = navbarContainer.querySelector(".navbar-nav");
  
  if (navbarNav) {
    const themeToggleItem = document.createElement("li");
    themeToggleItem.className = "nav-item theme-toggle-item";
    themeToggleItem.appendChild(themeButton);
    navbarNav.appendChild(themeToggleItem);
  } else {
    // Fallback for mobile: insert before navbar-toggler
    const navToggler = navbarContainer.querySelector(".navbar-toggler");
    if (navToggler) {
      navbarContainer.insertBefore(themeButton, navToggler);
    } else {
      navbarContainer.appendChild(themeButton);
    }
  }

  const setTheme = function (isLight) {
    document.body.classList.toggle("light", isLight);
    themeButton.setAttribute("aria-pressed", String(isLight));
    themeButton.setAttribute(
      "aria-label",
      isLight ? "Switch to dark mode" : "Switch to light mode"
    );
    themeButton.title = isLight ? "Switch to dark mode" : "Switch to light mode";

    try {
      window.localStorage.setItem(
        "january8th-theme",
        isLight ? "light" : "dark"
      );
    } catch (error) {
      // Ignore storage access failures (private browsing, disabled cookies, etc.).
    }
  };

  // Default to dark mode for first-time visitors (no saved preference) —
  // the site no longer follows the OS light/dark preference on first load,
  // it only follows it once a visitor has explicitly chosen light mode
  // and we remember that choice.
  let prefersLight = false;

  try {
    const savedTheme = window.localStorage.getItem("january8th-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      prefersLight = savedTheme === "light";
    }
  } catch (error) {
    prefersLight = false;
  }

  setTheme(prefersLight);

  themeButton.addEventListener("click", function () {
    const nextTheme = !document.body.classList.contains("light");
    setTheme(nextTheme);
  });
}

function initializeContactHints() {
  if (typeof document === "undefined") {
    return;
  }

  const fields = document.querySelectorAll(".contact-field");

  fields.forEach(function (field) {
    const input = field.querySelector("input, textarea");
    const hint = field.querySelector(".contact-hint");

    if (!input || !hint) {
      return;
    }

    const showHint = function () {
      field.classList.add("is-focused");
      hint.setAttribute("aria-hidden", "false");
    };

    const hideHint = function () {
      field.classList.remove("is-focused");
      hint.setAttribute("aria-hidden", "true");
    };

    input.addEventListener("focus", showHint);
    input.addEventListener("click", showHint);
    input.addEventListener("blur", hideHint);

    hideHint();
  });
}

function initializeContactForm() {
  if (typeof document === "undefined") {
    return;
  }

  const form = document.querySelector("#contact-form");

  if (!form) {
    return;
  }

  const status = form.querySelector("#contact-form-status");
  const submitButton = form.querySelector('button[type="submit"]');

  const setStatus = function (message, tone) {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.remove("is-success", "is-error");
    if (tone) {
      status.classList.add(tone);
    }
  };

  form.addEventListener("submit", function (event) {
    // FormSubmit.co is a hosted relay: it accepts this POST and forwards it
    // as an email to the address in the form's action attribute, with no
    // backend of our own required. Submitting via fetch (instead of a plain
    // form POST) keeps the visitor on this page — a normal submit would
    // navigate them away to FormSubmit's own confirmation page — and lets
    // us show a message in place, matching the rest of the site's feel.
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }
    setStatus("Sending your message...", null);

    const formData = new FormData(form);

    fetch(form.action, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Request failed with status " + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        // FormSubmit replies with HTTP 200 even when it did NOT deliver the
        // email — e.g. while its one-time per-domain activation is still
        // pending, or if it silently rejects the request for some other
        // reason. The real signal is the JSON body's own success field, not
        // the HTTP status, so that case has to be treated as a failure here
        // rather than shown to the visitor as "message sent."
        if (data && String(data.success).toLowerCase() === "false") {
          throw new Error(data.message || "FormSubmit rejected the request");
        }
        form.reset();
        setStatus(
          "Message sent — thank you. I'll get back to you soon.",
          "is-success"
        );
      })
      .catch(function () {
        setStatus(
          "Something went wrong sending that. Please try again, or email amini.kave95@gmail.com directly.",
          "is-error"
        );
      })
      .finally(function () {
        if (submitButton) {
          submitButton.disabled = false;
        }
      });
  });
}

function initializePageTransitions() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    return;
  }

  // Must match the --chamber-duration value in style.css exactly — this is
  // how long the doors take to swing shut before we actually change pages.
  const CHAMBER_DURATION_MS = 650;

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const link = event.target.closest("a[href]");

    if (!link) {
      return;
    }

    const href = link.getAttribute("href");

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    if (link.target && link.target !== "_self") {
      return;
    }

    if (link.hasAttribute("download")) {
      return;
    }

    let destination;

    try {
      destination = new URL(href, window.location.href);
    } catch (error) {
      return;
    }

    // Different site entirely — let the browser navigate away plainly,
    // there is no next chamber of this cathedral to reveal.
    if (destination.origin !== window.location.origin) {
      return;
    }

    // A link to an anchor on the page already open is an in-page scroll,
    // not a move between chambers — leave it alone.
    if (
      destination.pathname === window.location.pathname &&
      destination.hash
    ) {
      return;
    }

    event.preventDefault();
    document.body.classList.add("chamber-exit");

    window.setTimeout(function () {
      window.location.href = destination.href;
    }, CHAMBER_DURATION_MS);
  });

  // A back/forward navigation can restore this exact document from bfcache
  // with .chamber-exit still applied from the moment it was left — drop it
  // so the doors are open, not stuck sealed, on the restored page.
  window.addEventListener("pageshow", function () {
    document.body.classList.remove("chamber-exit");
  });
}

function initializeChamberGuardians() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Same call as the doors themselves: no sentries without the doors that
  // carry them, and a static, unanimated lion left sitting over the page
  // would just be clutter under reduced motion.
  if (reduceMotion) {
    return;
  }

  [
    ["chamber-guardian-left", "chamber-guardian-art"],
    ["chamber-guardian-right", "chamber-guardian-art"],
  ].forEach(function (classes) {
    const guardian = document.createElement("div");
    guardian.className = "chamber-guardian " + classes[0];
    guardian.setAttribute("aria-hidden", "true");

    const art = document.createElement("div");
    art.className = classes[1];
    guardian.appendChild(art);

    document.body.appendChild(guardian);
  });
}

function initializeMagneticFooterLinks() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    return;
  }

  const links = document.querySelectorAll(
    ".footer-navigation a, .footer-contact a, .footer-title a"
  );

  if (!links.length) {
    return;
  }

  // How far a link is allowed to be pulled toward the cursor, in pixels,
  // and how far outside its own box the pull field still reaches.
  const maxPull = 10;
  const catchRadius = 28;

  links.forEach(function (link) {
    let frame = null;

    const settle = function (x, y, ease) {
      link.style.transition = ease
        ? "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)"
        : "transform 0.05s linear";
      link.style.transform = "translate(" + x + "px, " + y + "px)";
    };

    const onMove = function (event) {
      if (event.pointerType === "touch") {
        return;
      }

      const rect = link.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const reach = Math.max(rect.width, rect.height) / 2 + catchRadius;
      const distance = Math.hypot(dx, dy);

      if (distance > reach) {
        return;
      }

      // Pull strength fades to 0 at the edge of the catch radius and peaks
      // at the link's own center, so the tug feels magnetic, not linear.
      const pull = 1 - distance / reach;
      const targetX = (dx / reach) * maxPull * pull;
      const targetY = (dy / reach) * maxPull * pull;

      if (frame) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(function () {
        settle(targetX, targetY, false);
      });
    };

    const onLeave = function () {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      settle(0, 0, true);
    };

    link.addEventListener("pointermove", onMove);
    link.addEventListener("pointerleave", onLeave);
  });
}

function initializeLogoSignatureAnimation() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    return;
  }

  // The rose-medallion's sacred "breath" (grow, bloom with holy light,
  // settle) is driven by CSS on :hover/:focus-visible for pointer users.
  // Touch devices never fire :hover, so a tap here adds the same
  // .glyph-spin class the CSS keyframe listens for, and removes it once
  // the animation finishes so the very next tap can replay it.
  const marks = document.querySelectorAll(".navbar-brand, .footer-title a");

  marks.forEach(function (mark) {
    // Each mark now holds two stacked images (.logo-dark / .logo-light) so
    // the lion glyph can swap with the light/dark theme — only one is ever
    // visible at a time, but a tap should replay the breath on whichever
    // one that is, so both are wired up here rather than just the first.
    const glyphs = mark.querySelectorAll("img");

    if (!glyphs.length) {
      return;
    }

    glyphs.forEach(function (glyph) {
      glyph.addEventListener("animationend", function (event) {
        if (event.animationName === "glyph-awaken") {
          glyph.classList.remove("glyph-spin");
        }
      });
    });

    mark.addEventListener("click", function () {
      glyphs.forEach(function (glyph) {
        glyph.classList.remove("glyph-spin");
        void glyph.offsetWidth; // restart the animation even on rapid repeat taps
        glyph.classList.add("glyph-spin");
      });
    });
  });
}

function initializeWordHoverEffect() {
  if (typeof document === "undefined") {
    return;
  }

  const WRAPPED_ATTR = "data-word-hover";

  const wrapParagraph = function (p) {
    // Only fragment plain-text paragraphs. Paragraphs that already contain
    // elements (links, icons, etc.) are left alone so we never break markup.
    if (p.hasAttribute(WRAPPED_ATTR) || p.children.length > 0) {
      return;
    }

    const text = p.textContent;

    if (!text || !text.trim()) {
      return;
    }

    const fragment = document.createDocumentFragment();

    text.split(/(\s+)/).forEach(function (token) {
      if (token === "") {
        return;
      }

      if (/^\s+$/.test(token)) {
        fragment.appendChild(document.createTextNode(token));
        return;
      }

      const span = document.createElement("span");
      span.className = "word";
      span.textContent = token;
      fragment.appendChild(span);
    });

    p.textContent = "";
    p.appendChild(fragment);
    p.setAttribute(WRAPPED_ATTR, "true");
  };

  const wrapParagraphsWithin = function (root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }

    if (root.tagName === "P") {
      wrapParagraph(root);
    }

    root.querySelectorAll("p").forEach(wrapParagraph);
  };

  // Wrap every paragraph already on the page.
  wrapParagraphsWithin(document.body);

  // Keep wrapping paragraphs that get added later (notes cards, the notes
  // popup panel, the manifesto popup, etc.) so the hover effect stays
  // consistent across the whole site, not just the initial page load.
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            wrapParagraphsWithin(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// About page — Background section: expands/collapses the truncated
// "Influence" panel (the only column long enough to need a "Read More"
// toggle; see .background-copy.collapsible in style.css, scoped to
// desktop widths only). Generic over any `.read-more-btn` /
// `.collapsible` pair so a second panel could opt in later just by
// carrying the same markup — nothing here is Influence-specific.
function initializeReadMoreSections() {
  if (typeof document === "undefined") {
    return;
  }

  const buttons = document.querySelectorAll(".read-more-btn");

  buttons.forEach(function (button) {
    const targetId = button.getAttribute("aria-controls");
    const copy = targetId ? document.getElementById(targetId) : null;

    if (!copy) {
      return;
    }

    button.addEventListener("click", function () {
      const isExpanded = copy.classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(isExpanded));
      button.textContent = isExpanded ? "Read Less" : "Read More";
    });
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    initializeContactHints,
    initializeContactForm,
    initializeWordHoverEffect,
    initializeMagneticFooterLinks,
    initializePageTransitions,
    initializeLogoSignatureAnimation,
    initializeChamberGuardians,
    initializeReadMoreSections,
  };
}

if (typeof document !== "undefined") {
  const openButton = document.querySelector(".manifesto-open");
  const closeButton = document.querySelector(".popup-close");
  const popup = document.querySelector(".manifesto-popup");

  initializeThemeToggle();
  initializeContactHints();
  initializeContactForm();
  initializeWordHoverEffect();
  initializeMagneticFooterLinks();
  initializePageTransitions();
  initializeLogoSignatureAnimation();
  initializeChamberGuardians();
  initializeReadMoreSections();

  if (openButton) {
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const lockBodyScroll = function () {
      document.body.style.overflow = "hidden";
    };

    const unlockBodyScroll = function () {
      document.body.style.overflow = "";
    };

    const closePopup = function () {
      popup.classList.remove("show");
      popup.setAttribute("aria-hidden", "true");
      unlockBodyScroll();
      openButton.focus();
    };

    openButton.addEventListener("click", function () {
      popup.classList.add("show");
      popup.setAttribute("aria-hidden", "false");
      lockBodyScroll();
      requestAnimationFrame(function () {
        const dialog = popup.querySelector(".popup-container");
        if (dialog) {
          dialog.focus();
        } else {
          closeButton.focus();
        }
      });
    });

    closeButton.addEventListener("click", closePopup);

    popup.addEventListener("click", function (event) {
      if (event.target === popup) {
        closePopup();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && popup.classList.contains("show")) {
        closePopup();
      }

      if (event.key === "Tab" && popup.classList.contains("show")) {
        const container = popup.querySelector(".popup-container");
        const focusableElements = container
          ? container.querySelectorAll(focusableSelector)
          : [];

        if (!focusableElements.length) {
          event.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function normalizePathname(pathname) {
    if (!pathname) {
      return "/";
    }

    const normalized = pathname.replace(/\/index\.html$/i, "/");

    if (normalized.length > 1 && normalized.endsWith("/")) {
      return normalized.slice(0, -1);
    }

    return normalized || "/";
  }

  function syncNavbarActiveState() {
    const navLinks = document.querySelectorAll(".navbar .nav-link");

    if (!navLinks.length) {
      return;
    }

    const currentPath = normalizePathname(window.location.pathname);
    const currentHash = window.location.hash;
    let activeLink = null;

    navLinks.forEach(function (link) {
      link.classList.remove("active");
      link.removeAttribute("aria-current");

      const href = link.getAttribute("href");
      const rawHref = (href || "").trim();

      if (!rawHref) {
        return;
      }

      // Ignore placeholder hash links so they cannot steal active state from real pages.
      if (rawHref === "#") {
        return;
      }

      const url = new URL(rawHref, window.location.origin);
      const linkPath = normalizePathname(url.pathname);
      const linkHash = url.hash;

      if (linkHash) {
        if (linkHash === "#manifesto") {
          const isManifestoPage =
            currentPath === "/" && currentHash === "#manifesto";

          if (isManifestoPage) {
            activeLink = link;
          }
        } else if (linkPath === currentPath && linkHash === currentHash) {
          activeLink = link;
        }

        return;
      }

      if (linkPath === currentPath) {
        activeLink = link;
      }
    });

    if (!activeLink) {
      activeLink = document.querySelector('.navbar .nav-link[href="/"]');
    }

    if (activeLink) {
      activeLink.classList.add("active");
      activeLink.setAttribute("aria-current", "page");
    }

    navLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.forEach(function (item) {
          item.classList.remove("active");
          item.removeAttribute("aria-current");
        });

        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      });
    });
  }

  syncNavbarActiveState();

  function optimizeImageLoading() {
    const images = document.querySelectorAll("img");

    if (!images.length) {
      return;
    }

    const foldThreshold = window.innerHeight * 1.2;

    images.forEach(function (image, index) {
      if (!image.getAttribute("decoding")) {
        image.decoding = "async";
      }

      if (image.closest(".image-modal")) {
        return;
      }

      if (image.getAttribute("loading")) {
        return;
      }

      const rect = image.getBoundingClientRect();
      const likelyAboveTheFold = index === 0 || rect.top < foldThreshold;

      image.loading = likelyAboveTheFold ? "eager" : "lazy";

      if (likelyAboveTheFold && !image.getAttribute("fetchpriority")) {
        image.fetchPriority = "high";
      }
    });
  }

  optimizeImageLoading();

  function createImageModal() {
    const modal = document.createElement("div");
    modal.className = "image-modal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="image-modal-dialog" role="dialog" aria-modal="true" aria-label="Artwork preview">
        <button class="image-modal-close" type="button" aria-label="Close image preview">X</button>
        <figure class="image-modal-figure">
          <img class="image-modal-image" alt="" />
          <figcaption class="image-modal-caption">
            <h3 class="image-modal-title"></h3>
            <p class="image-modal-description"></p>
          </figcaption>
        </figure>
      </div>
    `;

    document.body.appendChild(modal);

    return {
      modal,
      dialog: modal.querySelector(".image-modal-dialog"),
      image: modal.querySelector(".image-modal-image"),
      title: modal.querySelector(".image-modal-title"),
      description: modal.querySelector(".image-modal-description"),
      closeButton: modal.querySelector(".image-modal-close"),
    };
  }

  const imageModal = createImageModal();

  const defaultImageModalDescription =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

  function closeImageModal() {
    imageModal.modal.classList.remove("is-open");
    imageModal.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    imageModal.image.removeAttribute("src");
    imageModal.image.alt = "";
    imageModal.title.textContent = "";
    imageModal.description.textContent = "";
  }

  function openImageModal(image) {
    const imageTitle = image.alt || "Artwork preview";
    const imageDescription =
      image.dataset.description || defaultImageModalDescription;

    imageModal.image.src = image.currentSrc || image.src;
    imageModal.image.alt = imageTitle;
    imageModal.title.textContent = imageTitle;
    imageModal.description.textContent = imageDescription;
    imageModal.modal.classList.add("is-open");
    imageModal.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  imageModal.closeButton.addEventListener("click", closeImageModal);

  imageModal.modal.addEventListener("click", function (event) {
    if (event.target === imageModal.modal) {
      closeImageModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      imageModal.modal.classList.contains("is-open")
    ) {
      closeImageModal();
    }

    if (
      event.key === "Escape" &&
      notesPanel.panel.classList.contains("is-open")
    ) {
      closeNotesPanel();
    }
  });

  const carousels = document.querySelectorAll(".carousel");

  carousels.forEach(function (carousel) {
    const track = carousel.querySelector(".carousel-track");
    const carouselWindow = carousel.querySelector(".car-window");
    const items = carousel.querySelectorAll(".car-item");

    const nextButton = carousel.querySelector(".next-btn");
    const previousButton = carousel.querySelector(".previous-btn");
    const previewImages = carousel.querySelectorAll(".car-item img");

    let currentSlide = 0;
    let motionTimer;

    function markCarouselMoving() {
      track.classList.add("is-moving");
      clearTimeout(motionTimer);

      motionTimer = setTimeout(function () {
        track.classList.remove("is-moving");
      }, 560);
    }

    function getMeasurements() {
      const firstItem = items[0];

      if (!firstItem) {
        return {
          distance: 0,
          maximumSlide: 0,
        };
      }

      const itemWidth = firstItem.getBoundingClientRect().width;

      const trackStyles = getComputedStyle(track);
      const gap = parseFloat(trackStyles.columnGap) || 0;

      const distance = itemWidth + gap;

      const visibleItems = Math.max(
        1,
        Math.floor((carouselWindow.clientWidth + gap) / distance),
      );

      const maximumSlide = Math.max(0, items.length - visibleItems);

      return {
        distance,
        maximumSlide,
      };
    }

    function updateCarousel(shouldAnimate = false) {
      const { distance, maximumSlide } = getMeasurements();

      currentSlide = Math.min(currentSlide, maximumSlide);

      track.style.transform = `translateX(-${currentSlide * distance}px)`;

      if (shouldAnimate) {
        markCarouselMoving();
      }

      const hasMultipleSlides = maximumSlide > 0;
      previousButton.disabled = !hasMultipleSlides;
      nextButton.disabled = !hasMultipleSlides;
    }

    nextButton.addEventListener("click", function () {
      const { maximumSlide } = getMeasurements();

      if (maximumSlide === 0) {
        return;
      }

      currentSlide = currentSlide >= maximumSlide ? 0 : currentSlide + 1;
      updateCarousel(true);
    });

    previousButton.addEventListener("click", function () {
      const { maximumSlide } = getMeasurements();

      if (maximumSlide === 0) {
        return;
      }

      currentSlide = currentSlide <= 0 ? maximumSlide : currentSlide - 1;
      updateCarousel(true);
    });

    previewImages.forEach(function (image) {
      if (image.closest("a")) {
        return;
      }

      image.classList.add("previewable-image");
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute(
        "aria-label",
        `Open enlarged view of ${image.alt || "artwork"}`,
      );

      image.addEventListener("click", function () {
        openImageModal(image);
      });

      image.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openImageModal(image);
        }
      });
    });

    window.addEventListener("resize", updateCarousel);

    updateCarousel();
  });

  function formatPostDate(value) {
    const fallback = value || "";
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }

    return parsed.toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function createNotesPostElement(post) {
    const article = document.createElement("article");
    article.className = "notes-post";

    article.innerHTML = `
      <div class="post-img">
        <h4 class="post-date">${formatPostDate(post.date)}</h4>
      </div>
      <div class="post-info">
        <h3 class="post-title">${post.title || "Untitled Note"}</h3>
        <p class="info-body">${post.summary || ""}</p>
        <button class="btn info-btn" type="button">Read More</button>
      </div>
    `;

    return article;
  }

  function createNotesPanel() {
    const panel = document.createElement("aside");
    panel.className = "notes-panel";
    panel.setAttribute("aria-hidden", "true");

    panel.innerHTML = `
      <div class="notes-panel-shell" role="dialog" aria-modal="true" aria-label="Blog post">
        <button class="notes-panel-close" type="button" aria-label="Close blog post">Close</button>
        <div class="notes-panel-header">
          <p class="notes-panel-date"></p>
          <h2 class="notes-panel-title"></h2>
        </div>
        <article class="notes-panel-content"></article>
      </div>
    `;

    document.body.appendChild(panel);

    return {
      panel,
      closeButton: panel.querySelector(".notes-panel-close"),
      date: panel.querySelector(".notes-panel-date"),
      title: panel.querySelector(".notes-panel-title"),
      content: panel.querySelector(".notes-panel-content"),
    };
  }

  function normalizeNotesGridPosts(posts, targetCount) {
    if (!Array.isArray(posts) || posts.length === 0) {
      return [];
    }

    if (posts.length >= targetCount) {
      return posts.slice(0, targetCount);
    }

    const normalized = posts.slice();
    let index = 0;

    while (normalized.length < targetCount) {
      normalized.push({ ...posts[index % posts.length] });
      index += 1;
    }

    return normalized;
  }

  function sortNotesNewestFirst(posts) {
    return [...posts].sort(function (a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      const safeA = Number.isNaN(dateA) ? -Infinity : dateA;
      const safeB = Number.isNaN(dateB) ? -Infinity : dateB;

      if (safeA !== safeB) {
        return safeB - safeA;
      }

      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  const notesPanel = createNotesPanel();

  function closeNotesPanel() {
    notesPanel.panel.classList.remove("is-open");
    notesPanel.panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notes-panel-open");
  }

  function openNotesPanel(post, html) {
    notesPanel.date.textContent = formatPostDate(post.date);
    notesPanel.title.textContent = post.title || "Untitled Note";
    notesPanel.content.innerHTML = html;
    notesPanel.panel.classList.add("is-open");
    notesPanel.panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("notes-panel-open");
  }

  notesPanel.closeButton.addEventListener("click", closeNotesPanel);

  notesPanel.panel.addEventListener("click", function (event) {
    if (event.target === notesPanel.panel) {
      closeNotesPanel();
    }
  });

  async function loadNotesMarkdownPosts() {
    const notesList = document.querySelector("#notes-list");

    if (!notesList) {
      return;
    }

    if (typeof marked === "undefined") {
      notesList.innerHTML = "<p>Markdown renderer is not available.</p>";
      return;
    }

    try {
      const response = await fetch("../posts/index.json");

      if (!response.ok) {
        throw new Error(`Failed to load posts index (${response.status})`);
      }

      const posts = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        notesList.innerHTML = "<p>No posts available yet.</p>";
        return;
      }

      const sortedPosts = sortNotesNewestFirst(posts);
      const displayPosts = normalizeNotesGridPosts(sortedPosts, 9);

      notesList.innerHTML = "";
      const postCache = new Map();

      displayPosts.forEach(function (post) {
        const article = createNotesPostElement(post);
        const button = article.querySelector(".info-btn");

        button.addEventListener("click", async function () {
          button.disabled = true;
          button.textContent = "Loading...";

          try {
            let renderedHtml = postCache.get(post.file);

            if (!renderedHtml) {
              const postResponse = await fetch(`../posts/${post.file}`);

              if (!postResponse.ok) {
                throw new Error(`Failed to load post (${postResponse.status})`);
              }

              const markdown = await postResponse.text();
              renderedHtml = marked.parse(markdown);
              postCache.set(post.file, renderedHtml);
            }

            openNotesPanel(post, renderedHtml);
          } catch (error) {
            openNotesPanel(post, "<p>Unable to load this post right now.</p>");
          } finally {
            button.disabled = false;
            button.textContent = "Read More";
          }
        });

        notesList.appendChild(article);
      });
    } catch (error) {
      notesList.innerHTML =
        "<p>Unable to load notes. If you are opening files directly, run a local server first.</p>";
    }
  }

  loadNotesMarkdownPosts();
}

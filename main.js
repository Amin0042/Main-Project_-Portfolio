const openButton = document.querySelector(".manifesto-open");
const closeButton = document.querySelector(".popup-close");
const popup = document.querySelector(".manifesto-popup");

if (openButton) {
  openButton.addEventListener("click", function () {
    popup.classList.add("show");
  });

  closeButton.addEventListener("click", function () {
    popup.classList.remove("show");
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
  const imageDescription = image.dataset.description || defaultImageModalDescription;

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

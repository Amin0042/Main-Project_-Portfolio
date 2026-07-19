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

function createImageModal() {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="image-modal-dialog" role="dialog" aria-modal="true" aria-label="Artwork preview">
      <button class="image-modal-close" type="button" aria-label="Close image preview">X</button>
      <figure class="image-modal-figure">
        <img class="image-modal-image" alt="" />
        <figcaption class="image-modal-caption"></figcaption>
      </figure>
    </div>
  `;

  document.body.appendChild(modal);

  return {
    modal,
    dialog: modal.querySelector(".image-modal-dialog"),
    image: modal.querySelector(".image-modal-image"),
    caption: modal.querySelector(".image-modal-caption"),
    closeButton: modal.querySelector(".image-modal-close"),
  };
}

const imageModal = createImageModal();

function closeImageModal() {
  imageModal.modal.classList.remove("is-open");
  imageModal.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  imageModal.image.removeAttribute("src");
  imageModal.image.alt = "";
  imageModal.caption.textContent = "";
}

function openImageModal(image) {
  imageModal.image.src = image.currentSrc || image.src;
  imageModal.image.alt = image.alt || "Artwork preview";
  imageModal.caption.textContent = image.alt || "";
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

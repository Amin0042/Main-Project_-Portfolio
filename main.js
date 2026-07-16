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

const carousels = document.querySelectorAll(".carousel");

carousels.forEach(function (carousel) {
  const track = carousel.querySelector(".carousel-track");
  const carouselWindow = carousel.querySelector(".car-window");
  const items = carousel.querySelectorAll(".car-item");

  const nextButton = carousel.querySelector(".next-btn");
  const previousButton = carousel.querySelector(".previous-btn");

  let currentSlide = 0;

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

  function updateCarousel() {
    const { distance, maximumSlide } = getMeasurements();

    currentSlide = Math.min(currentSlide, maximumSlide);

    track.style.transform = `translateX(-${currentSlide * distance}px)`;

    previousButton.disabled = currentSlide === 0;
    nextButton.disabled = currentSlide === maximumSlide;
  }

  nextButton.addEventListener("click", function () {
    const { maximumSlide } = getMeasurements();

    if (currentSlide < maximumSlide) {
      currentSlide++;
      updateCarousel();
    }
  });

  previousButton.addEventListener("click", function () {
    if (currentSlide > 0) {
      currentSlide--;
      updateCarousel();
    }
  });

  window.addEventListener("resize", updateCarousel);

  updateCarousel();
});

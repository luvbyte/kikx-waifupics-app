const kikxApp = kikxSdk.createApp();
const proxy = new kikxSdk.ProxyService(kikxApp);
const fs = new kikxSdk.FileSystemService(kikxApp);
const invoker = new kikxSdk.Invoker(kikxApp);

proxy.setFetchType();

const base = "https://api.waifu.im";
const dest = "home://Pictures/WaifuPics";

let pics = [];

let activeImage = null;

let page = 1;
let totalPages = 1;

let currentTag = null;
let currentSearch = "";

let loading = false;

const pageSize = 10;

const popularTags = [
  "waifu",
  "maid",
  "uniform",
  "selfies",
  "genshin-impact",
  "raiden-shogun",
  "oppai",
  "marin-kitagawa",
  "mori-calliope",
  "one-piece",
  "nami",
  "rem",
  "kamisato-ayaka"
];

/*
 * Fetch images
 */

async function fetchPics(query = {}) {
  const params = {
    Page: query.page || 1,
    PageSize: query.pageSize || pageSize,
    IsNsfw: "False"
  };

  if (query.tag) {
    params.IncludedTags = query.tag;
  }

  if (query.search) {
    params.IncludedTags = query.search;
  }

  const response = await proxy.proxyRequest(`${base}/images`, {
    method: "GET",
    params
  });

  if (!response) {
    throw new Error("Empty response");
  }

  const data = response.data !== undefined ? response.data : response;

  return data;
}

/*
 * Fetch tags
 */

async function fetchTags() {
  try {
    const response = await proxy.proxyRequest(`${base}/tags`, {
      method: "GET"
    });

    const data = response.data !== undefined ? response.data : response;

    return Array.isArray(data) ? data : data.items || [];
  } catch (error) {
    console.error("Failed to fetch tags:", error);

    return [];
  }
}

/*
 * Render tags
 */

function renderTags(tags = []) {
  const list = $("#tag-list");

  list.empty();

  const finalTags = [
    ...popularTags,
    ...tags
      .map(tag => {
        if (typeof tag === "string") {
          return tag;
        }

        return tag.name;
      })
      .filter(Boolean)
  ];

  const uniqueTags = [...new Set(finalTags)].slice(0, 25);

  uniqueTags.forEach(tag => {
    const active =
      currentTag === tag
        ? "border-pink-500 bg-pink-500 text-white"
        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10";

    const button = $(`
      <button
        class="tag-button shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition active:scale-95 ${active}"
        data-tag="${escapeHtml(tag)}"
      >
        ${escapeHtml(tag)}
      </button>
    `);

    list.append(button);
  });
}

/*
 * Render gallery
 */

function renderGallery(items, append = false) {
  const gallery = $("#gallery");

  if (!append) {
    gallery.empty();
  }

  items.forEach(image => {
    const card = createImageCard(image);

    gallery.append(card);
  });
}

/*
 * Image card
 */

function createImageCard(image) {
  const tags = image.tags || [];

  const tagHTML = tags
    .slice(0, 3)
    .map(tag => {
      const name = typeof tag === "string" ? tag : tag.name;

      return `
        <span
          class="rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/80 backdrop-blur-md"
        >
          ${escapeHtml(name)}
        </span>
      `;
    })
    .join("");

  const card = $(`
    <article
      class="group relative mb-2 break-inside-avoid overflow-hidden rounded-2xl bg-white/5 sm:mb-3"
      data-image-id="${image.image_id || image.id || ""}"
    >
      <!-- Image loading -->
      <div
        class="image-loading absolute inset-0 min-h-[180px] animate-pulse bg-white/5"
      ></div>

      <!-- Image -->
      <img
        src="${escapeHtml(image.url)}"
        alt=""
        loading="lazy"
        decoding="async"
        class="relative block h-auto w-full opacity-0 transition duration-300 group-hover:scale-[1.02] group-hover:brightness-75"
      />

      <!-- Overlay -->
      <div
        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 pt-10 opacity-0 transition group-hover:opacity-100"
      >
        <div class="flex flex-wrap gap-1">
          ${tagHTML}
        </div>
      </div>
    </article>
  `);

  const img = card.find("img");

  img.on("load", function () {
    $(this).removeClass("opacity-0");
    card.find(".image-loading").remove();
  });

  img.on("error", function () {
    card.find(".image-loading").remove();

    $(this).replaceWith(`
        <div
          class="flex min-h-[180px] items-center justify-center bg-white/5 text-xs text-white/30"
        >
          Image unavailable
        </div>
      `);
  });

  card.on("click", () => {
    openImage(image);
  });

  return card;
}

/*
 * Open image
 */

function openImage(image) {
  activeImage = image;

  const modal = $("#image-modal");

  $("#modal-image").attr("src", image.url).attr("alt", "");

  // Wallpaper
  $("#wallpaper-btn")
    .off("click")
    .on("click", () => {
      invoker.setWallpaper(image.url);
    });

  $("#share-btn")
    .off("click")
    .on("click", () => {
      invoker.share(image.url);
    });

  $("#download-btn")
    .off("click")
    .on("click", async () => {
      if (!image.url) {
        return;
      }

      const button = $("#download-btn");

      button.prop("disabled", true);

      try {
        const response = await fetch(image.url);

        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.status}`);
        }

        const blob = await response.blob();

        const extension = blob.type.split("/")[1] || "jpg";

        const filename = `${image.image_id || image.id || Date.now()}.${extension}`;

        const file = new File([blob], filename, {
          type: blob.type || "image/jpeg"
        });

        const { error } = await fs.uploadFile(file, dest);
        if (error) {
          throw new Error(error.message);
        }

        await kikxApp.system.alert(`Download success - ${dest}/${filename}`);
      } catch (error) {
        console.error("Download failed:", error);

        await kikxApp.system.alert("Download failed", {
          type: "error"
        });
      } finally {
        button.prop("disabled", false);
      }
    });

  const tags = image.tags || [];

  const info = tags
    .map(tag => {
      const name = typeof tag === "string" ? tag : tag.name;

      return `
        <span
          class="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70"
        >
          ${escapeHtml(name)}
        </span>
      `;
    })
    .join("");

  $("#modal-info").html(info);

  modal.removeClass("hidden").addClass("flex");
}

/*
 * Close image
 */

function closeImage() {
  activeImage = null;

  $("#image-modal").addClass("hidden").removeClass("flex");
  $("#modal-image").attr("src", "");
  $("#modal-info").empty();
}

/*
 * Load gallery
 */

async function loadGallery(reset = false) {
  if (loading) {
    return;
  }

  if (!reset && page > totalPages) {
    return;
  }

  loading = true;

  $("#empty").hide();

  if (reset) {
    page = 1;
    pics = [];

    $("#gallery").empty();

    $("#loading-more").removeClass("hidden").addClass("flex");
  } else {
    $("#loading-more").removeClass("hidden").addClass("flex");
  }

  try {
    const data = await fetchPics({
      page,
      pageSize,
      tag: currentTag,
      search: currentSearch
    });

    const items = data.items || [];

    totalPages = data.totalPages || 1;

    if (reset) {
      pics = items;

      renderGallery(items);
    } else {
      pics.push(...items);

      renderGallery(items, true);
    }

    if (!items.length && page === 1) {
      $("#empty").removeClass("hidden");
    }

    if (page >= totalPages) {
      $("#load-more").hide();
    } else {
      $("#load-more").show();
    }

    page++;
  } catch (error) {
    console.error("Gallery error:", error);

    if (page === 1) {
      $("#empty").removeClass("hidden").html(`
          <div class="text-5xl">⚠️</div>

          <h2 class="mt-4 text-lg font-bold">
            Failed to load images
          </h2>

          <p class="mt-1 text-sm text-white/40">
            Please try again.
          </p>

          <button
            id="retry"
            class="mt-5 rounded-xl bg-pink-500 px-5 py-2 text-sm font-bold"
          >
            Retry
          </button>
        `);

      $("#retry").on("click", () => {
        loadGallery(true);
      });
    }
  } finally {
    loading = false;

    $("#loading-more").addClass("hidden").removeClass("flex");

    $("#loading-screen").hide();
  }
}

/*
 * Select tag
 */

function selectTag(tag) {
  currentTag = tag;
  currentSearch = "";

  $("#search").val("");

  if (tag) {
    $("#active-filter").removeClass("hidden").addClass("flex");

    $("#active-tag").text(`#${tag}`);
  } else {
    $("#active-filter").addClass("hidden").removeClass("flex");
  }

  renderTags(popularTags);

  loadGallery(true);
}

/*
 * Search
 */

let searchTimer;

function searchImages(value) {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    currentSearch = value.trim();
    currentTag = null;

    $("#active-filter").addClass("hidden").removeClass("flex");

    loadGallery(true);
  }, 450);
}

/*
 * Random
 */

async function randomImage() {
  if (loading) {
    return;
  }

  const button = $("#random-btn");

  button.prop("disabled", true);
  button.css("opacity", "0.5");

  try {
    const data = await fetchPics({
      page: 1,
      pageSize: 1
    });

    const image = data.items?.[0];

    if (image) {
      openImage(image);
    }
  } catch (error) {
    console.error(error);
  } finally {
    button.prop("disabled", false);
    button.css("opacity", "");
  }
}

/*
 * Escape HTML
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
 * Events
 */

function bindEvents() {
  kikxApp.onMessage("app:navigation", key => {
    if (key !== "back") {
      return;
    }

    if (activeImage) {
      closeImage();
      return;
    }

    kikxApp.system.closeApp();
  });

  $("#random-btn").on("click", randomImage);

  $("#load-more").on("click", () => {
    loadGallery(false);
  });

  $("#search").on("input", function () {
    searchImages($(this).val());
  });

  $("#clear-filter").on("click", () => {
    selectTag(null);
  });

  $("#logo").on("click", () => {
    currentTag = null;
    currentSearch = "";

    $("#search").val("");

    selectTag(null);
  });

  $("#modal-close").on("click", closeImage);

  $("#image-modal").on("click", function (event) {
    if (event.target === this) {
      closeImage();
    }
  });

  $(document).on("click", ".tag-button", function () {
    selectTag($(this).data("tag"));
  });

  $(document).on("keydown", function (event) {
    if (event.key === "Escape") {
      closeImage();
    }
  });
}

/*
 * Init
 */

async function init() {
  bindEvents();

  renderTags(popularTags);

  await loadGallery(true);

  // Fetch real tags after the initial gallery
  const tags = await fetchTags();

  if (tags.length) {
    renderTags(tags);
  }
}

$(document).ready(() => {
  kikxApp.run(init);
});

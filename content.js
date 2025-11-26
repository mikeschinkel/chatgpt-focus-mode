(function () {
  const ARTICLE_PROCESSED_FLAG = "cgptCollapserProcessed";
  const DEBUG = false; // set true if you want console logs
  const SVG_NS = "http://www.w3.org/2000/svg";

  function log(...args) {
    if (DEBUG) {
      console.log("[ChatGPT Collapser]", ...args);
    }
  }

  // ----------------- Text helpers -----------------

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }
function buildSummaryTextForAssistant(article) {
  // FINAL MESSAGE SELECTORS: these contain the real rendered answer
  const REAL_MESSAGE_SELECTORS = [
    ".markdown",
    ".prose",
    ".message-content",
    ".flex.flex-col",
    ".overflow-hidden"
  ];

  let paragraphs = [];

  // 1. First try: <p> inside real message containers only
  for (const sel of REAL_MESSAGE_SELECTORS) {
    const container = article.querySelector(sel);
    if (!container) continue;
    paragraphs = container.querySelectorAll("p");
    if (paragraphs.length > 0) break;
  }

  // 2. If still nothing, fall back to ANY <p> but exclude thinking containers
  if (paragraphs.length === 0) {
    paragraphs = article.querySelectorAll("p");
  }

  for (const p of paragraphs) {
    // Skip screen-reader-only / hidden paragraphs
    if (p.closest(".sr-only, .visually-hidden")) continue;
    if (p.getAttribute("aria-hidden") === "true") continue;

    // Skip THINKING paragraphs (internal chain-of-thought containers)
    if (p.closest(".result-streaming, .thinking, .delta, .pending, .partial")) {
      continue;
    }

    const text = normalizeWhitespace(p.textContent || "");
    if (text) {
      return text.length > 200 ? text.slice(0, 200) : text;
    }
  }

  // 3. Nothing good yet → do NOT fall back to article.textContent,
  //    because that includes “ChatGPT said:” and thinking.
  return "";
}


  //
  // function buildSummaryTextForAssistant(article) {
  //   // 1. Prefer the first visible <p>
  //   const paragraphs = article.querySelectorAll("p");
  //
  //   for (const p of paragraphs) {
  //     // Skip screen-reader-only / hidden bits
  //     if (p.closest(".sr-only, .visually-hidden")) {
  //       continue;
  //     }
  //     if (p.getAttribute("aria-hidden") === "true") {
  //       continue;
  //     }
  //
  //     const text = normalizeWhitespace(p.textContent || "");
  //     if (text) {
  //       return truncateSummary(text);
  //     }
  //   }
  //
  //   // 2. Fallback: walk text nodes, skipping sr-only parents
  //   let fallback = "";
  //   const walker = document.createTreeWalker(
  //       article,
  //       NodeFilter.SHOW_TEXT,
  //       {
  //         acceptNode(node) {
  //           const parent = node.parentElement;
  //           if (!parent) {
  //             return NodeFilter.FILTER_REJECT;
  //           }
  //           if (parent.classList.contains("sr-only")) {
  //             return NodeFilter.FILTER_REJECT;
  //           }
  //           if (parent.classList.contains("visually-hidden")) {
  //             return NodeFilter.FILTER_REJECT;
  //           }
  //           if (parent.getAttribute("aria-hidden") === "true") {
  //             return NodeFilter.FILTER_REJECT;
  //           }
  //
  //           const trimmed = node.textContent.trim();
  //           return trimmed ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  //         }
  //       }
  //   );
  //
  //   if (walker.nextNode()) {
  //     fallback = normalizeWhitespace(walker.currentNode.textContent || "");
  //   }
  //
  //   return truncateSummary(fallback);
  // }

  function truncateSummary(text) {
    if (!text) {
      return "";
    }
    if (text.length > 200) {
      return text.slice(0, 200);
    }
    return text;
  }



  function buildSummaryTextForUser(article) {
    // Prefer <div class="whitespace-pre-wrap">
    let source = article.querySelector("div.whitespace-pre-wrap");

    if (!source) {
      // Fallback: "child-most div" ≈ last div in subtree
      const allDivs = article.querySelectorAll("div");
      if (allDivs.length > 0) {
        source = allDivs[allDivs.length - 1];
      }
    }

    let text = "";
    if (source) {
      text = normalizeWhitespace(source.textContent || "");
    } else {
      text = "User message";
    }

    if (text.length > 80) {
      text = text.slice(0, 80) + "…";
    }
    return text;
  }

  function buildSummaryText(article, role) {
    if (role === "assistant") {
      return buildSummaryTextForAssistant(article);
    }
    if (role === "user") {
      return buildSummaryTextForUser(article);
    }

    const txt = normalizeWhitespace(article.textContent || "");
    if (txt.length > 80) {
      return txt.slice(0, 80) + "…";
    }
    return txt || "";
  }

  // ----------------- Per-article collapsers -----------------

  // ----------------- Per-article collapsers -----------------

  function getRoleForArticle(article) {
    // 1. Prefer to detect real roles
    const roleDiv = article.querySelector("div[data-message-author-role]");
    if (roleDiv) {
      return roleDiv.getAttribute("data-message-author-role");
    }

    // 2. Fallback detection: agent-turn exists (system-like content)
    const agentTurn = article.querySelector(".agent-turn");
    if (agentTurn) {
      // Treat it like an assistant message for summarization purposes
      return "assistant";
    }

    // No recognizable message content → skip
    return null;
  }

  function createLabelSpanForRole(role) {
    const labelSpan = document.createElement("span");
    const strong = document.createElement("strong");

    if (role === "user") {
      strong.textContent = "User:";
    } else {
      // assistant + system-like messages
      strong.textContent = "ChatGPT:";
    }

    labelSpan.appendChild(strong);
    // non-breaking space after label
    labelSpan.appendChild(document.createTextNode("\u00A0"));

    return labelSpan;
  }

  function createSummaryIcons(initialState /* "expanded" | "collapsed" */) {
    const iconWrapper = document.createElement("span");
    iconWrapper.className = "cgpt-summary-icon-wrapper";

    const plusIcon = createSquarePlusMinusIcon("plus");
    plusIcon.classList.add("cgpt-summary-icon");

    const minusIcon = createSquarePlusMinusIcon("minus");
    minusIcon.classList.add("cgpt-summary-icon");

    if (initialState === "expanded") {
      iconWrapper.appendChild(minusIcon);
    } else {
      iconWrapper.appendChild(plusIcon);
    }

    return { iconWrapper, plusIcon, minusIcon };
  }

  function wrapArticleContentInDiv(article) {
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "cgpt-article-content";

    while (article.firstChild) {
      contentWrapper.appendChild(article.firstChild);
    }

    return contentWrapper;
  }

  function setupDetailsToggle(details, iconWrapper, plusIcon, minusIcon, textSpan, summaryText) {
    details.addEventListener("toggle", () => {
      const open = details.open;

      // Swap icon based on open/closed
      iconWrapper.replaceChildren(open ? minusIcon : plusIcon);

      // When collapsed (open == false), show snippet; when expanded, clear it.
      textSpan.textContent = open ? "" : summaryText;
    });
  }

  function buildDetailsForArticle(article, role, summaryText) {
    const details = document.createElement("details");
    details.className = "cgpt-article-details";
    details.open = true; // start expanded

    const summary = document.createElement("summary");
    summary.className = "cgpt-article-summary";

    // Icons
    const { iconWrapper, plusIcon, minusIcon } = createSummaryIcons("expanded");
    summary.appendChild(iconWrapper);

    // Label: User: / ChatGPT:
    const labelSpan = createLabelSpanForRole(role);
    summary.appendChild(labelSpan);

    // Snippet span – START EMPTY; we fill it only when collapsed
    const textSpan = document.createElement("span");
    textSpan.textContent = ""; // expanded → no snippet
    summary.appendChild(textSpan);

    details.appendChild(summary);

    // Move existing article content under our <details>
    const contentWrapper = wrapArticleContentInDiv(article);
    details.appendChild(contentWrapper);

    // Toggle behaviour
    setupDetailsToggle(details, iconWrapper, plusIcon, minusIcon, textSpan, summaryText);

    return { details, summary, iconWrapper, plusIcon, minusIcon, textSpan };
  }

  // function makeArticleCollapsible(article) {
  //   if (!article) {
  //     return;
  //   }
  //
  //   // Avoid processing the same article twice
  //   if (article.dataset[ARTICLE_PROCESSED_FLAG] === "1") {
  //     return;
  //   }
  //
  //   // 1. Detect role
  //   const roleDiv = article.querySelector("div[data-message-author-role]");
  //   let role = null;
  //
  //   if (roleDiv) {
  //     role = roleDiv.getAttribute("data-message-author-role");
  //   } else {
  //     const agentTurn = article.querySelector(".agent-turn");
  //     if (agentTurn) {
  //       role = "assistant"; // treat system-like chunks as assistant
  //     }
  //   }
  //
  //   if (!role) {
  //     // Nothing we recognize → skip
  //     return;
  //   }
  //
  //   // 2. Build summary text once, BEFORE we move children
  //   const summaryText = buildSummaryText(article, role);
  //
  //   // 3. Create <details> and <summary>
  //   const details = document.createElement("details");
  //   details.className = "cgpt-article-details";
  //   details.open = true; // start expanded
  //
  //   const summary = document.createElement("summary");
  //   summary.className = "cgpt-article-summary";
  //
  //   // Icon wrapper
  //   const iconWrapper = document.createElement("span");
  //   iconWrapper.className = "cgpt-summary-icon-wrapper";
  //
  //   const plusIcon = createSquarePlusMinusIcon("plus");
  //   plusIcon.classList.add("cgpt-summary-icon");
  //
  //   const minusIcon = createSquarePlusMinusIcon("minus");
  //   minusIcon.classList.add("cgpt-summary-icon");
  //
  //   // Start expanded → show minus
  //   iconWrapper.appendChild(minusIcon);
  //   summary.appendChild(iconWrapper);
  //
  //   // Label: User: / ChatGPT:
  //   const labelSpan = document.createElement("span");
  //   const strong = document.createElement("strong");
  //
  //   if (role === "user") {
  //     strong.textContent = "User:";
  //   } else {
  //     strong.textContent = "ChatGPT:";
  //   }
  //
  //   labelSpan.appendChild(strong);
  //   labelSpan.appendChild(document.createTextNode("\u00A0")); // &nbsp;
  //   summary.appendChild(labelSpan);
  //
  //   // Snippet span – START EMPTY; filled only when collapsed
  //   const textSpan = document.createElement("span");
  //   textSpan.textContent = ""; // expanded → no snippet
  //   summary.appendChild(textSpan);
  //
  //   details.appendChild(summary);
  //
  //   // 4. Move existing article content into wrapper
  //   const contentWrapper = document.createElement("div");
  //   contentWrapper.className = "cgpt-article-content";
  //
  //   while (article.firstChild) {
  //     contentWrapper.appendChild(article.firstChild);
  //   }
  //   details.appendChild(contentWrapper);
  //
  //   // 5. Toggle handler: swap icon AND snippet
  //   details.addEventListener("toggle", () => {
  //     const open = details.open;
  //
  //     // Icon
  //     iconWrapper.replaceChildren(open ? minusIcon : plusIcon);
  //
  //     // Snippet: show only when collapsed
  //     textSpan.textContent = open ? "" : summaryText;
  //   });
  //
  //   // 6. Put <details> back into the article
  //   article.appendChild(details);
  //
  //   // 7. Add bottom collapse button (if toolbar exists)
  //   injectBottomCollapseButton(article, details);
  //
  //   // 8. Mark as processed
  //   article.dataset[ARTICLE_PROCESSED_FLAG] = "1";
  // }

  function makeArticleCollapsible(article) {
    if (!article) {
      return;
    }

    // Avoid processing the same article twice
    if (article.dataset[ARTICLE_PROCESSED_FLAG] === "1") {
      return;
    }

    // 1. Detect role
    const roleDiv = article.querySelector("div[data-message-author-role]");
    let role = null;

    if (roleDiv) {
      role = roleDiv.getAttribute("data-message-author-role");
    } else {
      const agentTurn = article.querySelector(".agent-turn");
      if (agentTurn) {
        role = "assistant"; // treat system-like/systemish as assistant
      }
    }

    if (!role) {
      // Nothing we recognize → skip
      return;
    }

    // 2. Build summary text once, *but it might be empty if still streaming*
    let summaryText = buildSummaryText(article, role);

    // 3. Create <details> / <summary>
    const details = document.createElement("details");
    details.className = "cgpt-article-details";
    details.open = true; // start expanded

    const summary = document.createElement("summary");
    summary.className = "cgpt-article-summary";

    // Icons
    const iconWrapper = document.createElement("span");
    iconWrapper.className = "cgpt-summary-icon-wrapper";

    const plusIcon = createSquarePlusMinusIcon("plus");
    plusIcon.classList.add("cgpt-summary-icon");

    const minusIcon = createSquarePlusMinusIcon("minus");
    minusIcon.classList.add("cgpt-summary-icon");

    // Start expanded → show minus icon
    iconWrapper.appendChild(minusIcon);
    summary.appendChild(iconWrapper);

    // Label: User: / ChatGPT:
    const labelSpan = document.createElement("span");
    const strong = document.createElement("strong");
    if (role === "user") {
      strong.textContent = "User:";
    } else {
      strong.textContent = "ChatGPT:";
    }
    labelSpan.appendChild(strong);
    labelSpan.appendChild(document.createTextNode("\u00A0")); // &nbsp;
    summary.appendChild(labelSpan);

    // Snippet span – empty when expanded, filled when collapsed
    const textSpan = document.createElement("span");
    textSpan.textContent = "";
    summary.appendChild(textSpan);

    details.appendChild(summary);

    // 4. Move existing article content into wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "cgpt-article-content";

    while (article.firstChild) {
      contentWrapper.appendChild(article.firstChild);
    }
    details.appendChild(contentWrapper);

    // 5. Toggle handler: recompute summary on first collapse if needed
    details.addEventListener("toggle", () => {
      const open = details.open;

      if (open) {
        // Expanded: show minus icon, hide snippet
        iconWrapper.replaceChildren(minusIcon);
        textSpan.textContent = "";
      } else {
        // Collapsed: if we *still* don't have a summary, recompute now
        if (!summaryText) {
          summaryText = buildSummaryText(article, role);
        }
        iconWrapper.replaceChildren(plusIcon);
        textSpan.textContent = summaryText || ""; // may still be empty, but now only if content is genuinely empty
      }
    });

    // 6. Put <details> back into the article
    article.appendChild(details);

    // 7. Bottom collapse button, if toolbar present
    injectBottomCollapseButton(article, details);

    // 8. Mark as processed
    article.dataset[ARTICLE_PROCESSED_FLAG] = "1";
  }

  function processAllArticles() {
    const articles = document.querySelectorAll("article");
    articles.forEach(makeArticleCollapsible);
  }


  function processAllArticles() {
    const articles = document.querySelectorAll("article");
    articles.forEach(makeArticleCollapsible);
  }

  // ----------------- Global expand / collapse -----------------

  function setAllArticlesOpen(open) {
    log("setAllArticlesOpen:", open);
    const articles = document.querySelectorAll("article");
    articles.forEach(article => {
      const details = article.querySelector("details.cgpt-article-details");
      const btn = article.querySelector(".cgpt-article-toggle-btn");

      if (details) {
        details.open = open;
      }
      if (btn) {
        btn.textContent = open ? "[-]" : "[+]";
      }
    });
  }

  function expandAllArticles() {
    setAllArticlesOpen(true);
  }

  function collapseAllArticles() {
    setAllArticlesOpen(false);
  }

  // ----------------- Header anchor helpers -----------------

  function isVisibleElement(el) {
    // offsetParent is null when display:none or not in layout
    return !!(el && el.offsetParent !== null && el.getClientRects().length > 0);
  }

  function findVisibleButton(selector) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (isVisibleElement(node)) {
        return node;
      }
    }
    return null;
  }

  function getHeaderAnchor() {
    // Per your original requirement: prefer the sidebar button
    let anchor = findVisibleButton('button[data-testid="open-sidebar-button"]');
    if (anchor) {
      log("Using visible open-sidebar-button as anchor");
      return anchor;
    }

    // Fallback: the model switcher button
    anchor = findVisibleButton(
        'button[data-testid="model-switcher-dropdown-button"]'
    );
    if (anchor) {
      log("Using visible model-switcher-dropdown-button as anchor");
      return anchor;
    }

    log("No visible header anchor found");
    return null;
  }

  // ----------------- Global buttons near header anchor -----------------

  function ensureGlobalButtonsNearAnchor() {
    const anchor = getHeaderAnchor();
    if (!anchor || !anchor.parentElement) {
      return;
    }

    const parent = anchor.parentElement;

    let expandAllBtn = document.getElementById("cgpt-expand-all-btn");
    let collapseAllBtn = document.getElementById("cgpt-collapse-all-btn");

    // If buttons exist but are under a different parent, move them
    if (expandAllBtn && expandAllBtn.parentElement !== parent) {
      expandAllBtn.parentElement.removeChild(expandAllBtn);
      expandAllBtn = null;
    }
    if (collapseAllBtn && collapseAllBtn.parentElement !== parent) {
      collapseAllBtn.parentElement.removeChild(collapseAllBtn);
      collapseAllBtn = null;
    }

    // Create if missing
    if (!expandAllBtn) {
      expandAllBtn = document.createElement("button");
      expandAllBtn.type = "button";
      expandAllBtn.id = "cgpt-expand-all-btn";
      expandAllBtn.title = "Expand all messages";
      expandAllBtn.addEventListener("click", expandAllArticles);

      // Copy styling from the anchor button
      expandAllBtn.className = anchor.className;
      expandAllBtn.style.marginLeft = "0.5rem";

      const icon = createSquarePlusMinusIcon("plus");
      expandAllBtn.appendChild(icon);
    }

    if (!collapseAllBtn) {
      collapseAllBtn = document.createElement("button");
      collapseAllBtn.type = "button";
      collapseAllBtn.id = "cgpt-collapse-all-btn";
      collapseAllBtn.title = "Collapse all messages";
      collapseAllBtn.addEventListener("click", collapseAllArticles);

      collapseAllBtn.className = anchor.className;
      collapseAllBtn.style.marginLeft = "0.25rem";

      const icon = createSquarePlusMinusIcon("minus");
      collapseAllBtn.appendChild(icon);
    }


    // Insert as siblings immediately after the anchor
    if (anchor.nextSibling) {
      parent.insertBefore(expandAllBtn, anchor.nextSibling);
    } else {
      parent.appendChild(expandAllBtn);
    }
    parent.insertBefore(collapseAllBtn, expandAllBtn.nextSibling);
  }

  // ----------------- DOM observer -----------------

  function observeDom() {
    const observer = new MutationObserver(mutations => {
      let sawNewArticle = false;
      let sawHeaderChange = false;

      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          // New articles
          if (node.tagName === "ARTICLE") {
            makeArticleCollapsible(node);
            sawNewArticle = true;
          } else {
            const articles = node.querySelectorAll?.("article") || [];
            if (articles.length > 0) {
              articles.forEach(makeArticleCollapsible);
              sawNewArticle = true;
            }
          }

          // Header-related changes that might add/move our anchor
          if (
              node.matches?.(
                  'button[data-testid="open-sidebar-button"], button[data-testid="model-switcher-dropdown-button"]'
              ) ||
              node.querySelector?.(
                  'button[data-testid="open-sidebar-button"], button[data-testid="model-switcher-dropdown-button"]'
              )
          ) {
            sawHeaderChange = true;
          }
        }
      }

      if (sawNewArticle) {
        log("New article(s) detected");
      }
      if (sawHeaderChange) {
        log("Header anchor change detected via MutationObserver");
        ensureGlobalButtonsNearAnchor();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    log("MutationObserver started");
  }

  // ----------------- SVG Icons -----------------
  function injectBottomCollapseButton(article, details) {
    // Only assistant/system turns have the bottom toolbar with action buttons
    const copyBtn = article.querySelector('button[data-testid="copy-turn-action-button"]');
    if (!copyBtn || !copyBtn.parentElement) {
      return;
    }

    const parent = copyBtn.parentElement;

    // Don’t add it twice
    if (parent.querySelector(".cgpt-collapse-from-bottom-btn")) {
      return;
    }

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = copyBtn.className; // match styling
    collapseBtn.classList.add("cgpt-collapse-from-bottom-btn");
    collapseBtn.setAttribute("aria-label", "Collapse this message");
    collapseBtn.title = "Collapse this message";

    // Use the same square minus icon we use elsewhere
    const icon = createSquarePlusMinusIcon("minus");
    collapseBtn.appendChild(icon);

    // Insert just before the Copy button (or change to parent.appendChild(...) if
    // you want it to the right of everything)
    parent.insertBefore(collapseBtn, copyBtn);
    parent.insertBefore(spacer(), copyBtn);

    collapseBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      details.open = false; // this will also fire the <details> "toggle" event
      // Optional: scroll the summary into view so you can immediately see it
      // details.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function spacer() {
    // Create a spacer to visually separate collapse from other actions
    const spacer = document.createElement("div");
    spacer.className = "cgpt-collapse-spacer";
    spacer.style.display = "inline-block";
    spacer.style.width = "1.25rem";   // adjust this to taste
    spacer.style.height = "1px";      // doesn't matter, flexbox aligns it fine
    return spacer;
  }

  function createSquarePlusMinusIcon(kind) {
    // kind: "plus" or "minus"
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "1.5");
    rect.setAttribute("y", "1.5");
    rect.setAttribute("width", "13");
    rect.setAttribute("height", "13");
    rect.setAttribute("rx", "2");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "currentColor");
    rect.setAttribute("stroke-width", "1.2");
    svg.appendChild(rect);

    const h = document.createElementNS(SVG_NS, "line");
    h.setAttribute("x1", "4");
    h.setAttribute("y1", "8");
    h.setAttribute("x2", "12");
    h.setAttribute("y2", "8");
    h.setAttribute("stroke", "currentColor");
    h.setAttribute("stroke-width", "1.2");
    svg.appendChild(h);

    if (kind === "plus") {
      const v = document.createElementNS(SVG_NS, "line");
      v.setAttribute("x1", "8");
      v.setAttribute("y1", "4");
      v.setAttribute("x2", "8");
      v.setAttribute("y2", "12");
      v.setAttribute("stroke", "currentColor");
      v.setAttribute("stroke-width", "1.2");
      svg.appendChild(v);
    }

    return svg;
  }

  // ----------------- Init -----------------

  function init() {
    log("init() called");
    processAllArticles();
    ensureGlobalButtonsNearAnchor();
    observeDom();

    // Re-evaluate header anchor on resize (switch between mobile/desktop header)
    window.addEventListener("resize", () => {
      ensureGlobalButtonsNearAnchor();
    });
  }

  // Expose helpers for manual debugging if you want them
  window.cgptEnsureHeaderButtons = ensureGlobalButtonsNearAnchor;
  window.cgptExpandAll = expandAllArticles;
  window.cgptCollapseAll = collapseAllArticles;


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

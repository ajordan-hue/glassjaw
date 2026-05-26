/*!
 * Glassjaw Tracker — comprehensive behavioral analytics library
 * Loaded by a GTM Custom Template. Call Glassjaw.init({ endpoint, clientId, modules })
 * to start tracking.
 *
 * Modules: behavior, performance, forms, media, navigation, environment, content, identity
 */
(function(window, document) {
  'use strict';

  if (window.Glassjaw) return;

  // ========================================================================
  // CONFIG
  // ========================================================================

  var CONFIG = {
    endpoint: null,
    clientId: null,
    modules: {
      behavior: true,
      performance: true,
      forms: true,
      media: true,
      navigation: true,
      environment: true,
      content: true,
      identity: true
    }
  };

  // ========================================================================
  // KEYS & CONSTANTS
  // ========================================================================

  var USER_KEY        = "_gj_uid";
  var SESSION_KEY     = "_gj_sid";
  var ATTR_FIRST_KEY  = "_gj_attr_first";
  var ATTR_LAST_KEY   = "_gj_attr_last";
  var VISIT_COUNT_KEY = "_gj_visits";
  var FIRST_SEEN_KEY  = "_gj_first_seen";
  var SESSION_DAYS    = 0.02;

  // ========================================================================
  // UTILITIES
  // ========================================================================

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? m[1] : null;
  }

  function setCookie(name, val, days) {
    var d = new Date();
    d.setTime(d.getTime() + (days * 86400000));
    document.cookie = name + "=" + val + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
  }

  function genId(prefix) {
    return prefix + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
  }

  function tryParse(s) {
    try { return JSON.parse(decodeURIComponent(s)); } catch(e) { return null; }
  }

  function isExternalLink(href) {
    try {
      var u = new URL(href, window.location.href);
      return !!u.hostname && u.hostname !== window.location.hostname;
    } catch(e) { return false; }
  }

  function scrubText(text, maxLen) {
    if (!text) return "";
    var scrubbed = String(text)
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
      .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]');
    return scrubbed.substring(0, maxLen || 200);
  }

  function safeClassName(el) {
    return typeof el.className === "string" ? el.className : "";
  }

  // ========================================================================
  // TRANSPORT
  // ========================================================================

  var userId, sessionId;

  function send(eventType, data) {
    if (!CONFIG.endpoint || !CONFIG.clientId) return;

    var payload = {
      clientId: CONFIG.clientId,
      userId: userId,
      sessionId: sessionId,
      event: eventType,
      data: data || {},
      timestamp: new Date().toISOString(),
      page: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || "(direct)",
      viewport: window.innerWidth + "x" + window.innerHeight,
      screenRes: screen.width + "x" + screen.height,
      language: navigator.language,
      platform: navigator.platform,
      attribution: getAttribution(),
      visit: {
        visit_count: parseInt(getCookie(VISIT_COUNT_KEY) || "1", 10),
        first_seen: getCookie(FIRST_SEEN_KEY) || null
      }
    };

    setCookie(SESSION_KEY, sessionId, SESSION_DAYS);

    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CONFIG.endpoint, body);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", CONFIG.endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(body);
    }
  }

  // ========================================================================
  // ATTRIBUTION
  // ========================================================================

  var ATTR_KEYS = [
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "gclid","gbraid","wbraid","gclsrc","dclid",
    "fbclid","msclkid","ttclid","li_fat_id","twclid","yclid"
  ];

  function captureAttribution() {
    var qs = window.location.search.replace(/^\?/, "");
    var params = {};
    qs.split("&").forEach(function(p) {
      var kv = p.split("=");
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });

    var captured = {};
    ATTR_KEYS.forEach(function(k) { if (params[k]) captured[k] = params[k]; });

    if (document.referrer) {
      try {
        var ref = new URL(document.referrer);
        if (ref.hostname !== window.location.hostname) {
          captured.referrer_domain = ref.hostname;
          captured.referrer_full = document.referrer;
        }
      } catch(e) {}
    }

    captured.landing_path = window.location.pathname;
    captured.captured_at = new Date().toISOString();

    var hasSignal = ATTR_KEYS.some(function(k) { return params[k]; }) || captured.referrer_domain;
    if (hasSignal) {
      var encoded = encodeURIComponent(JSON.stringify(captured));
      if (!getCookie(ATTR_FIRST_KEY)) setCookie(ATTR_FIRST_KEY, encoded, 365);
      setCookie(ATTR_LAST_KEY, encoded, 365);
    }
  }

  function getAttribution() {
    return {
      first_touch: tryParse(getCookie(ATTR_FIRST_KEY) || ""),
      last_touch:  tryParse(getCookie(ATTR_LAST_KEY)  || "")
    };
  }

  // ========================================================================
  // CORE — identity, session, standard event capture (always on)
  // ========================================================================

  function initCore() {
    userId = getCookie(USER_KEY);
    if (!userId) {
      userId = genId("u_");
      setCookie(USER_KEY, userId, 365);
      setCookie(FIRST_SEEN_KEY, new Date().toISOString(), 365);
    }

    sessionId = getCookie(SESSION_KEY);
    if (!sessionId) {
      sessionId = genId("s_");
      var visits = parseInt(getCookie(VISIT_COUNT_KEY) || "0", 10) + 1;
      setCookie(VISIT_COUNT_KEY, String(visits), 365);
    }
    setCookie(SESSION_KEY, sessionId, SESSION_DAYS);

    captureAttribution();

    send("pageview", {
      title: document.title,
      hostname: window.location.hostname,
      path: window.location.pathname
    });

    document.addEventListener("click", function(e) {
      var el = e.target;
      var link = el.closest ? el.closest("a") : null;
      send("click", {
        element: el.id || safeClassName(el) || el.tagName,
        text:    scrubText(el.textContent || "", 100),
        url:     link ? link.href : null,
        classes: safeClassName(el) || null,
        tagName: el.tagName
      });
    }, true);

    // Form submit — capture field metadata + safe values (no PII)
    document.addEventListener("submit", function(e) {
      var form = e.target;
      var fields = [];
      var SENSITIVE_NAME_RE = /pass|cc|card|cvv|ssn|secret|token|auth/i;

      if (form.elements && form.elements.length) {
        for (var i = 0; i < form.elements.length; i++) {
          var el = form.elements[i];
          var elType = (el.type || "").toLowerCase();
          var elTag  = (el.tagName || "").toLowerCase();

          // Skip non-data elements
          if (!el.name && !el.id) continue;
          if (elType === "submit" || elType === "button" || elType === "reset") continue;
          if (elType === "hidden" || elType === "password") continue;
          // For radio groups, only record the one that's checked
          if (elType === "radio" && !el.checked) continue;

          var fieldName = el.name || el.id;
          var fieldValue = (el.value || "").toString();
          var entry = {
            name: fieldName,
            type: elType || elTag,
            filled: fieldValue.length > 0,
            length: fieldValue.length
          };

          // Sensitive field name → redact entirely (defense in depth)
          if (SENSITIVE_NAME_RE.test(fieldName.toLowerCase())) {
            fields.push({ name: fieldName, type: elType || elTag, redacted: true });
            continue;
          }

          var isSelectLike =
            elType === "select-one" || elType === "select-multiple" ||
            elType === "radio" || elType === "checkbox" ||
            elTag === "select";

          if (elType === "checkbox") {
            entry.checked = el.checked;
            if (el.checked) entry.value = (fieldValue || "on").substring(0, 500);
          } else if (fieldValue.length > 0) {
            // Capture the actual value the user entered, truncated to bound payload size.
            // Sensitive fields (password, CC, SSN-named) are already filtered above.
            // Long free-text (e.g., 5,000-char message) is capped at 500 chars.
            entry.value = fieldValue.substring(0, 500);
          }

          fields.push(entry);
        }
      }

      send("form_submit", {
        formId:      form.id || null,
        formClasses: safeClassName(form) || null,
        formAction:  form.action || null,
        fieldCount:  form.elements ? form.elements.length : 0,
        fields:      fields
      });
    }, true);

    var scrollFired = {};
    function checkScroll() {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) return;
      var pct = Math.round(window.pageYOffset / docH * 100);
      [25, 50, 75, 100].forEach(function(t) {
        if (pct >= t && !scrollFired[t]) {
          scrollFired[t] = true;
          send("scroll_depth", { depth: t + "%" });
        }
      });
    }
    var scrollTimer;
    window.addEventListener("scroll", function() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(checkScroll, 200);
    });
  }

  // ========================================================================
  // MODULE: BEHAVIOR
  // ========================================================================

  function initBehavior() {
    var lastActive = Date.now();
    var activeMs = 0, idleMs = 0;

    function bump() {
      var now = Date.now();
      if (document.visibilityState === "visible") activeMs += (now - lastActive);
      else                                        idleMs   += (now - lastActive);
      lastActive = now;
    }

    document.addEventListener("visibilitychange", function() {
      bump();
      send("tab_visibility", {
        state: document.visibilityState,
        active_ms: activeMs,
        idle_ms: idleMs
      });
    });

    setInterval(function() {
      if (document.visibilityState === "visible") {
        bump();
        send("heartbeat", { active_ms: activeMs, idle_ms: idleMs });
      }
    }, 30000);

    var clickHistory = [];
    document.addEventListener("click", function(e) {
      var k = (e.target.id || safeClassName(e.target) || e.target.tagName) + "";
      var now = Date.now();
      clickHistory.push({ k: k, t: now });
      clickHistory = clickHistory.filter(function(c) { return now - c.t < 1500; });
      var sameCount = clickHistory.filter(function(c) { return c.k === k; }).length;
      if (sameCount >= 3) {
        send("rage_click", { element: k.substring(0, 100), count: sameCount });
        clickHistory = clickHistory.filter(function(c) { return c.k !== k; });
      }
    }, true);

    var mutationCount = 0;
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function(m) { mutationCount += m.length; })
        .observe(document.body, { childList: true, subtree: true, attributes: true });
    }
    document.addEventListener("click", function(e) {
      var el = e.target;
      var k = (el.id || safeClassName(el) || el.tagName) + "";
      var startUrl = window.location.href;
      var startMut = mutationCount;
      setTimeout(function() {
        if (window.location.href === startUrl && (mutationCount - startMut) < 2) {
          send("dead_click", {
            element: k.substring(0, 100),
            tagName: el.tagName,
            text: scrubText(el.textContent || "", 50)
          });
        }
      }, 300);
    }, true);

    var exitFired = false;
    document.addEventListener("mouseleave", function(e) {
      if (exitFired || e.clientY > 0) return;
      exitFired = true;
      send("exit_intent", {
        page: window.location.pathname,
        time_on_page_ms: activeMs + idleMs
      });
    });

    window.addEventListener("beforeunload", function() {
      bump();
      send("session_end", {
        active_ms: activeMs,
        idle_ms: idleMs,
        total_ms: activeMs + idleMs
      });
    });
  }

  // ========================================================================
  // MODULE: PERFORMANCE
  // ========================================================================

  function initPerformance() {
    window.addEventListener("error", function(e) {
      send("js_error", {
        message: scrubText(e.message || "", 500),
        source: (e.filename || "").substring(0, 200),
        line: e.lineno || null,
        column: e.colno || null,
        stack: ((e.error && e.error.stack) || "").substring(0, 1000)
      });
    });

    window.addEventListener("unhandledrejection", function(e) {
      var reason = e.reason;
      var msg = reason && reason.toString ? reason.toString() : String(reason);
      send("promise_rejection", { reason: scrubText(msg, 500) });
    });

    if (typeof PerformanceObserver === "undefined") return;

    var lcpEntry = null;
    try {
      new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        lcpEntry = entries[entries.length - 1];
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch(e) {}

    var clsValue = 0;
    try {
      new PerformanceObserver(function(list) {
        list.getEntries().forEach(function(entry) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        });
      }).observe({ type: "layout-shift", buffered: true });
    } catch(e) {}

    try {
      new PerformanceObserver(function(list) {
        list.getEntries().forEach(function(entry) {
          send("web_vital_inp", {
            value_ms: Math.round(entry.processingStart - entry.startTime),
            input_type: entry.name
          });
        });
      }).observe({ type: "first-input", buffered: true });
    } catch(e) {}

    var vitalsReported = false;
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState !== "hidden" || vitalsReported) return;
      vitalsReported = true;
      if (lcpEntry) {
        send("web_vital_lcp", {
          value_ms: Math.round(lcpEntry.renderTime || lcpEntry.loadTime),
          element: lcpEntry.element ? lcpEntry.element.tagName : null
        });
      }
      send("web_vital_cls", { value: Math.round(clsValue * 1000) / 1000 });
    });

    window.addEventListener("load", function() {
      setTimeout(function() {
        var t = performance.timing;
        if (!t) return;
        send("page_timing", {
          dns_ms: t.domainLookupEnd - t.domainLookupStart,
          tcp_ms: t.connectEnd - t.connectStart,
          ttfb_ms: t.responseStart - t.requestStart,
          download_ms: t.responseEnd - t.responseStart,
          dom_ready_ms: t.domContentLoadedEventEnd - t.navigationStart,
          page_load_ms: t.loadEventEnd - t.navigationStart
        });
      }, 0);
    });
  }

  // ========================================================================
  // MODULE: FORMS
  // ========================================================================

  function initForms() {
    var fieldStates = {};
    var formStarted = false;
    var formSubmitted = false;

    function isField(el) {
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    }
    function fieldKey(el) {
      var formPart = el.form && el.form.id ? el.form.id + "/" : "";
      return formPart + (el.id || el.name || ((el.type || el.tagName) + "_unknown"));
    }

    document.addEventListener("focusin", function(e) {
      if (!isField(e.target)) return;
      var k = fieldKey(e.target);
      if (!fieldStates[k]) {
        fieldStates[k] = {
          totalDwellMs: 0,
          focusCount: 0,
          type: e.target.type || e.target.tagName.toLowerCase()
        };
      }
      fieldStates[k].focusTime = Date.now();
      fieldStates[k].focusCount++;
      if (!formStarted) {
        formStarted = true;
        send("form_started", {
          formId: e.target.form ? e.target.form.id || null : null,
          firstField: k
        });
      }
    }, true);

    document.addEventListener("focusout", function(e) {
      if (!isField(e.target)) return;
      var k = fieldKey(e.target);
      var s = fieldStates[k];
      if (!s || !s.focusTime) return;
      var dwell = Date.now() - s.focusTime;
      s.totalDwellMs += dwell;
      s.finalLength = (e.target.value || "").length;
      var wasAutofilled = dwell < 100 && s.finalLength > 5;
      send("form_field_blur", {
        fieldKey: k,
        fieldType: s.type,
        dwell_ms: dwell,
        total_dwell_ms: s.totalDwellMs,
        focus_count: s.focusCount,
        value_length: s.finalLength,
        empty: s.finalLength === 0,
        autofilled: wasAutofilled
      });
      s.focusTime = null;
    }, true);

    document.addEventListener("invalid", function(e) {
      if (!isField(e.target)) return;
      send("form_validation_error", {
        fieldKey: fieldKey(e.target),
        fieldType: e.target.type || e.target.tagName,
        message: scrubText(e.target.validationMessage || "", 200)
      });
    }, true);

    document.addEventListener("submit", function() { formSubmitted = true; }, true);

    window.addEventListener("beforeunload", function() {
      if (!formStarted || formSubmitted) return;
      var fields = [];
      var lastTouched = null;
      var maxDwell = 0;
      Object.keys(fieldStates).forEach(function(k) {
        var s = fieldStates[k];
        fields.push({
          field: k,
          type: s.type,
          total_dwell_ms: s.totalDwellMs,
          focus_count: s.focusCount,
          empty: !s.finalLength
        });
        if (s.totalDwellMs > maxDwell) {
          maxDwell = s.totalDwellMs;
          lastTouched = k;
        }
      });
      send("form_abandoned", {
        last_touched_field: lastTouched,
        fields: fields
      });
    });
  }

  // ========================================================================
  // MODULE: MEDIA
  // ========================================================================

  function initMedia() {
    var DOWNLOAD_RE = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|mp4|mp3|wav|mov|avi|jpg|jpeg|png|gif|svg|webp)$/i;

    function attachVideoTracking(video) {
      if (video._gj_tracked) return;
      video._gj_tracked = true;
      var lastReported = 0;
      var milestones = [25, 50, 75, 95];
      var srcOf = function() { return video.currentSrc || video.src || "unknown"; };

      video.addEventListener("play", function() {
        send("video_play", {
          src: srcOf(),
          duration_s: video.duration || null,
          currentTime_s: video.currentTime
        });
      });
      video.addEventListener("pause", function() {
        if (video.ended) return;
        send("video_pause", {
          src: srcOf(),
          currentTime_s: video.currentTime,
          duration_s: video.duration || null,
          percent: video.duration ? Math.round(video.currentTime / video.duration * 100) : null
        });
      });
      video.addEventListener("ended", function() {
        send("video_complete", {
          src: srcOf(),
          duration_s: video.duration || null
        });
      });
      video.addEventListener("seeked", function() {
        send("video_seek", { src: srcOf(), to_s: video.currentTime });
      });
      video.addEventListener("ratechange", function() {
        send("video_rate_change", { src: srcOf(), rate: video.playbackRate });
      });
      video.addEventListener("timeupdate", function() {
        if (!video.duration) return;
        var pct = video.currentTime / video.duration * 100;
        milestones.forEach(function(m) {
          if (pct >= m && lastReported < m) {
            lastReported = m;
            send("video_progress", { src: srcOf(), percent: m });
          }
        });
      });
    }

    document.querySelectorAll("video, audio").forEach(attachVideoTracking);

    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          (m.addedNodes || []).forEach(function(node) {
            if (node.tagName === "VIDEO" || node.tagName === "AUDIO") attachVideoTracking(node);
            if (node.querySelectorAll) {
              node.querySelectorAll("video, audio").forEach(attachVideoTracking);
            }
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener("click", function(e) {
      var link = e.target.closest ? e.target.closest("a[href]") : null;
      if (!link) return;
      var href = link.href || "";
      if (DOWNLOAD_RE.test(href)) {
        send("download_click", {
          url: href,
          filename: href.split("/").pop().split("?")[0],
          link_text: scrubText(link.textContent || "", 100)
        });
      }
    }, true);

    window.addEventListener("beforeprint", function() {
      send("print", { path: window.location.pathname });
    });

    function watchModals() {
      document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog').forEach(function(d) {
        if (d._gj_tracked) return;
        d._gj_tracked = true;
        var wasVisible = d.offsetParent !== null && !d.hidden;
        new MutationObserver(function() {
          var isVisible = d.offsetParent !== null && !d.hidden;
          if (isVisible && !wasVisible) {
            send("modal_open", { id: d.id || null, label: d.getAttribute("aria-label") || null });
          } else if (!isVisible && wasVisible) {
            send("modal_close", { id: d.id || null });
          }
          wasVisible = isVisible;
        }).observe(d, { attributes: true, attributeFilter: ["hidden", "style", "class", "open"] });
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", watchModals);
    } else {
      watchModals();
    }
  }

  // ========================================================================
  // MODULE: NAVIGATION
  // ========================================================================

  function initNavigation() {
    document.addEventListener("click", function(e) {
      var link = e.target.closest ? e.target.closest("a[href]") : null;
      if (!link) return;
      var href = link.href || "";

      if (href.indexOf("mailto:") === 0) {
        send("email_click", { url: href });
        return;
      }
      if (href.indexOf("tel:") === 0) {
        send("phone_click", { url: href });
        return;
      }
      if (isExternalLink(href)) {
        try {
          var u = new URL(href, window.location.href);
          send("outbound_click", {
            url: href,
            target_domain: u.hostname,
            link_text: scrubText(link.textContent || "", 100),
            opened_new_tab: link.target === "_blank" || e.ctrlKey || e.metaKey || e.button === 1
          });
        } catch(err) {}
      }
    }, true);

    var lastUrl = window.location.href;
    function checkUrl() {
      if (window.location.href !== lastUrl) {
        var from = lastUrl;
        lastUrl = window.location.href;
        send("spa_route_change", {
          from: from,
          to: window.location.href,
          path: window.location.pathname
        });
      }
    }
    window.addEventListener("hashchange", checkUrl);
    window.addEventListener("popstate", checkUrl);
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function() {
      origPush.apply(this, arguments);
      setTimeout(checkUrl, 0);
    };
    history.replaceState = function() {
      origReplace.apply(this, arguments);
      setTimeout(checkUrl, 0);
    };

    document.addEventListener("submit", function(e) {
      var form = e.target;
      if (!form || !form.querySelector) return;
      var searchInput = form.querySelector(
        'input[type="search"], input[name*="search" i], input[name*="query" i], input[name="q"]'
      );
      if (!searchInput) return;
      send("internal_search", {
        query: scrubText(searchInput.value || "", 200),
        form_id: form.id || null
      });
    }, true);

    document.addEventListener("click", function(e) {
      var link = e.target.closest ? e.target.closest("a[href^='#']") : null;
      if (!link) return;
      send("anchor_click", {
        target: link.getAttribute("href"),
        text: scrubText(link.textContent || "", 100)
      });
    }, true);

    try {
      var navEntries = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (navEntries && navEntries.length && navEntries[0].type === "reload") {
        send("page_reload", { path: window.location.pathname });
      } else if (performance.navigation && performance.navigation.type === 1) {
        send("page_reload", { path: window.location.pathname });
      }
    } catch(e) {}
  }

  // ========================================================================
  // MODULE: ENVIRONMENT
  // ========================================================================

  function initEnvironment() {
    function snapshot() {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
      return {
        effective_type: conn.effectiveType || null,
        downlink_mbps:  conn.downlink || null,
        rtt_ms:         conn.rtt || null,
        save_data:      conn.saveData || false,
        pixel_ratio:    window.devicePixelRatio || 1,
        orientation:    screen.orientation ? screen.orientation.type : null,
        color_scheme:   window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        reduced_motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        languages:      navigator.languages ? navigator.languages.slice(0, 5) : [navigator.language],
        timezone:       (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
        timezone_offset: new Date().getTimezoneOffset(),
        device_memory_gb:    navigator.deviceMemory || null,
        hardware_concurrency: navigator.hardwareConcurrency || null,
        touch_capable: 'ontouchstart' in window || navigator.maxTouchPoints > 0
      };
    }

    send("environment", snapshot());

    var lastViewport = window.innerWidth + "x" + window.innerHeight;
    var resizeTimer;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        var newViewport = window.innerWidth + "x" + window.innerHeight;
        if (newViewport !== lastViewport) {
          send("viewport_change", {
            from: lastViewport,
            to: newViewport,
            orientation: screen.orientation ? screen.orientation.type : null
          });
          lastViewport = newViewport;
        }
      }, 300);
    });

    if (navigator.connection && navigator.connection.addEventListener) {
      navigator.connection.addEventListener("change", function() {
        send("connection_change", {
          effective_type: navigator.connection.effectiveType,
          downlink_mbps:  navigator.connection.downlink
        });
      });
    }
  }

  // ========================================================================
  // MODULE: CONTENT
  // ========================================================================

  function initContent() {
    var selectionTimer;
    var lastSelectionLen = 0;

    function selectionInForm(sel) {
      try {
        var node = sel.anchorNode;
        while (node) {
          if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") return true;
          node = node.parentNode;
        }
      } catch(e) {}
      return false;
    }

    document.addEventListener("selectionchange", function() {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(function() {
        var sel = window.getSelection();
        if (!sel) return;
        var text = sel.toString();
        var len = text.length;
        if (len < 5 || len === lastSelectionLen) return;
        lastSelectionLen = len;
        if (selectionInForm(sel)) return;
        send("text_selection", {
          length: len,
          preview: scrubText(text, 100)
        });
      }, 500);
    });

    document.addEventListener("copy", function() {
      var sel = window.getSelection();
      if (!sel) return;
      var text = sel.toString();
      if (text.length < 3) return;
      if (selectionInForm(sel)) return;
      send("text_copy", {
        length: text.length,
        preview: scrubText(text, 100)
      });
    });
  }

  // ========================================================================
  // MODULE: IDENTITY
  // ========================================================================

  function initIdentity() {
    var firstSeen = getCookie(FIRST_SEEN_KEY);
    var daysSince = null;
    if (firstSeen) {
      try {
        daysSince = Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86400000);
      } catch(e) {}
    }

    send("identity_snapshot", {
      visit_count: parseInt(getCookie(VISIT_COUNT_KEY) || "1", 10),
      first_seen: firstSeen,
      days_since_first_visit: daysSince,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      is_returning: parseInt(getCookie(VISIT_COUNT_KEY) || "1", 10) > 1
    });

    setTimeout(function() {
      var loggedInId = null;
      try {
        if (window.dataLayer && window.dataLayer.length) {
          for (var i = 0; i < window.dataLayer.length; i++) {
            var item = window.dataLayer[i];
            if (item && (item.user_id || item.userId)) {
              loggedInId = item.user_id || item.userId;
              break;
            }
          }
        }
      } catch(e) {}
      if (loggedInId) {
        send("user_identified", {
          internal_user_id: String(loggedInId).substring(0, 100)
        });
      }
    }, 1000);
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  window.Glassjaw = {
    version: "0.1.0",
    init: function(config) {
      if (!config || !config.endpoint || !config.clientId) {
        if (window.console) console.error("Glassjaw.init: missing endpoint or clientId");
        return;
      }
      CONFIG.endpoint = config.endpoint;
      CONFIG.clientId = config.clientId;
      if (config.modules) {
        Object.keys(config.modules).forEach(function(k) {
          CONFIG.modules[k] = !!config.modules[k];
        });
      }

      initCore();
      if (CONFIG.modules.behavior)    initBehavior();
      if (CONFIG.modules.performance) initPerformance();
      if (CONFIG.modules.forms)       initForms();
      if (CONFIG.modules.media)       initMedia();
      if (CONFIG.modules.navigation)  initNavigation();
      if (CONFIG.modules.environment) initEnvironment();
      if (CONFIG.modules.content)     initContent();
      if (CONFIG.modules.identity)    initIdentity();
    },
    sendEvent: send
  };
})(window, document);

/* =====================================================================
   TIME TO GET REAL: effects.js
   Chaos Mode, Calm Mode, the idle runaway effect, and the hype button.

   Everything is wrapped in a function so none of these names can clash
   with the page scripts in log.html and progress.html.
   Remove its <script> line in layout.html to turn it all off.

   Storage keys (layout.html reads these before the page draws):
     sessionStorage "ttgr-chaos"  Chaos stays on between pages, off on a fresh visit
     localStorage   "ttgr-calm"   Calm is remembered until switched off
   ===================================================================== */

(function () {
    "use strict";

    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const IDLE_MS = 5000;      // still time before everything flies away
    const WANDER_MS = 2000;    // how often flying pieces pick a new spot
    const SNAP_MS = 380;       // how long the trip home takes
    const MAX_LETTERS = 700;   // keeps long pages smooth

    // Things that fly away whole
    const PIECE_SELECTOR = 'a[href], button, .fx-toggle, select, input:not([type="hidden"]), textarea, .chart-box';

    // Text inside these is never split into letters
    const SKIP_SELECTOR = PIECE_SELECTOR + ", script, style, noscript, option, canvas, .visually-hidden, .fx-drips, .fx-hype-pop";

    /* ===== Small helpers ===== */
    function save(kind, key, on) {
        try {
            const store = kind === "session" ? window.sessionStorage : window.localStorage;
            if (on) {
                store.setItem(key, "1");
            } else {
                store.removeItem(key);
            }
        } catch (error) {
            // Storage blocked (private window, etc.): the switches still work for this page
        }
    }

    function isChaos() {
        return root.classList.contains("chaos-on");
    }

    function isCalm() {
        return root.classList.contains("calm-on") || reducedMotion.matches;
    }

    function canRunaway() {
        return isChaos() && !isCalm() && !document.hidden;
    }

    /* ===== Chaos and Calm switches ===== */
    const chaosToggle = document.getElementById("chaos-toggle");
    const calmToggle = document.getElementById("calm-toggle");

    function setChaos(on) {
        root.classList.toggle("chaos-on", on);
        if (chaosToggle) {
            chaosToggle.checked = on;
        }
        save("session", "ttgr-chaos", on);
        if (on) {
            setCalm(false);
        } else {
            snapBack();
        }
        resetIdle();
    }

    function setCalm(on) {
        root.classList.toggle("calm-on", on);
        if (calmToggle) {
            calmToggle.checked = on;
        }
        save("local", "ttgr-calm", on);
        if (on) {
            setChaos(false);
        }
    }

    if (chaosToggle) {
        chaosToggle.addEventListener("change", function () {
            setChaos(chaosToggle.checked);
        });
    }

    if (calmToggle) {
        calmToggle.addEventListener("change", function () {
            setCalm(calmToggle.checked);
        });
    }

    /* ===== Idle runaway ===== */
    let idleTimer = null;
    let wanderTimer = null;
    let restoreTimer = null;
    let flying = false;

    let pieces = [];       // { el, rect }
    let letters = [];      // { el, rect }
    let splits = [];       // { original, nodes } so text can be put back exactly
    let displayFixes = []; // inline elements temporarily made inline-block so they can move

    function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = canRunaway() ? setTimeout(launch, IDLE_MS) : null;
    }

    function onActivity() {
        if (flying) {
            snapBack();
        }
        resetIdle();
    }

    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach(function (type) {
        window.addEventListener(type, onActivity, { passive: true, capture: true });
    });

    // Block real mouse clicks while pieces are away or on their way home,
    // so nothing gets clicked by accident. Keyboard "clicks" (like pressing
    // Enter to submit a form) have detail 0 and always go through.
    document.addEventListener("click", function (event) {
        if (root.classList.contains("runaway") && event.detail > 0) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    function splitText() {
        const scopes = document.querySelectorAll(".site-header, .flash, main.page");
        let count = 0;

        for (const scope of scopes) {
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    if (!node.nodeValue.trim()) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    const parent = node.parentElement;
                    if (!parent || parent.closest(SKIP_SELECTOR)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });

            // Collect first, then change the page, so the walk isn't disturbed
            const textNodes = [];
            while (walker.nextNode()) {
                textNodes.push(walker.currentNode);
            }

            for (const node of textNodes) {
                const visible = Array.from(node.nodeValue).filter(function (c) { return !/\s/.test(c); }).length;
                if (count + visible > MAX_LETTERS) {
                    return;
                }
                count += visible;

                const fragment = document.createDocumentFragment();
                for (const part of node.nodeValue.split(/(\s+)/)) {
                    if (!part) {
                        continue;
                    }
                    if (/^\s+$/.test(part)) {
                        fragment.appendChild(document.createTextNode(part));
                        continue;
                    }
                    const word = document.createElement("span");
                    word.className = "fx-word";
                    for (const char of Array.from(part)) {
                        const letter = document.createElement("span");
                        letter.className = "fx-letter";
                        letter.textContent = char;
                        word.appendChild(letter);
                    }
                    fragment.appendChild(word);
                }

                const nodes = Array.from(fragment.childNodes);
                node.parentNode.replaceChild(fragment, node);
                splits.push({ original: node, nodes: nodes });
            }
        }
    }

    function unsplitText() {
        for (const split of splits) {
            const first = split.nodes[0];
            if (first && first.parentNode) {
                first.parentNode.insertBefore(split.original, first);
            }
            for (const node of split.nodes) {
                node.remove();
            }
        }
        splits = [];
    }

    function fly(item, isLetter, first) {
        const rect = item.rect;
        const x = Math.random() * Math.max(0, window.innerWidth - rect.width) - rect.left;
        const y = Math.random() * Math.max(0, window.innerHeight - rect.height) - rect.top;
        const spin = (Math.random() - 0.5) * (isLetter ? 1080 : 140);
        const delay = Math.random() * (first ? 0.6 : 0.3);

        item.el.style.transitionDelay = delay.toFixed(2) + "s";
        item.el.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px";
        item.el.style.rotate = spin.toFixed(1) + "deg";
    }

    function launch() {
        if (!canRunaway() || flying) {
            return;
        }
        if (restoreTimer) {
            clearTimeout(restoreTimer);
            finishRestore();
        }

        flying = true;
        root.classList.remove("fx-snap");
        root.classList.add("runaway");

        const focused = document.activeElement;

        // Whole pieces: buttons, links, switches, fields, the chart
        const pieceEls = Array.from(document.querySelectorAll(PIECE_SELECTOR)).filter(function (el) {
            if (el === focused || el.contains(focused)) {
                return false; // the field you're in never moves
            }
            if (el.tagName === "INPUT" && el.closest(".fx-toggle")) {
                return false; // the switch label moves instead
            }
            return true;
        });

        for (const el of pieceEls) {
            if (window.getComputedStyle(el).display === "inline") {
                displayFixes.push({ el: el, value: el.style.display });
                el.style.display = "inline-block"; // plain inline elements can't move
            }
            el.classList.add("fx-piece");
        }

        // Letters
        splitText();
        const letterEls = Array.from(document.querySelectorAll(".fx-letter"));

        // Measure every home position once (reading all, then writing all, keeps it fast)
        pieces = pieceEls
            .map(function (el) { return { el: el, rect: el.getBoundingClientRect() }; })
            .filter(function (item) { return item.rect.width > 0 && item.rect.height > 0; });
        letters = letterEls.map(function (el) { return { el: el, rect: el.getBoundingClientRect() }; });

        requestAnimationFrame(function () {
            if (!flying) {
                return;
            }
            pieces.forEach(function (item) { fly(item, false, true); });
            letters.forEach(function (item) { fly(item, true, true); });
        });

        wanderTimer = setInterval(function () {
            pieces.forEach(function (item) { fly(item, false, false); });
            letters.forEach(function (item) { fly(item, true, false); });
        }, WANDER_MS);
    }

    function snapBack() {
        if (!flying) {
            return;
        }
        flying = false;
        clearInterval(wanderTimer);
        wanderTimer = null;

        root.classList.add("fx-snap");
        for (const item of pieces.concat(letters)) {
            item.el.style.transitionDelay = "";
            item.el.style.translate = "";
            item.el.style.rotate = "";
        }

        restoreTimer = setTimeout(finishRestore, SNAP_MS);
    }

    function finishRestore() {
        restoreTimer = null;
        for (const item of pieces) {
            item.el.classList.remove("fx-piece");
        }
        for (const fix of displayFixes) {
            fix.el.style.display = fix.value;
        }
        displayFixes = [];
        pieces = [];
        letters = [];
        unsplitText();
        root.classList.remove("runaway", "fx-snap");
    }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            clearTimeout(idleTimer);
        } else {
            resetIdle();
        }
    });

    if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener("change", function () {
            snapBack();
            resetIdle();
        });
    }

    /* ===== Hype button + screen shake ===== */
    const HYPE_LINES = [
        "Chalk up. Lock in. Time to get REAL.",
        "The bar doesn't care how you feel. Lift it anyway.",
        "Every rep is a vote for a stronger you.",
        "Heavy is just a number you haven't beaten yet.",
        "Today's warm-up was last year's max.",
        "Iron sharpens. Get sharp.",
        "Nobody remembers the easy days.",
        "Plates don't lie.",
        "Grip it. Rip it. Log it.",
        "You came to move weight, not excuses.",
        "Small plates. Big progress.",
        "Show up. Load up. Level up.",
        "Strong is built one ugly rep at a time.",
        "Earn the chalk on your hands.",
        "The ledger is watching. Make it count.",
        "Your future self is spotting you right now.",
        "Breathe. Brace. Own the bar.",
        "Make the bar bend.",
        "Legends log their lifts.",
        "One more rep. Then one more."
    ];

    let lastLine = -1;
    let shakeTimer = null;

    function shake() {
        if (isCalm()) {
            return;
        }
        root.classList.remove("fx-shaking");
        void root.offsetWidth; // restart the animation if it's already running
        root.classList.add("fx-shaking");
        clearTimeout(shakeTimer);
        shakeTimer = setTimeout(function () {
            root.classList.remove("fx-shaking");
        }, 600);
    }

    function hype() {
        let index;
        do {
            index = Math.floor(Math.random() * HYPE_LINES.length);
        } while (index === lastLine && HYPE_LINES.length > 1);
        lastLine = index;

        document.querySelectorAll(".fx-hype-pop").forEach(function (node) { node.remove(); });

        const pop = document.createElement("div");
        pop.className = "fx-hype-pop";
        pop.setAttribute("role", "status");
        pop.textContent = HYPE_LINES[index];
        document.body.appendChild(pop);
        setTimeout(function () { pop.remove(); }, 2700);

        shake();
    }

    const hypeButton = document.getElementById("hype-button");
    if (hypeButton) {
        hypeButton.addEventListener("click", hype);
    }

    /* ===== Start up ===== */
    // layout.html already set the classes from storage; match the switches to them
    if (isChaos() && root.classList.contains("calm-on")) {
        setChaos(false);
    }
    if (chaosToggle) {
        chaosToggle.checked = isChaos();
    }
    if (calmToggle) {
        calmToggle.checked = root.classList.contains("calm-on");
    }
    resetIdle();

    // Shared with later feature files (like the PR explosion)
    window.TimeToGetReal = {
        shake: shake,
        hype: hype,
        isCalm: isCalm,
        isChaos: isChaos
    };
})();
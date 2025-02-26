let matches = [];           // Array of arrays of spans for each match
let currentMatchIndex = -1; // Index of the currently selected match

// Listen for the command to open the fuzzy find input
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openFuzzyFind") {
        let inputBox = document.getElementById("fuzzy-find-input");
        if (!inputBox) {
            // Create input box
            inputBox = document.createElement("input");
            inputBox.id = "fuzzy-find-input";
            inputBox.type = "text";
            inputBox.style.position = "fixed";
            inputBox.style.top = "10px";
            inputBox.style.left = "10px";
            inputBox.style.zIndex = "9999";
            inputBox.style.padding = "5px";
            inputBox.style.width = "300px";
            document.body.appendChild(inputBox);

            // Handle typing in the input box
            inputBox.addEventListener("input", handleInput);

            // Handle Enter, Shift+Enter, and Escape keys
            inputBox.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    if (event.shiftKey) {
                        // Go to previous match
                        if (matches.length > 0) {
                            currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
                            highlightSelectedMatch();
                        }
                    } else {
                        // Go to next match
                        if (matches.length > 0) {
                            currentMatchIndex = (currentMatchIndex + 1) % matches.length;
                            highlightSelectedMatch();
                        }
                    }
                } else if (event.key === "Escape") {
                    removeHighlights();
                    inputBox.remove();
                }
            });
        }
        inputBox.focus();
    }
});

// Process input and highlight matches
function handleInput() {
    removeHighlights();
    matches = [];
    currentMatchIndex = -1;
    const query = this.value.trim();
    if (query === "") return;
    const textNodes = getAllTextNodes();
    textNodes.forEach((textNode) => {
        const text = textNode.nodeValue;
        const nodeMatches = findMatches(query, text);
        if (nodeMatches.length > 0) {
            const allPositions = [...new Set(nodeMatches.flat())].sort((a, b) => a - b);
            const highlightSpans = highlightTextNode(textNode, allPositions);
            nodeMatches.forEach(matchPositions => {
                const matchSpans = matchPositions.map(pos => highlightSpans[pos]);
                matches.push(matchSpans);
            });
        }
    });
    if (matches.length > 0) {
        currentMatchIndex = 0;
        highlightSelectedMatch();
    }
}

// Get all text nodes on the page
function getAllTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }
    return textNodes;
}

// Find non-overlapping matches within a text node
function findMatches(query, text) {
    const matches = [];
    const qLen = query.length;
    let start = 0;
    while (start < text.length) {
        let matchFound = true;
        let matchPositions = [];
        let tIndex = start;
        for (let qIndex = 0; qIndex < qLen; qIndex++) {
            while (tIndex < text.length && text[tIndex].toLowerCase() !== query[qIndex].toLowerCase()) {
                tIndex++;
            }
            if (tIndex >= text.length) {
                matchFound = false;
                break;
            }
            matchPositions.push(tIndex);
            tIndex++;
        }
        if (matchFound) {
            matches.push(matchPositions);
            start = matchPositions[matchPositions.length - 1] + 1; // Skip past this match
        } else {
            start++;
        }
    }
    return matches;
}

// Highlight positions and return a map of position to span
function highlightTextNode(textNode, positions) {
    const parent = textNode.parentNode;
    const text = textNode.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastPos = 0;
    const highlightSpans = {};
    positions.forEach((pos) => {
        if (pos > lastPos) {
            fragment.appendChild(document.createTextNode(text.substring(lastPos, pos)));
        }
        const span = document.createElement("span");
        span.className = "fuzzy-find-highlight";
        span.style.backgroundColor = "yellow";
        span.textContent = text[pos];
        fragment.appendChild(span);
        highlightSpans[pos] = span;
        lastPos = pos + 1;
    });
    if (lastPos < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastPos)));
    }
    parent.replaceChild(fragment, textNode);
    return highlightSpans;
}

// Highlight the selected match
function highlightSelectedMatch() {
    const allSpans = new Set();
    matches.forEach(match => match.forEach(span => allSpans.add(span)));
    allSpans.forEach(span => span.style.backgroundColor = "yellow");
    if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
        matches[currentMatchIndex].forEach(span => span.style.backgroundColor = "orange");
        matches[currentMatchIndex][0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// Remove all highlights
function removeHighlights() {
    const highlights = document.querySelectorAll(".fuzzy-find-highlight");
    highlights.forEach((span) => {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
    });
    document.body.normalize();
}
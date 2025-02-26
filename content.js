let matches = [];           // Array to store spans of each match
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
            inputBox.style.right = "10px";
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

// Process input and highlight matches with locality preference
function handleInput() {
    removeHighlights();
    matches = [];
    currentMatchIndex = -1;
    const query = this.value.trim();
    if (query === "") return;

    // Step 1: Collect and concatenate text nodes
    const textNodes = getAllTextNodes();
    const segments = [];
    let currentStart = 0;
    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        segments.push({ textNode, startPos: currentStart, length: text.length });
        currentStart += text.length;
    });
    const fullText = textNodes.map(tn => tn.nodeValue).join('');

    // Step 2: Precompute positions for each character in the query
    const queryChars = query.toLowerCase().split('');
    const positions = {};
    queryChars.forEach(char => {
        positions[char] = [];
        for (let i = 0; i < fullText.length; i++) {
            if (fullText[i].toLowerCase() === char) {
                positions[char].push(i);
            }
        }
    });

    // Step 3: Find non-overlapping matches with the smallest span
    const matchesPositions = [];
    let lastEnd = 0;
    while (true) {
        let bestMatch = null;
        let bestSpan = Infinity;
        const startPositions = positions[queryChars[0]]?.filter(p => p >= lastEnd) || [];
        if (startPositions.length === 0) break;

        for (const startPos of startPositions) {
            const match = findEarliestMatch(startPos, queryChars, positions);
            if (match) {
                const span = match[match.length - 1] - match[0];
                if (span < bestSpan) {
                    bestSpan = span;
                    bestMatch = match;
                }
            }
        }
        if (!bestMatch) break;
        matchesPositions.push(bestMatch);
        lastEnd = bestMatch[bestMatch.length - 1] + 1;
    }

    // Step 4: Highlight all positions in the matches
    const allPositions = new Set(matchesPositions.flat());
    const posToSpan = {};
    highlightPositions(fullText, segments, allPositions, posToSpan);

    // Step 5: Convert matches to spans for navigation
    matches = matchesPositions.map(match => match.map(p => posToSpan[p]));
    if (matches.length > 0) {
        currentMatchIndex = 0;
        highlightSelectedMatch();
    }
}

// Find the earliest completion of the query starting from startPos
function findEarliestMatch(startPos, queryChars, positions) {
    const match = [startPos];
    let currentPos = startPos;
    for (let i = 1; i < queryChars.length; i++) {
        const char = queryChars[i];
        const nextPos = positions[char]?.find(p => p > currentPos);
        if (nextPos === undefined) return null;
        match.push(nextPos);
        currentPos = nextPos;
    }
    return match;
}

// Highlight positions and map global positions to their spans
function highlightPositions(fullText, segments, positions, posToSpan) {
    const positionsByNode = new Map();
    positions.forEach(p => {
        const result = getTextNodeAndLocalPos(p, segments);
        if (result) {
            const { textNode, localPos } = result;
            if (!positionsByNode.has(textNode)) positionsByNode.set(textNode, []);
            positionsByNode.get(textNode).push(localPos);
        }
    });

    for (const [textNode, localPositions] of positionsByNode) {
        const sortedPositions = [...new Set(localPositions)].sort((a, b) => a - b);
        const localPosToSpan = highlightTextNode(textNode, sortedPositions);
        sortedPositions.forEach(localPos => {
            const globalPos = segments.find(seg => seg.textNode === textNode).startPos + localPos;
            posToSpan[globalPos] = localPosToSpan[localPos];
        });
    }
}

// Get the text node and local position for a global position
function getTextNodeAndLocalPos(globalPos, segments) {
    for (const segment of segments) {
        if (globalPos >= segment.startPos && globalPos < segment.startPos + segment.length) {
            return { textNode: segment.textNode, localPos: globalPos - segment.startPos };
        }
    }
    return null;
}

// Highlight positions in a specific text node
function highlightTextNode(textNode, positions) {
    if (!(textNode instanceof Node) || textNode.nodeType !== Node.TEXT_NODE) {
        console.error("Invalid textNode:", textNode);
        return {};
    }
    const parent = textNode.parentNode;
    const text = textNode.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastPos = 0;
    const localPosToSpan = {};

    positions.forEach(pos => {
        if (pos > lastPos) {
            fragment.appendChild(document.createTextNode(text.substring(lastPos, pos)));
        }
        const span = document.createElement("span");
        span.className = "fuzzy-find-highlight";
        span.style.backgroundColor = "yellow";
        span.textContent = text[pos];
        fragment.appendChild(span);
        localPosToSpan[pos] = span;
        lastPos = pos + 1;
    });
    if (lastPos < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastPos)));
    }
    parent.replaceChild(fragment, textNode);
    return localPosToSpan;
}

// Highlight the selected match
function highlightSelectedMatch() {
    matches.forEach((match, index) => {
        const color = index === currentMatchIndex ? "orange" : "yellow";
        match.forEach(span => span.style.backgroundColor = color);
    });
    if (currentMatchIndex >= 0) {
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

// Get all text nodes on the page
function getAllTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }
    return textNodes;
}
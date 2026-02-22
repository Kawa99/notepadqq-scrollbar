define([], function () {
    "use strict";

    var DIRECTION_LTR = "ltr";
    var DIRECTION_RTL = "rtl";
    var MAX_SCAN_RADIUS = 200;

    var STRONG_RTL_RANGES = [
        [0x0590, 0x05FF], // Hebrew
        [0x0600, 0x06FF], // Arabic
        [0x0700, 0x08FF], // Syriac + Arabic extended blocks
        [0xFB1D, 0xFDFF], // Hebrew + Arabic presentation forms
        [0xFE70, 0xFEFF], // Arabic presentation forms B
        [0x10800, 0x10FFF],
        [0x1E800, 0x1EEFF]
    ];

    var COMMON_NEUTRAL_RANGES = [
        [0x0000, 0x0040], // Control, whitespace, ASCII punctuation, digits
        [0x005B, 0x0060], // ASCII punctuation
        [0x007B, 0x00BF], // ASCII punctuation + latin punctuation
        [0x2000, 0x206F], // General punctuation
        [0x2E00, 0x2E7F], // Supplemental punctuation
        [0x3000, 0x303F]  // CJK punctuation
    ];

    function inRanges(codePoint, ranges) {
        for (var i = 0; i < ranges.length; i++) {
            if (codePoint >= ranges[i][0] && codePoint <= ranges[i][1]) {
                return true;
            }
        }

        return false;
    }

    function readCodePoint(text, index) {
        var first = text.charCodeAt(index);
        if (first >= 0xD800 && first <= 0xDBFF && index + 1 < text.length) {
            var second = text.charCodeAt(index + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                return {
                    codePoint: ((first - 0xD800) * 0x400) + (second - 0xDC00) + 0x10000,
                    length: 2
                };
            }
        }

        return {
            codePoint: first,
            length: 1
        };
    }

    function isDigitCodePoint(codePoint) {
        return (codePoint >= 0x0030 && codePoint <= 0x0039) || // ASCII
               (codePoint >= 0x0660 && codePoint <= 0x0669) || // Arabic-Indic
               (codePoint >= 0x06F0 && codePoint <= 0x06F9);   // Extended Arabic-Indic
    }

    function isCombiningMark(codePoint) {
        return (codePoint >= 0x0300 && codePoint <= 0x036F) ||
               (codePoint >= 0x0591 && codePoint <= 0x05C7) ||
               (codePoint >= 0x0610 && codePoint <= 0x061A) ||
               (codePoint >= 0x064B && codePoint <= 0x065F) ||
               codePoint === 0x0670 ||
               (codePoint >= 0x06D6 && codePoint <= 0x06ED) ||
               (codePoint >= 0x08D3 && codePoint <= 0x08FF) ||
               (codePoint >= 0x1AB0 && codePoint <= 0x1AFF) ||
               (codePoint >= 0x1DC0 && codePoint <= 0x1DFF) ||
               (codePoint >= 0x20D0 && codePoint <= 0x20FF) ||
               (codePoint >= 0xFE20 && codePoint <= 0xFE2F);
    }

    function isNeutralPunctuation(codePoint) {
        if (inRanges(codePoint, COMMON_NEUTRAL_RANGES)) {
            return true;
        }

        // Arabic/Hebrew punctuation and separators that are not strong direction.
        return codePoint === 0x05BE ||
               codePoint === 0x05C0 ||
               codePoint === 0x05C3 ||
               codePoint === 0x05F3 ||
               codePoint === 0x05F4 ||
               codePoint === 0x060C ||
               codePoint === 0x061B ||
               codePoint === 0x061F ||
               codePoint === 0x066A ||
               codePoint === 0x066B ||
               codePoint === 0x066C ||
               codePoint === 0x06D4;
    }

    function isWeakOrNeutralCodePoint(codePoint) {
        return isDigitCodePoint(codePoint) ||
               isCombiningMark(codePoint) ||
               isNeutralPunctuation(codePoint);
    }

    function normalizeDirection(direction) {
        return direction === DIRECTION_RTL ? DIRECTION_RTL : DIRECTION_LTR;
    }

    function detectFirstStrongDirection(text) {
        if (!text || text.length === 0) {
            return null;
        }

        for (var i = 0; i < text.length;) {
            var read = readCodePoint(text, i);
            var codePoint = read.codePoint;
            i += read.length;

            if (isWeakOrNeutralCodePoint(codePoint)) {
                continue;
            }

            if (inRanges(codePoint, STRONG_RTL_RANGES)) {
                return DIRECTION_RTL;
            }

            // Any non-neutral/non-weak character outside RTL ranges counts as LTR.
            return DIRECTION_LTR;
        }

        return null;
    }

    function directionFromLine(editor, lineNumber) {
        if (lineNumber < 0 || lineNumber >= editor.lineCount()) {
            return null;
        }

        return detectFirstStrongDirection(editor.getLine(lineNumber));
    }

    function detectDirectionNearLine(editor, lineNumber, fallbackDirection) {
        var lineCount = editor.lineCount();
        if (lineCount <= 0) {
            return fallbackDirection;
        }

        var line = Math.max(0, Math.min(lineNumber, lineCount - 1));
        var maxOffset = Math.min(MAX_SCAN_RADIUS, lineCount - 1);
        for (var offset = 0; offset <= maxOffset; offset++) {
            var above = line - offset;
            if (above >= 0) {
                var directionAbove = directionFromLine(editor, above);
                if (directionAbove) {
                    return directionAbove;
                }
            }

            if (offset === 0) {
                continue;
            }

            var below = line + offset;
            if (below < lineCount) {
                var directionBelow = directionFromLine(editor, below);
                if (directionBelow) {
                    return directionBelow;
                }
            }
        }

        return fallbackDirection;
    }

    function getCursorLine(editor) {
        var cursor = editor.getCursor("head");
        if (!cursor || typeof cursor.line !== "number") {
            return 0;
        }

        return cursor.line;
    }

    function applyDirection(editor, direction) {
        var normalizedDirection = normalizeDirection(direction);
        if (editor.getOption("direction") !== normalizedDirection) {
            editor.setOption("direction", normalizedDirection);
        }

        return normalizedDirection;
    }

    function refreshFromLine(editor, lineNumber) {
        var fallbackDirection = normalizeDirection(editor.getOption("direction"));
        var nextDirection = detectDirectionNearLine(editor, lineNumber, fallbackDirection);
        return applyDirection(editor, nextDirection);
    }

    function refreshFromCursor(editor) {
        return refreshFromLine(editor, getCursorLine(editor));
    }

    function enable(editor) {
        editor.setOption("rtlMoveVisually", true);
        return refreshFromCursor(editor);
    }

    return {
        detectFirstStrongDirection: detectFirstStrongDirection,
        refreshFromCursor: refreshFromCursor,
        refreshFromLine: refreshFromLine,
        enable: enable
    };
});

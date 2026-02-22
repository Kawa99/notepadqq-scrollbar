define([], function () {
    "use strict";

    var PREVIEW_CLASS = "markdown-preview-enabled";
    var PREVIEW_PANE_CLASS = "markdown-preview-pane";

    function hasClass(el, className) {
        if (!el) {
            return false;
        }
        if (el.classList) {
            return el.classList.contains(className);
        }
        return (" " + el.className + " ").indexOf(" " + className + " ") !== -1;
    }

    function addClass(el, className) {
        if (!el || hasClass(el, className)) {
            return;
        }
        if (el.classList) {
            el.classList.add(className);
        } else {
            el.className += " " + className;
        }
    }

    function removeClass(el, className) {
        if (!el || !hasClass(el, className)) {
            return;
        }
        if (el.classList) {
            el.classList.remove(className);
        } else {
            el.className = (" " + el.className + " ")
                .replace(" " + className + " ", " ")
                .replace(/^\s+|\s+$/g, "");
        }
    }

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizeUrl(url) {
        var cleaned = String(url || "")
            .replace(/&amp;/g, "&")
            .replace(/^\s+|\s+$/g, "")
            .replace(/^<|>$/g, "");

        if (!/^(https?:\/\/|mailto:|\/|#)/i.test(cleaned)) {
            return "#";
        }

        return cleaned.replace(/"/g, "%22");
    }

    function normalizeFenceInfo(info) {
        var token = String(info || "").replace(/^\s+|\s+$/g, "").split(/\s+/)[0] || "";

        // Accept forms like ```js, ```{.js} and ```python title=...
        token = token.replace(/^\{?\.?/, "").replace(/\}?$/, "");

        return token.toLowerCase();
    }

    function createFootnotesState(definitions) {
        return {
            definitions: definitions || {},
            order: [],
            indexById: {}
        };
    }

    function extractFootnoteDefinitions(lines) {
        var contentLines = [];
        var definitions = {};

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var match = /^\s{0,3}\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
            if (!match) {
                contentLines.push(line);
                continue;
            }

            var id = String(match[1] || "").replace(/^\s+|\s+$/g, "");
            var definitionLines = [match[2] || ""];

            while (i + 1 < lines.length) {
                var continuation = /^(?:\s{2,}|\t)(.*)$/.exec(lines[i + 1]);
                if (!continuation) {
                    break;
                }
                definitionLines.push(continuation[1]);
                i++;
            }

            if (id.length > 0) {
                definitions[id] = definitionLines.join("\n").replace(/\s+$/g, "");
            }
        }

        return {
            lines: contentLines,
            definitions: definitions
        };
    }

    function registerFootnoteReference(id, footnotesState) {
        if (!footnotesState || !id) {
            return "";
        }

        if (!footnotesState.indexById[id]) {
            footnotesState.order.push(id);
            footnotesState.indexById[id] = footnotesState.order.length;
        }

        return String(footnotesState.indexById[id]);
    }

    function renderFootnotes(footnotesState) {
        if (!footnotesState || footnotesState.order.length === 0) {
            return "";
        }

        var html = [];
        html.push("<section class=\"markdown-footnotes\">");
        html.push("<hr>");
        html.push("<ol>");

        for (var i = 0; i < footnotesState.order.length; i++) {
            var id = footnotesState.order[i];
            var index = footnotesState.indexById[id];
            var body = footnotesState.definitions[id] || "";
            var renderedBody = body ? renderInline(body, null) :
                "<em>Missing footnote: " + escapeHtml(id) + "</em>";

            html.push("<li id=\"md-footnote-" + index + "\">");
            html.push(renderedBody + " <a class=\"md-footnote-backref\" href=\"#md-footnote-ref-" +
                index + "\" aria-label=\"Back to reference\">&#8617;</a>");
            html.push("</li>");
        }

        html.push("</ol>");
        html.push("</section>");

        return html.join("\n");
    }

    function findCodeMode(languageHint) {
        var lang = normalizeFenceInfo(languageHint);
        if (!lang) {
            return null;
        }

        var found = null;

        if (!found && CodeMirror.findModeByName) {
            found = CodeMirror.findModeByName(lang) || CodeMirror.findModeByName(languageHint);
        }
        if (!found && CodeMirror.findModeByExtension) {
            found = CodeMirror.findModeByExtension(lang);
        }
        if (!found && CodeMirror.findModeByMIME) {
            found = CodeMirror.findModeByMIME(lang);
        }

        if (!found) {
            return lang;
        }

        return found.mime || found.mode || lang;
    }

    function renderInline(rawText, footnotesState) {
        var text = String(rawText || "");
        var codeSpans = [];
        var codeTokenPrefix = "%%CODESPAN";
        var codeTokenSuffix = "%%";

        text = text.replace(/`([^`]+)`/g, function (_m, code) {
            var index = codeSpans.length;
            codeSpans.push(code);
            return codeTokenPrefix + index + codeTokenSuffix;
        });

        text = escapeHtml(text);

        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, url) {
            var safeUrl = sanitizeUrl(url);
            return "<a href=\"" + safeUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + label + "</a>";
        });

        text = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, function (_m, target, alias) {
            var cleanTarget = String(target || "").replace(/^\s+|\s+$/g, "");
            if (cleanTarget.length === 0) {
                return "";
            }

            var label = alias && alias.length > 0 ? alias : cleanTarget;
            var href = "#wikilink-" + encodeURIComponent(cleanTarget.toLowerCase().replace(/\s+/g, "-"));
            return "<a class=\"md-wikilink\" href=\"" + href + "\" data-note=\"" +
                cleanTarget.replace(/"/g, "&quot;") + "\">" + label + "</a>";
        });

        if (footnotesState) {
            text = text.replace(/\[\^([^\]]+)\]/g, function (_m, rawId) {
                var footnoteId = String(rawId || "").replace(/^\s+|\s+$/g, "");
                var index = registerFootnoteReference(footnoteId, footnotesState);
                if (!index) {
                    return _m;
                }
                return "<sup class=\"md-footnote-ref\"><a href=\"#md-footnote-" + index +
                    "\" id=\"md-footnote-ref-" + index + "\">" + index + "</a></sup>";
            });
        }

        text = text.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
        text = text.replace(/~~([^~]+?)~~/g, "<span class=\"md-strike\">$1</span>");
        text = text.replace(/==([^=]+?)==/g, "<mark>$1</mark>");
        text = text.replace(/\+\+([^+]+?)\+\+/g, "<u>$1</u>");
        text = text.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
        text = text.replace(/_([^_]+?)_/g, "<em>$1</em>");
        text = text.replace(/\\\n/g, "<br>");
        text = text.replace(/ {2,}\n/g, "<br>");
        text = text.replace(/\n/g, "<br>");

        text = text.replace(/%%CODESPAN(\d+)%%/g, function (_m, idx) {
            var i = parseInt(idx, 10);
            var code = i >= 0 && i < codeSpans.length ? codeSpans[i] : "";
            return "<code class=\"md-inline-code\">" + escapeHtml(code) + "</code>";
        });

        return text;
    }

    function renderListItem(rawText, footnotesState) {
        var taskMatch = /^\[( |x|X)\]\s+(.+)$/.exec(rawText);
        if (!taskMatch) {
            return renderInline(rawText, footnotesState);
        }

        var checked = taskMatch[1].toLowerCase() === "x";
        var checkedAttr = checked ? " checked" : "";
        return "<label class=\"markdown-task\"><input type=\"checkbox\" disabled" + checkedAttr + "><span>" +
            renderInline(taskMatch[2], footnotesState) + "</span></label>";
    }

    function parseTableRow(line) {
        var trimmed = String(line || "").replace(/^\s*\||\|\s*$/g, "");
        if (trimmed.length === 0) {
            return [""];
        }
        var cells = trimmed.split("|");
        for (var i = 0; i < cells.length; i++) {
            cells[i] = cells[i].replace(/^\s+|\s+$/g, "");
        }
        return cells;
    }

    function isTableSeparatorLine(line) {
        if (String(line || "").indexOf("|") === -1) {
            return false;
        }

        var parts = parseTableRow(line);
        if (parts.length === 0) {
            return false;
        }

        for (var i = 0; i < parts.length; i++) {
            if (!/^\s*:?-{3,}:?\s*$/.test(parts[i])) {
                return false;
            }
        }
        return true;
    }

    function parseTableAlignments(line) {
        var parts = parseTableRow(line);
        var alignments = [];

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            var left = /^\s*:/.test(part);
            var right = /:\s*$/.test(part);

            if (left && right) {
                alignments.push("center");
            } else if (right) {
                alignments.push("right");
            } else if (left) {
                alignments.push("left");
            } else {
                alignments.push("");
            }
        }

        return alignments;
    }

    function tableCellClass(alignments, index) {
        if (index < 0 || index >= alignments.length || alignments[index] === "") {
            return "";
        }
        return " class=\"md-align-" + alignments[index] + "\"";
    }

    function renderCodeBlock(codeText, languageHint) {
        var code = String(codeText || "");
        var language = normalizeFenceInfo(languageHint);
        var mode = findCodeMode(language);
        var highlighted = "";
        var usedRunMode = false;

        if (CodeMirror.runMode) {
            try {
                CodeMirror.runMode(code, mode || "null", function (tokenText, style) {
                    var safeText = escapeHtml(tokenText);
                    if (style) {
                        var className = "cm-" + style.replace(/ +/g, " cm-");
                        highlighted += "<span class=\"" + className + "\">" + safeText + "</span>";
                    } else {
                        highlighted += safeText;
                    }
                });
                usedRunMode = true;
            } catch (_err) {
                usedRunMode = false;
            }
        }

        if (!usedRunMode) {
            highlighted = escapeHtml(code);
        }

        var meta = "";
        if (language) {
            meta = "<div class=\"markdown-code-meta\"><span class=\"markdown-code-language\">" +
                escapeHtml(language) + "</span></div>";
        }

        return "<div class=\"markdown-code-wrapper\">" + meta +
            "<pre class=\"md-code\"><code class=\"cm-s-default\">" + highlighted + "</code></pre></div>";
    }

    function renderMarkdown(markdown) {
        var lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
        var extraction = extractFootnoteDefinitions(lines);
        lines = extraction.lines;

        var footnotesState = createFootnotesState(extraction.definitions);
        var html = [];
        var inCode = false;
        var codeLines = [];
        var codeLanguage = "";
        var listType = null;
        var paragraph = [];

        function closeParagraph() {
            if (paragraph.length === 0) {
                return;
            }
            html.push("<p>" + renderInline(paragraph.join("\n"), footnotesState) + "</p>");
            paragraph = [];
        }

        function closeList() {
            if (!listType) {
                return;
            }
            html.push("</" + listType + ">");
            listType = null;
        }

        function closeCodeBlock() {
            if (!inCode) {
                return;
            }
            html.push(renderCodeBlock(codeLines.join("\n"), codeLanguage));
            inCode = false;
            codeLines = [];
            codeLanguage = "";
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var match = null;

            if (inCode) {
                if (/^\s*```/.test(line)) {
                    closeCodeBlock();
                } else {
                    codeLines.push(line);
                }
                continue;
            }

            match = /^\s*```(.*)$/.exec(line);
            if (match) {
                closeParagraph();
                closeList();
                inCode = true;
                codeLines = [];
                codeLanguage = match[1] || "";
                continue;
            }

            if (/^\s*$/.test(line)) {
                closeParagraph();
                closeList();
                continue;
            }

            match = /^(#{1,6})\s+(.*)$/.exec(line);
            if (match) {
                closeParagraph();
                closeList();
                var level = match[1].length;
                html.push("<h" + level + ">" + renderInline(match[2], footnotesState) + "</h" + level + ">");
                continue;
            }

            if (/^\s*([-*_]\s*){3,}$/.test(line)) {
                closeParagraph();
                closeList();
                html.push("<hr>");
                continue;
            }

            match = /^\s*>\s?(.*)$/.exec(line);
            if (match) {
                closeParagraph();
                closeList();
                html.push("<blockquote>" + renderInline(match[1], footnotesState) + "</blockquote>");
                continue;
            }

            if (line.indexOf("|") !== -1 && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
                closeParagraph();
                closeList();

                var headers = parseTableRow(line);
                var alignments = parseTableAlignments(lines[i + 1]);

                html.push("<table>");
                html.push("<thead><tr>");
                for (var h = 0; h < headers.length; h++) {
                    html.push("<th" + tableCellClass(alignments, h) + ">" +
                        renderInline(headers[h], footnotesState) + "</th>");
                }
                html.push("</tr></thead>");
                html.push("<tbody>");

                i += 2;
                while (i < lines.length && !/^\s*$/.test(lines[i]) && lines[i].indexOf("|") !== -1) {
                    var row = parseTableRow(lines[i]);
                    html.push("<tr>");

                    for (var c = 0; c < headers.length; c++) {
                        var cell = c < row.length ? row[c] : "";
                        html.push("<td" + tableCellClass(alignments, c) + ">" +
                            renderInline(cell, footnotesState) + "</td>");
                    }

                    html.push("</tr>");
                    i++;
                }

                html.push("</tbody></table>");
                i--;
                continue;
            }

            match = /^\s*[-*+]\s+(.+)$/.exec(line);
            if (match) {
                closeParagraph();
                if (listType !== "ul") {
                    closeList();
                    listType = "ul";
                    html.push("<ul>");
                }
                html.push("<li>" + renderListItem(match[1], footnotesState) + "</li>");
                continue;
            }

            match = /^\s*\d+\.\s+(.+)$/.exec(line);
            if (match) {
                closeParagraph();
                if (listType !== "ol") {
                    closeList();
                    listType = "ol";
                    html.push("<ol>");
                }
                html.push("<li>" + renderListItem(match[1], footnotesState) + "</li>");
                continue;
            }

            closeList();
            paragraph.push(line.replace(/^\s+|\s+$/g, ""));
        }

        closeParagraph();
        closeList();
        closeCodeBlock();

        var footnotesHtml = renderFootnotes(footnotesState);
        if (footnotesHtml.length > 0) {
            html.push(footnotesHtml);
        }

        return html.join("\n");
    }

    function getContainer(editor) {
        var wrapper = editor.getWrapperElement();
        if (!wrapper) {
            return null;
        }
        return wrapper.parentNode;
    }

    function getState(editor) {
        return editor._markdownPreviewState || null;
    }

    function createState(editor) {
        if (editor._markdownPreviewState) {
            return editor._markdownPreviewState;
        }

        var container = getContainer(editor);
        var pane = document.createElement("div");
        pane.className = PREVIEW_PANE_CLASS;

        var header = document.createElement("div");
        header.className = "markdown-preview-header";

        var title = document.createElement("span");
        title.className = "markdown-preview-title";
        title.innerHTML = "Markdown Preview";

        var closeBtn = document.createElement("button");
        closeBtn.className = "markdown-preview-close";
        closeBtn.innerHTML = "&times;";
        closeBtn.title = "Close preview";

        header.appendChild(title);
        header.appendChild(closeBtn);

        var content = document.createElement("div");
        content.className = "markdown-preview-content";

        pane.appendChild(header);
        pane.appendChild(content);
        container.appendChild(pane);

        var state = {
            enabled: false,
            pane: pane,
            contentNode: content,
            timer: null,
            onChange: function () {
                scheduleRender(editor);
            }
        };

        closeBtn.addEventListener("click", function () {
            setEnabled(editor, false, true);
        });

        editor._markdownPreviewState = state;
        return state;
    }

    function renderNow(editor, createIfMissing) {
        var state = createIfMissing ? createState(editor) : getState(editor);
        if (!state || !state.enabled) {
            return;
        }
        state.contentNode.innerHTML = renderMarkdown(editor.getValue("\n"));
    }

    function scheduleRender(editor, createIfMissing) {
        var state = createIfMissing ? createState(editor) : getState(editor);
        if (!state || !state.enabled) {
            return;
        }

        if (state.timer !== null) {
            clearTimeout(state.timer);
        }

        state.timer = setTimeout(function () {
            state.timer = null;
            renderNow(editor, false);
        }, 120);
    }

    function requestEditorRefresh(editor) {
        setTimeout(function () {
            editor.refresh();
        }, 0);
    }

    function setEnabled(editor, enabled, notifyCpp) {
        var state = enabled ? createState(editor) : getState(editor);

        if (!state) {
            return;
        }

        if (enabled) {
            if (state.enabled) {
                return;
            }

            state.enabled = true;
            addClass(getContainer(editor), PREVIEW_CLASS);
            editor.on("change", state.onChange);
            renderNow(editor, true);
            requestEditorRefresh(editor);
            return;
        }

        if (!state.enabled) {
            return;
        }

        state.enabled = false;
        editor.off("change", state.onChange);
        removeClass(getContainer(editor), PREVIEW_CLASS);
        if (state.timer !== null) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        requestEditorRefresh(editor);

        if (notifyCpp) {
            UiDriver.sendMessage("J_EVT_MARKDOWN_PREVIEW_TOGGLED", false);
        }
    }

    var obj = {};

    obj.enable = function (editor) {
        setEnabled(editor, true, false);
    };

    obj.disable = function (editor) {
        setEnabled(editor, false, false);
    };

    obj.refresh = function (editor) {
        scheduleRender(editor, false);
    };

    return obj;
});

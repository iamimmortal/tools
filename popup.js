  'use strict';

  /* ── Element refs ── */
  const editor = document.getElementById('editor');
  const sourceEditor = document.getElementById('source-editor');
  let activePanel = 'visual';
  let savedSelection = null;
  const STORAGE_KEY = 'pagecraft.savedDocument.v1';
  let lastSavedSnapshot = null;
  let _isInitializing = true; // suppress markDirty on first load

  /* ── Exec command wrapper (deprecated API — guarded) ── */
  function fmt(cmd, val) {
    editor.focus();
    // execCommand is deprecated but still widely supported; wrap defensively
    try {
      document.execCommand(cmd, false, val !== undefined ? val : null);
    } catch (e) {
      console.warn('execCommand failed:', cmd, e);
    }
    updateStats();
    syncSource();
  }

  /* ── Wire toolbar buttons ── */
  document.getElementById('tb-undo').addEventListener('click', () => fmt('undo'));
  document.getElementById('tb-redo').addEventListener('click', () => fmt('redo'));
  document.getElementById('tb-bold').addEventListener('click', () => fmt('bold'));
  document.getElementById('tb-italic').addEventListener('click', () => fmt('italic'));
  document.getElementById('tb-underline').addEventListener('click', () => fmt('underline'));
  document.getElementById('tb-strike').addEventListener('click', () => fmt('strikeThrough'));
  document.getElementById('tb-sup').addEventListener('click', () => fmt('superscript'));
  document.getElementById('tb-sub').addEventListener('click', () => fmt('subscript'));
  document.getElementById('tb-left').addEventListener('click', () => fmt('justifyLeft'));
  document.getElementById('tb-center').addEventListener('click', () => fmt('justifyCenter'));
  document.getElementById('tb-right').addEventListener('click', () => fmt('justifyRight'));
  document.getElementById('tb-justify').addEventListener('click', () => fmt('justifyFull'));
  document.getElementById('tb-ul').addEventListener('click', () => fmt('insertUnorderedList'));
  document.getElementById('tb-ol').addEventListener('click', () => fmt('insertOrderedList'));
  document.getElementById('tb-indent').addEventListener('click', () => fmt('indent'));
  document.getElementById('tb-outdent').addEventListener('click', () => fmt('outdent'));
  document.getElementById('tb-hr').addEventListener('click', () => fmt('insertHorizontalRule'));
  document.getElementById('tb-clear').addEventListener('click', () => fmt('removeFormat'));

  /* ── Toolbar selects ── */
  document.getElementById('format-select').addEventListener('change', function() {
    fmt('formatBlock', this.value);
    // Reset select to avoid showing stale selection after cursor moves
    this.value = 'p';
  });

  document.getElementById('font-select').addEventListener('change', function() {
    fmt('fontName', this.value);
  });

  document.getElementById('size-select').addEventListener('change', function() {
    fmt('fontSize', this.value);
  });

  document.getElementById('text-color').addEventListener('input', function() {
    fmt('foreColor', this.value);
  });

  document.getElementById('highlight-color').addEventListener('input', function() {
    fmt('hiliteColor', this.value);
  });

  /* ── Tabs ── */
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var panel = this.dataset.panel;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
      document.getElementById('panel-' + panel).classList.add('active');
      activePanel = panel;

      if (panel === 'source') {
        sourceEditor.value = getCleanHTML();
      }
      if (panel === 'preview' || panel === 'split') {
        updatePreview();
      }
    });
  });

  /* ── Get clean HTML ── */
  function getCleanHTML() {
    return sanitizeHTML(editor.innerHTML);
  }

  /* ── Blob URL manager — revoke old URLs to prevent memory leaks ── */
  var _previewBlobURLs = {};
  function setPreviewSrc(frameId, html) {
    var frame = document.getElementById(frameId);
    if (!frame) return;
    // Revoke previous blob URL for this frame
    if (_previewBlobURLs[frameId]) {
      URL.revokeObjectURL(_previewBlobURLs[frameId]);
    }
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    _previewBlobURLs[frameId] = url;
    frame.src = url;
  }

  /* ── Sync source from editor ── */
  function syncSource() {
    if (activePanel === 'source') sourceEditor.value = getCleanHTML();
    if (activePanel === 'preview' || activePanel === 'split') updatePreview();
    if (!_isInitializing) markDirty();
  }

  /* ── Apply source to editor ── */
  document.getElementById('btn-apply-source').addEventListener('click', function() {
    editor.innerHTML = sanitizeHTML(sourceEditor.value);
    updateStats();
    syncSource();
    toast('Changes applied');
  });

  /* ── Format source ── */
  document.getElementById('btn-format-source').addEventListener('click', function() {
    try {
      var html = sourceEditor.value;
      html = html.replace(/></g, '>\n<').replace(/\n\s*\n/g, '\n');
      sourceEditor.value = html;
      toast('Formatted');
    } catch(e) {
      console.warn('Format error:', e);
    }
  });

  /* ── Copy source — with fallback for non-HTTPS/unsupported envs ── */
  document.getElementById('btn-copy-source').addEventListener('click', function() {
    var text = sourceEditor.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        toast('Copied!');
      }).catch(function() {
        _fallbackCopy(text);
      });
    } else {
      _fallbackCopy(text);
    }
  });

  function _fallbackCopy(text) {
    sourceEditor.select();
    try {
      document.execCommand('copy');
      toast('Copied!');
    } catch(e) {
      toast('Copy not supported in this browser');
    }
  }

  /* ── Preview ── */
  function updatePreview() {
    var previewStyles = 'body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:16px;line-height:1.75;color:#1a1a18;padding:40px 60px;max-width:860px;margin:0 auto}h1{font-size:2em;font-weight:700}h2{font-size:1.5em;font-weight:600}h3{font-size:1.25em;font-weight:600}blockquote{border-left:3px solid #2563eb;margin:1em 0;padding:.5em 1em;color:#6b6b68;font-style:italic}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e2e0;padding:8px 12px}th{background:#f5f5f4;font-weight:600}img{max-width:100%}a{color:#2563eb}';
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + previewStyles + '</style></head><body>' + sanitizeHTML(editor.innerHTML) + '</body></html>';
    setPreviewSrc('preview-frame', html);
    setPreviewSrc('preview-frame-split', html);
  }

  /* ── Editor events ── */
  editor.addEventListener('input', function() {
    updateStats();
    syncSource();
  });


  // Sanitize pasted rich HTML before it enters the editor.
  // Also supports direct image paste from clipboard, e.g. screenshots / copied images.
  editor.addEventListener('paste', function(e) {
    var clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard) return;

    // 1) Direct image paste support: clipboard image blobs are converted to data URLs.
    var items = clipboard.items ? Array.prototype.slice.call(clipboard.items) : [];
    var imageItems = items.filter(function(item) {
      return item && item.kind === 'file' && item.type && item.type.indexOf('image/') === 0;
    });

    if (imageItems.length > 0) {
      e.preventDefault();
      imageItems.forEach(function(item) {
        var file = item.getAsFile();
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          var dataUrl = normalizeSafeUrl(ev.target.result, true);
          if (!dataUrl) {
            toast('Unsupported pasted image');
            return;
          }
          var imgHtml = '<img src="' + dataUrl.replace(/"/g, '&quot;') + '" alt="Pasted image">';
          try {
            document.execCommand('insertHTML', false, imgHtml);
          } catch(err) {
            editor.insertAdjacentHTML('beforeend', imgHtml);
          }
          sanitizeEditorContent();
          updateStats();
          syncSource();
          toast('Image pasted');
        };
        reader.onerror = function() {
          toast('Could not paste image');
        };
        reader.readAsDataURL(file);
      });
      return;
    }

    // 2) HTML/text paste support.
    var htmlData = clipboard.getData('text/html');
    var textData = clipboard.getData('text/plain');
    e.preventDefault();
    var safeContent = htmlData ? sanitizeHTML(htmlData) : _escapeHTML(textData).replace(/\n/g, '<br>');
    try {
      document.execCommand('insertHTML', false, safeContent);
    } catch(err) {
      editor.insertAdjacentHTML('beforeend', safeContent);
    }
    sanitizeEditorContent();
    updateStats();
    syncSource();
  });
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      // Use insertText instead of the non-standard \u00a0 approach
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var tabNode = document.createTextNode('\u00a0\u00a0\u00a0\u00a0');
        range.insertNode(tabNode);
        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        sel.removeAllRanges();
        sel.addRange(range);
        updateStats();
        syncSource();
      }
    }
  });

  /* ── Stats ── */
  function updateStats() {
    var text = editor.innerText || '';
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    var chars = text.length;
    document.getElementById('stat-words').textContent = words + ' words';
    document.getElementById('stat-chars').textContent = chars + ' chars';
  }

  /* ── Cursor position tracking ── */
  editor.addEventListener('keyup', updateCursorPos);
  editor.addEventListener('mouseup', updateCursorPos);
  function updateCursorPos() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    // Count approximate line number via node traversal
    try {
      var range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      range.setStart(editor, 0);
      var text = range.toString();
      var line = (text.match(/\n/g) || []).length + 1;
      document.getElementById('stat-cursor').textContent = 'Line ' + line;
    } catch(e) {}
  }

  var dirty = false;
  function markDirty() {
    dirty = true;
    document.getElementById('status-dot').classList.add('unsaved');
    document.getElementById('status-text').textContent = 'Unsaved changes since last local save';
    document.title = getCurrentFileName() + ' - unsaved';
  }
  function markSaved() {
    dirty = false;
    document.getElementById('status-dot').classList.remove('unsaved');
    document.getElementById('status-text').textContent = 'Saved';
  }

  /* ── Save draft locally ── */
  document.getElementById('btn-save').addEventListener('click', saveDraft);

  /* ── Download ── */
  document.getElementById('btn-download').addEventListener('click', function() {
    // Save the latest editor state first, then download the generated HTML.
    saveDraft();
    var name = getCurrentFileName();
    var html = lastSavedSnapshot && lastSavedSnapshot.fullHTML ? lastSavedSnapshot.fullHTML : buildExportHTML(name);
    var blob = new Blob([html], {type: 'text/html'});
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    markSaved();
    updateSavedStatus(new Date().toISOString(), name);
    toast('Downloaded: ' + name);
  });
  /* ── HTML escape helper (prevents XSS in inserted titles/attributes) ── */
  function _escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }



  /* ── Save/export helpers ── */
  function getCurrentFileName() {
    return (document.getElementById('filename-input').value || 'document').replace(/\.html?$/i,'') + '.html';
  }

  function buildExportHTML(fileName) {
    var title = (fileName || getCurrentFileName()).replace(/\.html?$/i,'');
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + _escapeHTML(title) + '</title>\n<style>\n  body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 16px; line-height: 1.75; color: #1a1a18; padding: 40px 60px; max-width: 860px; margin: 0 auto; }\n  h1 { font-size: 2em; font-weight: 700; }\n  h2 { font-size: 1.5em; font-weight: 600; }\n  h3 { font-size: 1.25em; font-weight: 600; }\n  blockquote { border-left: 3px solid #2563eb; margin: 1em 0; padding: .5em 1em; color: #6b6b68; font-style: italic; }\n  table { border-collapse: collapse; width: 100%; }\n  th, td { border: 1px solid #e2e2e0; padding: 8px 12px; }\n  th { background: #f5f5f4; font-weight: 600; }\n  img { max-width: 100%; }\n  a { color: #2563eb; }\n</style>\n</head>\n<body>\n' + sanitizeHTML(editor.innerHTML) + '\n</body>\n</html>';
  }


  function updateSavedStatus(savedAt, fileName) {
    var displayTime = savedAt ? new Date(savedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
    document.getElementById('status-dot').classList.remove('unsaved');
    document.getElementById('status-text').textContent = 'Saved locally at ' + displayTime;
    document.title = (fileName || getCurrentFileName()) + ' - saved';
  }

  function saveDraft() {
    try {
      var fileName = getCurrentFileName();
      var now = new Date().toISOString();
      var saved = {
        fileName: fileName,
        bodyHTML: sanitizeHTML(editor.innerHTML),
        fullHTML: buildExportHTML(fileName),
        savedAt: now
      };
      lastSavedSnapshot = saved;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      markSaved();
      updateSavedStatus(now, fileName);
      toast('Draft saved locally');
      return true;
    } catch(e) {
      console.warn('Save failed:', e);
      toast('Save failed. Browser storage may be blocked.');
      return false;
    }
  }

  function restoreSavedDraftIfAvailable() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || !saved.bodyHTML) return false;
      lastSavedSnapshot = saved;
      editor.innerHTML = sanitizeHTML(saved.bodyHTML);
      document.getElementById('filename-input').value = (saved.fileName || 'document.html').replace(/\.html?$/i,'');
      updateSavedStatus(saved.savedAt, saved.fileName);
      toast('Restored saved draft');
      return true;
    } catch(e) {
      console.warn('Restore saved draft failed:', e);
      return false;
    }
  }

  /* ── DOMPurify sanitization helpers ──
     Sanitizes all untrusted HTML while preserving normal editor markup. */
  var SANITIZE_CONFIG = {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['style', 'target', 'rel', 'allowfullscreen'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    ALLOW_DATA_ATTR: false
  };

  function sanitizeHTML(dirty) {
    var input = String(dirty || '');
    if (window.DOMPurify && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(input, SANITIZE_CONFIG);
    }
    // Fallback sanitizer if CDN is unavailable. DOMPurify remains the primary protection.
    var template = document.createElement('template');
    template.innerHTML = input;
    template.content.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, option, meta, link').forEach(function(el) {
      el.remove();
    });
    template.content.querySelectorAll('*').forEach(function(el) {
      Array.prototype.slice.call(el.attributes).forEach(function(attr) {
        var name = attr.name.toLowerCase();
        var value = String(attr.value || '').trim().toLowerCase();
        if (name.indexOf('on') === 0 || value.indexOf('javascript:') === 0 || value.indexOf('data:text/html') === 0) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return template.innerHTML;
  }

  function sanitizeEditorContent() {
    var clean = sanitizeHTML(editor.innerHTML);
    if (clean !== editor.innerHTML) {
      editor.innerHTML = clean;
    }
  }

  function normalizeSafeUrl(url, allowImageData) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    if (/^\/\//.test(raw)) return 'https:' + raw;
    if (/^[\w.-]+\.[a-z]{2,}([\/:?#].*)?$/i.test(raw)) return 'https://' + raw;
    try {
      var parsed = new URL(raw, window.location.href);
      var protocol = parsed.protocol.toLowerCase();
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') return raw;
      if (allowImageData && protocol === 'data:' && /^data:image\/(png|gif|jpe?g|webp);/i.test(raw)) return raw;
      if (raw.charAt(0) === '/' || raw.charAt(0) === '#') return raw;
    } catch(e) {
      if (raw.charAt(0) === '/' || raw.charAt(0) === '#') return raw;
    }
    return '';
  }

  /* ── Open file ── */
  document.getElementById('btn-open').addEventListener('click', function() {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', function(e) {
    var f = e.target.files[0];
    if (!f) return;
    document.getElementById('filename-input').value = f.name.replace(/\.html?$/i,'');
    var reader = new FileReader();
    reader.onload = function(ev) {
      var html = ev.target.result;
      var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      editor.innerHTML = sanitizeHTML(bodyMatch ? bodyMatch[1].trim() : html);
      updateStats();
      syncSource();
      markSaved();
      toast('Opened: ' + f.name);
    };
    reader.onerror = function() {
      toast('Error reading file');
    };
    reader.readAsText(f);
    this.value = ''; // reset so same file can be re-opened
  });

  /* ── New doc ── */
  document.getElementById('btn-new').addEventListener('click', function() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    editor.innerHTML = '<p>Start typing\u2026</p>';
    document.getElementById('filename-input').value = 'document';
    updateStats();
    syncSource();
    markSaved();
    toast('New document');
  });

  /* ── Table ── */
  document.getElementById('btn-table').addEventListener('click', function() {
    savedSelection = saveSelection();
    document.getElementById('table-dialog').classList.add('open');
  });

  function closeTableDialog() {
    document.getElementById('table-dialog').classList.remove('open');
  }

  function insertTable() {
    var rows = Math.min(parseInt(document.getElementById('tbl-rows').value, 10) || 3, 20);
    var cols = Math.min(parseInt(document.getElementById('tbl-cols').value, 10) || 3, 10);
    var html = '<table><thead><tr>';
    for (var c = 0; c < cols; c++) html += '<th>Header ' + (c+1) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var cc = 0; cc < cols; cc++) html += '<td>Cell</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    closeTableDialog();
    restoreSelection(savedSelection);
    editor.focus();
    try { document.execCommand('insertHTML', false, html); } catch(e) { editor.innerHTML += html; }
    sanitizeEditorContent();
    syncSource();
  }

  document.getElementById('btn-table-cancel').addEventListener('click', closeTableDialog);
  document.getElementById('btn-table-insert').addEventListener('click', insertTable);

  /* ── Link ── */
  document.getElementById('btn-link').addEventListener('click', function() {
    savedSelection = saveSelection();
    var sel = window.getSelection();
    document.getElementById('link-text').value = sel && sel.toString() ? sel.toString() : '';
    document.getElementById('link-url').value = '';
    document.getElementById('link-dialog').classList.add('open');
    setTimeout(function() { document.getElementById('link-url').focus(); }, 50);
  });

  function closeLinkDialog() {
    document.getElementById('link-dialog').classList.remove('open');
  }

  function applyLink() {
    var url = normalizeSafeUrl(document.getElementById('link-url').value.trim(), false);
    var text = document.getElementById('link-text').value.trim();
    if (!url) { toast('Invalid URL'); return; }
    restoreSelection(savedSelection);
    editor.focus();
    var sel = window.getSelection();
    if (text && (!sel || !sel.toString())) {
      // Safe insertion: escape attributes properly
      var safeHref = url.replace(/"/g, '&quot;');
      var safeText = _escapeHTML(text);
      try { document.execCommand('insertHTML', false, '<a href="' + safeHref + '">' + safeText + '</a>'); }
      catch(e) { console.warn('insertHTML failed:', e); }
    } else {
      try { document.execCommand('createLink', false, url); } catch(e) { console.warn('createLink failed:', e); }
    }
    sanitizeEditorContent();
    closeLinkDialog();
    syncSource();
  }

  document.getElementById('btn-link-cancel').addEventListener('click', closeLinkDialog);
  document.getElementById('btn-link-insert').addEventListener('click', applyLink);

  /* ── Image ── */
  document.getElementById('btn-image').addEventListener('click', function() {
    savedSelection = saveSelection();
    document.getElementById('img-url').value = '';
    document.getElementById('img-alt').value = '';
    document.getElementById('image-dialog').classList.add('open');
    setTimeout(function() { document.getElementById('img-url').focus(); }, 50);
  });

  function closeImageDialog() {
    document.getElementById('image-dialog').classList.remove('open');
  }

  function applyImage() {
    var url = normalizeSafeUrl(document.getElementById('img-url').value.trim(), true);
    var alt = document.getElementById('img-alt').value.trim();
    if (!url) { toast('Invalid image URL'); return; }
    var safeUrl = url.replace(/"/g, '&quot;');
    var safeAlt = _escapeHTML(alt);
    restoreSelection(savedSelection);
    editor.focus();
    try { document.execCommand('insertHTML', false, '<img src="' + safeUrl + '" alt="' + safeAlt + '">'); }
    catch(e) { console.warn('insertHTML failed:', e); }
    sanitizeEditorContent();
    closeImageDialog();
    syncSource();
  }

  document.getElementById('btn-image-cancel').addEventListener('click', closeImageDialog);
  document.getElementById('btn-image-insert').addEventListener('click', applyImage);

  /* ── Find & Replace ── */
  document.getElementById('btn-find').addEventListener('click', function() {
    var bar = document.getElementById('find-bar');
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) document.getElementById('find-input').focus();
  });

  function closeFindBar() {
    document.getElementById('find-bar').classList.remove('open');
  }

  document.getElementById('btn-close-find').addEventListener('click', closeFindBar);

  document.getElementById('btn-replace-one').addEventListener('click', function() {
    var find = document.getElementById('find-input').value;
    var replace = document.getElementById('replace-input').value;
    if (!find) return;
    var html = editor.innerHTML;
    var idx = html.indexOf(find);
    if (idx === -1) { toast('Not found'); return; }
    editor.innerHTML = sanitizeHTML(html.slice(0, idx) + replace + html.slice(idx + find.length));
    syncSource();
    toast('Replaced 1');
  });

  document.getElementById('btn-replace-all').addEventListener('click', function() {
    var find = document.getElementById('find-input').value;
    var replace = document.getElementById('replace-input').value;
    if (!find) return;
    var orig = editor.innerHTML;
    var updated = orig.split(find).join(replace);
    var count = orig.split(find).length - 1;
    editor.innerHTML = sanitizeHTML(updated);
    syncSource();
    toast('Replaced ' + count);
  });

  /* ── Selection save/restore ── */
  function saveSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
    return null;
  }

  function restoreSelection(range) {
    if (!range) return;
    var sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /* ── Dialog close on overlay click ── */
  document.querySelectorAll('.dialog-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') { e.preventDefault(); if (e.shiftKey) { document.getElementById('btn-download').click(); } else { document.getElementById('btn-save').click(); } }
      if (e.key === 'f') { e.preventDefault(); document.getElementById('btn-find').click(); }
      if (e.key === 'o') { e.preventDefault(); document.getElementById('btn-open').click(); }
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.dialog-overlay').forEach(function(d) { d.classList.remove('open'); });
      closeFindBar();
    }
  });

  /* ── Warn if closing with unsaved changes ── */
  window.addEventListener('beforeunload', function(e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── Toast ── */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2200);
  }

  /* ── Init ── */
  var restoredDraft = restoreSavedDraftIfAvailable();
  sanitizeEditorContent();
  updateStats();
  if (!restoredDraft) markSaved();
  _isInitializing = false; // allow dirty tracking from now on

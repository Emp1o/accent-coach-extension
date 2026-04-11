function replaceSelectionText(newText) {
  const active = document.activeElement;
  if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(active.type)))) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && start !== end) {
      const value = active.value;
      active.value = value.slice(0, start) + newText + value.slice(end);
      active.selectionStart = active.selectionEnd = start + newText.length;
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (container && container.closest && container.closest('[contenteditable="true"]')) {
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      selection.removeAllRanges();
      return true;
    }
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "REPLACE_OR_SHOW_RESULT") {
    const ok = replaceSelectionText(msg.text || "");
    sendResponse({ ok: true, replaced: ok });
    return true;
  }
});
